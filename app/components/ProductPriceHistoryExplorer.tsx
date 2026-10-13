"use client";

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Alert, Anchor, Box, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import type { ProductPriceHistory } from '../services/priceHistoryService';
import { availableSizeCount, formatCAD, getAvailabilityPoints, getLowAnnotation, getPricePoints, latestObservation, type HistoryMode } from '../services/productChartService';

const PriceHistoryChart = dynamic(() => import('./product/PriceHistoryChart'), { ssr: false, loading: () => <Text>Loading chart…</Text> });
const AvailabilityHistoryChart = dynamic(() => import('./product/AvailabilityHistoryChart'), { ssr: false, loading: () => <Text>Loading chart…</Text> });

export default function ProductPriceHistoryExplorer({ productNo }: { productNo: string }) {
  const [product, setProduct] = useState<ProductPriceHistory | null>(null);
  const [selectedColorId, setSelectedColorId] = useState('');
  const [mode, setMode] = useState<HistoryMode>('selected');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setMode('selected');
    fetch(`/api/products/${productNo}/price-history`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`Price history request failed with ${response.status}`); return response.json(); })
      .then((history: ProductPriceHistory | null) => { if (!controller.signal.aborted) { setProduct(history); setSelectedColorId(history?.colors[0]?.colorId ?? ''); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load history'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [productNo]);
  const selected = product?.colors.find(color => color.colorId === selectedColorId);
  const current = selected ? latestObservation(selected) : null;
  const points = useMemo(() => getPricePoints(product?.colors ?? [], selectedColorId, mode), [product, selectedColorId, mode]);
  const availability = useMemo(() => selected ? getAvailabilityPoints(selected) : [], [selected]);
  const low = getLowAnnotation(points);
  const trackingStart = product?.colors.flatMap(color => color.history.map(point => point.scrapedDate.slice(0, 10))).sort()[0];
  if (loading) return <Group justify="center" mih={360}><Loader /><Text>Loading price history</Text></Group>;
  if (error) return <Alert color="red" title="Price history could not load">{error}</Alert>;
  if (!product || !selected) return <Text>No price history is available for this product.</Text>;
  return <Stack gap="xl">
    <Anchor component={Link} href="/">Back to products</Anchor>
    <Group align="start" gap="xl" wrap="wrap">
      <Box style={{ flex: '1 1 280px', maxWidth: 460 }}>
        {selected.productColorImageUrl ? <img src={selected.productColorImageUrl} alt={`${product.productName ?? 'Product'} in ${selected.colorName ?? selected.colorId}`} style={{ display: 'block', width: '100%', aspectRatio: '3 / 4', objectFit: 'cover' }} /> : <Paper p="xl">Image unavailable</Paper>}
      </Box>
      <Stack style={{ flex: '1 1 320px' }} gap="lg">
        <Box><Text c="dimmed">{product.productBrand} · #{product.productNo}</Text><Title order={1}>{product.productName ?? `Product ${product.productNo}`}</Title></Box>
        <Text aria-label="Selected color price" size="xl" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCAD(current?.salePrice ?? current?.originalPrice ?? null)}</Text>
        <Text>{selected.colorName ?? selected.colorId}</Text>
        <Group aria-label="Product colors" gap="xs">
          {product.colors.map(color => <Button key={color.colorId} aria-label={`Select ${color.colorName ?? color.colorId}`} aria-pressed={color.colorId === selectedColorId} variant={color.colorId === selectedColorId ? 'filled' : 'outline'} onClick={() => setSelectedColorId(color.colorId)}>{color.swatchImageUrl ? <img src={color.swatchImageUrl} alt="" width={20} height={20} /> : null}{color.colorName ?? color.colorId}</Button>)}
        </Group>
        <Text aria-label="Available sizes">{current?.stock.some(size => size.isAvailable) ? `Available sizes: ${current.stock.filter(size => size.isAvailable).map(size => size.size).join(', ')}` : availableSizeCount(current?.stock ?? []) === 0 ? 'Currently unavailable' : 'Availability unavailable'}</Text>
        <Button component="a" href={product.productUrl} target="_blank" rel="noreferrer" variant="outline">Open product at Aritzia</Button>
      </Stack>
    </Group>
    <Paper withBorder p={{ base: 'md', sm: 'xl' }}>
      <Stack gap="md">
        <Title order={2}>Price history</Title>
        <Group><Button aria-pressed={mode === 'selected'} variant={mode === 'selected' ? 'filled' : 'outline'} onClick={() => setMode('selected')}>Selected color</Button><Button aria-pressed={mode === 'product'} variant={mode === 'product' ? 'filled' : 'outline'} onClick={() => setMode('product')}>Product lowest available</Button></Group>
        <Text id="price-method" size="sm" c="dimmed">Tracking started {trackingStart ?? 'date unavailable'}. {mode === 'selected' ? 'Latest daily observation for the selected color, including sold-out prices.' : 'Daily lowest price among colors with an available size in the same observation. Sold-out and unknown availability are excluded.'} Missing days remain gaps. Observed prices are in CAD and are not a complete retail price record.</Text>
        <Box role="region" aria-label="Price history chart" aria-describedby="price-method" tabIndex={0}>
          {points.filter(point => point.y != null).length > 1 ? <PriceHistoryChart points={points} descriptionId="price-method" /> : <Text>Price history is still building</Text>}
        </Box>
        {low ? <Text size="sm">{low}</Text> : null}
        <Title order={2}>Availability history</Title>
        <Text id="availability-method" size="sm" c="dimmed">Available size count for {selected.colorName ?? selected.colorId} at each daily observation. Zero means sold out; missing stock data remains a gap. Use Tab to enter a chart and arrow keys to explore observations.</Text>
        <Box role="region" aria-label="Availability history chart" aria-describedby="availability-method" tabIndex={0}>
          {availability.filter(point => point.y != null).length > 1 ? <AvailabilityHistoryChart points={availability} colorName={selected.colorName ?? selected.colorId} descriptionId="availability-method" /> : <Text>Availability history is still building</Text>}
        </Box>
      </Stack>
    </Paper>
  </Stack>;
}
