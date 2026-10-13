'use client';

import { useState } from 'react';
import { Button, Checkbox, Drawer, Group, NativeSelect, SimpleGrid, Stack, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { defaultCatalogFilters, type CatalogFiltersState } from './useCatalogProducts';

export default function CatalogFilters({ filters, onChange }: {
  filters: CatalogFiltersState;
  onChange: (filters: CatalogFiltersState) => void;
}) {
  const mobile = useMediaQuery('(max-width: 48em)', false);
  const [opened, setOpened] = useState(false);
  const change = <K extends keyof CatalogFiltersState>(key: K, value: CatalogFiltersState[K]) =>
    onChange({ ...filters, [key]: value });

  const primary = <>
    <TextInput label="Search" placeholder="Search products" value={filters.search} onChange={event => change('search', event.currentTarget.value)} />
    <TextInput label="Category" placeholder="All categories" value={filters.category} onChange={event => change('category', event.currentTarget.value)} />
    <TextInput label="Brand" placeholder="All brands" value={filters.brand} onChange={event => change('brand', event.currentTarget.value)} />
    <Checkbox label="On sale" checked={filters.saleOnly} onChange={event => onChange({ ...filters, saleOnly: event.currentTarget.checked, minDiscount: '' })} />
    <NativeSelect label="Sort" value={filters.sort} onChange={event => change('sort', event.currentTarget.value as CatalogFiltersState['sort'])} data={[
      { value: 'discount-desc', label: 'Biggest discount' },
      { value: 'price-asc', label: 'Price: low to high' },
      { value: 'price-desc', label: 'Price: high to low' },
      { value: 'observed-desc', label: 'Recently observed' },
      { value: 'name-asc', label: 'Name: A to Z' },
    ]} />
  </>;
  const advanced = <Stack gap="md">
    <TextInput label="Color" placeholder="All colors" value={filters.color} onChange={event => change('color', event.currentTarget.value)} />
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>Size</legend>
      <Group gap="sm">
        {['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '00', '0', '2', '4', '6', '8', '10', '12', '14', '16'].map(size =>
          <Checkbox key={size} label={size} checked={filters.sizes.includes(size)} onChange={event => change('sizes', event.currentTarget.checked ? [...filters.sizes, size] : filters.sizes.filter(value => value !== size))} />)}
      </Group>
    </fieldset>
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>Price range</legend>
      <Group grow>
        <TextInput label="Minimum price" type="number" min="0" step="0.01" value={filters.minPrice} onChange={event => change('minPrice', event.currentTarget.value)} />
        <TextInput label="Maximum price" type="number" min="0" step="0.01" value={filters.maxPrice} onChange={event => change('maxPrice', event.currentTarget.value)} />
      </Group>
    </fieldset>
    {filters.saleOnly && <TextInput label="Minimum discount" type="number" min="0" max="100" value={filters.minDiscount} onChange={event => change('minDiscount', event.currentTarget.value)} rightSection="%" />}
  </Stack>;
  const reset = <Button variant="subtle" onClick={() => onChange({ ...defaultCatalogFilters, sizes: [] })}>Reset filters</Button>;

  if (mobile) return <>
    <Button onClick={() => setOpened(true)}>Filters</Button>
    <Drawer opened={opened} onClose={() => setOpened(false)} title="Filters" position="right">
      <Stack>{primary}{advanced}{reset}<Button onClick={() => setOpened(false)}>Show products</Button></Stack>
    </Drawer>
  </>;

  return <Stack>
    <Group align="end">
      {primary}
      <Button variant="default" aria-expanded={opened} aria-controls="catalog-more-filters" onClick={() => setOpened(!opened)}>More filters</Button>
      {reset}
    </Group>
    {opened && <SimpleGrid id="catalog-more-filters" cols={1}>{advanced}</SimpleGrid>}
  </Stack>;
}
