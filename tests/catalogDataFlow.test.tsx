import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import CatalogExplorer from '../app/components/catalog/CatalogExplorer';
import { defaultCatalogFilters, useCatalogProducts } from '../app/components/catalog/useCatalogProducts';
import type { CatalogProduct, CatalogResponse } from '../app/services/catalogTypes';

const product = (id: string, name: string): CatalogProduct => ({
  productNo: id, productSlug: null, productUrl: null, productName: name, productBrand: 'Wilfred', categories: ['Dresses'],
  fromColorId: null, fromPrice: 80, fromOriginalPrice: 100, fromSalePercent: 20, selectedColorId: null,
  availabilityStatus: 'available', trackingStartedAt: null, insightLabel: null, colors: [],
});
const page = (products: CatalogProduct[], nextCursor: string | null = null, status: 'active' | 'stale' = 'active'): CatalogResponse => ({
  products, nextCursor, total: 30, snapshot: { id: '9007199254740993', dataAsOf: '2026-10-13T12:34:56.123456Z', refreshedAt: '2026-10-13T12:40:00.123456Z', status },
});
const ok = (body: CatalogResponse) => ({ ok: true, json: async () => body } as Response);
const failure = (code: string) => ({ ok: false, json: async () => ({ error: { code, message: 'Request failed' } }) } as Response);
const first = product('9007199254740993', 'First dress');
const second = product('9007199254740994', 'Second dress');
let fetcher: jest.Mock;
beforeEach(() => { fetcher = jest.fn(); global.fetch = fetcher; });
afterEach(() => jest.useRealTimers());
function explorer() { return render(<MantineProvider><CatalogExplorer /></MantineProvider>); }

