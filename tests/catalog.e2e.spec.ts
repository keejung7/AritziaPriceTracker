import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const cards = (page: Page) => page.locator('article.catalog-card');
async function openFilters(page: Page, advanced = false) {
  if (await page.getByRole('button', { name: 'Filters', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
  } else if (advanced) await page.getByRole('button', { name: 'More filters' }).click();
}
async function closeFilters(page: Page) {
  if (await page.getByRole('button', { name: 'Show products' }).isVisible()) await page.getByRole('button', { name: 'Show products' }).click();
}
async function change(page: Page, action: () => Promise<unknown>, key: string, value: string | null) {
  const response = page.waitForResponse(r => {
    const url = new URL(r.url());
    return url.pathname === '/api/catalog/products' && url.searchParams.get(key) === value;
  });
  await action();
  expect((await response).status()).toBe(200);
}
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes('performance budgets')) return;
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('120 products');
  await expect(cards(page)).toHaveCount(24);
});

test('catalog loads exact labels, default discount order, unique pages, and sold-out last', async ({ page }) => {
  await expect(cards(page).first().getByRole('link')).toHaveText('Product 050');
  await expect(cards(page).first()).toContainText('60% off');
  await expect(cards(page).first()).toContainText('Lowest ever');
  for (let count = 48; count <= 120; count += 24) {
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(cards(page)).toHaveCount(count);
  }
  const hrefs = await cards(page).getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')));
  expect(new Set(hrefs).size).toBe(120);
  await expect(cards(page).last().getByRole('link')).toHaveText('Product 120');
  await expect(cards(page).last()).toContainText('Currently unavailable');
  await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);
});

test('combined filters match the same color and selected sizes use OR', async ({ page }) => {
  await openFilters(page, true);
  await change(page, () => page.getByLabel('On sale', { exact: true }).check(), 'saleOnly', 'true');
  await change(page, () => page.getByLabel('Color', { exact: true }).fill('black'), 'color', 'black');
  await closeFilters(page);
  await expect(page.getByText('No products match your filters.')).toBeVisible();
  await openFilters(page);
  await change(page, () => page.getByLabel('Color', { exact: true }).fill(''), 'color', null);
  await change(page, () => page.getByLabel('S', { exact: true }).check(), 'size', 'S');
  await closeFilters(page);
  await expect(page.getByRole('status')).toHaveText('0 products');
  await openFilters(page);
  const response = page.waitForResponse(r => new URL(r.url()).searchParams.getAll('size').includes('M'));
  await page.getByLabel('M', { exact: true }).check();
  await response;
  await closeFilters(page);
  await expect(page.getByRole('status')).toHaveText('119 products');
  await expect(cards(page).first()).toContainText('Red');
  await openFilters(page);
  await change(page, () => page.getByLabel('Minimum discount', { exact: true }).fill('20'), 'minDiscount', '20');
  await closeFilters(page);
  await expect(page.getByRole('status')).toHaveText('101 products');
});

test('inclusive price bounds and category/brand constrain matching available colors', async ({ page }) => {
  await openFilters(page, true);
  await change(page, () => page.getByLabel('Category', { exact: true }).fill('tops'), 'category', 'tops');
  await change(page, () => page.getByLabel('Brand', { exact: true }).fill('Test Brand'), 'brand', 'Test Brand');
  await change(page, () => page.getByLabel('Minimum price', { exact: true }).fill('41'), 'minPrice', '41');
  await change(page, () => page.getByLabel('Maximum price', { exact: true }).fill('41'), 'maxPrice', '41');
  await closeFilters(page);
  await expect(page.getByRole('status')).toHaveText('3 products');
  await expect(cards(page).getByRole('link')).toHaveText(['Product 001', 'Product 051', 'Product 101']);
});

test('swatches update selected price and available sizes while From stays stable', async ({ page }) => {
  const card = cards(page).first();
  await expect(card.getByLabel('Product starting price')).toContainText('From $40.00');
  await expect(card.getByLabel('Available sizes')).toContainText('M');
  await card.getByRole('button', { name: 'Select Black' }).click();
  await expect(card.getByLabel('Selected color price')).toHaveText('$100.00');
  await expect(card.getByLabel('Available sizes')).toContainText('S');
  await expect(card.getByLabel('Product starting price')).toContainText('From $40.00');
});

