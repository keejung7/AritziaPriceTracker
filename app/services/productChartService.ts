import type { ProductColorPriceHistory, ProductPrice, ProductStock } from './priceHistoryService';

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
export function latestObservation(color: ProductColorPriceHistory): ProductPrice | null {
  return [...color.history].sort((a, b) => Date.parse(b.scrapedDate) - Date.parse(a.scrapedDate))[0] ?? null;
}
function dailyObservations(color: ProductColorPriceHistory) {
  const days = new Map<string, ProductPrice>();
  for (const point of [...color.history].sort((a, b) => Date.parse(a.scrapedDate) - Date.parse(b.scrapedDate))) {
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
      if (!observation || (mode === 'product' && !observation.stock.some(s => s.isAvailable))) return [];
      const price = observation.salePrice ?? observation.originalPrice;
      return price != null && Number.isFinite(price) ? [{ color, observation, price }] : [];
    }).sort((a, b) => a.price - b.price || a.color.colorId.localeCompare(b.color.colorId));
    const chosen = candidates[0];
    const regular = chosen?.observation.originalPrice ?? null;
    return { x: Date.parse(`${date}T00:00:00Z`), y: chosen?.price ?? null, date, observedAt: chosen?.observation.scrapedDate ?? null,
      colorId: chosen?.color.colorId ?? null, colorName: chosen ? chosen.color.colorName ?? chosen.color.colorId : null,
      effectivePrice: chosen?.price ?? null, regularPrice: regular,
      discount: chosen && regular && regular > chosen.price ? Math.round((1 - chosen.price / regular) * 100) : null };
  });
}
export function getLowAnnotation(points: PricePoint[]): string | null {
  const low = points.filter(p => p.y != null).sort((a, b) => a.y! - b.y! || a.x - b.x)[0];
  return low ? `Lowest observed: ${formatCAD(low.y)} · ${low.colorName} · ${low.date}` : null;
}
export interface AvailabilityPoint { x: number; y: number | null; date: string; stock: ProductStock[]; observedAt: string | null }
export function availableSizeCount(stock: ProductStock[]): number | null {
  if (!stock.length || stock.some(s => !s.isAvailable && !/^(Sold Out|Unavailable)$/i.test(s.status?.trim() ?? ''))) return null;
  return stock.filter(s => s.isAvailable).length;
}
export function getAvailabilityPoints(color: ProductColorPriceHistory): AvailabilityPoint[] {
  const daily = dailyObservations(color);
  return dates([color]).map(date => {
    const observation = daily.get(date);
    const stock = observation?.stock ?? [];
    return { x: Date.parse(`${date}T00:00:00Z`), y: availableSizeCount(stock), date, stock, observedAt: observation?.scrapedDate ?? null };
  });
}
