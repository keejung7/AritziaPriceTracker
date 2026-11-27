"use client";

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ActionIcon, Alert, Anchor, Box, Button, Divider, Group, Loader, Paper, SimpleGrid, Stack, Text, Title, Tooltip, VisuallyHidden } from '@mantine/core';
import { formatCAD, latestObservation, observationDiscount, type HistoryMode, type ProductHistoryResponse } from '../services/productChartService';

import SizeAvailabilityHeatmap, { compareSizes, stockStatus } from './product/SizeAvailabilityHeatmap';
import { chartTheme, DAY_MS, dateAtPosition, datePosition, observationDate, PRICE_CHART_HEIGHT, pricePlotMargins } from './product/chartTheme';

const PriceHistoryChart = dynamic(() => import('./product/PriceHistoryChart'), { ssr: false, loading: () => <Box mih={PRICE_CHART_HEIGHT}><Text>Loading chart…</Text></Box> });

interface PriceOutlook {
  asOf: string;
  colors: Record<string, {
    current_price: number;
    drop_chance_next_day: number | null;
    markdown_price_low: number | null;
    markdown_price_high: number | null;
  }>;
}

const torontoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
});
const formatChance = new Intl.NumberFormat('en-CA', { style: 'percent', maximumFractionDigits: 1 });

function InfoTooltip({ name, description }: { name: string; description: string }) {
  return <Tooltip label={description} multiline w="min(300px, 75vw)"
    color={chartTheme.ink} events={{ hover: true, focus: true, touch: true }}>
    <ActionIcon type="button" size={24} radius="xl" variant="subtle" color={chartTheme.secondary} aria-label={name}>
      <Text span fw={600} fz={13} aria-hidden="true">i</Text>
    </ActionIcon>
  </Tooltip>;
}

