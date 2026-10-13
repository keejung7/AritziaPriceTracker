// Explicit URL only; no production DATABASE_URL fallback. Every statement is read-only.
const { Client } = require('pg');
const { performance } = require('node:perf_hooks');
const { buildCatalogQuery } = require('../../db/catalogQueries');

async function profileCatalogQueries(connectionString) {
  if (!connectionString) throw new Error('Set CATALOG_PROFILE_DATABASE_URL explicitly (prefer a disposable test database)');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='120s'");
    const metadata = (await client.query(`SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only,
      (SELECT count(*) FROM aritzia_products.products) AS raw_products,
      (SELECT count(*) FROM aritzia_products.price_snapshots) AS raw_prices,
      (SELECT count(*) FROM aritzia_products.stock_snapshots) AS raw_stock`)).rows[0];
    const base = { limit: 24, sort: 'discount-desc', cursor: null, search: null, brand: null, category: null, color: null, sizes: [], minPrice: null, maxPrice: null, saleOnly: false, minDiscount: null };
    const first = buildCatalogQuery(base);
    const initial = (await client.query(first.text, first.values)).rows[0];
    if (!initial.snapshot || !initial.products.length) throw new Error('Profile requires a populated catalog snapshot');
    const last = initial.products.at(-1);
    const shapes = {
      default: first,
      combined: buildCatalogQuery({ ...base, category: 'tops', color: 'red', sizes: ['M'], minPrice: 40, maxPrice: 60, saleOnly: true, minDiscount: 20 }),
      continuation: buildCatalogQuery({ ...base, cursor: { snapshotId: initial.snapshot.snapshot_id, sort: base.sort, lastSortValue: last.cursor_sort_value, lastProductNo: last.product_no } }),
      'exact-total': { text: "SELECT count(*) FROM aritzia_products.catalog_products WHERE snapshot_id=$1", values: [initial.snapshot.snapshot_id] },
    };
    const queries = {};
    for (const [name, query] of Object.entries(shapes)) {
      const start = performance.now();
      const result = await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + query.text, query.values);
      queries[name] = { wallDurationMs: performance.now() - start, explain: result.rows[0]['QUERY PLAN'][0] };
    }
    return { capturedAt: new Date().toISOString(), metadata, total: initial.total, queries };
  } finally { await client.query('ROLLBACK'); await client.end(); }
}
module.exports = { profileCatalogQueries };
if (require.main === module) profileCatalogQueries(process.env.CATALOG_PROFILE_DATABASE_URL)
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
