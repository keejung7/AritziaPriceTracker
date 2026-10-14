const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

function validateTestDatabaseUrl(connectionString = process.env.CATALOG_TEST_DATABASE_URL) {
  if (!connectionString) throw new Error('CATALOG_TEST_DATABASE_URL must be set to a dedicated database ending in _test');
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !database.endsWith('_test') ||
      [...url.searchParams.keys()].some(key => ['dbname', 'database', 'service'].includes(key))) {
    throw new Error('CATALOG_TEST_DATABASE_URL must identify a PostgreSQL database ending in _test');
  }
  return connectionString;
}

// Each suite owns a unique schema. Rollback removes it, even after an assertion fails.
// Qualified production queries are redirected into that schema as well.
async function createCatalogTestDatabase() {
  const connectionString = validateTestDatabaseUrl();
  const client = new Client({ connectionString });
  const schema = `catalog_test_${randomUUID().replaceAll('-', '')}`;
  const rawQuery = client.query.bind(client);
  const query = (sql, values) => rawQuery(sql.replace(/\baritzia_products\b/g, schema), values);
  try {
    await client.connect();
    const result = await rawQuery('SELECT current_database() AS name');
    if (!result.rows[0].name.endsWith('_test')) throw new Error('Connected database must end in _test');
    await rawQuery('BEGIN');
    // Bootstrap from a fixed pre-metadata raw schema, so canonical definitions
    // and imported working-tree changes cannot conceal missing migrations.
    const source = await readFile(path.join(__dirname, '../fixtures/originalRawSchema.sql'), 'utf8');
    await query(source);
    const migration = await readFile(path.join(__dirname, '../../db/migrations/009_add_catalog_read_model.sql'), 'utf8');
    await query(migration.replace(/^BEGIN;|^COMMIT;/gm, ''));
    return {
      schema,
      query,
      client: { query },
      async close() {
        try { await rawQuery('ROLLBACK'); } finally { await client.end(); }
      },
    };
  } catch (error) {
    try { await rawQuery('ROLLBACK'); } catch (_) { /* connection may not be open */ }
    await client.end();
    throw error;
  }
}

module.exports = { createCatalogTestDatabase, validateTestDatabaseUrl };
