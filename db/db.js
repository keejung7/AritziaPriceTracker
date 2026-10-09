const pg = require("pg");
const dotenv = require("dotenv").config();
const { Pool } = pg;

const parser = require("./parser.js");
const MAX_BATCH_PARAMS = 5000;

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
      }
    : {
        host: "localhost",
        port: 5432,
        database: "aritzia_db",
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_USER_PASSWORD,
        options: "-c search_path=aritzia_products,public",
      },
);

// For each product, insert product information
async function main() {
  const products = parser.getProductDataForInsert();
  const rows = collectRowsForInsert(products);

  await saveParsedProducts(pool, rows);

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function saveParsedProducts(pool, rows) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await insertOrUpdateProductTable(client, rows.products);
    await insertCategoriesTable(client, rows.categories);
    await insertProductCategoriesTable(client, rows.productCategories);
    await insertColorsTable(client, rows.colors);
    await insertProductColorsTable(client, rows.productColors);
    await insertPriceSnapshotsTable(client, rows.priceSnapshots);
    await insertStockSnapshotsTable(client, rows.stockSnapshots);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function collectRowsForInsert(products) {
  const rows = {
    products: [],
    categories: [],
    productCategories: [],
    colors: [],
    productColors: [],
    priceSnapshots: [],
    stockSnapshots: [],
  };

  const productsByNo = new Map();
  const categoriesBySlug = new Map();
  const productCategoryKeys = new Set();
  const colorsById = new Map();
  const productColorKeys = new Set();

  for (const product of products) {
    productsByNo.set(product.product.product_no, product.product);

    for (const category of product.categories) {
      categoriesBySlug.set(category.category_slug, category);
    }

    for (const productCategory of product.productCategories) {
      const key = `${productCategory.product_no}:${productCategory.category_slug}`;
      if (!productCategoryKeys.has(key)) {
        productCategoryKeys.add(key);
        rows.productCategories.push(productCategory);
      }
    }

    for (const color of product.colors) {
      colorsById.set(color.color_id, color);
    }

    for (const productColor of product.productColors) {
      const key = `${productColor.color_id}:${productColor.product_no}`;
      if (!productColorKeys.has(key)) {
        productColorKeys.add(key);
        rows.productColors.push(productColor);
      }
    }

    rows.priceSnapshots.push(...product.priceSnapshots);
    rows.stockSnapshots.push(...product.stockSnapshots);
  }

  rows.products = Array.from(productsByNo.values());
  rows.categories = Array.from(categoriesBySlug.values());
  rows.colors = Array.from(colorsById.values());

  return rows;
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function chunkRowsByParams(rows, columnCount) {
  const rowsPerChunk = Math.max(1, Math.floor(MAX_BATCH_PARAMS / columnCount));
  return chunkRows(rows, rowsPerChunk);
}

function buildValues(rows, columns) {
  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * columns.length;
    const rowPlaceholders = columns.map((column, columnIndex) => {
      values.push(row[column]);
      return `$${offset + columnIndex + 1}`;
    });

    return `(${rowPlaceholders.join(", ")})`;
  });

  return { placeholders: placeholders.join(", "), values };
}

async function insertOrUpdateProductTable(client, products) {
  if (products.length === 0) return;

  const sql = `
INSERT INTO aritzia_products.products (
  product_no, 
  product_slug, 
  product_full_url, 
  product_name, 
  product_brand
)
VALUES %VALUES%
ON CONFLICT (product_no)
DO UPDATE SET
  product_slug = EXCLUDED.product_slug,
  product_full_url = EXCLUDED.product_full_url,
  product_name = EXCLUDED.product_name,
  product_brand = EXCLUDED.product_brand
`;

  for (const chunk of chunkRowsByParams(products, 5)) {
    const { placeholders, values } = buildValues(chunk, [
      "product_no",
      "product_slug",
      "product_full_url",
      "product_name",
      "product_brand",
    ]);

    await client.query(sql.replace("%VALUES%", placeholders), values);
  }
}

async function insertCategoriesTable(client, categories) {
  if (categories.length === 0) return;

  const sql = `
    INSERT INTO aritzia_products.categories (
      category_slug
    )
    VALUES %VALUES%
    ON CONFLICT (category_slug)
    DO NOTHING
  `;

  for (const chunk of chunkRowsByParams(categories, 1)) {
    const { placeholders, values } = buildValues(chunk, ["category_slug"]);

    await client.query(sql.replace("%VALUES%", placeholders), values);
  }
}

