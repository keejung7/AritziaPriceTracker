/** @jest-environment node */
let mockDatabase;
jest.mock('pg', () => ({ ...jest.requireActual('pg'), Pool: class { query(sql, values) { return mockDatabase.query(sql, values); } } }));
const { createCatalogTestDatabase } = require('./helpers/catalogTestDatabase');
const { getProductPriceHistory } = require('../db/queries');
const { formatProductPriceHistory } = require('../app/services/priceHistoryService');
const { getPricePoints } = require('../app/services/productChartService');
beforeAll(async () => { mockDatabase = await createCatalogTestDatabase(); });
afterAll(async () => { await mockDatabase?.close(); });
test('history prices qualify only with recognized available stock at their exact timestamp', async () => {
  await mockDatabase.query(`INSERT INTO aritzia_products.products(product_no,product_slug,product_full_url) VALUES(9007199254740993,'test','https://example.test')`);
  await mockDatabase.query(`INSERT INTO aritzia_products.colors(color_id,color_name) VALUES('black','Black')`);
  await mockDatabase.query(`INSERT INTO aritzia_products.product_colors(product_no,color_id) VALUES(9007199254740993,'black')`);
  await mockDatabase.query(`INSERT INTO aritzia_products.price_snapshots(product_no,color_id,original_price,scraped_date)
    SELECT 9007199254740993,'black',100, '2026-10-01T10:00:00Z'::timestamptz + n*interval '1 day' FROM generate_series(0,5) n`);
  await mockDatabase.query(`INSERT INTO aritzia_products.stock_snapshots(product_no,color_id,product_size,product_status,scraped_date) VALUES
    (9007199254740993,'black','S','In Stock','2026-10-01T09:00:00Z'),
    (9007199254740993,'black','S','In Stock','2026-10-02T11:00:00Z'),
    (9007199254740993,'black','S',NULL,'2026-10-03T10:00:00Z'),
    (9007199254740993,'black','S','Mystery','2026-10-04T10:00:00Z'),
    (9007199254740993,'black','S','Sold Out','2026-10-05T10:00:00Z'),
    (9007199254740993,'black','S','Only a Few Left','2026-10-06T10:00:00Z')`);
  const rows = await getProductPriceHistory({ productNo: '9007199254740993' });
  const product = formatProductPriceHistory(rows);
  expect(product.productNo).toBe('9007199254740993');
  expect(getPricePoints(product.colors, 'black', 'product').map(p => p.y)).toEqual([null, null, null, null, null, 100]);
  expect(rows.find(r => r.scraped_date.toISOString().startsWith('2026-10-01')).stock).toEqual([]);
});
