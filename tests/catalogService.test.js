/** @jest-environment node */
const { parseCatalogQuery, getCatalogProducts } = require('../app/services/catalogService');
const { decodeCatalogCursor } = require('../app/services/catalogCursor');
const parse = input => parseCatalogQuery(new URLSearchParams(input));
test('defaults and deduplicates sizes',()=>{
  expect(parse('')).toMatchObject({limit:24,sort:'discount-desc',sizes:[],cursor:null});
  expect(parse('size=M&size=S&size=M').sizes).toEqual(['M','S']);
  expect(parse('limit=48&saleOnly=true&minDiscount=20')).toMatchObject({limit:48,minDiscount:20});
});
test.each(['limit=0','limit=49','limit=1.5','limit=no','minPrice=-1','minPrice=10&maxPrice=2','maxPrice=Infinity','minDiscount=5','saleOnly=true&minDiscount=101','sort=evil','saleOnly=yes','limit=','minPrice=','cursor=','sort=','saleOnly='])('rejects invalid parameters %s',input=>expect(()=>parse(input)).toThrow());
test('rejects an impossible observation cursor before database access',async()=>{
  const raw=Buffer.from(JSON.stringify({v:1,snapshotId:'1',sort:'observed-desc',lastSortValue:'2026-02-30T00:00:00Z',lastProductNo:'2'})).toString('base64url');
  const database={query:jest.fn()};
  await expect(Promise.resolve().then(()=>getCatalogProducts(parse(`sort=observed-desc&cursor=${raw}`),database)))
    .rejects.toMatchObject({code:'invalid_cursor',status:400});
  expect(database.query).not.toHaveBeenCalled();
});
test('returns bigint product and snapshot IDs and microsecond timestamps unchanged',async()=>{
  const id='9007199254740993';
  const timestamp='2024-02-29T12:34:56.123456Z';
  const product={product_no:id,product_slug:null,product_full_url:null,product_name:'Large ID',product_brand:null,categories:[],from_color_id:null,from_price:null,from_original_price:null,from_sale_percent:null,selected_color_id:null,availability_status:'available',tracking_started_at:timestamp,insight_label:null,cursor_sort_value:timestamp,colors:[{color_id:'red',color_name:'Red',swatch_image_url:null,product_color_image_url:null,original_price:null,sale_price:null,effective_price:null,sale_percent:null,available_sizes:[],availability_status:'available',scraped_date:timestamp}]};
  const database={query:async()=>({rows:[{snapshot:{snapshot_id:id,data_as_of:timestamp,activated_at:timestamp,stale:false},products:[product],total:1,has_more:true}]})};
  const response=await getCatalogProducts(parse('sort=observed-desc'),database);
  expect(response.products[0].productNo).toBe(id);
  expect(response.products[0].trackingStartedAt).toBe(timestamp);
  expect(response.products[0].colors[0].scrapedDate).toBe(timestamp);
  for (const record of [response.products[0], ...response.products[0].colors]) {
    expect(record).not.toHaveProperty('availableSizeCount');
    expect(record).not.toHaveProperty('totalSizeCount');
  }
  expect(response.snapshot).toMatchObject({id,dataAsOf:timestamp,refreshedAt:timestamp});
  expect(decodeCatalogCursor(response.nextCursor,'observed-desc')).toMatchObject({snapshotId:id,lastProductNo:id,lastSortValue:timestamp});
});
