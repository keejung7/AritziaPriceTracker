const { parseCatalogQuery } = require('../.test-dist/app/services/catalogService');
const parse = input => parseCatalogQuery(new URLSearchParams(input));
test('defaults and deduplicates sizes',()=>{
  expect(parse('')).toMatchObject({limit:24,sort:'discount-desc',sizes:[],cursor:null});
  expect(parse('size=M&size=S&size=M').sizes).toEqual(['M','S']);
  expect(parse('limit=48&saleOnly=true&minDiscount=20')).toMatchObject({limit:48,minDiscount:20});
});
test.each(['limit=0','limit=49','limit=1.5','limit=no','minPrice=-1','minPrice=10&maxPrice=2','maxPrice=Infinity','minDiscount=5','saleOnly=true&minDiscount=101','sort=evil','saleOnly=yes','limit=','minPrice=','cursor=','sort=','saleOnly='])('rejects invalid parameters %s',input=>expect(()=>parse(input)).toThrow());
