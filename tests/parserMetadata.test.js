/** @jest-environment node */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('raw artifact metadata survives parsing', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-parser-')); jest.resetModules(); });
  afterEach(() => { delete process.env.PRODUCT_DETAILS_PATH; fs.rmSync(dir, { recursive: true }); });
  function parse(categories, images = {}) {
    const input = { product_link: 'https://www.aritzia.com/en/product/shirt/123.html', source_categories: categories,
      scraped_at: '2026-10-12T10:00:00Z', colors: [{ black: { color_text: 'Black', original_price: '$100', sizes: [], ...images } }] };
    process.env.PRODUCT_DETAILS_PATH = path.join(dir, 'artifact.jsonl');
    fs.writeFileSync(process.env.PRODUCT_DETAILS_PATH, JSON.stringify(input));
    return require('../db/parser').getProductDataForInsert()[0];
  }
  test('carries deduplicated source categories and optional images for migration 009', () => {
    const product = parse(['tops', ' tops ', '', 'shirts'], { swatch_image_url: 'https://example.test/swatch.jpg', product_color_image_url: 'https://example.test/product.jpg' });
    expect(product.categories).toEqual([{ category_slug: 'tops' }, { category_slug: 'shirts' }]);
    expect(product.productCategories).toEqual([{ product_no: 123, category_slug: 'tops' }, { product_no: 123, category_slug: 'shirts' }]);
    expect(product.colors[0].swatch_image_url).toBe('https://example.test/swatch.jpg');
    expect(product.productColors[0].product_color_image_url).toBe('https://example.test/product.jpg');
  });
  test('old artifacts supply empty category lists and null images', () => {
    const product = parse(undefined);
    expect(product.categories).toEqual([]);
    expect(product.productCategories).toEqual([]);
    expect(product.colors[0].swatch_image_url).toBeNull();
    expect(product.productColors[0].product_color_image_url).toBeNull();
  });
});
