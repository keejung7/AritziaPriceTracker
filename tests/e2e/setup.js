const { Client, Pool } = require('pg');
const { rejects } = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const { refreshCatalogReadModel } = require('../../db/catalogReadModel');
const { createDbLogger } = require('../../db/loadLogging');
const { validateTestDatabaseUrl } = require('../helpers/catalogTestDatabase');

const dropTestSchema = 'DROP SCHEMA IF EXISTS aritzia_products CASCADE';

module.exports = async function setup() {
  const connectionString = validateTestDatabaseUrl();
  const expectedDatabase = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  const db = new Client({ connectionString });
  await db.connect();
  const pool = new Pool({ connectionString });
  let ownsSchema = false;
  const cleanup = async () => {
    try {
      if (ownsSchema) await db.query(dropTestSchema);
    } finally {
      await db.end();
    }
  };
  try {
    const actual = (await db.query('SELECT current_database() AS name')).rows[0].name;
    if (actual !== expectedDatabase) throw new Error('E2E connection must match the configured disposable _test database');
    // Keep this session open until cleanup so another run cannot reset our fixtures.
    const { locked } = (await db.query('SELECT pg_try_advisory_lock(470932, 1) AS locked')).rows[0];
    if (!locked) throw new Error('Another Playwright run is using this test database');
    if (process.env.CATALOG_TEST_ALLOW_RESET === '1') {
      await db.query(dropTestSchema);
    } else if ((await db.query("SELECT 1 FROM pg_namespace WHERE nspname='aritzia_products'")).rowCount) {
      throw new Error('E2E seed refuses an existing aritzia_products schema; set CATALOG_TEST_ALLOW_RESET=1 for a dedicated Playwright database');
    }
    await db.query(readFileSync(path.join(__dirname, '../fixtures/originalRawSchema.sql'), 'utf8'));
    ownsSchema = true;
    for (const name of ['009_add_catalog_read_model.sql', '010_remove_product_scores.sql']) {
      await db.query(readFileSync(path.join(__dirname, '../../db/migrations', name), 'utf8'));
    }
    await db.query(readFileSync(path.join(__dirname, '../fixtures/catalogE2eSeed.sql'), 'utf8'));
    const output = path.resolve('.validation-artifacts/catalog', new Date().toISOString().replaceAll(':', '-'));
    mkdirSync(output, { recursive: true });
    const logPath = path.join(output, `db_refresh_${new Date().toISOString().replaceAll(':', '-')}.log`);
    const logger = createDbLogger({ logPath });
    await refreshCatalogReadModel(pool, { logger });
    await db.query("UPDATE aritzia_products.price_snapshots SET sale_price=-1 WHERE product_no=1 AND color_id='18891' AND scraped_date='2026-10-13T10:00:00Z'");
    await rejects(refreshCatalogReadModel(pool, { logger }), {
      message: 'Catalog validation rejected a negative price',
    });
    await db.query("UPDATE aritzia_products.price_snapshots SET sale_price=41 WHERE product_no=1 AND color_id='18891' AND scraped_date='2026-10-13T10:00:00Z'");
    return cleanup;
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Playwright setup and database cleanup failed');
    }
    throw error;
  } finally {
    await pool.end();
  }
};
