/** @jest-environment node */
const { getPricePoints, getLowAnnotation, getAvailabilityPoints, formatDiscount } = require('../app/services/productChartService');
const point = (date, price, stock = [{ size: 'S', isAvailable: true }]) => ({ scrapedDate: `${date}T10:00:00Z`, originalPrice: 100, salePrice: price, salePercent: null, stock });
const colors = [
  { colorId: 'black', colorName: 'Black', history: [point('2026-10-01', 80), point('2026-10-03', 60, [])] },
  { colorId: 'red', colorName: 'Red', history: [point('2026-10-01', 50, [{ size: 'S', status: 'Sold Out', isAvailable: false }]), point('2026-10-03', 70)] },
];
test('selected color excludes sold-out and unknown prices while preserving gaps and provenance', () => {
  const result = getPricePoints(colors, 'black', 'selected');
  expect(result.map(p => p.y)).toEqual([80, null, null]);
  expect(result[0]).toMatchObject({ colorId: 'black', colorName: 'Black', date: '2026-10-01', observedAt: '2026-10-01T10:00:00Z', effectivePrice: 80, regularPrice: 100, discount: 20 });
  expect(getLowAnnotation(result)).toBeNull();
  expect(getPricePoints(colors, 'red', 'selected').map(p => p.y)).toEqual([null, null, 70]);
});
test('daily product low excludes sold out and unknown stock from the exact price observation', () => {
  expect(getPricePoints(colors, 'black', 'product').map(p => [p.y, p.colorId])).toEqual([[80, 'black'], [null, null], [70, 'red']]);
});
test('daily selection keeps the latest complete observation when a later price has no stock', () => {
  const repeated = [{ ...colors[0], history: [point('2026-10-01', 40), { ...point('2026-10-01', 20, []), scrapedDate: '2026-10-01T20:00:00Z' }] }];
  for (const mode of ['selected', 'product']) expect(getPricePoints(repeated, 'black', mode)[0]).toMatchObject({ y: 40, observedAt: '2026-10-01T10:00:00Z' });
  expect(getAvailabilityPoints(repeated[0])[0]).toMatchObject({ y: 1, observedAt: '2026-10-01T10:00:00Z' });
});
test('a later complete sold-out observation supersedes an available observation in both modes', () => {
  const repeated = [{ ...colors[0], history: [point('2026-10-01', 40), { ...point('2026-10-01', 20, [{ size: 'S', status: 'Sold Out', isAvailable: false }]), scrapedDate: '2026-10-01T20:00:00Z' }] }];
  for (const mode of ['selected', 'product']) expect(getPricePoints(repeated, 'black', mode)[0].y).toBeNull();
  expect(getAvailabilityPoints(repeated[0])[0].y).toBe(0);
});
test('same-millisecond observations retain microsecond ordering', () => {
  const repeated = [{ ...colors[0], history: [
    { ...point('2026-10-01', 20), scrapedDate: '2026-10-01T10:00:00.123900Z' },
    { ...point('2026-10-01', 40), scrapedDate: '2026-10-01T10:00:00.123100Z' },
  ] }];
  expect(getPricePoints(repeated, 'black', 'selected')[0]).toMatchObject({ y: 20, observedAt: '2026-10-01T10:00:00.123900Z' });
});
test.each([
  ['2026-10-01', [80, 70], 'Lowest ever'],
  ['2026-06-01', [30, 70, 60], 'Lowest in 90 days'],
  ['2026-07-01', [30, 50, 60], 'Lowest in 30 days'],
])('prioritizes the exact eligible-history label since %s', (start, prices, label) => {
  const history = prices.length === 2 ? [point(start, prices[0]), point('2026-10-13', prices[1])] : [point(start, prices[0]), point('2026-09-01', prices[1]), point('2026-10-13', prices[2])];
  const c = [{ ...colors[0], history }];
  for (const mode of ['selected', 'product']) expect(getLowAnnotation(getPricePoints(c, 'black', mode))).toBe(`${label}: $${prices.at(-1)}.00 CAD · Black · 2026-10-13`);
});
test('a current price above all historical lows has no low label', () => {
  const c = [{ ...colors[0], history: [point('2026-10-01', 40), point('2026-10-13', 70)] }];
  expect(getLowAnnotation(getPricePoints(c, 'black', 'selected'))).toBeNull();
});
test('availability distinguishes zero from unknown and preserves gaps', () => {
  expect(getAvailabilityPoints(colors[0]).map(p => p.y)).toEqual([1, null, null]);
  expect(getAvailabilityPoints(colors[1]).map(p => p.y)).toEqual([0, null, 1]);
});
test('null and unrecognized stock status cannot become a sold-out count', () => {
  const color = { ...colors[0], history: [point('2026-10-01', 80, [{ size: 'S', status: null, isAvailable: false }]), point('2026-10-02', 80, [{ size: 'S', status: 'Mystery', isAvailable: false }])] };
  expect(getAvailabilityPoints(color).map(p => p.y)).toEqual([null, null]);
});
test('mixed availability counts explicitly available sizes even with unknown statuses', () => {
  const color = { ...colors[0], history: [point('2026-10-01', 80, [
    { size: 'S', status: 'In Stock', isAvailable: true }, { size: 'M', status: null, isAvailable: false },
    { size: 'L', status: 'Mystery', isAvailable: false }, { size: 'XL', status: 'Only a Few Left', isAvailable: true },
  ])] };
  expect(getAvailabilityPoints(color)[0].y).toBe(2);
});
test('unknown discount remains unavailable while explicit zero remains zero', () => {
  const color = { ...colors[0], history: [
    { ...point('2026-10-01', 80), originalPrice: null, salePercent: null },
    { ...point('2026-10-02', 100), salePrice: null, salePercent: 0 },
  ] };
  expect(getPricePoints([color], 'black', 'selected').map(p => p.discount)).toEqual([null, 0]);
  expect(formatDiscount(null)).toBe('Unavailable');
  expect(formatDiscount(0)).toBe('0%');
});
