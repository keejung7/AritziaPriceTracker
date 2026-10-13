'use client';

import { useState } from 'react';
import { Alert, Box, Button, Group, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import ProductCard from './ProductCard';
import CatalogFilters from './CatalogFilters';
import { defaultCatalogFilters, useCatalogProducts } from './useCatalogProducts';

export default function CatalogExplorer() {
  const [filters, setFilters] = useState(defaultCatalogFilters);
  const catalog = useCatalogProducts(filters);
  const updated = catalog.snapshot ? new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(catalog.snapshot.dataAsOf)) : null;
  return <Stack gap="lg">
    <Box component="header">
      <Title order={1}>Aritzia Price Tracker</Title>
      <Text c="dimmed">Compare current prices, find your size, and explore the prices we’ve tracked.</Text>
      <Text size="sm" c="dimmed" mih={44}>Updated <time dateTime={catalog.snapshot?.dataAsOf}>{updated ?? 'date unavailable'}</time></Text>
    </Box>
    <CatalogFilters filters={filters} onChange={setFilters} options={catalog.filterOptions} />
    <Box mih={44} aria-live="polite">{catalog.snapshot?.status === 'stale' && <Text size="sm" c="dimmed">Catalog data is stale. Showing observations from {updated}.</Text>}</Box>
    {catalog.error && <Alert color="gray" role="alert"><Group><Text>{catalog.error}</Text><Button variant="subtle" onClick={catalog.retry}>Try again</Button></Group></Alert>}
    <Text role="status" aria-live="polite">{catalog.total === null ? (catalog.isLoading ? 'Loading products…' : 'Products unavailable') : `${catalog.total} products`}</Text>
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} aria-busy={catalog.isLoading || catalog.isLoadingMore}>
      {catalog.products.map(product => <ProductCard key={product.productNo} product={product} />)}
      {(catalog.isLoading || catalog.isLoadingMore) && Array.from({ length: 24 }, (_, index) =>
        <Skeleton key={`loading-${index}`} style={{ aspectRatio: '3 / 4' }} aria-label="Loading product" />)}
    </SimpleGrid>
    {!catalog.isLoading && !catalog.error && catalog.total === 0 && <Stack align="start"><Text>No products match your filters.</Text><Button variant="subtle" onClick={() => setFilters({ ...defaultCatalogFilters, sizes: [] })}>Clear filters</Button></Stack>}
    {catalog.nextCursor && <Button onClick={catalog.loadMore} loading={catalog.isLoadingMore} disabled={catalog.isLoading}>Load more</Button>}
  </Stack>;
}
