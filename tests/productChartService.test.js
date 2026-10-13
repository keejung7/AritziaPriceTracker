/** @jest-environment node */
const { getPricePoints, getLowAnnotation, getAvailabilityPoints } = require('../app/services/productChartService');
const point = (date, price, stock = [{ size: 'S', isAvailable: true }]) => ({ scrapedDate: `${date}T10:00:00Z`, originalPrice: 100, salePrice: price, salePercent: null, stock });
const colors = [
  { colorId: 'black', colorName: 'Black', history: [point('2026-10-01', 80), point('2026-10-03', 60, [])] },
  { colorId: 'red', colorName: 'Red', history: [point('2026-10-01', 50, [{ size: 'S', status: 'Sold Out', isAvailable: false }]), point('2026-10-03', 70)] },
];
test('selected color retains price provenance and missing days', () => {
  const result = getPricePoints(colors, 'black', 'selected');
  expect(result.map(p => p.y)).toEqual([80, null, 60]);
  expect(result[2]).toMatchObject({ colorId: 'black', colorName: 'Black', date: '2026-10-03', observedAt: '2026-10-03T10:00:00Z', effectivePrice: 60, regularPrice: 100, discount: 40 });
  expect(getLowAnnotation(result)).toBe('Lowest observed: $60.00 CAD · Black · 2026-10-03');
});
test('daily product low excludes sold out and unknown stock from the exact price observation', () => {
  expect(getPricePoints(colors, 'black', 'product').map(p => [p.y, p.colorId])).toEqual([[80, 'black'], [null, null], [70, 'red']]);
});
test('daily selection uses the latest color observation without borrowing earlier stock', () => {
  const repeated = [{ ...colors[0], history: [point('2026-10-01', 40), { ...point('2026-10-01', 20, []), scrapedDate: '2026-10-01T20:00:00Z' }] }];
  expect(getPricePoints(repeated, 'black', 'product')[0].y).toBeNull();
});
test('availability distinguishes zero from unknown and preserves gaps', () => {
  expect(getAvailabilityPoints(colors[0]).map(p => p.y)).toEqual([1, null, null]);
  expect(getAvailabilityPoints(colors[1]).map(p => p.y)).toEqual([0, null, 1]);
});
test('null and unrecognized stock status cannot become a sold-out count', () => {
  const color = { ...colors[0], history: [point('2026-10-01', 80, [{ size: 'S', status: null, isAvailable: false }]), point('2026-10-02', 80, [{ size: 'S', status: 'Mystery', isAvailable: false }])] };
  expect(getAvailabilityPoints(color).map(p => p.y)).toEqual([null, null]);
});
