/** @jest-environment node */
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { refreshCatalogReadModel } = require('../db/catalogReadModel');
const { createDbLogger } = require('../db/loadLogging');
const { validateTestDatabaseUrl } = require('./helpers/catalogTestDatabase');

const connectionString = process.env.CATALOG_TEST_DATABASE_URL;
describe('atomic catalog derivation in an isolated schema', () => {
  let pool, client, schema, scopedPool, logPath, result;
  beforeAll(async () => {
    pool = new Pool({ connectionString: validateTestDatabaseUrl(connectionString) });
    client = await pool.connect();
    schema = `catalog_test_${randomBytes(8).toString('hex')}`;
    logPath = `/private/tmp/${schema}.log`;
    const raw = fs.readFileSync(require.resolve('./fixtures/originalRawSchema.sql'), 'utf8');
    const migration = fs.readFileSync(require.resolve('../db/migrations/009_add_catalog_read_model.sql'), 'utf8');
    await client.query(raw.replaceAll('aritzia_products', schema));
    await client.query(migration.replaceAll('aritzia_products', schema));
    scopedPool = { connect: async () => ({
      query: (sql, values) => client.query(sql.replaceAll('aritzia_products', schema), values),
      release() {},
    }) };
  });
  afterAll(async () => {
    if (schema) await client.query(`DROP SCHEMA ${schema} CASCADE`);
    client?.release();
    await pool?.end();
  });
  const query = (sql, values) => client.query(sql.replaceAll('aritzia_products', schema), values);
  const logger = () => createDbLogger({ logPath, info: () => {}, error: () => {}, warn: () => {} });
  async function observe(product, color, price, date, statuses) {
    await query(`INSERT INTO aritzia_products.products VALUES ($1::bigint,$2,$2,$2,'Brand') ON CONFLICT DO NOTHING`, [product,String(product)]);
    await query(`INSERT INTO aritzia_products.colors(color_id) VALUES($1) ON CONFLICT DO NOTHING`, [color]);
    await query(`INSERT INTO aritzia_products.product_colors(color_id,product_no) VALUES($1,$2) ON CONFLICT DO NOTHING`, [color,product]);
    await query(`INSERT INTO aritzia_products.price_snapshots(color_id,product_no,original_price,scraped_date) VALUES($1,$2,$3,$4)`, [color,product,price,date]);
    for (const [i,status] of (statuses || []).entries()) await query(`INSERT INTO aritzia_products.stock_snapshots VALUES($1,$2,$3,$4,$5)`, [`size${i}`,color,product,status,date]);
  }
  beforeEach(async () => {
    await query(`DROP TRIGGER IF EXISTS reject_activation ON aritzia_products.catalog_snapshots`);
    await query(`TRUNCATE aritzia_products.products, aritzia_products.colors,
      aritzia_products.categories, aritzia_products.catalog_snapshots RESTART IDENTITY CASCADE`);
    await observe(1,'a',50,'2026-10-13T12:00Z',[' In Stock ','Sold Out']);
    await observe(1,'b',50,'2026-10-13T12:00Z',['Only a Few Left']);
    await observe(1,'a',50,'2026-06-01T12:00Z',['Available']);
    await observe(1,'a',60,'2026-07-16T00:00Z',['available']);
    await observe(1,'a',60,'2026-07-15T23:59Z',['AVAILABLE']);
    await observe(1,'c',1,'2026-10-13T12:00Z',['Sold Out']);
    await observe(1,'d',2,'2026-10-13T12:00Z',['Coming Soon']);
    await observe(2,'a',30,'2026-10-13T12:00Z',['Sold Out','Unavailable']);
    await observe(3,'a',20,'2026-10-12T12:00Z',[]);
    await query(`INSERT INTO aritzia_products.stock_snapshots VALUES('S','a',3,'In Stock','2026-10-13T12:00Z')`);
    await observe(4,'a',10,'2026-10-13T12:00Z',[null]);
    await observe(5,'a',10,'2026-10-13T12:00Z',['Coming Soon']);
    await observe(6,'a',10,'2026-06-01T12:00Z',['Available']);
    await observe(6,'a',20,'2026-10-13T12:00Z',['Available']);
    await observe(7,'a',10,'2026-09-01T12:00Z',['Available']);
    await observe(7,'a',20,'2026-10-13T12:00Z',['Available']);
    await query(`INSERT INTO aritzia_products.categories VALUES('tops'),('sale')`);
    await query(`INSERT INTO aritzia_products.product_categories VALUES(1,'tops'),(1,'sale')`);
    await query(`UPDATE aritzia_products.colors SET color_name='Black',swatch_image_url='https://example.com/swatch' WHERE color_id='a'`);
    await query(`UPDATE aritzia_products.product_colors SET product_color_image_url='https://example.com/product' WHERE product_no=1 AND color_id='a'`);
    result = await refreshCatalogReadModel(scopedPool,{ logger:logger() });
  });
  test('exact stock eligibility, deterministic daily minima, bounded history and label priority', async () => {
    expect(result.productCount).toBe(7);
    expect(result.colorCount).toBe(10);
    const colors = (await query(`SELECT product_no,color_id,availability_status,available_sizes FROM aritzia_products.catalog_product_colors WHERE snapshot_id=$1 ORDER BY product_no,color_id`,[result.snapshotId])).rows;
    expect(colors[0]).toMatchObject({ availability_status:'available',available_sizes:['size0'] });
    expect(colors[4].availability_status).toBe('sold_out');
    expect(colors.slice(5,8).map(c=>c.availability_status)).toEqual(['unknown','unknown','unknown']);
    const products = (await query(`SELECT product_no,from_price,insight_label FROM aritzia_products.catalog_products WHERE snapshot_id=$1 ORDER BY product_no`,[result.snapshotId])).rows;
    expect(products[0]).toMatchObject({ from_price:'50',insight_label:'Lowest ever' });
    expect(products.slice(1,5).map(p=>p.from_price)).toEqual([null,null,null,null]);
    expect(products[5].insight_label).toBe('Lowest in 90 days');
    expect(products[6].insight_label).toBe('Lowest in 30 days');
    expect((await query(`SELECT categories FROM aritzia_products.catalog_products WHERE snapshot_id=$1 AND product_no=1`,[result.snapshotId])).rows[0].categories).toEqual(['sale','tops']);
    expect((await query(`SELECT color_name,swatch_image_url,product_color_image_url FROM aritzia_products.catalog_product_colors WHERE snapshot_id=$1 AND product_no=1 AND color_id='a'`,[result.snapshotId])).rows[0]).toEqual({color_name:'Black',swatch_image_url:'https://example.com/swatch',product_color_image_url:'https://example.com/product'});
    const history = (await query(`SELECT product_no,color_id,observation_date::text FROM aritzia_products.catalog_product_price_history WHERE snapshot_id=$1 ORDER BY product_no,observation_date`,[result.snapshotId])).rows;
    expect(history).toEqual([
      { product_no:'1',color_id:'a',observation_date:'2026-07-16' },
      { product_no:'1',color_id:'a',observation_date:'2026-10-13' },
      { product_no:'6',color_id:'a',observation_date:'2026-10-13' },
      { product_no:'7',color_id:'a',observation_date:'2026-09-01' },
      { product_no:'7',color_id:'a',observation_date:'2026-10-13' },
    ]);
    const log = fs.readFileSync(logPath,'utf8');
    expect(log).toContain('stage=derive_all_time_lows queryDurationMs=');
    expect(log).toContain('totalDurationMs=');
    expect(log).toContain('productCount=7 colorCount=10 historyCount=5');
    expect(log).toContain('statementTimeoutMs=120000');
    expect(log).toContain('cleanup removedSnapshots=0 retainedNonActive=2');
  });
  test('rolling history expiry is allowed but loss within the comparable window fails', async () => {
    await observe(1,'a',50,'2026-10-11T12:00Z',['In Stock']);
    await observe(1,'a',50,'2026-10-12T12:00Z',['In Stock']);
    const baseline=await refreshCatalogReadModel(scopedPool,{logger:logger()});
    expect(baseline.historyCount).toBe(7);
    await query("UPDATE aritzia_products.stock_snapshots SET product_status='Sold Out' WHERE scraped_date IN ('2026-10-11T12:00Z','2026-10-12T12:00Z')");
    await expect(refreshCatalogReadModel(scopedPool,{logger:logger(),warningRegressionRatio:0.9,failureRegressionRatio:0.8})).rejects.toThrow('Severe history count regression: 7 -> 5');
    expect((await query("SELECT snapshot_id::text AS id FROM aritzia_products.catalog_snapshots WHERE status='active'")).rows[0].id).toBe(baseline.snapshotId);
    await observe(1,'a',50,'2027-02-01T12:00Z',['In Stock']);
    const advanced=await refreshCatalogReadModel(scopedPool,{logger:logger()});
    expect(advanced.historyCount).toBe(1);
    expect((await query("SELECT snapshot_id::text AS id FROM aritzia_products.catalog_snapshots WHERE status='active'")).rows[0].id).toBe(advanced.snapshotId);
  });
  test('raw fractional percentages become paired factual percentage points, including discount filters', async () => {
    await query(`UPDATE aritzia_products.price_snapshots SET original_price=100,sale_price=40,sale_percent=0.6 WHERE product_no=1 AND color_id='a'`);
    const refreshed = await refreshCatalogReadModel(scopedPool, { logger: logger() });
    const color = (await query(`SELECT sale_percent FROM aritzia_products.catalog_product_colors WHERE snapshot_id=$1 AND product_no=1 AND color_id='a'`, [refreshed.snapshotId])).rows[0];
    expect(Number(color.sale_percent)).toBe(60);
    const history = (await query(`SELECT sale_percent FROM aritzia_products.catalog_product_price_history WHERE snapshot_id=$1 AND product_no=1`, [refreshed.snapshotId])).rows;
    expect(history.every(point => Number(point.sale_percent) === 60)).toBe(true);
    const { buildCatalogQuery } = require('../db/catalogQueries');
    const built = buildCatalogQuery({ limit: 24, sort: 'discount-desc', cursor: null, search: null, brand: null, category: null, color: 'a', sizes: [], minPrice: null, maxPrice: null, saleOnly: true, minDiscount: 20 });
    const catalog = (await query(built.text, built.values)).rows[0];
    expect(catalog.total).toBe(1);
    expect(Number(catalog.products[0].from_sale_percent)).toBe(60);
    expect((await query(`SELECT sale_percent FROM aritzia_products.price_snapshots WHERE product_no=1 AND color_id='a' LIMIT 1`)).rows[0].sale_percent).toBe('0.6');
  });
  test('paired discounts guard unknown or zero original prices and ignore contradictory raw metadata', async () => {
    await query(`UPDATE aritzia_products.price_snapshots SET original_price=CASE color_id WHEN 'a' THEN NULL WHEN 'b' THEN 0 WHEN 'c' THEN 100 ELSE 100 END,
      sale_price=CASE color_id WHEN 'a' THEN 20 WHEN 'b' THEN 0 WHEN 'c' THEN 120 ELSE NULL END,sale_percent=0.6 WHERE product_no=1`);
    const refreshed = await refreshCatalogReadModel(scopedPool, { logger: logger() });
    expect((await query(`SELECT color_id,sale_percent FROM aritzia_products.catalog_product_colors WHERE snapshot_id=$1 AND product_no=1 ORDER BY color_id`, [refreshed.snapshotId])).rows)
      .toEqual([{ color_id: 'a', sale_percent: null }, { color_id: 'b', sale_percent: null }, { color_id: 'c', sale_percent: null }, { color_id: 'd', sale_percent: '0' }]);
  });
  test('failed activation preserves previous active snapshot and raw observations', async () => {
    const old = (await query(`SELECT snapshot_id FROM aritzia_products.catalog_snapshots WHERE status='active'`)).rows[0].snapshot_id;
    await query(`CREATE FUNCTION ${schema}.reject_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='active' THEN RAISE EXCEPTION 'activation rejected'; END IF; RETURN NEW; END $$`);
    await query(`CREATE TRIGGER reject_activation BEFORE UPDATE ON aritzia_products.catalog_snapshots FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_activation()`);
    await expect(refreshCatalogReadModel(scopedPool,{logger:logger()})).rejects.toThrow('activation rejected');
    expect((await query(`SELECT snapshot_id FROM aritzia_products.catalog_snapshots WHERE status='active'`)).rows).toEqual([{snapshot_id:old}]);
    const failed = (await query(`SELECT snapshot_id,status,data_as_of,created_at FROM aritzia_products.catalog_snapshots WHERE status='failed'`)).rows;
    expect(failed).toHaveLength(1);
    expect(Number(failed[0].snapshot_id)).toBeGreaterThan(Number(old));
    expect(failed[0].created_at).toBeInstanceOf(Date);
    expect(failed[0].data_as_of.toISOString()).toBe('2026-10-13T12:00:00.000Z');
    expect(Number((await query(`SELECT count(*) FROM aritzia_products.price_snapshots`)).rows[0].count)).toBe(15);
    expect(fs.readFileSync(logPath,'utf8')).toContain('failed stage=activate_snapshot');
    await query(`DROP TRIGGER reject_activation ON aritzia_products.catalog_snapshots`);
  });
  test('keeps active and two most recent inactive snapshots', async () => {
    for (let i=0;i<3;i++) await refreshCatalogReadModel(scopedPool,{logger:logger()});
    expect((await query(`SELECT status,count(*)::int AS count FROM aritzia_products.catalog_snapshots GROUP BY status ORDER BY status`)).rows).toEqual([{status:'active',count:1},{status:'inactive',count:2}]);
  });
  test('warning regressions persist to DB_LOG_PATH and still publish', async () => {
    const previous = (await query(`SELECT snapshot_id FROM aritzia_products.catalog_snapshots WHERE status='active'`)).rows[0].snapshot_id;
    await query(`DELETE FROM aritzia_products.catalog_products WHERE snapshot_id=$1 AND product_no=7`,[previous]);
    // Inflate the previous color count without changing the raw catalog.
    await query(`INSERT INTO aritzia_products.colors(color_id) VALUES('extra')`);
    await query(`INSERT INTO aritzia_products.product_colors(color_id,product_no) VALUES('extra',1)`);
    await query(`INSERT INTO aritzia_products.catalog_product_colors(snapshot_id,product_no,color_id,scraped_date) VALUES($1,1,'extra',now())`,[previous]);
    await refreshCatalogReadModel(scopedPool,{logger:logger(),warningRegressionRatio:0.95});
    expect(fs.readFileSync(logPath,'utf8')).toContain('warning color count regression: 11 -> 10');
  });
  test('latest complete intraday observation determines history and all low labels', async () => {
    await observe(8,'a',10,'2026-10-13T09:00Z',['Available']);
    await observe(8,'a',20,'2026-10-13T18:00Z',['Available']);
    await observe(8,'a',5,'2026-10-13T19:00Z',[]);
    await observe(9,'a',10,'2026-10-13T09:00Z',['Available']);
    await observe(9,'a',20,'2026-10-13T18:00Z',['Sold Out']);
    await observe(10,'a',10,'2026-06-01T09:00Z',['Available']);
    await observe(10,'a',20,'2026-06-01T18:00Z',['Available']);
    await observe(10,'a',20,'2026-10-13T18:00Z',['Available']);
    await observe(11,'a',10,'2026-10-13T09:00Z',['Available']);
    await observe(11,'a',20,'2026-10-13T18:00Z',['Coming Soon']);
    await observe(12,'a',5,'2026-06-01T09:00Z',['Available']);
    await observe(12,'a',10,'2026-09-01T09:00Z',['Available']);
    await observe(12,'a',20,'2026-09-01T18:00Z',['Available']);
    await observe(12,'a',20,'2026-10-13T18:00Z',['Available']);
    await observe(13,'a',5,'2026-06-01T09:00Z',['Available']);
    await observe(13,'a',10,'2026-09-01T09:00Z',['Available']);
    await observe(13,'a',10,'2026-10-01T09:00Z',['Available']);
    await observe(13,'a',20,'2026-10-01T18:00Z',['Available']);
    await observe(13,'a',20,'2026-10-13T18:00Z',['Available']);
    const next = await refreshCatalogReadModel(scopedPool,{logger:logger()});
    expect((await query(`SELECT effective_price FROM aritzia_products.catalog_product_price_history WHERE snapshot_id=$1 AND product_no=8`,[next.snapshotId])).rows).toEqual([{effective_price:'20'}]);
    expect((await query(`SELECT insight_label FROM aritzia_products.catalog_products WHERE snapshot_id=$1 AND product_no=10`,[next.snapshotId])).rows).toEqual([{insight_label:'Lowest ever'}]);
    expect((await query(`SELECT * FROM aritzia_products.catalog_product_price_history WHERE snapshot_id=$1 AND product_no=9`,[next.snapshotId])).rows).toEqual([]);
    expect((await query(`SELECT * FROM aritzia_products.catalog_product_price_history WHERE snapshot_id=$1 AND product_no=11`,[next.snapshotId])).rows).toEqual([]);
    expect((await query(`SELECT insight_label FROM aritzia_products.catalog_products WHERE snapshot_id=$1 AND product_no IN (12,13) ORDER BY product_no`,[next.snapshotId])).rows).toEqual([{insight_label:'Lowest in 90 days'},{insight_label:'Lowest in 30 days'}]);
  });
  test.each([
    ['current effective', '2026-10-13T18:00Z', -1, null],
    ['current original', '2026-10-13T18:00Z', -1, 10],
    ['history effective', '2026-09-01T18:00Z', -1, null],
    ['all-time original', '2026-06-01T18:00Z', -1, 10],
  ])('rejects negative %s prices without changing the active snapshot', async (_,date,original,sale) => {
    const old = result.snapshotId;
    await observe(8,'a',original,date,['Available']);
    if (sale!==null) await query(`UPDATE aritzia_products.price_snapshots SET sale_price=$1 WHERE product_no=8`,[sale]);
    await expect(refreshCatalogReadModel(scopedPool,{logger:logger()})).rejects.toThrow(/negative price/i);
    expect((await query(`SELECT snapshot_id FROM aritzia_products.catalog_snapshots WHERE status='active'`)).rows).toEqual([{snapshot_id:old}]);
    expect((await query(`SELECT status FROM aritzia_products.catalog_snapshots WHERE status='failed'`)).rows).toEqual([{status:'failed'}]);
    expect((await query(`SELECT original_price FROM aritzia_products.price_snapshots WHERE product_no=8`)).rows).toEqual([{original_price:'-1'}]);
  });
});
