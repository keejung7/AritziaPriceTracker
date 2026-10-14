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
test('the API supplies eligible chart points, gaps, availability and exact low annotations', async () => {
  getProductPriceHistory.mockResolvedValueOnce([
    { product_no: '9007199254740993', color_id: '1274', color_name: 'Black', scraped_date: '2026-10-13T12:00:00.123456Z', original_price: 100, sale_price: 60, stock: [{ size: 'S', status: 'In Stock', isAvailable: true }, { size: 'M', status: null, isAvailable: false }] },
    { product_no: '9007199254740993', color_id: '1274', color_name: 'Black', scraped_date: '2026-10-11T12:00:00.123456Z', original_price: 100, sale_price: 20, stock: [] },
  ]);
  const response = await GET(request, { params: Promise.resolve({ productNo: '9007199254740993' }) });
  const body = await response.json();
  expect(body.chartHistory.product.points.map(p => p.y)).toEqual([null, null, 60]);
  expect(body.chartHistory.colors['1274'].price.lowAnnotation).toBe('Lowest ever: $60.00 CAD · Black · 2026-10-13');
  expect(body.chartHistory.colors['1274'].availability.map(p => p.y)).toEqual([null, null, 1]);
  expect(body.chartHistory.product.points[2].observedAt).toBe('2026-10-13T12:00:00.123456Z');
});
test.each(['dateFrom=2026-10-01','dateTo=2026-10-13','colorId=1274'])('partial raw history %s cannot make a full-history low claim', async query => {
  getProductPriceHistory.mockResolvedValueOnce([{product_no:'1',color_id:'1274',color_name:'Black',scraped_date:'2026-10-13T12:00:00.123456Z',original_price:100,sale_price:60,stock:[{size:'S',status:'In Stock',isAvailable:true}]}]);
  const response=await GET({nextUrl:new URL(`https://example.test/api/products/1/price-history?${query}`)},{params:Promise.resolve({productNo:'1'})});
  const body=await response.json();
  expect(body.chartHistory.product.lowAnnotation).toBeNull();
  expect(body.chartHistory.colors['1274'].price.lowAnnotation).toBeNull();
  expect(body.chartHistory.colors['1274'].price.points[0].y).toBe(60);
});
