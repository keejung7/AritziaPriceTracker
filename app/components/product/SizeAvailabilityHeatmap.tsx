"use client";

import type { PointerEvent } from 'react';
import { Box, Group, Text } from '@mantine/core';
import type { AvailabilityPoint } from '../../services/productChartService';
import type { ProductStock } from '../../services/priceHistoryService';
import { chartTheme, DAY_MS, dateAtPosition, datePosition, observationDate, type ChartDateRange } from './chartTheme';

const stockStates = {
  inStock: { label: 'In stock', color: '#72967A' },
  limited: { label: 'Only a few left', color: '#D9B568' },
  critical: { label: 'Critically low stock', color: '#B76E45' },
  soldOut: { label: 'Sold out', color: '#DEDAD5' },
  unknown: { label: 'No observation', color: 'transparent' },
} as const;

export function stockStatus(item?: ProductStock) {
  const status = item?.status?.trim() ?? '';
  const state = /^(Sold Out(?: Online)?|Unavailable)$/i.test(status) ? stockStates.soldOut
    : /^(?:Only )?1 Left$/i.test(status) ? stockStates.critical
    : /^(?:Only a Few Left|(?:Only )?[23] Left)$/i.test(status) ? stockStates.limited
    : item?.isAvailable ? stockStates.inStock : stockStates.unknown;
  return { ...state, detail: status || state.label };
}

const clothingSizes = ['5XS', '4XS', '3XS', '2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
const compareLabels = new Intl.Collator('en-CA', { numeric: true, sensitivity: 'base' });

function sizeRank(size: string) {
  const label = size.trim().toUpperCase().replace(/^(X{2,})([SL])$/, (_, xs: string, suffix: string) => `${xs.length}X${suffix}`);
  const rank = clothingSizes.indexOf(label);
  return rank < 0 ? clothingSizes.length : rank;
}

export function compareSizes(left: string, right: string) {
  return sizeRank(left) - sizeRank(right) || compareLabels.compare(left, right);
}

export default function SizeAvailabilityHeatmap({ points, sizes, selectedSize, dateRange, activeDate, onDateChange }: {
  points: AvailabilityPoint[];
  sizes: string[];
  selectedSize: string | null;
  dateRange: Required<ChartDateRange>;
  activeDate: number | null;
  onDateChange: (date: number | null) => void;
}) {
  const byDate = new Map(points.map(point => [point.x, point.stock]));
  const start = dateRange.min + DAY_MS / 2;
  const end = dateRange.max - DAY_MS / 2;
  const columnWidth = 100 * DAY_MS / (dateRange.max - dateRange.min);
  const tickCount = Math.min(4, Math.round((end - start) / DAY_MS));
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) =>
    start + Math.round(index * (end - start) / (Math.max(1, tickCount) * DAY_MS)) * DAY_MS);
  const date = activeDate == null ? null : observationDate.format(activeDate);

  function pointToDate(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    onDateChange(dateAtPosition((event.clientX - bounds.left) / bounds.width, dateRange));
  }

  return <>
    <Group gap={12} aria-label="Stock status legend">
      {Object.values(stockStates).map(state => <Group key={state.label} gap={4}>
        <Box aria-hidden="true" w={12} h={12} style={{ background: state.color, border: '1px solid #9A9188' }} />
        <Text fz={14}>{state.label}</Text>
      </Group>)}
    </Group>
    <div role="group" aria-label="Stock by size and observation date" onMouseLeave={() => onDateChange(null)}>
      {sizes.map(size => <div id={`stock-row-${encodeURIComponent(size)}`} key={size}
        style={{ display: 'grid', gridTemplateColumns: `${chartTheme.plotMargins.marginLeft}px minmax(0, 1fr) ${chartTheme.plotMargins.marginRight}px`, background: selectedSize === size ? '#F3E5E8' : undefined }}>
        <Text fz={12} fw={selectedSize === size ? 700 : 500} py={4} pl={4}>{size}</Text>
        <svg width="100%" height="26" role="img" tabIndex={0}
          aria-label={`Size ${size} stock history. Use the left and right arrow keys to review dates.`}
          onPointerMove={pointToDate} onPointerDown={pointToDate}
          onFocus={() => onDateChange(activeDate ?? end)} onBlur={() => onDateChange(null)}
          onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            onDateChange(Math.max(start, Math.min(end, (activeDate ?? end) + (event.key === 'ArrowLeft' ? -DAY_MS : DAY_MS))));
          }}>
          {points.flatMap(point => {
            const item = point.stock.find(stock => stock.size === size);
            const status = stockStatus(item);
            if (status.color === 'transparent') return [];
            return <rect key={point.date} x={`${datePosition(point.x, dateRange) - columnWidth / 2}%`}
              y={3} width={`${columnWidth}%`} height={20} rx={1.5} fill={status.color} stroke="var(--mantine-color-body)" strokeWidth={0.5}>
              <title>{observationDate.format(point.x)} · {size} · {status.detail}</title>
            </rect>;
          })}
          {activeDate != null && <line x1={`${datePosition(activeDate, dateRange)}%`} x2={`${datePosition(activeDate, dateRange)}%`}
            y1={0} y2={26} stroke={chartTheme.ink} pointerEvents="none" />}
        </svg>
      </div>)}
      <Box pos="relative" h={22} ml={chartTheme.plotMargins.marginLeft} mr={chartTheme.plotMargins.marginRight} aria-label="Observation date (UTC)">
        {ticks.map((tick, index) => <Text key={tick} component="span" fz={12} c={chartTheme.secondary}
          style={{ position: 'absolute', left: `${datePosition(tick, dateRange)}%`, transform: `translateX(${index === 0 ? 0 : index === ticks.length - 1 ? -100 : -50}%)`, whiteSpace: 'nowrap' }}>
          {observationDate.format(tick)}
        </Text>)}
      </Box>
    </div>
    <Text aria-live="polite" fz={12} c={chartTheme.secondary} mih={20}>
      {date && activeDate != null ? `${date} · ${(selectedSize ? [selectedSize] : sizes).map(size =>
        `${size}: ${stockStatus(byDate.get(activeDate)?.find(item => item.size === size)).detail}`).join(' · ')}` : 'Point to a date to see stock statuses.'}
    </Text>
  </>;
}
