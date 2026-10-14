require('dotenv').config();
const { Pool } = require('pg');
const { refreshCatalogReadModel } = require('./catalogReadModel');
const { createDbLogger } = require('./loadLogging');

const logger = createDbLogger();
const pool = new Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : { host: 'localhost', port: 5432, database: 'aritzia_db',
      user: process.env.POSTGRES_USER, password: process.env.POSTGRES_USER_PASSWORD,
      options: '-c search_path=aritzia_products,public' });

refreshCatalogReadModel(pool, { logger })
  .catch((error) => {
    logger.error(`Catalog refresh failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
