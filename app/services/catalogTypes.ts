export const catalogSorts = ['discount-desc', 'price-asc', 'price-desc', 'observed-desc', 'name-asc'] as const;
export type CatalogSort = typeof catalogSorts[number];
export type AvailabilityStatus = 'available' | 'sold_out' | 'unknown';
export interface CatalogCursor {
  snapshotId: string;
  sort: CatalogSort;
  lastSortValue: number | string | null;
  lastProductNo: string;
}
export interface CatalogQuery {
  limit: number;
  sort: CatalogSort;
  cursor: CatalogCursor | null;
  search: string | null;
  brand: string | null;
  category: string | null;
  color: string | null;
  sizes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  saleOnly: boolean;
  minDiscount: number | null;
}
export interface CatalogColor {
  colorId: string;
  colorName: string | null;
  swatchImageUrl: string | null;
  productColorImageUrl: string | null;
  originalPrice: number | null;
  salePrice: number | null;
  effectivePrice: number | null;
  salePercent: number | null;
  availableSizes: string[];
  availabilityStatus: AvailabilityStatus;
  scrapedDate: string;
}
export interface CatalogProduct {
  productNo: number;
  productSlug: string | null;
  productUrl: string | null;
  productName: string | null;
  productBrand: string | null;
  categories: string[];
  fromColorId: string | null;
  fromPrice: number | null;
  fromOriginalPrice: number | null;
  fromSalePercent: number | null;
  selectedColorId: string | null;
  availabilityStatus: AvailabilityStatus;
  trackingStartedAt: string | null;
  insightLabel: string | null;
  colors: CatalogColor[];
}
export interface CatalogResponse {
  products: CatalogProduct[];
  total: number;
  nextCursor: string | null;
  snapshot: { id: string; dataAsOf: string; refreshedAt: string; status: 'active' | 'stale' };
}
export type CatalogErrorCode = 'invalid_query' | 'invalid_cursor' | 'cursor_expired' | 'catalog_unavailable';
export class CatalogError extends Error {
  constructor(public code: CatalogErrorCode, public status: number, message: string) { super(message); }
}