test('requests 24 products, appends unique product IDs with the opaque cursor, and shows stale data notice', async () => {
  fetcher.mockResolvedValueOnce(ok(page([first], 'opaque+cursor', 'stale'))).mockResolvedValueOnce(ok(page([first, second])));
  const user = userEvent.setup();
  explorer();
  expect(await screen.findByText('First dress')).toBeInTheDocument();
  const initial = new URL(fetcher.mock.calls[0][0], 'http://localhost');
  expect(initial.searchParams.get('limit')).toBe('24');
  expect(initial.searchParams.has('cursor')).toBe(false);
  expect(screen.getByText(/30 products/)).toBeInTheDocument();
  expect(screen.getByText(/stale/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Load more' }));
  expect(await screen.findByText('Second dress')).toBeInTheDocument();
  expect(screen.getAllByText('First dress')).toHaveLength(1);
  expect(new URL(fetcher.mock.calls[1][0], 'http://localhost').searchParams.get('cursor')).toBe('opaque+cursor');
  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
});

test('last-known stale status stays visible while filtered first-page requests settle', async () => {
  fetcher.mockResolvedValueOnce(ok(page([first], null, 'stale')))
    .mockImplementationOnce(() => new Promise(() => {}));
  const { result, rerender } = renderHook(({ filters }) => useCatalogProducts(filters), { initialProps: { filters: defaultCatalogFilters } });
  await waitFor(() => expect(result.current.snapshot?.status).toBe('stale'));
  rerender({ filters: { ...defaultCatalogFilters, brand: 'Wilfred' } });
  expect(result.current.products).toEqual([]);
  expect(result.current.isLoading).toBe(true);
  expect(result.current.snapshot?.status).toBe('stale');
});

test('expired cursor discards accumulated pages and refetches page one', async () => {
  let resolveFresh: (response: Response) => void;
  fetcher.mockResolvedValueOnce(ok(page([first], 'expired'))).mockResolvedValueOnce(failure('cursor_expired'))
    .mockImplementationOnce(() => new Promise(resolve => { resolveFresh = resolve; }));
  const user = userEvent.setup();
  explorer();
  await screen.findByText('First dress');
  await user.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(screen.queryByText('First dress')).not.toBeInTheDocument();
  expect(new URL(fetcher.mock.calls[2][0], 'http://localhost').searchParams.has('cursor')).toBe(false);
  await act(async () => resolveFresh(ok(page([second]))));
  expect(await screen.findByText('Second dress')).toBeInTheDocument();
});

test('non-cursor errors preserve loaded products and allow another Load more attempt', async () => {
  fetcher.mockResolvedValueOnce(ok(page([first], 'next'))).mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce(ok(page([second])));
  const user = userEvent.setup();
  explorer();
  await screen.findByText('First dress');
  await user.click(screen.getByRole('button', { name: 'Load more' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  expect(screen.getByText('First dress')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Load more' }));
  expect(await screen.findByText('Second dress')).toBeInTheDocument();
});

test('serializes the API contract with repeated size parameters and conditional discount', async () => {
  fetcher.mockResolvedValue(ok(page([])));
  const { rerender } = renderHook(({ filters }) => useCatalogProducts(filters), { initialProps: { filters: {
    ...defaultCatalogFilters, category: 'Dresses', brand: 'Wilfred', color: 'Black', sizes: ['S', 'M'],
    minPrice: '20', maxPrice: '100', minDiscount: '25', saleOnly: true, sort: 'price-asc' as const,
  } } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const params = new URL(fetcher.mock.calls[0][0], 'http://localhost').searchParams;
  expect(Object.fromEntries(params)).toMatchObject({ limit: '24', category: 'Dresses', brand: 'Wilfred', color: 'Black', minPrice: '20', maxPrice: '100', minDiscount: '25', saleOnly: 'true', sort: 'price-asc' });
  expect(params.getAll('size')).toEqual(['S', 'M']);
  rerender({ filters: { ...defaultCatalogFilters, category: 'Dresses', brand: 'Wilfred', color: 'Black', sizes: ['S', 'M'], minPrice: '20', maxPrice: '100', minDiscount: '25', saleOnly: false, sort: 'price-asc' } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(new URL(fetcher.mock.calls[1][0], 'http://localhost').searchParams.has('minDiscount')).toBe(false);
});

test('filter changes abort superseded requests, reset pages, and ignore late responses', async () => {
  let resolveOld: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce(ok(page([second])));
  const { result, rerender, unmount } = renderHook(({ filters }) => useCatalogProducts(filters), { initialProps: { filters: defaultCatalogFilters } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const oldSignal = fetcher.mock.calls[0][1].signal as AbortSignal;
  rerender({ filters: { ...defaultCatalogFilters, brand: 'Wilfred' } });
  await waitFor(() => expect(result.current.products).toEqual([second]));
  expect(oldSignal.aborted).toBe(true);
  expect(new URL(fetcher.mock.calls[1][0], 'http://localhost').searchParams.has('cursor')).toBe(false);
  await act(async () => resolveOld(ok(page([first]))));
  expect(result.current.products).toEqual([second]);
  const currentSignal = fetcher.mock.calls[1][1].signal as AbortSignal;
  unmount();
  expect(currentSignal.aborted).toBe(true);
});

test('search waits for typing to settle and immediately cancels the previous request', async () => {
  jest.useFakeTimers();
  fetcher.mockResolvedValue(ok(page([first])));
  const { rerender } = renderHook(({ filters }) => useCatalogProducts(filters), { initialProps: { filters: defaultCatalogFilters } });
  await act(async () => {});
  rerender({ filters: { ...defaultCatalogFilters, search: 'dre' } });
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => jest.advanceTimersByTime(200));
  rerender({ filters: { ...defaultCatalogFilters, search: 'dress' } });
  await act(async () => jest.advanceTimersByTime(299));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1));
  expect(new URL(fetcher.mock.calls[1][0], 'http://localhost').searchParams.get('search')).toBe('dress');
  jest.useRealTimers();
});

test('a sort change clears loaded pages and cancels an in-flight Load more; duplicate clicks send one request', async () => {
  let resolveMore: (response: Response) => void;
  fetcher.mockResolvedValueOnce(ok(page([first], 'next')))
    .mockImplementationOnce(() => new Promise(resolve => { resolveMore = resolve; }))
    .mockResolvedValueOnce(ok(page([second])));
  const { result, rerender } = renderHook(({ filters }) => useCatalogProducts(filters), { initialProps: { filters: defaultCatalogFilters } });
  await waitFor(() => expect(result.current.products).toEqual([first]));
  act(() => { result.current.loadMore(); result.current.loadMore(); });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const moreSignal = fetcher.mock.calls[1][1].signal as AbortSignal;
  rerender({ filters: { ...defaultCatalogFilters, sort: 'price-desc' } });
  expect(result.current.products).toEqual([]);
  expect(moreSignal.aborted).toBe(true);
  await waitFor(() => expect(result.current.products).toEqual([second]));
  const params = new URL(fetcher.mock.calls[2][0], 'http://localhost').searchParams;
  expect(params.get('sort')).toBe('price-desc');
  expect(params.has('cursor')).toBe(false);
  await act(async () => resolveMore(ok(page([first]))));
  expect(result.current.products).toEqual([second]);
});

test('an initial error offers a first-page retry', async () => {
  fetcher.mockResolvedValueOnce(failure('catalog_unavailable')).mockResolvedValueOnce(ok(page([first])));
  const user = userEvent.setup();
  explorer();
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
  expect(screen.getByRole('status')).not.toHaveTextContent('Loading');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('First dress')).toBeInTheDocument();
  expect(new URL(fetcher.mock.calls[1][0], 'http://localhost').searchParams.has('cursor')).toBe(false);
});

test('reset clears every control and fetches the default first page', async () => {
  fetcher.mockResolvedValue(ok(page([first])));
  const user = userEvent.setup();
  explorer();
  await screen.findByText('First dress');
  await user.click(screen.getByRole('button', { name: 'More filters' }));
  for (const label of ['Search', 'Category', 'Brand', 'Color']) await user.type(screen.getByLabelText(label), 'test');
  for (const label of ['Minimum price', 'Maximum price']) await user.type(screen.getByLabelText(label), '50');
  await user.click(screen.getByLabelText('S', { exact: true }));
  await user.click(screen.getByLabelText('On sale'));
  await user.type(screen.getByLabelText('Minimum discount'), '20');
  await user.selectOptions(screen.getByLabelText('Sort'), 'price-desc');
  await user.click(screen.getByRole('button', { name: 'Reset filters' }));
  for (const label of ['Search', 'Category', 'Brand', 'Color']) expect(screen.getByLabelText(label)).toHaveValue('');
  for (const label of ['Minimum price', 'Maximum price']) expect(screen.getByLabelText(label)).toHaveValue(null);
  expect(screen.getByLabelText('S', { exact: true })).not.toBeChecked();
  expect(screen.getByLabelText('On sale')).not.toBeChecked();
  expect(screen.queryByLabelText('Minimum discount')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Sort')).toHaveValue('discount-desc');
  await waitFor(() => {
    const params = new URL(fetcher.mock.calls.at(-1)[0], 'http://localhost').searchParams;
    expect([...params.keys()].sort()).toEqual(['limit', 'sort']);
  });
});