export default function ProductPriceHistoryExplorer({ productNo }: { productNo: string }) {
  const [product, setProduct] = useState<ProductHistoryResponse | null>(null);
  const [selectedColorId, setSelectedColorId] = useState('');
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [activeDate, setActiveDate] = useState<number | null>(null);
  const [outlook, setOutlook] = useState<PriceOutlook | null>(null);
  const [mode, setMode] = useState<HistoryMode>('selected');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setSelectedSize(null);
    setActiveDate(null);
    setOutlook(null);
    fetch(`/predictions/${encodeURIComponent(productNo)}.json`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((result: PriceOutlook | null) => {
        if (!controller.signal.aborted && result?.colors) setOutlook(result);
      })
      .catch(() => { /* History remains usable when the optional export is unavailable. */ });
    setLoading(true); setError(null); setMode('selected');
    fetch(`/api/products/${productNo}/price-history`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`Price history request failed with ${response.status}`); return response.json(); })
      .then((history: ProductHistoryResponse | null) => { if (!controller.signal.aborted) { setProduct(history); setSelectedColorId(history?.colors[0]?.colorId ?? ''); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load history'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [productNo]);
  const selected = product?.colors.find(color => color.colorId === selectedColorId);
  const current = selected ? latestObservation(selected) : null;
  const currentPrice = current?.salePrice ?? current?.originalPrice ?? null;
  const discounted = currentPrice != null && current?.originalPrice != null && currentPrice < current.originalPrice;
  const series = mode === 'product' ? product?.chartHistory.product : product?.chartHistory.colors[selectedColorId]?.price;
  const points = series?.points ?? [];
  const availability = product?.chartHistory.colors[selectedColorId]?.availability ?? [];
  const sizes = [...new Set([
    ...(current?.stock.map(item => item.size) ?? []),
    ...availability.flatMap(point => point.stock.map(item => item.size)),
  ])].sort(compareSizes);
  const size = selectedSize && sizes.includes(selectedSize) ? selectedSize : null;
  const candidate = outlook?.colors[selectedColorId];
  const prediction = candidate && current && candidate.current_price === currentPrice
    && outlook?.asOf === torontoDate.format(new Date(current.scrapedDate)) ? candidate : null;
  const dropChance = prediction?.drop_chance_next_day;
  const markdownRange = prediction?.markdown_price_low != null && prediction.markdown_price_high != null
    ? `${formatCAD(prediction.markdown_price_low).replace(' CAD', '')}–${formatCAD(prediction.markdown_price_high)}` : null;
  const estimateCount = Number(dropChance != null) + Number(markdownRange != null);
  const unavailableReason = candidate && !prediction ? 'The saved forecast is based on a different price observation.'
    : prediction ? 'The model did not produce a price estimate for this observation.' : null;
  const colorName = selected?.colorName ?? selectedColorId;
  const low = mode === 'product' ? series?.lowAnnotation : null;
  const start = Math.min(points[0]?.x ?? Infinity, availability[0]?.x ?? Infinity);
  const end = Math.max(points.at(-1)?.x ?? -Infinity, availability.at(-1)?.x ?? -Infinity);
  const dateRange = useMemo(() => Number.isFinite(start) && Number.isFinite(end)
    ? { min: start - DAY_MS / 2, max: end + DAY_MS / 2 } : null, [start, end]);
  const hasPriceChart = points.filter(point => point.y != null).length > 1;
  const showHeatmap = Boolean(sizes.length && dateRange);
  const historicalLow = (product?.chartHistory.colors[selectedColorId]?.price.points ?? [])
    .reduce<number | null>((lowest, point) =>
      point.y == null ? lowest : lowest == null ? point.y : Math.min(lowest, point.y), null);
  const trackingStart = product?.colors.flatMap(color => color.history.map(point => point.scrapedDate.slice(0, 10))).sort()[0];
  const priceMethod = `Based on prices tracked since ${trackingStart ?? 'date unavailable'}. ${
    mode === 'selected' ? 'Daily price for the selected color when an available size was observed at the exact same time.'
      : 'Daily lowest price among colors with an available size in the same observation.'
  } Each UTC day uses the latest complete color observation. Sold-out and unknown availability are excluded. Missing days remain gaps. Prices are in CAD.`;
  const availabilityMethod = `Each row shows a size for ${colorName}. Each column is one UTC date. Blank cells indicate no known stock status. Select a size above to highlight its row.`;
  const outlookMethod = `Experimental estimates based on ${outlook?.asOf}. The drop chance is for a check one day later. The range applies if this color gets cheaper during a broad markdown.`;
  if (loading) return <Group justify="center" mih={360}><Loader /><Text>Loading price history</Text></Group>;
  if (error) return <Alert color="red" title="Price history could not load">{error}</Alert>;
  if (!product || !selected) return <Text>No price history is available for this product.</Text>;
  return <Stack gap={20} c={chartTheme.ink}>
    <Anchor component={Link} href="/">Back to products</Anchor>
    <Paper withBorder p={20}>
      <Group align="start" gap={16} wrap="wrap">
        <Box style={{ flex: '0 1 160px', width: '100%' }}>
          {selected.productColorImageUrl ? <img src={selected.productColorImageUrl}
            alt={`${product.productName ?? 'Product'} in ${colorName}`}
            style={{ display: 'block', width: '100%', aspectRatio: '3 / 4', objectFit: 'cover' }} />
            : <Text size="sm" c="dimmed">Image unavailable</Text>}
        </Box>
        <Stack style={{ flex: '1 1 320px', minWidth: 0 }} gap={16}>
          <Box>
            {product.productBrand && <Text fz={12} c={chartTheme.secondary}>{product.productBrand}</Text>}
            <Title order={1} fz={24} fw={600}>{product.productName ?? `Product ${product.productNo}`}</Title>
          </Box>
          <Stack gap={8}>
            <Text fz={13} c={chartTheme.secondary}>Colour: <Text span fw={600} c={chartTheme.ink}>{colorName}</Text>
              {' · '}{product.colors.length} {product.colors.length === 1 ? 'colour' : 'colours'}
            </Text>
            <Group role="group" aria-label="Product colors" gap={8}>
              {product.colors.map(color => {
                const name = color.colorName ?? color.colorId;
                const selected = color.colorId === selectedColorId;
                return <Tooltip key={color.colorId} label={name} color={chartTheme.ink}
                  events={{ hover: true, focus: true, touch: false }}>
                  <ActionIcon type="button" size={34} radius={5} variant="default"
                    aria-label={`Select ${name}`} aria-pressed={selected}
                    onClick={() => { setSelectedColorId(color.colorId); setActiveDate(null); }}
                    style={{
                      borderColor: selected ? chartTheme.accent : '#A8A29E',
                      boxShadow: selected ? `0 0 0 2px var(--mantine-color-body), 0 0 0 3px ${chartTheme.accent}` : undefined,
                      overflow: 'hidden',
                    }}>
                    {color.swatchImageUrl ? <img src={color.swatchImageUrl} alt="" loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Text span fz={11} fw={600} aria-hidden="true">{name.slice(0, 2).toUpperCase()}</Text>}
                  </ActionIcon>
                </Tooltip>;
              })}
            </Group>
          </Stack>
          <SimpleGrid cols={{ base: 2, md: estimateCount === 2 ? 4 : 3 }} spacing={16} aria-label={`Price summary for ${colorName}`}>
            <Stack gap={6}>
              <Text fz={12} c={chartTheme.secondary}>Last observed price</Text>
              <Stack aria-label="Selected color price" gap={0}>
                <Text fz={24} fw={600} lh={1.2}>{formatCAD(currentPrice)}</Text>
                {discounted && <Text c={chartTheme.secondary} fz={12}>
                  <Text span component="del" fz={13}>{formatCAD(current.originalPrice)}</Text>
                  {' · '}{observationDiscount(current)}% off
                </Text>}
              </Stack>
            </Stack>
            <Stack gap={6}>
              <Text fz={12} c={chartTheme.secondary}>Historical low</Text>
              <Text fz={20} fw={600} lh={1.2}>{formatCAD(historicalLow)}</Text>
              {historicalLow != null && currentPrice === historicalLow && <Text fz={12} c={chartTheme.secondary}>At tracked low</Text>}
            </Stack>
            {dropChance != null && <Stack gap={6}>
              <Group gap={4} h={18} wrap="nowrap">
                <Text fz={12} c={chartTheme.secondary}>Price drop chance</Text>
                {markdownRange == null && <InfoTooltip name="About price estimates" description={outlookMethod} />}
              </Group>
              <Text fz={20} fw={600} lh={1.2}>{dropChance > 0 && dropChance < 0.001
                ? 'Less than 0.1%' : formatChance.format(dropChance)}</Text>
              <Text fz={12} c={chartTheme.secondary}>Within 1 day</Text>
            </Stack>}
            {markdownRange != null && <Stack gap={6}>
              <Group gap={4} h={18} wrap="nowrap">
                <Text fz={12} c={chartTheme.secondary}>Est. markdown</Text>
                <InfoTooltip name="About price estimates" description={outlookMethod} />
              </Group>
              <Text fz={20} fw={600} lh={1.2}>{markdownRange}</Text>
              <Text fz={12} c={chartTheme.secondary}>If marked down</Text>
            </Stack>}
            {!estimateCount && <Stack gap={6}>
              <Group gap={4} h={18} wrap="nowrap">
                <Text fz={12} c={chartTheme.secondary}>Price outlook</Text>
                {unavailableReason && <InfoTooltip name="Why there is no price estimate" description={unavailableReason} />}
              </Group>
              <Text fz={14} fw={500} c={chartTheme.secondary}>No estimate available</Text>
            </Stack>}
          </SimpleGrid>
          <Group justify="space-between" gap="xs">
            <Stack gap={4}>
              <Text fz={12} c={chartTheme.secondary}>
                {current ? `Last observed availability · ${observationDate.format(new Date(current.scrapedDate))} UTC` : 'Availability unknown'}
              </Text>
              <Group role="group" aria-label="Last observed sizes" gap={8}>
                {sizes.map(value => {
                  const status = stockStatus(current?.stock.find(item => item.size === value));
                  const soldOut = status.label === 'Sold out';
                  const indicator = status.label === 'Only a few left' || status.label === 'Critically low stock';
                  return <Button key={value} h={38} miw={48} px={10} variant="outline" color={chartTheme.accent}
                    aria-pressed={size === value} aria-label={`${value} · ${status.detail}`} title={status.detail}
                    onClick={() => setSelectedSize(size === value ? null : value)}
                    style={{
                      color: soldOut ? chartTheme.muted : chartTheme.ink,
                      borderColor: size === value ? chartTheme.accent : soldOut ? chartTheme.grid : '#9A9188',
                      background: size === value ? '#F3E5E8' : soldOut ? '#F5F3F0' : undefined,
                    }}>
                    {indicator && <Box component="span" aria-hidden="true" w={10} h={10} mr={6}
                      style={{ display: 'inline-block', background: status.color, border: '1px solid #82623B', borderRadius: '50%' }} />}
                    <Text span fz={13} fw={600} td={soldOut ? 'line-through' : undefined}>{value}</Text>
                  </Button>;
                })}
              </Group>
            </Stack>
            <Button component="a" href={product.productUrl} target="_blank" rel="noreferrer" variant="outline" color={chartTheme.accent} size="compact-sm">
              Check at Aritzia
            </Button>
          </Group>
        </Stack>
      </Group>
    </Paper>
    <Paper component="section" aria-labelledby="history-title" withBorder p={20}>
      <Stack gap={16}>
        <Title id="history-title" order={2} fz={20} fw={600}>Price &amp; availability history</Title>
        <Group justify="space-between" align="center" gap="xs">
          <Group gap={8}>
            <Title order={3} fz={20} fw={600}>Price history</Title>
            <InfoTooltip name="How price history is calculated" description={priceMethod} />
          </Group>
          <Group role="group" aria-label="Price history scope" gap="xs">
            <Button color={chartTheme.accent} size="compact-sm" aria-pressed={mode === 'selected'} variant={mode === 'selected' ? 'filled' : 'outline'} onClick={() => { setMode('selected'); setActiveDate(null); }}>Selected color</Button>
            <Button color={chartTheme.accent} size="compact-sm" aria-pressed={mode === 'product'} variant={mode === 'product' ? 'filled' : 'outline'} onClick={() => { setMode('product'); setActiveDate(null); }}>Product lowest available</Button>
          </Group>
        </Group>
        <VisuallyHidden id="price-method">{priceMethod}</VisuallyHidden>
        <Box role="region" aria-label="Price history chart" aria-describedby="price-method" tabIndex={0} mih={PRICE_CHART_HEIGHT} pos="relative"
          onPointerMove={event => {
            if (!hasPriceChart || !showHeatmap || !dateRange) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const { marginLeft, marginRight } = chartTheme.plotMargins;
            const width = bounds.width - marginLeft - marginRight;
            if (width > 0) setActiveDate(dateAtPosition((event.clientX - bounds.left - marginLeft) / width, dateRange));
          }}
          onPointerLeave={() => setActiveDate(null)}>
          {hasPriceChart ? <PriceHistoryChart points={points} dateRange={dateRange ?? {}} showDateAxis={!showHeatmap} descriptionId="price-method" /> : <Text>Price history is still building</Text>}
          {showHeatmap && dateRange && activeDate != null && hasPriceChart &&
            <Box aria-hidden="true" pos="absolute" top={pricePlotMargins.marginTop} bottom={pricePlotMargins.marginBottom}
              left={chartTheme.plotMargins.marginLeft} right={chartTheme.plotMargins.marginRight} style={{ pointerEvents: 'none' }}>
              <Box pos="absolute" top={0} bottom={0} left={`${datePosition(activeDate, dateRange)}%`} w={1} bg={chartTheme.ink} />
            </Box>}
        </Box>
        {low ? <Text size="sm">{low}</Text> : null}
        <Divider />
        <Group gap={8}>
          <Title order={3} fz={20} fw={600}>Size availability history</Title>
          <InfoTooltip name="How availability history is calculated" description={availabilityMethod} />
        </Group>
        <VisuallyHidden id="availability-method">{availabilityMethod}</VisuallyHidden>
        <Box role="region" aria-label="Size availability history" aria-describedby="availability-method">
          {showHeatmap && dateRange ? <SizeAvailabilityHeatmap points={availability} sizes={sizes}
            selectedSize={size} dateRange={dateRange} activeDate={activeDate} onDateChange={setActiveDate} />
            : <Text>Availability history is still building</Text>}
        </Box>
      </Stack>
    </Paper>
  </Stack>;
}
