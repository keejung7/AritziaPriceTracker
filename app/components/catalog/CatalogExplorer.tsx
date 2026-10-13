'use client';

import { useState } from 'react';
import { Alert, Button, Group, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import ProductCard from './ProductCard';
import CatalogFilters from './CatalogFilters';
import { defaultCatalogFilters, useCatalogProducts } from './useCatalogProducts';

export default function CatalogExplorer() {
  const [filters, setFilters] = useState(defaultCatalogFilters);
  const catalog = useCatalogProducts(filters);
  return <Stack gap="lg">
    <Title order={1}>Explore products</Title>
    <CatalogFilters filters={filters} onChange={setFilters} />
    {catalog.snapshot?.status === 'stale' && <Alert color="gray">Catalog data is stale. Showing the latest available snapshot.</Alert>}
    {catalog.error && <Alert color="gray" role="alert"><Group><Text>{catalog.error}</Text><Button variant="subtle" onClick={catalog.retry}>Try again</Button></Group></Alert>}
    <Text role="status" aria-live="polite">{catalog.total === null ? (catalog.isLoading ? 'Loading products…' : 'Products unavailable') : `${catalog.total} products`}</Text>
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} aria-busy={catalog.isLoading || catalog.isLoadingMore}>
      {catalog.products.map(product => <ProductCard key={product.productNo} product={product} />)}
      {(catalog.isLoading || catalog.isLoadingMore) && Array.from({ length: 24 }, (_, index) =>
        <Skeleton key={`loading-${index}`} style={{ aspectRatio: '3 / 4' }} aria-label="Loading product" />)}
    </SimpleGrid>
    {!catalog.isLoading && !catalog.error && catalog.total === 0 && <Stack align="start"><Text>No products match your filters.</Text><Button variant="subtle" onClick={() => setFilters({ ...defaultCatalogFilters, sizes: [] })}>Clear filters</Button></Stack>}
    {catalog.nextCursor && <Button onClick={catalog.loadMore} loading={catalog.isLoadingMore} disabled={catalog.isLoading}>Load more</Button>}
  </Stack>;
}
