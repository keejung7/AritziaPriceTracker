import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductCard from '../app/components/catalog/ProductCard';
import type { CatalogColor, CatalogProduct } from '../app/services/catalogTypes';

const color = (id: string, overrides: Partial<CatalogColor> = {}): CatalogColor => ({ colorId: id, colorName: id, swatchImageUrl: null, productColorImageUrl: `/${id}.jpg`, originalPrice: 100, salePrice: 70, effectivePrice: 70, salePercent: 30, availableSizes: ['S', 'M'], availabilityStatus: 'available', scrapedDate: '2026-10-13', ...overrides });
const product: CatalogProduct = { productNo: '12345', productSlug: null, productUrl: null, productName: 'Everyday shirt', productBrand: 'Wilfred', categories: ['Tops'], fromColorId: 'Black', fromPrice: 70, fromOriginalPrice: 100, fromSalePercent: 30, selectedColorId: 'Black', availabilityStatus: 'available', trackingStartedAt: null, insightLabel: 'Lowest observed price', colors: [color('Black'), color('White', { effectivePrice: 100, salePrice: null, salePercent: 0, availableSizes: ['L'] }), color('Red', { availabilityStatus: 'sold_out', availableSizes: [] }), color('Blue', { availabilityStatus: 'unknown', availableSizes: [] })] };

test('From stays paired and stable while keyboard color selection changes image, price and sizes', async () => {
  const user = userEvent.setup();
  render(<ProductCard product={product} />);
  const from = screen.getByLabelText('Product starting price');
  expect(from).toHaveTextContent('From $70.00');
  expect(from).toHaveTextContent('$100.00');
  expect(from).toHaveTextContent('30% off');
  expect(from).toHaveStyle({ fontVariantNumeric: 'tabular-nums' });
  expect(screen.getAllByText('Lowest observed price')).toHaveLength(1);
  const white = screen.getByRole('button', { name: 'Select White' });
  white.focus();
  await user.keyboard('{Enter}');
  expect(white).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('img', { name: 'Everyday shirt in White' })).toHaveAttribute('src', '/White.jpg');
  expect(screen.getByLabelText('Selected color price')).toHaveTextContent('$100.00');
  expect(within(screen.getByLabelText('Selected color price')).queryByText('0% off')).toBeNull();
  expect(screen.getByLabelText('Available sizes')).toHaveTextContent('L');
  expect(from).toHaveTextContent('From $70.00');
  await user.click(screen.getByRole('button', { name: 'Select Red' }));
  expect(screen.getByText('Currently unavailable')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Select Blue' }));
  expect(screen.getByText('Availability unavailable')).toBeInTheDocument();
  expect(screen.queryByText(/deal|popular|scarcity|colors|Tops/i)).toBeNull();
});

test('sold-out products remain visible and additional swatches expand', async () => {
  const user = userEvent.setup();
  render(<ProductCard product={{ ...product, availabilityStatus: 'sold_out', colors: Array.from({ length: 8 }, (_, i) => color(`Color ${i}`, { availabilityStatus: 'sold_out', availableSizes: [] })) }} />);
  expect(screen.getByRole('link', { name: 'Everyday shirt' })).toBeInTheDocument();
  expect(screen.getByText('Currently unavailable')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Show 3 more swatches' }));
  expect(screen.getByRole('button', { name: 'Select Color 7' })).toBeInTheDocument();
});

test('selected color displays its own discount even at the same starting price', async () => {
  const user = userEvent.setup();
  render(<ProductCard product={{ ...product, colors: [...product.colors, color('Cream', { originalPrice: 140, salePercent: 50 })] }} />);
  await user.click(screen.getByRole('button', { name: 'Select Cream' }));
  expect(screen.getByLabelText('Selected color price')).toHaveTextContent('$70.00$140.0050% off');
  expect(screen.getByLabelText('Product starting price')).toHaveTextContent('30% off');
});

test('full price and missing image have honest fallbacks', () => {
  render(<ProductCard product={{ ...product, fromPrice: 100, fromOriginalPrice: 100, fromSalePercent: 0, insightLabel: null, colors: [color('White', { effectivePrice: 100, originalPrice: 100, salePrice: null, salePercent: 0, productColorImageUrl: null })] }} />);
  expect(screen.getByText('Image unavailable')).toBeInTheDocument();
  expect(screen.queryByText(/% off/)).toBeNull();
  expect(document.querySelector('del')).toBeNull();
});
