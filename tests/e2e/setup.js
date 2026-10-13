const { Client } = require('pg');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { validateTestDatabaseUrl } = require('../helpers/catalogTestDatabase');

// Refuse existing schemas rather than truncate a database that might belong to someone.
module.exports = async function setup() {
  const connectionString = validateTestDatabaseUrl();
  const db = new Client({ connectionString });
  await db.connect();
  try {
    const actual = (await db.query('SELECT current_database() AS name')).rows[0].name;
    if (!actual.endsWith('_test')) throw new Error('E2E requires a disposable _test database');
    if ((await db.query("SELECT 1 FROM pg_namespace WHERE nspname='aritzia_products'")).rowCount) {
      throw new Error('E2E seed refuses an existing aritzia_products schema; create a fresh disposable _test database');
    }
    await db.query(readFileSync(path.join(__dirname, '../fixtures/originalRawSchema.sql'), 'utf8'));
    for (const name of ['009_add_catalog_read_model.sql', '010_remove_product_scores.sql']) {
      await db.query(readFileSync(path.join(__dirname, '../../db/migrations', name), 'utf8'));
    }
    await db.query(`INSERT INTO aritzia_products.products(product_no,product_slug,product_full_url,product_name,product_brand)
      SELECT n,'product-'||n,'https://example.test/product/'||n,'Product '||lpad(n::text,3,'0'),'Test Brand' FROM generate_series(1,120) n;
      INSERT INTO aritzia_products.categories VALUES('tops');
      INSERT INTO aritzia_products.product_categories SELECT n,'tops' FROM generate_series(1,120) n;
      INSERT INTO aritzia_products.colors(color_id,color_name) VALUES('black','Black'),('red','Red');
      INSERT INTO aritzia_products.product_colors(product_no,color_id) SELECT n,c FROM generate_series(1,120) n CROSS JOIN unnest(ARRAY['black','red']) c;
      INSERT INTO aritzia_products.price_snapshots(product_no,color_id,original_price,sale_price,sale_percent,scraped_date)
      SELECT n,c,100,CASE WHEN c='red' THEN 40+n%50+d ELSE NULL END,
        CASE WHEN c='red' THEN (60-n%50-d)/100.0 ELSE NULL END,
        '2026-10-13T10:00:00Z'::timestamptz-d*interval '1 day'
      FROM generate_series(1,120) n CROSS JOIN unnest(ARRAY['black','red']) c CROSS JOIN generate_series(0,2) d;
      INSERT INTO aritzia_products.stock_snapshots(product_no,color_id,product_size,product_status,scraped_date)
      SELECT n,c,CASE WHEN c='red' THEN 'M' ELSE 'S' END,CASE WHEN n=120 THEN 'Sold Out' ELSE 'In Stock' END,
        '2026-10-13T10:00:00Z'::timestamptz-d*interval '1 day'
      FROM generate_series(1,120) n CROSS JOIN unnest(ARRAY['black','red']) c CROSS JOIN generate_series(0,2) d;`);
    const output = path.resolve('.validation-artifacts/catalog', new Date().toISOString().replaceAll(':', '-'));
    mkdirSync(output, { recursive: true });
    const logPath = path.join(output, `db_refresh_${new Date().toISOString().replaceAll(':', '-')}.log`);
    const env = { ...process.env, DATABASE_URL: connectionString, DB_LOG_PATH: logPath };
    const refresh = () => execFileSync(process.execPath, ['db/refresh_catalog_read_model.js'], { env, encoding: 'utf8' });
    for (let i = 0; i < 4; i++) refresh();
    const before = (await db.query("SELECT snapshot_id::text AS id FROM aritzia_products.catalog_snapshots WHERE status='active'")).rows[0].id;
    const retention = (await db.query('SELECT status,count(*)::int AS count FROM aritzia_products.catalog_snapshots GROUP BY status ORDER BY status')).rows;
    if (JSON.stringify(retention) !== JSON.stringify([{ status: 'active', count: 1 }, { status: 'inactive', count: 2 }])) throw new Error('Snapshot retention failed');
    await db.query("UPDATE aritzia_products.price_snapshots SET sale_price=-1 WHERE product_no=1 AND color_id='red' AND scraped_date='2026-10-13T10:00:00Z'");
    let failed = false;
    try { refresh(); } catch (error) { failed = error.status === 1; }
    await db.query("UPDATE aritzia_products.price_snapshots SET sale_price=41 WHERE product_no=1 AND color_id='red' AND scraped_date='2026-10-13T10:00:00Z'");
    const after = (await db.query("SELECT snapshot_id::text AS id FROM aritzia_products.catalog_snapshots WHERE status='active'")).rows[0].id;
    const failedCount = (await db.query("SELECT count(*)::int AS count FROM aritzia_products.catalog_snapshots WHERE status='failed'")).rows[0].count;
    if (!failed || before !== after || failedCount !== 1) throw new Error('Failed refresh did not preserve prior snapshot and persist failure marker');
    writeFileSync(path.join(output, 'refresh-evidence.json'), JSON.stringify({ logPath, activeSnapshotBeforeFailure: before, activeSnapshotAfterFailure: after, failedCount, retention, statementTimeoutMs: 120000 }, null, 2));
  } finally { await db.end(); }
};
