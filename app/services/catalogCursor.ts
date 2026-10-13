import { CatalogCursor, CatalogError, CatalogSort, catalogSorts } from './catalogTypes';

function validate(value: unknown, sort: CatalogSort): CatalogCursor {
  const c = value as CatalogCursor & {v?: number};
  const id = (x: unknown) => typeof x === 'string' && /^[1-9]\d*$/.test(x) && BigInt(x) <= BigInt('9223372036854775807');
  const numeric = ['discount-desc','price-asc','price-desc'].includes(sort);
  if (!c || c.v !== 1 || !id(c.snapshotId) || !id(c.lastProductNo) || !catalogSorts.includes(c.sort) || c.sort !== sort ||
      (c.lastSortValue !== null && (numeric ? typeof c.lastSortValue !== 'number' || !Number.isFinite(c.lastSortValue) : typeof c.lastSortValue !== 'string')) ||
      (sort === 'observed-desc' && c.lastSortValue !== null &&
        (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(String(c.lastSortValue)) ||
         !Number.isFinite(Date.parse(String(c.lastSortValue)))))) {
    throw new CatalogError('invalid_cursor',400,'Invalid catalog cursor');
  }
  return {snapshotId:c.snapshotId,sort:c.sort,lastSortValue:c.lastSortValue,lastProductNo:c.lastProductNo};
}
export function encodeCatalogCursor(cursor: CatalogCursor): string {
  validate({...cursor,v:1},cursor.sort);
  const bytes = new TextEncoder().encode(JSON.stringify({v:1,...cursor}));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeCatalogCursor(raw: string, sort: CatalogSort): CatalogCursor {
  try {
    if (raw.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const bytes = Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sort);
  } catch (_) { throw new CatalogError('invalid_cursor',400,'Invalid catalog cursor'); }
}
