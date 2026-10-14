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
  expect(response.items[0].productNo).toBe(id);
  expect(response.items[0].trackingStartedAt).toBe(timestamp);
  expect(response.items[0].colors[0].scrapedDate).toBe(timestamp);
  for (const record of [response.items[0], ...response.items[0].colors]) {
    expect(record).not.toHaveProperty('availableSizeCount');
    expect(record).not.toHaveProperty('totalSizeCount');
  }
  expect(response.snapshot).toMatchObject({id,dataAsOf:timestamp,refreshedAt:timestamp,status:'current'});
  expect(response).not.toHaveProperty('products');
  expect(decodeCatalogCursor(response.nextCursor,'observed-desc')).toMatchObject({snapshotId:id,lastProductNo:id,lastSortValue:timestamp});
});
test('returns deterministic human size ordering without narrowing metadata to current filters', async () => {
  const database = {query: async()=>({rows:[{snapshot:{snapshot_id:'1',data_as_of:'2026-10-13T10:00:00.000000Z',activated_at:'2026-10-13T11:00:00.000000Z',stale:false},products:[],total:0,has_more:false,
    filter_options:{colors:[{id:'1274',name:'Black'},{id:'3042',name:'Black'}],sizes:['10','2','ONE','M/L','3XS','00','XS/S','S','2XS','0','XS','M']}}]})};
  const result = await getCatalogProducts(parse('search=nothing'),database);
  expect(result.filterOptions).toEqual({colors:[{id:'1274',name:'Black'},{id:'3042',name:'Black'}],sizes:['3XS','2XS','XS','XS/S','S','M','M/L','00','0','2','10','ONE']});
});
