import { CatalogCursor, CatalogError, CatalogSort, catalogSorts } from './catalogTypes';

function canonicalUtcTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?Z$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
    Number(hourText) < 24 && Number(minuteText) < 60 && Number(secondText) < 60;
}

function validate(value: unknown, sort: CatalogSort): CatalogCursor {
  const c = value as CatalogCursor & {v?: number};
  const id = (x: unknown) => typeof x === 'string' && /^[1-9]\d*$/.test(x) && BigInt(x) <= BigInt('9223372036854775807');
  const numeric = ['discount-desc','price-asc','price-desc'].includes(sort);
  if (!c || c.v !== 1 || !id(c.snapshotId) || !id(c.lastProductNo) || !catalogSorts.includes(c.sort) || c.sort !== sort ||
      (c.lastSortValue !== null && (numeric ? typeof c.lastSortValue !== 'number' || !Number.isFinite(c.lastSortValue) : typeof c.lastSortValue !== 'string')) ||
      (sort === 'observed-desc' && c.lastSortValue !== null && !canonicalUtcTimestamp(String(c.lastSortValue)))) {
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
