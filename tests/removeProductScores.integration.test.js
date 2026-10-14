/** @jest-environment node */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createCatalogTestDatabase } = require('./helpers/catalogTestDatabase');

describe('retiring derived score and latest-price tables', () => {
  let db;
  beforeAll(async () => { db = await createCatalogTestDatabase(); });
  afterAll(async () => { if (db) await db.close(); });

  test('drops populated obsolete tables and indexes idempotently while preserving facts and catalog', async () => {
    await db.query("INSERT INTO products VALUES (1, 'one', 'https://example.com/one', 'One', 'Aritzia')");
    await db.query("INSERT INTO colors (color_id) VALUES ('black')");
    await db.query("INSERT INTO product_colors (product_no, color_id) VALUES (1, 'black')");
    await db.query("INSERT INTO price_snapshots VALUES ('black',1,100,75,0.25,'2026-10-13T12:00Z')");
    await db.query("INSERT INTO stock_snapshots VALUES ('S','black',1,'In Stock','2026-10-13T12:00Z')");
    await db.query("INSERT INTO catalog_snapshots (snapshot_id,status,data_as_of) VALUES (1,'active','2026-10-13T12:00Z')");
    await db.query("INSERT INTO catalog_products (snapshot_id,product_no,from_price,availability_status) VALUES (1,1,75,'available')");
    const obsolete = ['product_color_deal_scores', 'product_color_stock_metrics', 'latest_product_color_prices'];
    for (const table of obsolete) {
      await db.query(`CREATE TABLE aritzia_products.${table} (product_no bigint REFERENCES products(product_no), value integer)`);
      await db.query(`CREATE INDEX ${table}_test_idx ON aritzia_products.${table} (value)`);
      await db.query(`INSERT INTO aritzia_products.${table} VALUES (1,50)`);
    }
    const sql = readFileSync(path.join(__dirname, '../db/migrations/010_remove_product_scores.sql'), 'utf8').replace(/^BEGIN;|^COMMIT;/gm, '');
    // Verify PostgreSQL rollback semantics before applying the forward-only migration.
    await db.query('SAVEPOINT removal');
    await db.query(sql);
    await db.query('ROLLBACK TO SAVEPOINT removal');
    for (const table of obsolete) expect((await db.query(`SELECT * FROM aritzia_products.${table}`)).rows).toHaveLength(1);
    await db.query(sql);
    await db.query(sql);
    for (const table of obsolete) {
      expect((await db.query('SELECT to_regclass($1) AS relation', [`${db.schema}.${table}`])).rows[0].relation).toBeNull();
      expect((await db.query('SELECT to_regclass($1) AS relation', [`${db.schema}.${table}_test_idx`])).rows[0].relation).toBeNull();
    }
    expect((await db.query('SELECT original_price,sale_price FROM price_snapshots')).rows).toEqual([{ original_price: '100', sale_price: '75' }]);
    expect((await db.query('SELECT product_size,product_status FROM stock_snapshots')).rows).toEqual([{ product_size: 'S', product_status: 'In Stock' }]);
    expect((await db.query('SELECT from_price,availability_status FROM catalog_products')).rows).toEqual([{ from_price: '75', availability_status: 'available' }]);
  });
});
