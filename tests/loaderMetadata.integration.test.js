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

test('mixed shared colors and repeated product/colors keep the last non-null metadata in artifact order', async () => {
  const db = await createCatalogTestDatabase();
  const client = { query: (sql, values) => db.query(
    sql === 'BEGIN' ? 'SAVEPOINT loader' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT loader' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT loader' : sql, values), release() {} };
  const record = (id, name, swatch, image) => ({
    product: { product_no: id, product_slug: `shirt-${id}`, product_full_url: `https://example.test/shirt-${id}`, product_name: 'Shirt', product_brand: 'Brand' },
    categories: [], productCategories: [],
    colors: [{ color_id: 'black', color_name: name, swatch_image_url: swatch }],
    productColors: [{ product_no: id, color_id: 'black', product_color_image_url: image }],
    priceSnapshots: [], stockSnapshots: [],
  });
  try {
    const rows = collectRowsForInsert([
      record(123, 'Black', 'https://example.test/swatch-first.jpg', null),
      record(124, null, null, 'https://example.test/product-124.jpg'),
      record(123, 'Onyx', 'https://example.test/swatch-last.jpg', 'https://example.test/product-123-first.jpg'),
      record(124, null, null, null),
      record(123, null, null, 'https://example.test/product-123-last.jpg'),
      record(123, null, null, null),
    ]);
    await saveParsedProducts({ connect: async () => client }, rows);
    expect({
      colors: (await db.query('SELECT color_name,swatch_image_url FROM aritzia_products.colors')).rows,
      productColors: (await db.query('SELECT product_no::text,product_color_image_url FROM aritzia_products.product_colors ORDER BY product_no')).rows,
    }).toEqual({
      colors: [{ color_name: 'Onyx', swatch_image_url: 'https://example.test/swatch-last.jpg' }],
      productColors: [{ product_no: '123', product_color_image_url: 'https://example.test/product-123-last.jpg' },
        { product_no: '124', product_color_image_url: 'https://example.test/product-124.jpg' }],
    });
    expect(rows.colors).toHaveLength(1);
    expect(rows.productColors).toHaveLength(2);
  } finally { await db.close(); }
});
