import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import CatalogFilters from '../app/components/catalog/CatalogFilters';
import { defaultCatalogFilters } from '../app/components/catalog/useCatalogProducts';
const options = { colors: [{id:'1274',name:'Black'},{id:'3042',name:'Black'},{id:'18891',name:'Brown'}], sizes:['3XS','XS/S','S','2','2/4','10','ONE'] };

function Controls() {
  const [filters, setFilters] = useState(defaultCatalogFilters);
  return <MantineProvider><CatalogFilters filters={filters} onChange={setFilters} options={options} /><output aria-label="Selected filters">{JSON.stringify(filters)}</output></MantineProvider>;
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
test('named selectable colors send exact IDs and duplicate names are disambiguated', async () => {
  const user = userEvent.setup();
  render(<Controls />);
  await user.click(screen.getByRole('button', {name:'More filters'}));
  const color = screen.getByRole('combobox', {name:'Color'});
  await user.selectOptions(color, '1274');
  expect(color).toHaveValue('1274');
  expect(screen.getByLabelText('Selected filters')).toHaveTextContent('"color":"1274"');
  expect(within(color).getByRole('option', {name:'Black (1274)'})).toHaveValue('1274');
  expect(within(color).getByRole('option', {name:'Black (3042)'})).toHaveValue('3042');
});
test('size choices include only catalog metadata and preserve multiple observed labels', async () => {
  const user = userEvent.setup(); render(<Controls />);
  await user.click(screen.getByRole('button', {name:'More filters'}));
  const size = within(screen.getByRole('group', {name:'Size'}));
  expect(size.getAllByRole('checkbox').map(input => input.getAttribute('value'))).toEqual(['3XS','XS/S','S','2','2/4','10','ONE']);
  await user.click(size.getByLabelText('ONE', {exact:true}));
  await user.click(size.getByLabelText('3XS', {exact:true}));
  expect(screen.getByLabelText('Selected filters')).toHaveTextContent('"sizes":["ONE","3XS"]');
});
test('a selection absent from a newly active snapshot stays visible and clearable', async () => {
  const change = jest.fn(); const user=userEvent.setup();
  render(<MantineProvider><CatalogFilters filters={{...defaultCatalogFilters,color:'9999',sizes:['32']}} onChange={change} options={options} /></MantineProvider>);
  await user.click(screen.getByRole('button', {name:'More filters'}));
  expect(screen.getByRole('combobox', {name:'Color'})).toHaveValue('9999');
  expect(screen.getByRole('option', {name:'9999 (not in this snapshot)'})).toBeInTheDocument();
  expect(screen.getByLabelText('32', {exact:true})).toBeChecked();
  await user.selectOptions(screen.getByRole('combobox', {name:'Color'}),'');
  expect(change).toHaveBeenCalledWith(expect.objectContaining({color:''}));
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
