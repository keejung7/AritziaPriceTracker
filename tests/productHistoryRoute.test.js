/** @jest-environment node */
jest.mock('../db/queries', () => ({ getProductPriceHistory: jest.fn().mockResolvedValue([]) }));
const { GET } = require('../app/api/products/[productNo]/price-history/route');
const { getProductPriceHistory } = require('../db/queries');
const request = { nextUrl: new URL('https://example.test/api/products/9007199254740993/price-history') };
test('history request preserves a lossless bigint product ID', async () => {
  await GET(request, { params: Promise.resolve({ productNo: '9007199254740993' }) });
  expect(getProductPriceHistory).toHaveBeenCalledWith({ productNo: '9007199254740993', colorId: null, dateFrom: null, dateTo: null });
});
test.each(['1.5', 'NaN', '-1', '9223372036854775808'])('rejects invalid postgres product IDs %s', async productNo => {
  const response = await GET(request, { params: Promise.resolve({ productNo }) });
  expect(response.status).toBe(400);
});
