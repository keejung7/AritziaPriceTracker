const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { Client } = require('pg');

const queries = {
  days: `
    SELECT (scraped_date AT TIME ZONE 'America/Toronto')::date::text AS d,
           COUNT(DISTINCT (product_no, color_id))::integer AS n
    FROM price_snapshots
    GROUP BY 1
    ORDER BY 1`,
  prices: `
    SELECT DISTINCT ON (product_no, color_id, d)
           product_no::text AS p, color_id AS c,
           (scraped_date AT TIME ZONE 'America/Toronto')::date::text AS d,
           original_price::float8 AS o, sale_price::float8 AS s
    FROM price_snapshots
    ORDER BY product_no, color_id, d, scraped_date DESC`,
  stock: `
    SELECT DISTINCT ON (s.product_no, s.color_id, s.product_size, d)
           s.product_no::text AS p, s.color_id AS c, s.product_size AS z,
           (s.scraped_date AT TIME ZONE 'America/Toronto')::date::text AS d,
           s.product_status AS a,
           (1 - COALESCE(pr.sale_price, pr.original_price)
             / NULLIF(pr.original_price, 0))::float8 AS m
    FROM stock_snapshots s
    LEFT JOIN price_snapshots pr USING (product_no, color_id, scraped_date)
    ORDER BY s.product_no, s.color_id, s.product_size, d, s.scraped_date DESC`,
};

async function main(directory) {
  if (!directory) throw new Error('Provide a new output directory outside Git');
  const database = new Client(process.env.DATABASE_URL ? {
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  } : {
    host: 'localhost',
    port: 5432,
    database: 'aritzia_db',
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_USER_PASSWORD,
    connectionTimeoutMillis: 10000,
  });

  await mkdir(directory);
  try {
    await database.connect();
    await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await database.query("SET LOCAL statement_timeout = '120s'");
    await database.query('SET LOCAL search_path TO aritzia_products, public');
    for (const [name, query] of Object.entries(queries)) {
      const { rows } = await database.query(query);
      await writeFile(join(directory, name + '.json'), JSON.stringify(rows));
    }
    await database.query('ROLLBACK');
  } finally {
    await database.end();
  }
}

main(process.argv[2]).catch((error) => {
  console.error('Snapshot export failed:', error.code || error.message);
  process.exitCode = 1;
});
