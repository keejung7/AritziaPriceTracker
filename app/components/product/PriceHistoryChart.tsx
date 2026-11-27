"use client";

import { memo } from 'react';
import { Chart } from '@highcharts/react/Highcharts';
import 'highcharts/es-modules/masters/modules/accessibility.src.js';
import { useReducedMotion } from '@mantine/hooks';
import { formatCAD, formatDiscount, type PricePoint } from '../../services/productChartService';
import { chartTheme, observationDate, PRICE_CHART_HEIGHT, pricePlotMargins, type ChartDateRange } from './chartTheme';

const PriceHistoryChart = memo(function PriceHistoryChart({ points, dateRange, showDateAxis, descriptionId }: { points: PricePoint[]; dateRange: ChartDateRange; showDateAxis: boolean; descriptionId: string }) {
  const reducedMotion = useReducedMotion();
  return <Chart options={{
    chart: { ...chartTheme.plotMargins, ...(showDateAxis ? {} : pricePlotMargins), height: PRICE_CHART_HEIGHT, backgroundColor: 'transparent', animation: !reducedMotion, style: { fontFamily: chartTheme.fontFamily, color: chartTheme.ink } },
    title: { text: undefined }, credits: { enabled: false }, legend: { enabled: false },
    accessibility: { enabled: true, linkedDescription: `#${descriptionId}`, keyboardNavigation: { enabled: true }, point: { descriptionFormatter: point => { const p = point.options.custom as PricePoint; return `${p.date}, ${p.colorName}, ${formatCAD(p.y)}, regular ${formatCAD(p.regularPrice)}, ${p.discount == null ? 'discount unavailable' : `${p.discount} percent discount`}.`; } } },
    xAxis: { type: 'datetime', ...dateRange, minPadding: 0, maxPadding: 0, visible: showDateAxis, labels: { style: chartTheme.axisLabels, formatter() { return observationDate.format(Number(this.value)); } }, lineColor: chartTheme.axis, tickColor: chartTheme.axis, title: { text: undefined } },
    yAxis: { title: { text: undefined }, gridLineColor: chartTheme.grid, labels: { style: chartTheme.axisLabels, format: '${value:,.2f}' } },
    tooltip: { useHTML: false, formatter() { const p = this.options.custom as PricePoint; return `${p.colorName} · ${observationDate.format(p.x)}<br/>Price: ${formatCAD(p.effectivePrice)}<br/>Regular: ${formatCAD(p.regularPrice)}<br/>Discount: ${formatDiscount(p.discount)}`; } },
    plotOptions: { series: { animation: reducedMotion ? false : { duration: 200 }, connectNulls: false } },
    series: [{ type: 'line', name: 'Observed price', color: chartTheme.accent, lineWidth: 2, marker: { enabled: true, radius: 3 }, data: points.map(point => ({ x: point.x, y: point.y, custom: point })) }],
  }} />;
});

export default PriceHistoryChart;
