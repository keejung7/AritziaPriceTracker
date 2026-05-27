const fs = require("fs");
const path = require("path");

const filePath =
  process.env.PRODUCT_DETAILS_PATH ||
  process.argv[2] ||
  path.join(__dirname, "..", "product_details.jsonl");

const fileContent = fs.readFileSync(filePath, "utf8");

/**
 * {
  product: {
    product_no,
    product_slug,
    product_full_url,
    product_name,
    product_brand,
  },
  colors: [
    {
      color_id,
      color_name,
    }
  ],
  productColors: [
    {
      product_no,
      color_id,
    }
  ],
  priceSnapshots: [
    {
      product_no,
      color_id,
      original_price,
      sale_price,
      scraped_date,
    }
  ],
  stockSnapshots: [
    {
      product_no,
      color_id,
      product_size,
      product_status,
      scraped_date,
    }
  ]
}
 */

function getProductDataForInsert() {
  // read jsonl file, parse JSON object line by line
  const products = fileContent
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));

  let productsSQLData = [];

  for (const product of products) {
    // get products table data

    const productLink = product.product_link;
    const productLinkData = parseAritziaUrl(productLink);
    const productNo = productLinkData.product_no;
    const productSlug = productLinkData.product_slug;
    const productName = product.product_name ? product.product_name : null;
    const productBrand = product.product_brand ? product.product_brand : null;

    const productObj = {
      product: {
        product_no: productNo,
        product_slug: productSlug,
        product_full_url: productLink,
        product_name: productName,
        product_brand: productBrand,
      },
      colors: [], // GATHER ARRAY
      productColors: [], // GATHER ARRAY
      priceSnapshots: [], // GATHER ARRAY
      stockSnapshots: [], // GATHER ARRAY
    };

    const scrapedDate = product.scraped_at
      ? new Date(product.scraped_at)
      : new Date();

    // get colors and product colors table data
    for (const colorObj of product.colors) {
      // array of objects, where key is color

      const colorId = Object.keys(colorObj)[0];
      const colorDetails = colorObj[colorId];
      const colorName = colorDetails.color_text;

      // ADD COLORS DATA
      productObj.colors.push({ color_id: colorId, color_name: colorName });

      // ADD PRODUCT_COLORS DATA
      productObj.productColors.push({
        product_no: productNo,
        color_id: colorId,
      });

      // price data
      // prices include $, remove them for processing
      const colorOriginalPrice = parsePrice(colorDetails.original_price);
      const colorSalePrice = parsePrice(colorDetails.sale_price);
      const colorSalePercent =
        colorDetails.sale_percent == null
          ? null
          : Number(colorDetails.sale_percent);

      // ADD PRICE_SNAPSHOTS DATA
      productObj.priceSnapshots.push({
        product_no: productNo,
        color_id: colorId,
        original_price: colorOriginalPrice,
        sale_price: colorSalePrice,
        sale_percent: colorSalePercent,
        scraped_date: scrapedDate,
      });

      // stock data
      for (const sizeInfo of colorDetails.sizes) {
        const colorSize = sizeInfo.size;
        const colorSizeStatus = sizeInfo.status;

        // ADD STOCK_SNAPSHOTS DATA
        productObj.stockSnapshots.push({
          product_no: productNo,
          color_id: colorId,
          product_size: colorSize,
          product_status: colorSizeStatus,
          scraped_date: scrapedDate,
        });
      }
    }

    // ADD THE PRODUCT TO ARRAY
    productsSQLData.push(productObj);
  }
  return productsSQLData;
}

function parseAritziaUrl(productLink) {
  const url = new URL(productLink);
  const pathParts = url.pathname.split("/").filter(Boolean);

  const productIndex = pathParts.indexOf("product");
  const productSlug = pathParts.slice(productIndex).join("/");

  const match = url.pathname.match(/\/(\d+)\.html$/);
  const productNo = match ? Number(match[1]) : null;

  return { product_no: productNo, product_slug: productSlug };
}

function parsePrice(price) {
  if (!price || price == "N/A") return null;

  const parsed = price.replace("$", "").trim();

  return Number(parsed);
}

module.exports = { getProductDataForInsert };
