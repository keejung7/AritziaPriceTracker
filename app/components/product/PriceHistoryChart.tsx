"use client";

import { Chart } from '@highcharts/react/Highcharts';
import 'highcharts/es-modules/masters/modules/accessibility.src.js';
import { useReducedMotion } from '@mantine/hooks';
import { formatCAD, formatDiscount, type PricePoint } from '../../services/productChartService';
import { chartTheme } from './chartTheme';

export default function PriceHistoryChart({ points, descriptionId }: { points: PricePoint[]; descriptionId: string }) {
  const reducedMotion = useReducedMotion();
  return <Chart options={{
    chart: { height: 340, backgroundColor: 'transparent', animation: !reducedMotion, style: { fontFamily: chartTheme.fontFamily, color: chartTheme.ink } },
    title: { text: undefined }, credits: { enabled: false }, legend: { enabled: false },
    accessibility: { enabled: true, linkedDescription: `#${descriptionId}`, keyboardNavigation: { enabled: true }, point: { descriptionFormatter: point => { const p = point.options.custom as PricePoint; return `${p.date}, ${p.colorName}, ${formatCAD(p.y)}, regular ${formatCAD(p.regularPrice)}, ${p.discount == null ? 'discount unavailable' : `${p.discount} percent discount`}.`; } } },
    xAxis: { type: 'datetime', lineColor: chartTheme.axis, tickColor: chartTheme.axis, title: { text: 'Observation date (UTC)' } },
    yAxis: { title: { text: 'Price (CAD)' }, gridLineColor: chartTheme.grid, labels: { formatter() { return formatCAD(Number(this.value)); } } },
    tooltip: { useHTML: false, formatter() { const p = this.options.custom as PricePoint; return `${p.colorName} · ${p.date}<br/>Observed: ${p.observedAt}<br/>Price: ${formatCAD(p.effectivePrice)}<br/>Regular: ${formatCAD(p.regularPrice)}<br/>Discount: ${formatDiscount(p.discount)}`; } },
    plotOptions: { series: { animation: reducedMotion ? false : { duration: 200 }, connectNulls: false } },
    series: [{ type: 'line', name: 'Observed price', color: chartTheme.accent, lineWidth: 2, marker: { enabled: true, radius: 3 }, data: points.map(point => ({ x: point.x, y: point.y, custom: point })) }],
  }} />;
}
