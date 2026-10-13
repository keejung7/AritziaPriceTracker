import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import ProductPriceHistoryExplorer from '../app/components/ProductPriceHistoryExplorer';

const observation = (date: string, price: number) => ({ scrapedDate: `${date}T10:00:00Z`, originalPrice: 100, salePrice: price, salePercent: 20, stock: [{ size: 'S', status: 'InStock', isAvailable: true }] });
const product = { productNo: '9007199254740993', productUrl: 'https://www.aritzia.com/', productName: 'Everyday shirt', productBrand: 'Wilfred', categories: [], colors: [
  { colorId: 'black', colorName: 'Black', productColorImageUrl: '/black.jpg', swatchImageUrl: null, stock: [], history: [observation('2026-10-01', 80), observation('2026-10-03', 70)] },
  { colorId: 'white', colorName: 'White', productColorImageUrl: '/white.jpg', swatchImageUrl: null, stock: [], history: [observation('2026-10-01', 90), observation('2026-10-03', 85)] },
] };
beforeEach(() => { global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => product }); });
test('selected color defaults and keyboard swatches update current data and history provenance', async () => {
  const user = userEvent.setup();
  render(<MantineProvider><ProductPriceHistoryExplorer productNo={product.productNo} /></MantineProvider>);
  expect(await screen.findByRole('button', { name: 'Selected color' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Selected color price')).toHaveTextContent('$70.00 CAD');
  const white = screen.getByRole('button', { name: 'Select White' });
  white.focus(); await user.keyboard('{Enter}');
  expect(white).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Selected color price')).toHaveTextContent('$85.00 CAD');
  expect(screen.getByText('Lowest observed: $85.00 CAD · White · 2026-10-03')).toBeInTheDocument();
  expect(screen.getByText(/Tracking started 2026-10-01/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Product lowest available' }));
  expect(screen.getByText('Lowest observed: $70.00 CAD · Black · 2026-10-03')).toBeInTheDocument();
  expect(screen.getByText(/same observation/)).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Price history chart' })).toHaveAttribute('aria-describedby');
  expect(screen.getByRole('region', { name: 'Availability history chart' })).toHaveAttribute('aria-describedby');
});
test('insufficient history displays the agreed message', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ...product, colors: [{ ...product.colors[0], history: [observation('2026-10-01', 80)] }] }) });
  render(<MantineProvider><ProductPriceHistoryExplorer productNo={product.productNo} /></MantineProvider>);
  expect(await screen.findByText('Price history is still building')).toBeInTheDocument();
});
