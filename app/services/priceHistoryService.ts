export interface ProductPriceHistory {
  productNo: number;
  productUrl: string;
  productName: string | null;
  productBrand: string | null;
  colors: ProductColorPriceHistory[];
}

export interface ProductColorPriceHistory {
  colorId: string;
  colorName: string | null;
  history: ProductPrice[];
}

export interface ProductPrice {
  originalPrice: number | null;
  salePrice: number | null;
  salePercent: number | null;
  scrapedDate: string;
}

export interface RawPriceHistoryRow {
  product_no: number;
  product_full_url: string;
  product_name: string | null;
  product_brand: string | null;
  color_id: string;
  color_name: string | null;
  original_price: string | number | null;
  sale_price: string | number | null;
  sale_percent: string | number | null;
  scraped_date: Date | string;
}

export interface PriceRow {
  productNo: number;
  productUrl: string;
  productName: string | null;
  productBrand: string | null;
  colorId: string;
  colorName: string | null;
  originalPrice: number | null;
  salePrice: number | null;
  salePercent: number | null;
  scrapedDate: string;
}

export function formatProductPriceHistory(
  rows: RawPriceHistoryRow[],
): ProductPriceHistory | null {
  if (rows.length === 0) {
    return null;
  }

  const firstRow = rows[0];

  const product: ProductPriceHistory = {
    productNo: Number(firstRow.product_no),
    productUrl: firstRow.product_full_url,
    productName: firstRow.product_name,
    productBrand: firstRow.product_brand,
    colors: [],
  };

  const productColorMap = new Map<string, ProductColorPriceHistory>();

  for (const row of rows) {
    const key = `${row.product_no}:${row.color_id}`;
    let productColor = productColorMap.get(key);

    if (productColor == null) {
      productColor = {
        colorId: row.color_id,
        colorName: row.color_name,
        history: [],
      };

      productColorMap.set(key, productColor);
      product.colors.push(productColor);
    }

    productColor.history.push({
      originalPrice: toNumberOrNull(row.original_price),
      salePrice: toNumberOrNull(row.sale_price),
      salePercent: toNumberOrNull(row.sale_percent),
      scrapedDate: toIsoString(row.scraped_date),
    });
  }

  return product;
}

export function formatLatestPrices(rows: RawPriceHistoryRow[]): PriceRow[] {
  return rows.map(formatPriceRow);
}

export function formatProductPriceForDate(
  rows: RawPriceHistoryRow[],
): PriceRow[] {
  return rows.map(formatPriceRow);
}

function formatPriceRow(row: RawPriceHistoryRow): PriceRow {
  return {
    productNo: Number(row.product_no),
    productUrl: row.product_full_url,
    productName: row.product_name,
    productBrand: row.product_brand,
    colorId: row.color_id,
    colorName: row.color_name,
    originalPrice: toNumberOrNull(row.original_price),
    salePrice: toNumberOrNull(row.sale_price),
    salePercent: toNumberOrNull(row.sale_percent),
    scrapedDate: toIsoString(row.scraped_date),
  };
}

function toNumberOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function toIsoString(value: Date | string): string {
  return new Date(value).toISOString();
}
