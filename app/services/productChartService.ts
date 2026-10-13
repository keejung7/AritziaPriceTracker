import type { ProductColorPriceHistory, ProductPrice, ProductPriceHistory, ProductStock } from './priceHistoryService';

export type HistoryMode = 'selected' | 'product';
export interface PricePoint {
  x: number;
  y: number | null;
  date: string;
  observedAt: string | null;
  colorId: string | null;
  colorName: string | null;
  effectivePrice: number | null;
  regularPrice: number | null;
  discount: number | null;
}
const DAY = 86400000;
export const formatCAD = (value: number | null) => value == null ? 'Unavailable' : `${new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)} CAD`;
export const formatDiscount = (value: number | null) => value == null ? 'Unavailable' : `${value}%`;
export function observationDiscount(point: ProductPrice | null): number | null {
  if (!point) return null;
  const effective = point.salePrice ?? point.originalPrice;
  if (effective != null && point.originalPrice != null && point.originalPrice > 0 && effective < point.originalPrice) {
    return Math.round((1 - effective / point.originalPrice) * 100);
  }
  return point.salePercent === 0 ? 0 : null;
}
export function latestObservation(color: ProductColorPriceHistory): ProductPrice | null {
  return [...color.history].sort((a, b) => compareObservations(b, a))[0] ?? null;
}
function compareObservations(a: ProductPrice, b: ProductPrice) {
  const milliseconds = Date.parse(a.scrapedDate) - Date.parse(b.scrapedDate);
  // SQL emits UTC strings with six fractional digits. Preserve ordering within
  // one JS millisecond as well as the lossless observation identity in tooltips.
  const fraction = (value: string) => (value.match(/\.(\d+)Z$/)?.[1] ?? '').padEnd(6, '0');
  return milliseconds || fraction(a.scrapedDate).localeCompare(fraction(b.scrapedDate));
}
function dailyObservations(color: ProductColorPriceHistory) {
  const days = new Map<string, ProductPrice>();
  // Exactly mirror DAILY_SERIES: first choose the latest observation with
  // same-timestamp stock, then filter availability. An incomplete price cannot
  // erase a complete observation; a later complete sold-out observation can.
  for (const point of [...color.history].filter(p => p.stock.length > 0).sort(compareObservations)) {
    days.set(point.scrapedDate.slice(0, 10), point);
  }
  return days;
}
function dates(colors: ProductColorPriceHistory[]): string[] {
  const timestamps = colors.flatMap(c => c.history.map(p => Date.parse(`${p.scrapedDate.slice(0, 10)}T00:00:00Z`))).filter(Number.isFinite);
  if (!timestamps.length) return [];
  const result: string[] = [];
  for (let time = Math.min(...timestamps); time <= Math.max(...timestamps); time += DAY) result.push(new Date(time).toISOString().slice(0, 10));
  return result;
}
export function getPricePoints(colors: ProductColorPriceHistory[], selectedColorId: string, mode: HistoryMode): PricePoint[] {
  const included = mode === 'selected' ? colors.filter(c => c.colorId === selectedColorId) : colors;
  const daily = included.map(color => ({ color, observations: dailyObservations(color) }));
  return dates(included).map(date => {
    const candidates = daily.flatMap(({ color, observations }) => {
      const observation = observations.get(date);
      if (!observation || !observation.stock.some(s => s.isAvailable)) return [];
      const price = observation.salePrice ?? observation.originalPrice;
      return price != null && Number.isFinite(price) ? [{ color, observation, price }] : [];
    }).sort((a, b) => a.price - b.price || a.color.colorId.localeCompare(b.color.colorId));
    const chosen = candidates[0];
    const regular = chosen?.observation.originalPrice ?? null;
    return { x: Date.parse(`${date}T00:00:00Z`), y: chosen?.price ?? null, date, observedAt: chosen?.observation.scrapedDate ?? null,
      colorId: chosen?.color.colorId ?? null, colorName: chosen ? chosen.color.colorName ?? chosen.color.colorId : null,
      effectivePrice: chosen?.price ?? null, regularPrice: regular,
      discount: observationDiscount(chosen?.observation ?? null) };
  });
}
export function getLowAnnotation(points: PricePoint[]): string | null {
  const current = points.at(-1);
  if (current?.y == null) return null;
  const eligible = points.filter(p => p.y != null);
  const minimum = (from: number) => Math.min(...eligible.filter(p => p.x >= from).map(p => p.y!));
  const span = current.x - points[0].x;
  const label = current.y <= minimum(-Infinity) ? 'Lowest ever'
    : span >= 89 * DAY && current.y <= minimum(current.x - 89 * DAY) ? 'Lowest in 90 days'
    : span >= 29 * DAY && current.y <= minimum(current.x - 29 * DAY) ? 'Lowest in 30 days' : null;
  return label ? `${label}: ${formatCAD(current.y)} · ${current.colorName} · ${current.date}` : null;
}
export interface AvailabilityPoint { x: number; y: number | null; date: string; stock: ProductStock[]; observedAt: string | null }
export function availableSizeCount(stock: ProductStock[]): number | null {
  const available = stock.filter(s => s.isAvailable).length;
  if (available > 0) return available;
  return stock.length && stock.every(s => /^(Sold Out|Unavailable)$/i.test(s.status?.trim() ?? '')) ? 0 : null;
}
export function getAvailabilityPoints(color: ProductColorPriceHistory): AvailabilityPoint[] {
  const daily = dailyObservations(color);
  return dates([color]).map(date => {
    const observation = daily.get(date);
    const stock = observation?.stock ?? [];
    return { x: Date.parse(`${date}T00:00:00Z`), y: availableSizeCount(stock), date, stock, observedAt: observation?.scrapedDate ?? null };
  });
}
export interface PriceHistorySeries { points: PricePoint[]; lowAnnotation: string | null }
export interface ProductChartHistory {
  product: PriceHistorySeries;
  colors: Record<string, { price: PriceHistorySeries; availability: AvailabilityPoint[] }>;
}
export interface ProductHistoryResponse extends ProductPriceHistory { chartHistory: ProductChartHistory }
// This runs at the API boundary. Renderers consume the same authoritative points
// and labels, rather than each choosing eligibility or daily representatives.
export function getProductChartHistory(colors: ProductColorPriceHistory[], { completeHistory = true } = {}): ProductChartHistory {
  const series = (mode: HistoryMode, colorId = '') => {
    const points = getPricePoints(colors, colorId, mode);
    return { points, lowAnnotation: completeHistory ? getLowAnnotation(points) : null };
  };
  return { product: series('product'), colors: Object.fromEntries(colors.map(color => [color.colorId,
    { price: series('selected', color.colorId), availability: getAvailabilityPoints(color) }])) };
}
