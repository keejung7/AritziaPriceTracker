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
  expect(rows.find(r => r.scraped_date.startsWith('2026-10-01')).stock).toEqual([]);
});
test('SQL timestamps and both detail modes match catalog daily completeness and mixed availability', async () => {
  const { refreshCatalogReadModel } = require('../db/catalogReadModel');
  await mockDatabase.query(`INSERT INTO aritzia_products.products(product_no,product_slug,product_full_url) VALUES(2,'paired','https://example.test/2');
    INSERT INTO aritzia_products.colors(color_id,color_name) VALUES('1274','Black');
    INSERT INTO aritzia_products.product_colors(product_no,color_id) VALUES(2,'1274');
    INSERT INTO aritzia_products.price_snapshots(product_no,color_id,original_price,scraped_date) VALUES
    (2,'1274',40,'2026-10-04T10:00:00.123100Z'),(2,'1274',20,'2026-10-04T10:00:00.123900Z'),
    (2,'1274',40,'2026-10-05T10:00:00Z'),(2,'1274',20,'2026-10-05T20:00:00Z'),
    (2,'1274',40,'2026-10-06T10:00:00Z'),(2,'1274',20,'2026-10-06T20:00:00Z');
    INSERT INTO aritzia_products.stock_snapshots(product_no,color_id,product_size,product_status,scraped_date) VALUES
    (2,'1274','S','In Stock','2026-10-04T10:00:00.123100Z'),(2,'1274','S','In Stock','2026-10-04T10:00:00.123900Z'),
    (2,'1274','M',NULL,'2026-10-04T10:00:00.123900Z'),
    (2,'1274','S','In Stock','2026-10-05T10:00:00Z'),
    (2,'1274','S','In Stock','2026-10-06T10:00:00Z'),(2,'1274','S','Sold Out','2026-10-06T20:00:00Z');`);
  const rows = await getProductPriceHistory({ productNo: '2' });
  expect(typeof rows[0].scraped_date).toBe('string');
  expect(rows.find(r => Number(r.original_price) === 20 && r.scraped_date.startsWith('2026-10-04')).scraped_date).toBe('2026-10-04T10:00:00.123900Z');
  const product = formatProductPriceHistory(rows);
  for (const mode of ['selected', 'product']) expect(getPricePoints(product.colors, '1274', mode).map(p => p.y)).toEqual([20,40,null]);
  const { getAvailabilityPoints } = require('../app/services/productChartService');
  expect(getAvailabilityPoints(product.colors[0]).map(p => p.y)).toEqual([1,1,0]);
  const scopedPool = {connect: async () => ({query(sql, values) {
    if (sql.startsWith('BEGIN')) return mockDatabase.query('SAVEPOINT history_refresh');
    if (sql === 'COMMIT') return mockDatabase.query('RELEASE SAVEPOINT history_refresh');
    if (sql === 'ROLLBACK') return mockDatabase.query('ROLLBACK TO SAVEPOINT history_refresh');
    return mockDatabase.query(sql, values);
  },release(){}})};
  await refreshCatalogReadModel(scopedPool, {logger:{info(){},warn(){},error(){}}});
  const history = (await mockDatabase.query("SELECT observation_date::text, effective_price FROM aritzia_products.catalog_product_price_history WHERE product_no=2 ORDER BY observation_date")).rows;
  expect(history).toEqual([{observation_date:'2026-10-04',effective_price:'20'},{observation_date:'2026-10-05',effective_price:'40'}]);
});
