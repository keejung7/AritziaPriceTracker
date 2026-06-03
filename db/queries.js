const pg = require("pg");
const dotenv = require("dotenv").config();
const { Pool } = pg;

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

// TODO: remove after tests are added
async function main() {
  try {
    const priceHistoryResults = await getProductPriceHistory({
      productNo: 134146,
      colorId: 1275,
      dateFrom: "2026-04-27",
      dateTo: "2026-06-03",
    });
    console.log(priceHistoryResults);

    await getProductPriceHistory({ productNo: 134146 });

    await getProductPriceHistory({
      productNo: 134146,
      colorId: "1275",
    });

    await getProductPriceHistory({
      productNo: 134146,
      dateFrom: "2026-04-27",
      dateTo: "2026-06-03",
    });

    const priceForDateResult = await getProductPriceForDate({
      productNo: 134146,
      date: "2026-06-02",
    });
    console.log(priceForDateResult);

    const latestProductPriceHistory = await getLatestPrices({
      limit: 100,
      saleOnly: true,
    });
    console.log(latestProductPriceHistory);
  } catch (error) {
    throw error;
  } finally {
    // do nothing
  }
}

// TODO: remove after tests are added
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// For specific product number
// 1. get price history data for a specific product
// what information do I want:
// Product - product no, product url, product name, product brand,
// Colors - color id, color name,
// Price Snapshot - original price, sale price, sale percent, scraped date
// TODO: account for Stock availability

// productNo is required,
// colorId, dateFrom, dateTo are optional
async function getProductPriceHistory({
  productNo,
  colorId,
  dateFrom,
  dateTo,
}) {
  const where = ["ps.product_no = $1"];
  const values = [productNo];

  if (colorId != null) {
    values.push(colorId);
    where.push(`ps.color_id = $${values.length}`);
  }

  if (dateFrom != null) {
    values.push(dateFrom);
    where.push(
      `ps.scraped_date >= ($${values.length}::date AT TIME ZONE 'America/Vancouver')`,
    );
  }

  if (dateTo != null) {
    values.push(dateTo);
    where.push(
      `ps.scraped_date < (($${values.length}::date + INTERVAL '1 day') AT TIME ZONE 'America/Vancouver')`,
    );
  }

  const sql = `
    SELECT 
        p.product_no,
        p.product_full_url,
        p.product_name,
        p.product_brand,
        c.color_id,
        c.color_name,
        ps.original_price,
        ps.sale_price,
        ps.sale_percent,
        ps.scraped_date
    FROM aritzia_products.price_snapshots ps
    JOIN aritzia_products.products p ON ps.product_no = p.product_no
    JOIN aritzia_products.colors c ON ps.color_id = c.color_id 
    WHERE ${where.join(" AND ")}
    ORDER BY ps.scraped_date DESC;
    `;

  const result = await pool.query(sql, values);
  return result.rows;
}

// what information do I want:
// Product - product no, product url, product name, product brand,
// Colors - color id, color name,
// Price Snapshot - original price, sale prie, sale percent, scraped date

async function getProductPriceForDate({ productNo, date }) {
  const sql = `
    SELECT 
        p.product_no,
        p.product_full_url,
        p.product_name,
        p.product_brand,
        c.color_id,
        c.color_name,
        ps.original_price,
        ps.sale_price,
        ps.sale_percent,
        ps.scraped_date
    FROM aritzia_products.price_snapshots ps
    JOIN aritzia_products.products p on ps.product_no = p.product_no
    JOIN aritzia_products.colors c on ps.color_id = c.color_id
    WHERE ps.product_no = $1 
        AND ps.scraped_date >= ($2::date AT TIME ZONE 'America/Vancouver')
        AND ps.scraped_date < (($2::date + INTERVAL '1 day') AT TIME ZONE 'America/Vancouver')
    `;

  const values = [productNo, date];

  const result = await pool.query(sql, values);
  return result.rows;
}

// 2. get the latest price history data for all products
// figure out how to get the latest price for each product

async function getLatestPrices({ limit = 100, saleOnly = false } = {}) {
  const sql = `
    SELECT 
      DISTINCT ON (p.product_no, c.color_id)
        p.product_no,
        p.product_full_url,
        p.product_name,
        p.product_brand,
        c.color_id,
        c.color_name,
        ps.original_price,
        ps.sale_price,
        ps.sale_percent,
        ps.scraped_date
    FROM aritzia_products.products p
    JOIN aritzia_products.price_snapshots ps ON p.product_no = ps.product_no
    JOIN aritzia_products.colors c ON ps.color_id = c.color_id
    WHERE (ps.sale_price IS NOT NULL OR $2 = false)
    ORDER BY p.product_no, c.color_id, ps.scraped_date DESC
    LIMIT $1
    `;

  const values = [limit, saleOnly];

  const result = await pool.query(sql, values);
  return result.rows;
}

module.exports = {
  getProductPriceHistory,
  getProductPriceForDate,
  getLatestPrices,
};
// 3. get available
