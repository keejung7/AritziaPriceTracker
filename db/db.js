const pg = require("pg");
const dotenv = require("dotenv").config();
const { Pool } = pg;

const parser = require("./parser.js");

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "aritzia_db",
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_USER_PASSWORD,
  options: "-c search_path=aritzia_products,public",
});

// For each product, insert product information
async function main() {
  const products = parser.getProductDataForInsert();

  for (const product of products) {
    // Insert Product
    await saveParsedProduct(pool, product);
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function saveParsedProduct(pool, product) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await insertOrUpdateProductTable(client, product.product);

    // Insert Colors
    for (const color of product.colors) {
      await insertColorsTable(client, color);
    }

    // Insert Product Colors
    for (const productColor of product.productColors) {
      await insertProductColorsTable(client, productColor);
    }

    // Insert Product Price Snapshot
    for (const priceSnapshot of product.priceSnapshots) {
      await insertPriceSnapshotsTable(client, priceSnapshot);
    }

    // Insert Product Size Snapshot
    for (const stockSnapshot of product.stockSnapshots) {
      await insertStockSnapshotsTable(client, stockSnapshot);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertOrUpdateProductTable(client, product) {
  const sql = `
INSERT INTO products (
  product_no, 
  product_slug, 
  product_full_url, 
  product_name, 
  product_brand
)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (product_no)
DO UPDATE SET
  product_slug = EXCLUDED.product_slug,
  product_full_url = EXCLUDED.product_full_url,
  product_name = EXCLUDED.product_name,
  product_brand = EXCLUDED.product_brand
`;

  const values = [
    product.product_no,
    product.product_slug,
    product.product_full_url,
    product.product_name,
    product.product_brand,
  ];

  await client.query(sql, values);
}
/* 
Insert Color

color_id
color_name
*/

async function insertColorsTable(client, color) {
  const sql = `
   INSERT INTO colors (
    color_id,
    color_name
   )
  VALUES ($1, $2)
  ON CONFLICT (color_id)
  DO NOTHING
  `;

  const values = [color.color_id, color.color_name];

  await client.query(sql, values);
}

/* 
Insert Product color

color_id
product_no
*/

async function insertProductColorsTable(client, productColor) {
  const sql = `
    INSERT INTO product_colors (
     color_id,
     product_no
    )
     VALUES ($1, $2)
     ON CONFLICT (color_id, product_no)
     DO NOTHING
  `;

  const values = [productColor.color_id, productColor.product_no];

  await client.query(sql, values);
}

/*
Insert Product Color Price Snapshot

product_no,
color_id,
original_price,
sale_price,
scraped_date,
*/

async function insertPriceSnapshotsTable(client, priceSnapshot) {
  const sql = `INSERT INTO price_snapshots (
    color_id,
    product_no,
    original_price,
    sale_price,
    sale_percent,
    scraped_date
   ) 
   VALUES ($1, $2, $3, $4, $5, $6)
   ON CONFLICT(color_id, product_no, scraped_date)
   DO NOTHING
    `;

  const values = [
    priceSnapshot.color_id,
    priceSnapshot.product_no,
    priceSnapshot.original_price,
    priceSnapshot.sale_price,
    priceSnapshot.sale_percent,
    priceSnapshot.scraped_date,
  ];

  await client.query(sql, values);
}

/*
Insert Product Color Size Snapshot

product_no,
color_id,
product_size,
product_status,
scraped_date,
*/

async function insertStockSnapshotsTable(client, sizeSnapshot) {
  const sql = `INSERT INTO stock_snapshots (
    product_size,
    color_id,
    product_no,
    product_status,
    scraped_date
  )
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (product_size, color_id, product_no, scraped_date)
  DO NOTHING
  `;

  const values = [
    sizeSnapshot.product_size,
    sizeSnapshot.color_id,
    sizeSnapshot.product_no,
    sizeSnapshot.product_status,
    sizeSnapshot.scraped_date,
  ];

  await client.query(sql, values);
}
