import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import CatalogFilters from '../app/components/catalog/CatalogFilters';
import { defaultCatalogFilters } from '../app/components/catalog/useCatalogProducts';

function Controls() {
  const [filters, setFilters] = useState(defaultCatalogFilters);
  return <MantineProvider><CatalogFilters filters={filters} onChange={setFilters} /></MantineProvider>;
}

test('desktop primary controls keep advanced fields behind More filters', async () => {
  const user = userEvent.setup();
  render(<Controls />);
  for (const label of ['Search', 'Category', 'Brand', 'On sale', 'Sort']) {
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  }
  expect(screen.queryByLabelText('Color')).not.toBeInTheDocument();
  expect(screen.queryByText('Full price')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'More filters' }));
  expect(screen.getByLabelText('Color')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Size' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Price range' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Minimum discount')).not.toBeInTheDocument();
  await user.click(screen.getByLabelText('On sale'));
  expect(screen.getByLabelText('Minimum discount')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Minimum discount'), '30');
  await user.click(screen.getByLabelText('On sale'));
  expect(screen.queryByLabelText('Minimum discount')).not.toBeInTheDocument();
});

test('mobile uses one Filters trigger and a drawer containing every control', async () => {
  jest.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: true, media: query, onchange: null, addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  }));
  const user = userEvent.setup();
  render(<Controls />);
  expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'More filters' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Filters' }));
  const drawer = within(await screen.findByRole('dialog', { name: 'Filters' }));
  for (const label of ['Search', 'Category', 'Brand', 'On sale', 'Sort', 'Color']) {
    expect(drawer.getByLabelText(label)).toBeInTheDocument();
  }
  expect(drawer.getByRole('group', { name: 'Size' })).toBeInTheDocument();
  expect(drawer.queryByText('Full price')).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument());
});