async function insertProductCategoriesTable(client, productCategories) {
  if (productCategories.length === 0) return;

  const sql = `
    INSERT INTO aritzia_products.product_categories (
      product_no,
      category_slug
    )
    VALUES %VALUES%
    ON CONFLICT (product_no, category_slug)
    DO NOTHING
  `;

  for (const chunk of chunkRowsByParams(productCategories, 2)) {
    const { placeholders, values } = buildValues(chunk, [
      "product_no",
      "category_slug",
    ]);

    await client.query(sql.replace("%VALUES%", placeholders), values);
  }
}

/* 
Insert Color

color_id
color_name
*/

async function insertColorsTable(client, colors) {
  if (colors.length === 0) return;

  const sql = `
	   INSERT INTO aritzia_products.colors AS colors (
	    color_id,
	    color_name,
      swatch_image_url
	   )
	  VALUES %VALUES%
	  ON CONFLICT (color_id)
	  DO UPDATE SET
      color_name = COALESCE(EXCLUDED.color_name, colors.color_name),
      swatch_image_url = COALESCE(EXCLUDED.swatch_image_url, colors.swatch_image_url)
	  `;

  for (const chunk of chunkRowsByParams(colors, 3)) {
    const { placeholders, values } = buildValues(chunk, [
      "color_id",
      "color_name",
      "swatch_image_url",
    ]);

    await client.query(sql.replace("%VALUES%", placeholders), values);
  }
}

/* 
Insert Product color

color_id
product_no
*/

async function insertProductColorsTable(client, productColors) {
  if (productColors.length === 0) return;

  const sql = `
    INSERT INTO aritzia_products.product_colors AS product_colors (
     color_id,
     product_no,
     product_color_image_url
    )
     VALUES %VALUES%
     ON CONFLICT (color_id, product_no)
     DO UPDATE SET
      product_color_image_url = COALESCE(
        EXCLUDED.product_color_image_url,
        product_colors.product_color_image_url
      )
  `;

  for (const chunk of chunkRowsByParams(productColors, 3)) {
    const { placeholders, values } = buildValues(chunk, [
      "color_id",
      "product_no",
      "product_color_image_url",
    ]);

    await client.query(sql.replace("%VALUES%", placeholders), values);
  }
}

/*
Insert Product Color Price Snapshot

product_no,
color_id,
original_price,
sale_price,
scraped_date,
*/

async function insertPriceSnapshotsTable(client, priceSnapshots) {
  if (priceSnapshots.length === 0) return;

  const sql = `INSERT INTO aritzia_products.price_snapshots (
    color_id,
    product_no,
    original_price,
    sale_price,
    sale_percent,
    scraped_date
   ) 
   VALUES %VALUES%
   ON CONFLICT(color_id, product_no, scraped_date)
   DO NOTHING
    `;

  for (const chunk of chunkRowsByParams(priceSnapshots, 6)) {
    const { placeholders, values } = buildValues(chunk, [
      "color_id",
      "product_no",
      "original_price",
      "sale_price",
      "sale_percent",
      "scraped_date",
    ]);

    await client.query(sql.replace("%VALUES%", placeholders), values);
  }
}

/*
Insert Product Color Size Snapshot

product_no,
color_id,
product_size,
product_status,
scraped_date,
*/

async function insertStockSnapshotsTable(client, stockSnapshots) {
  if (stockSnapshots.length === 0) return;

  const sql = `INSERT INTO aritzia_products.stock_snapshots (
    product_size,
    color_id,
    product_no,
    product_status,
    scraped_date
  )
  VALUES %VALUES%
  ON CONFLICT (product_size, color_id, product_no, scraped_date)
  DO NOTHING
  `;

  for (const chunk of chunkRowsByParams(stockSnapshots, 5)) {
    const { placeholders, values } = buildValues(chunk, [
      "product_size",
      "color_id",
      "product_no",
      "product_status",
      "scraped_date",
    ]);

    await client.query(sql.replace("%VALUES%", placeholders), values);
  }
}
