import { CatalogError, CatalogQuery, CatalogResponse, CatalogSort, catalogSorts } from './catalogTypes';
import { decodeCatalogCursor, encodeCatalogCursor } from './catalogCursor';
import { queryCatalogProducts } from '../../db/catalogQueries';

export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const invalid = () => { throw new CatalogError('invalid_query',400,'Invalid catalog query parameters'); };
  const string = (key: string) => params.get(key)?.trim() || null;
  const number = (key: string) => {
    const raw = params.get(key)?.trim() ?? null;
    if (raw === null) return null;
    if (!/^\d+(\.\d+)?$/.test(raw)) return invalid();
    const value = Number(raw);
    return Number.isFinite(value) ? value : invalid();
  };
  const limit = number('limit') ?? 24;
  if (!Number.isInteger(limit) || limit < 1 || limit > 48) invalid();
  const sort = (params.get('sort') ?? 'discount-desc') as CatalogSort;
  if (!catalogSorts.includes(sort)) invalid();
  const sale = params.get('saleOnly');
  if (sale !== null && sale !== 'true' && sale !== 'false') invalid();
  const saleOnly = sale === 'true';
  const minPrice = number('minPrice'), maxPrice = number('maxPrice'), minDiscount = number('minDiscount');
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) invalid();
  if (minDiscount !== null && (!saleOnly || minDiscount > 100)) invalid();
  const rawCursor = params.get('cursor');
  return {limit,sort,cursor:rawCursor === null ? null : decodeCatalogCursor(rawCursor,sort),
    search:string('search'),brand:string('brand'),category:string('category'),color:string('color'),
    sizes:[...new Set(params.getAll('size').map(s=>s.trim()).filter(Boolean))],minPrice,maxPrice,saleOnly,minDiscount};
}

const numeric = (value: unknown): number | null => value == null ? null : Number(value);
const iso = (value: string | Date): string => new Date(value).toISOString();
export async function getCatalogProducts(query: CatalogQuery, database?: { query: (sql: string, values: unknown[]) => Promise<any> }): Promise<CatalogResponse> {
  const result = await queryCatalogProducts(query,database);
  if (!result.snapshot) throw new CatalogError(query.cursor ? 'cursor_expired' : 'catalog_unavailable',query.cursor ? 400 : 503,
    query.cursor ? 'This catalog cursor has expired' : 'The catalog is temporarily unavailable');
  const products = result.products.map(p=>({
    productNo:Number(p.product_no),productSlug:p.product_slug,productUrl:p.product_full_url,productName:p.product_name,productBrand:p.product_brand,
    categories:p.categories,fromColorId:p.from_color_id,fromPrice:numeric(p.from_price),fromOriginalPrice:numeric(p.from_original_price),
    fromSalePercent:numeric(p.from_sale_percent),selectedColorId:p.selected_color_id,availabilityStatus:p.availability_status,
    trackingStartedAt:p.tracking_started_at ? iso(p.tracking_started_at) : null,insightLabel:p.insight_label,
    colors:p.colors.map(c=>({colorId:c.color_id,colorName:c.color_name,swatchImageUrl:c.swatch_image_url,productColorImageUrl:c.product_color_image_url,
      originalPrice:numeric(c.original_price),salePrice:numeric(c.sale_price),effectivePrice:numeric(c.effective_price),salePercent:numeric(c.sale_percent),
      availableSizes:c.available_sizes,availabilityStatus:c.availability_status,scrapedDate:iso(c.scraped_date)})),
  }));
  const last=result.products[result.products.length-1];
  const lastSortValue=last?.cursor_sort_value == null ? null : ['discount-desc','price-asc','price-desc'].includes(query.sort) ? Number(last.cursor_sort_value) : last.cursor_sort_value;
  return {products,total:result.total,nextCursor:result.has_more && last ? encodeCatalogCursor({snapshotId:String(result.snapshot.snapshot_id),sort:query.sort,lastProductNo:String(last.product_no),lastSortValue}) : null,
    snapshot:{id:String(result.snapshot.snapshot_id),dataAsOf:iso(result.snapshot.data_as_of),refreshedAt:iso(result.snapshot.activated_at),status:result.snapshot.stale ? 'stale' : 'active'}};
}