test('empty search can clear filters and failed refresh exposes stale snapshot notice', async ({ page }) => {
  await expect(page.getByText('Catalog data is stale. Showing the latest available snapshot.')).toBeVisible();
  await openFilters(page);
  await change(page, () => page.getByLabel('Search', { exact: true }).fill('no such product'), 'search', 'no such product');
  await closeFilters(page);
  await expect(page.getByText('No products match your filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('120 products');
});

test('detail loads selected-color Highcharts and product-wide lowest-available mode', async ({ page }) => {
  await page.goto('/products/1');
  await expect(page.getByRole('heading', { name: 'Product 001', exact: true })).toBeVisible();
  const chart = page.getByRole('region', { name: 'Price history chart', exact: true });
  await expect(chart.locator('.highcharts-container')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Selected color', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Selected color price')).toHaveText('$100.00 CAD');
  await page.getByRole('button', { name: 'Select Red', exact: true }).click();
  await expect(page.getByLabel('Selected color price')).toContainText('$41.00');
  await expect(chart.locator('[aria-label*="Red"]').first()).toHaveAttribute('aria-label', /Red.*\$4[1-3]\.00/);
  await page.getByRole('button', { name: 'Select Black', exact: true }).click();
  await page.getByRole('button', { name: 'Product lowest available', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Product lowest available', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#price-method')).toContainText('Daily lowest price among colors with an available size');
  await expect(chart.locator('[aria-label*="Red"]').first()).toHaveAttribute('aria-label', /Red.*\$4[1-3]\.00/);
  await expect(page.getByRole('region', { name: 'Availability history chart', exact: true }).locator('.highcharts-container')).toBeVisible();
  await expect(page.getByText('Highest price ever', { exact: true })).toHaveCount(0);
});

test('production catalog and lazy charts meet local performance budgets', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0, interactionDuration: 0, shifts: [] as any[] };
    (window as any).__catalogMetrics = metrics;
    new PerformanceObserver(list => { for (const entry of list.getEntries()) metrics.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries() as any) if (!entry.hadRecentInput) { metrics.cls += entry.value; metrics.shifts.push({ time: entry.startTime, value: entry.value, sources: entry.sources.map((s: any) => ({ node: s.node?.className ?? s.node?.tagName, previous: s.previousRect.toJSON(), current: s.currentRect.toJSON() })) }); } }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) metrics.interactionDuration = Math.max(metrics.interactionDuration, entry.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as any);
  });
  const start = performance.now();
  await page.goto('/');
  await expect(cards(page)).toHaveCount(24);
  const initialRenderMs = performance.now() - start;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const initialHeap = (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize')!.value;
  const initialResources = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => (e as PerformanceResourceTiming).initiatorType === 'script').map(e => ({ name: e.name, encoded: (e as PerformanceResourceTiming).encodedBodySize, transfer: (e as PerformanceResourceTiming).transferSize })));
  const catalogLoadsHighcharts = initialResources.some(resource => readFileSync(path.resolve('.next', new URL(resource.name).pathname.replace('/_next/', '')), 'utf8').includes('highcharts-container'));
  await openFilters(page);
  const filterStart = performance.now();
  await change(page, () => page.getByLabel('Search', { exact: true }).fill('Product 001'), 'search', 'Product 001');
  await closeFilters(page);
  await expect(cards(page)).toHaveCount(1);
  const filterLatencyMs = performance.now() - filterStart;
  await openFilters(page);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await closeFilters(page);
  await expect(cards(page)).toHaveCount(24);
  for (let count = 48; count <= 120; count += 24) {
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(cards(page)).toHaveCount(count);
  }
  const scroll = await page.evaluate(async () => {
    const frames: number[] = []; let previous = performance.now();
    for (let i = 0; i < 60; i++) await new Promise<void>(resolve => requestAnimationFrame(now => { frames.push(now - previous); previous = now; window.scrollBy(0, 120); resolve(); }));
    return frames.sort((a, b) => a - b)[Math.floor(frames.length * .95)];
  });
  const dom = await cdp.send('Memory.getDOMCounters');
  const finalHeap = (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize')!.value;
  const vitals = await page.evaluate(() => (window as any).__catalogMetrics);
  const detailStart = performance.now();
  await page.goto('/products/1');
  await expect(page.locator('.highcharts-container')).toHaveCount(2);
  const detailChartMs = performance.now() - detailStart;
  const detailResources = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => (e as PerformanceResourceTiming).initiatorType === 'script').map(e => ({ name: e.name, encoded: (e as PerformanceResourceTiming).encodedBodySize })));
  const initialNames = new Set(initialResources.map(r => r.name));
  const chartJsBytes = detailResources.filter(r => !initialNames.has(r.name)).reduce((sum, r) => sum + r.encoded, 0);
  const evidence = { viewport: testInfo.project.name, initialRenderMs, catalogJsEncodedBytes: initialResources.reduce((sum, r) => sum + r.encoded, 0), catalogJsTransferBytes: initialResources.reduce((sum, r) => sum + r.transfer, 0), catalogLoadsHighcharts, filterLatencyMs, scrollP95FrameMs: scroll, cards: 120, domNodes: dom.nodes, heapGrowthBytes: finalHeap - initialHeap, initialHeap, finalHeap, ...vitals, detailChartMs, chartJsBytes, initialResources, detailResources };
  await testInfo.attach('performance-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  expect(evidence.catalogJsEncodedBytes).toBeLessThan(650000);
  expect(catalogLoadsHighcharts).toBe(false);
  expect(initialRenderMs).toBeLessThan(2500);
  expect(vitals.lcp).toBeLessThan(2500);
  expect(vitals.cls).toBeLessThan(.1);
  expect(filterLatencyMs).toBeLessThan(1500);
  expect(scroll).toBeLessThan(50);
  expect(dom.nodes).toBeLessThan(20000);
  expect(finalHeap - initialHeap).toBeLessThan(40 * 1024 * 1024);
  expect(detailChartMs).toBeLessThan(2500);
  expect(chartJsBytes).toBeLessThan(500000);
});
