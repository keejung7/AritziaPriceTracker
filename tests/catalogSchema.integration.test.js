/** @jest-environment node */
const { createCatalogTestDatabase, validateTestDatabaseUrl } = require('./helpers/catalogTestDatabase');
const { readFileSync } = require('node:fs');
const path = require('node:path');

describe('catalog test database safety', () => {
  test('refuses missing URLs and non-test databases before connecting', () => {
    expect(() => validateTestDatabaseUrl('')).toThrow('CATALOG_TEST_DATABASE_URL');
    expect(() => validateTestDatabaseUrl('postgres://localhost/catalog')).toThrow('ending in _test');
    expect(() => validateTestDatabaseUrl('postgres://localhost/catalog_test?dbname=production')).toThrow('ending in _test');
    expect(validateTestDatabaseUrl('postgres://localhost/catalog_test')).toBe('postgres://localhost/catalog_test');
  });
});

describe('catalog schema', () => {
  let db;
  beforeAll(async () => { db = await createCatalogTestDatabase(); });
  afterAll(async () => { if (db) await db.close(); });
  beforeEach(async () => {
    await db.query('SAVEPOINT catalog_case');
    await db.query("INSERT INTO products VALUES (1, 'one', 'https://example.com/one', 'One', 'Aritzia')");
    await db.query("INSERT INTO colors (color_id) VALUES ('black'), ('white')");
    await db.query("INSERT INTO product_colors (product_no, color_id) VALUES (1, 'black'), (1, 'white')");
  });
  afterEach(async () => { if (db) await db.query('ROLLBACK TO SAVEPOINT catalog_case'); });

  async function rejectsSQL(sql, code) {
    await db.query('SAVEPOINT expected_failure');
    try { await expect(db.query(sql)).rejects.toMatchObject({ code }); }
    finally { await db.query('ROLLBACK TO SAVEPOINT expected_failure'); }
  }

  test('upgrades the original raw schema with category relationships and image metadata idempotently', async () => {
    await db.query("INSERT INTO categories (category_slug) VALUES ('tops')");
    await db.query("INSERT INTO product_categories (product_no, category_slug) VALUES (1, 'tops')");
    await db.query("UPDATE colors SET swatch_image_url = 'https://example.com/swatch' WHERE color_id = 'black'");
    await db.query("UPDATE product_colors SET product_color_image_url = 'https://example.com/product' WHERE color_id = 'black'");
    const migration = readFileSync(path.join(__dirname, '../db/migrations/009_add_catalog_read_model.sql'), 'utf8');
    await db.query(migration.replace(/^BEGIN;|^COMMIT;/gm, ''));
    const result = await db.query(`SELECT pc.product_no, pcat.category_slug,
      c.swatch_image_url, pc.product_color_image_url
      FROM product_colors pc JOIN colors c USING (color_id)
      JOIN product_categories pcat USING (product_no)
      WHERE pc.color_id = 'black'`);
    expect(result.rows).toEqual([{
      product_no: '1', category_slug: 'tops',
      swatch_image_url: 'https://example.com/swatch',
      product_color_image_url: 'https://example.com/product',
    }]);
    await rejectsSQL("INSERT INTO product_categories VALUES (1, 'tops')", '23505');
    await rejectsSQL("INSERT INTO product_categories VALUES (999, 'tops')", '23503');
    await rejectsSQL("INSERT INTO product_categories VALUES (1, 'missing')", '23503');
  });

  test('creates one-active-snapshot enforcement and snapshot lifecycle columns', async () => {
    const result = await db.query("INSERT INTO catalog_snapshots (status, data_as_of) VALUES ('building', now()) RETURNING *");
    const snapshot = result.rows[0];
    expect(snapshot.snapshot_id).toBeDefined();
    expect(snapshot.created_at).toBeInstanceOf(Date);
    expect(snapshot.data_as_of).toBeInstanceOf(Date);
    expect(snapshot.activated_at).toBeNull();
    await db.query('UPDATE catalog_snapshots SET status = $1, activated_at = now() WHERE snapshot_id = $2', ['active', snapshot.snapshot_id]);
    await rejectsSQL("INSERT INTO catalog_snapshots (status, data_as_of) VALUES ('active', now())", '23505');
    await rejectsSQL("INSERT INTO catalog_snapshots (status, data_as_of) VALUES ('invalid', now())", '23514');
    await db.query("UPDATE catalog_snapshots SET status = 'inactive'");
    await db.query("INSERT INTO catalog_snapshots (status, data_as_of) VALUES ('active', now()), ('failed', now())");
    expect((await db.query("SELECT count(*)::int AS n FROM catalog_snapshots WHERE status = 'active'")).rows[0].n).toBe(1);
  });

  test('stores available size arrays and explicit availability states', async () => {
    await db.query("INSERT INTO catalog_snapshots (snapshot_id, data_as_of) VALUES (1, now()), (2, now())");
    await db.query(`INSERT INTO catalog_product_colors (snapshot_id, product_no, color_id, available_sizes, availability_status, scraped_date)
      VALUES (1, 1, 'black', ARRAY['S','M'], 'available', now()),
             (1, 1, 'white', ARRAY[]::text[], 'sold_out', now()),
             (2, 1, 'black', ARRAY[]::text[], 'unknown', now())`);
    const rows = (await db.query('SELECT available_sizes, availability_status FROM catalog_product_colors ORDER BY snapshot_id, color_id')).rows;
    expect(rows).toEqual([
      { available_sizes: ['S', 'M'], availability_status: 'available' },
      { available_sizes: [], availability_status: 'sold_out' },
      { available_sizes: [], availability_status: 'unknown' },
    ]);
    await rejectsSQL("UPDATE catalog_product_colors SET availability_status = 'out_of_stock'", '23514');
    await rejectsSQL('UPDATE catalog_product_colors SET available_sizes = NULL', '23502');
    await db.query("INSERT INTO catalog_products (snapshot_id, product_no, availability_status) VALUES (1, 1, 'unknown')");
    await rejectsSQL("UPDATE catalog_products SET availability_status = 'invalid'", '23514');
  });

  test('enforces unique product, color, and day rows within a snapshot', async () => {
    await db.query("INSERT INTO catalog_snapshots (snapshot_id, data_as_of) VALUES (1, now()), (2, now())");
    const inserts = [
      "INSERT INTO catalog_products (snapshot_id, product_no) VALUES (1, 1)",
      "INSERT INTO catalog_product_colors (snapshot_id, product_no, color_id, scraped_date) VALUES (1, 1, 'black', now())",
      "INSERT INTO catalog_product_price_history (snapshot_id, product_no, observation_date, color_id) VALUES (1, 1, '2026-10-13', 'black')",
    ];
    for (const sql of inserts) {
      await db.query(sql);
      await rejectsSQL(sql, '23505');
      await db.query(sql.replace('(1, 1', '(2, 1'));
    }
    await rejectsSQL("INSERT INTO catalog_products (snapshot_id, product_no) VALUES (999, 1)", '23503');
    await rejectsSQL("INSERT INTO catalog_product_colors (snapshot_id, product_no, color_id, scraped_date) VALUES (1, 1, 'missing', now())", '23503');
    await rejectsSQL("INSERT INTO catalog_product_price_history (snapshot_id, product_no, observation_date, color_id) VALUES (1, 1, '2026-10-14', 'missing')", '23503');
  });

  test('creates the selective exact-observation stock index', async () => {
    const { rows } = await db.query(`SELECT indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'stock_snapshots'`);
    expect(rows.some(row => /\(product_no, color_id, scraped_date(?: DESC)?\) INCLUDE \(product_size, product_status\)/.test(row.indexdef))).toBe(true);
    const sizes = await db.query(`SELECT indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'catalog_product_colors'`);
    expect(sizes.rows.some(row => /USING gin \(available_sizes\)/.test(row.indexdef))).toBe(true);
  });
});
