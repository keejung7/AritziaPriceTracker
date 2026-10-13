/** @jest-environment node */
const { createCatalogTestDatabase } = require('./helpers/catalogTestDatabase');
const { collectRowsForInsert, saveParsedProducts } = require('../db/db');

test('loader persists categories and images required by the catalog read model', async () => {
  const db = await createCatalogTestDatabase();
  // The helper owns the outer rollback. Give the real loader its own savepoint.
  const client = { query: (sql, values) => db.query(
    sql === 'BEGIN' ? 'SAVEPOINT loader' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT loader' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT loader' : sql, values), release() {} };
  try {
    const rows = collectRowsForInsert([{ product: { product_no: 123, product_slug: 'shirt', product_full_url: 'https://example.test/shirt', product_name: 'Shirt', product_brand: 'Brand' },
      categories: [{ category_slug: 'tops' }], productCategories: [{ product_no: 123, category_slug: 'tops' }],
      colors: [{ color_id: 'black', color_name: 'Black', swatch_image_url: 'https://example.test/swatch.jpg' }],
      productColors: [{ product_no: 123, color_id: 'black', product_color_image_url: 'https://example.test/product.jpg' }], priceSnapshots: [], stockSnapshots: [] }]);
    await saveParsedProducts({ connect: async () => client }, rows);
    expect((await db.query('SELECT category_slug FROM aritzia_products.product_categories WHERE product_no=123')).rows).toEqual([{ category_slug: 'tops' }]);
    expect((await db.query('SELECT swatch_image_url FROM aritzia_products.colors')).rows[0].swatch_image_url).toBe('https://example.test/swatch.jpg');
    expect((await db.query('SELECT product_color_image_url FROM aritzia_products.product_colors')).rows[0].product_color_image_url).toBe('https://example.test/product.jpg');
  } finally { await db.close(); }
});
