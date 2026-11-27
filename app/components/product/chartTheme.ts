import { editorialTokens as tokens } from '../../designTokens';

export const chartTheme = {
  ink: '#292524',
  secondary: '#57534E',
  muted: '#78716C',
  axis: '#78716C',
  grid: '#E0DAD2',
  accent: '#72283D',
  fontFamily: tokens.fontFamily,
  axisLabels: { color: '#57534E', fontSize: '12px' },
  plotMargins: { marginLeft: 96, marginRight: 16 },
} as const;

export interface ChartDateRange {
  min?: number;
  max?: number;
}

export const DAY_MS = 86_400_000;

export function datePosition(date: number, { min, max }: Required<ChartDateRange>) {
  return 100 * (date - min) / (max - min);
}

export const PRICE_CHART_HEIGHT = 195;
export const pricePlotMargins = { marginTop: 10, marginBottom: 15 } as const;
export const observationDate = new Intl.DateTimeFormat('en-CA', {
  month: 'short', day: 'numeric', timeZone: 'UTC',
});

export function dateAtPosition(fraction: number, { min, max }: Required<ChartDateRange>) {
  const dayCount = Math.round((max - min) / DAY_MS);
  const day = Math.max(0, Math.min(dayCount - 1, Math.floor(fraction * dayCount)));
  return min + (day + 0.5) * DAY_MS;
}
