"use client";

import { Chart } from '@highcharts/react/Highcharts';
import 'highcharts/es-modules/masters/modules/accessibility.src.js';
import { useReducedMotion } from '@mantine/hooks';
import type { AvailabilityPoint } from '../../services/productChartService';

export default function AvailabilityHistoryChart({ points, colorName, descriptionId }: { points: AvailabilityPoint[]; colorName: string; descriptionId: string }) {
  const reducedMotion = useReducedMotion();
  return <Chart options={{
    chart: { height: 260, backgroundColor: 'transparent', animation: !reducedMotion, style: { fontFamily: 'inherit', color: '#2B2825' } },
    title: { text: undefined }, credits: { enabled: false }, legend: { enabled: false },
    accessibility: { enabled: true, linkedDescription: `#${descriptionId}`, keyboardNavigation: { enabled: true }, point: { descriptionFormatter: point => { const p = point.options.custom as AvailabilityPoint; return `${colorName}, ${p.date}, ${p.y} available sizes.`; } } },
    xAxis: { type: 'datetime', lineColor: '#D9D3CA', title: { text: 'Observation date (UTC)' } },
    yAxis: { min: 0, allowDecimals: false, title: { text: 'Available sizes' }, gridLineColor: '#E8E2D9' },
    tooltip: { useHTML: false, formatter() { const p = this.options.custom as AvailabilityPoint; return `${colorName} · ${p.date}<br/>Observed: ${p.observedAt}<br/>${p.y} available sizes<br/>${p.stock.map(size => `${size.size}: ${size.isAvailable ? 'Available' : size.status ?? 'Unknown'}`).join('<br/>')}`; } },
    plotOptions: { series: { animation: reducedMotion ? false : { duration: 200 }, connectNulls: false } },
    series: [{ type: 'line', name: `${colorName} available sizes`, color: '#722F3D', step: 'left', marker: { enabled: true, radius: 3 }, data: points.map(point => ({ x: point.x, y: point.y, custom: point })) }],
  }} />;
}
