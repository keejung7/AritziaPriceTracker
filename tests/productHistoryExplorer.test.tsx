import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import ProductPriceHistoryExplorer from '../app/components/ProductPriceHistoryExplorer';
import { getProductChartHistory } from '../app/services/productChartService';

const observation = (date: string, price: number) => ({ scrapedDate: `${date}T10:00:00Z`, originalPrice: 100, salePrice: price, salePercent: 20, stock: [{ size: 'S', status: 'InStock', isAvailable: true }] });
const product = { productNo: '9007199254740993', productUrl: 'https://www.aritzia.com/', productName: 'Everyday shirt', productBrand: 'Wilfred', categories: [], colors: [
  { colorId: 'black', colorName: 'Black', productColorImageUrl: '/black.jpg', swatchImageUrl: null, stock: [], history: [observation('2026-10-01', 80), observation('2026-10-03', 70)] },
  { colorId: 'white', colorName: 'White', productColorImageUrl: '/white.jpg', swatchImageUrl: null, stock: [], history: [observation('2026-10-01', 90), { ...observation('2026-10-03', 85), originalPrice: 120 }] },
  { colorId: 'cream', colorName: 'Cream', productColorImageUrl: null, swatchImageUrl: null, stock: [], history: [{ ...observation('2026-10-03', 100), salePrice: null, salePercent: 0 }] },
] };
const response = (value = product) => ({ ...value, chartHistory: getProductChartHistory(value.colors) });
beforeEach(() => { global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => response() }); });
test('selected color defaults and keyboard swatches update current data and history provenance', async () => {
  const user = userEvent.setup();
  render(<MantineProvider><ProductPriceHistoryExplorer productNo={product.productNo} /></MantineProvider>);
  expect(await screen.findByRole('button', { name: 'Selected color' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Selected color price')).toHaveTextContent('$70.00 CAD');
  expect(within(screen.getByLabelText('Selected color price')).getByText('$100.00 CAD').tagName).toBe('DEL');
  expect(screen.getByLabelText('Selected color price')).toHaveTextContent('30% off');
  const white = screen.getByRole('button', { name: 'Select White' });
  act(() => white.focus());
  await user.keyboard('{Enter}');
  expect(white).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(/3 colours/)).toHaveTextContent('Colour: White · 3 colours');
  expect(screen.getByLabelText('Selected color price')).toHaveTextContent('$85.00 CAD');
  expect(within(screen.getByLabelText('Selected color price')).getByText('$120.00 CAD').tagName).toBe('DEL');
  expect(screen.getByLabelText('Selected color price')).toHaveTextContent('29% off');
  expect(within(screen.getByLabelText('Selected color price')).queryByText('$100.00 CAD')).toBeNull();
  expect(screen.getByText('At tracked low')).toBeInTheDocument();
  expect(screen.queryByText(/Lowest ever:/)).not.toBeInTheDocument();
  expect(screen.getByText(/Based on prices tracked since 2026-10-01/)).toBeInTheDocument();
  expect(screen.queryByText(/including sold-out prices/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Product lowest available' }));
  expect(screen.getByText('Lowest ever: $70.00 CAD · Black · 2026-10-03')).toBeInTheDocument();
  expect(screen.getByText(/same observation/)).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Price history chart' })).toHaveAttribute('aria-describedby');
  expect(screen.getByRole('region', { name: 'Size availability history' })).toHaveAttribute('aria-describedby');
  await user.click(screen.getByRole('button', { name: 'Select Cream' }));
  const fullPrice = screen.getByLabelText('Selected color price');
  expect(fullPrice).toHaveTextContent('$100.00 CAD');
  expect(fullPrice.querySelector('del')).toBeNull();
  expect(within(fullPrice).queryByText(/% off/)).toBeNull();
});
test('insufficient history displays the agreed message', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => response({ ...product, colors: [{ ...product.colors[0], history: [observation('2026-10-01', 80)] }] }) });
  render(<MantineProvider><ProductPriceHistoryExplorer productNo={product.productNo} /></MantineProvider>);
  expect(await screen.findByText('Price history is still building')).toBeInTheDocument();
});

test('shows an outlook for the matching color observation and highlights the size row and preserves missing dates', async () => {
  const user = userEvent.setup();
  const black = product.colors[0];
  const value = response({ ...product, colors: [{
    ...black,
    history: black.history.map((point, index) => ({
      ...point,
      stock: [{ size: 'M', status: index ? '2 Left' : 'Sold Out Online', isAvailable: index === 1 }, ...point.stock],
    })),
  }, ...product.colors.slice(1)] });
  global.fetch = jest.fn().mockImplementation((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.startsWith('/predictions/') ? {
      asOf: '2026-10-03',
      colors: { black: { current_price: 70, drop_chance_next_day: 0.12, markdown_price_low: 55, markdown_price_high: 65 } },
    } : value,
  }));
  render(<MantineProvider><ProductPriceHistoryExplorer productNo={product.productNo} /></MantineProvider>);
  expect(await screen.findByText('12%')).toBeInTheDocument();
  expect(screen.getByText('$55.00–$65.00 CAD')).toBeInTheDocument();
  const sizes = screen.getByRole('group', { name: 'Last observed sizes' });
  expect(within(sizes).getAllByRole('button').map(button => button.textContent)).toEqual(['S', 'M']);
  const medium = screen.getByRole('button', { name: 'M · 2 Left' });
  const heatmap = screen.getByRole('region', { name: 'Size availability history' });
  const row = within(heatmap).getByRole('img', { name: /Size M stock history/ });
  expect(row.querySelectorAll('rect')).toHaveLength(2);
  expect(row).toHaveTextContent('Oct 1 · M · Sold Out Online');
  expect(row).toHaveTextContent('Oct 3 · M · 2 Left');
  expect(row).not.toHaveTextContent('Oct 2');
  await user.click(medium);
  expect(medium).toHaveAttribute('aria-pressed', 'true');
  act(() => row.focus());
  await user.keyboard('{ArrowLeft}');
  expect(within(heatmap).getByText('Oct 2 · M: No observation')).toBeInTheDocument();
  await user.click(medium);
  expect(medium).toHaveAttribute('aria-pressed', 'false');
  await user.click(screen.getByRole('button', { name: 'Select White' }));
  expect(screen.queryByText('12%')).not.toBeInTheDocument();
  expect(screen.getByText('No estimate available')).toBeInTheDocument();
  expect(within(heatmap).queryByRole('img', { name: /Size M stock history/ })).not.toBeInTheDocument();
});
