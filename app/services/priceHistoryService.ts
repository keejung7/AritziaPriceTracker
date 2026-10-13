export interface ProductPriceHistory {
  productNo: string;
  productUrl: string;
  productName: string | null;
  productBrand: string | null;
  categories: string[];
  colors: ProductColorPriceHistory[];
}

export interface ProductColorPriceHistory {
  colorId: string;
  colorName: string | null;
  swatchImageUrl: string | null;
  productColorImageUrl: string | null;
  stock: ProductStock[];
  history: ProductPrice[];
}

export interface ProductStock {
  size: string;
  status: string | null;
  isAvailable: boolean;
}

export interface ProductPrice {
  originalPrice: number | null;
  salePrice: number | null;
  salePercent: number | null;
  stock: ProductStock[];
  scrapedDate: string;
}

export interface RawPriceHistoryRow {
  product_no: string | number;
  product_full_url: string;
  product_name: string | null;
  product_brand: string | null;
  categories: string[] | null;
  color_id: string;
  color_name: string | null;
  swatch_image_url: string | null;
  product_color_image_url: string | null;
  stock?: RawProductStock[] | null;
  original_price: string | number | null;
  sale_price: string | number | null;
  sale_percent: string | number | null;
  scraped_date: Date | string;
}

export interface PriceRow {
  productNo: string;
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
    productNo: String(firstRow.product_no),
    productUrl: firstRow.product_full_url,
    productName: firstRow.product_name,
    productBrand: firstRow.product_brand,
    categories: normalizeCategories(firstRow.categories),
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
        swatchImageUrl: row.swatch_image_url,
        productColorImageUrl: row.product_color_image_url,
        stock: normalizeStock(row.stock),
        history: [],
      };

      productColorMap.set(key, productColor);
      product.colors.push(productColor);
    }

    productColor.history.push({
      originalPrice: toNumberOrNull(row.original_price),
      salePrice: toNumberOrNull(row.sale_price),
      salePercent: toNumberOrNull(row.sale_percent),
      stock: normalizeStock(row.stock),
      scrapedDate: toIsoString(row.scraped_date),
    });
  }

  return product;
}

export function formatProductPriceForDate(
  rows: RawPriceHistoryRow[],
): PriceRow[] {
  return rows.map(formatPriceRow);
}

function formatPriceRow(row: RawPriceHistoryRow): PriceRow {
  return {
    productNo: String(row.product_no),
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
  return typeof value === 'string' ? value : value.toISOString();
}

function normalizeCategories(categories: string[] | null): string[] {
  return Array.isArray(categories) ? categories : [];
}

interface RawProductStock {
  size?: unknown;
  status?: unknown;
  isAvailable?: unknown;
}

function normalizeStock(stock: RawProductStock[] | null | undefined): ProductStock[] {
  if (!Array.isArray(stock)) {
    return [];
  }

  return stock
    .map((item) => ({
      size: typeof item.size === "string" ? item.size : "",
      status: typeof item.status === "string" ? item.status : null,
      isAvailable: item.isAvailable === true,
    }))
    .filter((item) => item.size !== "");
}
