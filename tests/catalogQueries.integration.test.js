const { createCatalogTestDatabase } = require('./helpers/catalogTestDatabase');
const { getCatalogProducts, parseCatalogQuery } = require('../.test-dist/app/services/catalogService');
const { decodeCatalogCursor } = require('../.test-dist/app/services/catalogCursor');
const { buildCatalogQuery } = require('../db/catalogQueries');
describe('same-color catalog and snapshot pagination',()=>{
  let db;
  beforeAll(async()=>{ db=await createCatalogTestDatabase(); });
  afterAll(async()=>{ await db?.close(); });
  beforeEach(async()=>{
    await db.query(`TRUNCATE aritzia_products.products,aritzia_products.colors,aritzia_products.catalog_snapshots RESTART IDENTITY CASCADE`);
    await db.query(`INSERT INTO aritzia_products.catalog_snapshots(snapshot_id,status,data_as_of,activated_at) VALUES(1,'active',now(),now())`);
    await db.query(`INSERT INTO aritzia_products.products(product_no,product_slug,product_full_url,product_name) SELECT n,n::text,'https://example.com/'||n,'Product '||n FROM generate_series(1,30) n`);
    await db.query(`INSERT INTO aritzia_products.colors(color_id,color_name) VALUES('black','Black'),('red','Red')`);
    await db.query(`INSERT INTO aritzia_products.product_colors(product_no,color_id) SELECT n,c FROM generate_series(1,30) n CROSS JOIN unnest(ARRAY['black','red']) c`);
    await db.query(`INSERT INTO aritzia_products.catalog_product_colors(snapshot_id,product_no,color_id,original_price,sale_price,effective_price,sale_percent,available_sizes,availability_status,scraped_date)
      SELECT 1,n,c,100,CASE WHEN c='red' THEN 50 END,CASE WHEN c='red' THEN 50 ELSE 80 END,CASE WHEN c='red' THEN 50 ELSE 0 END,
      CASE WHEN c='red' THEN ARRAY['M'] ELSE ARRAY['S'] END,CASE WHEN n=30 THEN 'sold_out' ELSE 'available' END,now()
      FROM generate_series(1,30) n CROSS JOIN unnest(ARRAY['black','red']) c`);
    await db.query(`INSERT INTO aritzia_products.catalog_products(snapshot_id,product_no,product_name,product_brand,categories,from_color_id,from_price,from_original_price,from_sale_percent,availability_status)
      SELECT 1,n,'Product '||n,'Brand',ARRAY['tops'],CASE WHEN n=30 THEN NULL ELSE 'red' END,CASE WHEN n=30 THEN NULL ELSE 50 END,CASE WHEN n=30 THEN NULL ELSE 100 END,CASE WHEN n=30 THEN NULL ELSE 50 END,CASE WHEN n=30 THEN 'sold_out' ELSE 'available' END FROM generate_series(1,30) n`);
  });
  const get=raw=>getCatalogProducts(parseCatalogQuery(new URLSearchParams(raw)),db.client);
  test('all predicates belong to one available color; size values are OR',async()=>{
    expect((await get('color=black&saleOnly=true')).total).toBe(0);
    expect((await get('size=S&saleOnly=true')).total).toBe(0);
    expect((await get('size=S&size=M&saleOnly=true')).total).toBe(29);
    expect((await get('color=black&maxPrice=60')).total).toBe(0);
    expect((await get('minPrice=70&maxPrice=90')).products[0].selectedColorId).toBe('black');
  });
  test('global From metadata stays paired while filtered representative changes',async()=>{
    const product=(await get('color=black')).products[0];
    expect(product).toMatchObject({fromColorId:'red',fromPrice:50,fromOriginalPrice:100,fromSalePercent:50,selectedColorId:'black'});
    expect(product.colors.find(c=>c.colorId==='black')).toMatchObject({effectivePrice:80,salePercent:0});
    expect((await get('')).products[0].selectedColorId).toBe('red');
    expect(product).not.toHaveProperty('history');
  });
  test('pages equal discounts without gaps, includes unavailable last and fetches colors only for page',async()=>{
    const first=await get('');
    expect(first.products).toHaveLength(24);
    expect(first.products.flatMap(p=>p.colors)).toHaveLength(48);
    expect(first.total).toBe(30);
    const second=await get('cursor='+first.nextCursor);
    expect([...first.products,...second.products].map(p=>p.productNo)).toEqual(Array.from({length:30},(_,i)=>i+1));
    expect(second.nextCursor).toBeNull();
    expect(second.products.at(-1).availabilityStatus).toBe('sold_out');
  });
  test('cursor stays on retained snapshot and expires when removed',async()=>{
    const first=await get('limit=2');
    expect(decodeCatalogCursor(first.nextCursor,'discount-desc').snapshotId).toBe('1');
    await db.query(`UPDATE aritzia_products.catalog_snapshots SET status='inactive' WHERE snapshot_id=1`);
    await db.query(`INSERT INTO aritzia_products.catalog_snapshots(snapshot_id,status,data_as_of,activated_at) VALUES(2,'active',now(),now())`);
    const second=await get('limit=2&cursor='+first.nextCursor);
    expect(second.snapshot.id).toBe('1');
    expect(second.products.map(p=>p.productNo)).toEqual([3,4]);
    await db.query(`DELETE FROM aritzia_products.catalog_snapshots WHERE snapshot_id=1`);
    await expect(get('cursor='+first.nextCursor)).rejects.toMatchObject({code:'cursor_expired',status:400});
  });
  test('serves stale active snapshot after failed refresh and typed unavailable without snapshot',async()=>{
    await db.query(`INSERT INTO aritzia_products.catalog_snapshots(snapshot_id,status,data_as_of) VALUES(2,'failed',now())`);
    expect((await get('')).snapshot.status).toBe('stale');
    await db.query(`DELETE FROM aritzia_products.catalog_snapshots`);
    await expect(get('')).rejects.toMatchObject({code:'catalog_unavailable',status:503});
  });
  test.each(['price-asc','price-desc','observed-desc','name-asc'])('%s continuation handles ties and nulls',async sort=>{
    let cursor=null, ids=[];
    do {
      const page=await get(`limit=7&sort=${sort}${cursor?'&cursor='+cursor:''}`);
      ids.push(...page.products.map(p=>p.productNo)); cursor=page.nextCursor;
    } while(cursor);
    expect(ids).toHaveLength(30); expect(new Set(ids).size).toBe(30); expect(ids.at(-1)).toBe(30);
  });
  test('descending prices paginate differing values and ties before unavailable products',async()=>{
    await db.query(`UPDATE aritzia_products.catalog_product_colors SET effective_price=CASE product_no WHEN 1 THEN 90 WHEN 2 THEN 70 WHEN 3 THEN 70 ELSE 20 END WHERE color_id='red'`);
    const first=await get('limit=2&sort=price-desc');
    expect(first.products.map(p=>p.productNo)).toEqual([1,2]);
    const second=await get('limit=2&sort=price-desc&cursor='+first.nextCursor);
    expect(second.products.map(p=>p.productNo)).toEqual([3,4]);
  });
  test('profiles default, combined variant filters, exact total, and continuation',async()=>{
    // Increase cardinality without touching the raw observations or user schemas.
    await db.query(`INSERT INTO aritzia_products.products(product_no,product_slug,product_full_url) SELECT n,n::text,n::text FROM generate_series(31,10000) n`);
    await db.query(`INSERT INTO aritzia_products.product_colors(product_no,color_id) SELECT n,c FROM generate_series(31,10000) n CROSS JOIN unnest(ARRAY['black','red']) c`);
    await db.query(`INSERT INTO aritzia_products.catalog_product_colors(snapshot_id,product_no,color_id,original_price,sale_price,effective_price,sale_percent,available_sizes,availability_status,scraped_date)
      SELECT 1,n,c,100,50,50,50,ARRAY['M'],'available',now() FROM generate_series(31,10000) n CROSS JOIN unnest(ARRAY['black','red']) c`);
    await db.query(`INSERT INTO aritzia_products.catalog_products(snapshot_id,product_no,product_name,from_color_id,from_price,from_original_price,from_sale_percent,availability_status)
      SELECT 1,n,'Product '||n,'red',50,100,50,'available' FROM generate_series(31,10000) n`);
    await db.query(`ANALYZE aritzia_products.catalog_products`);
    await db.query(`ANALYZE aritzia_products.catalog_product_colors`);
    const first=await get('');
    const shapes={default:'',combined:'color=red&size=M&minPrice=40&maxPrice=60&saleOnly=true&minDiscount=20',continuation:'cursor='+first.nextCursor};
    for(const [name,raw] of Object.entries(shapes)) {
      const built=buildCatalogQuery(parseCatalogQuery(new URLSearchParams(raw)));
      const plan=await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+built.text,built.values);
      const root=plan.rows[0]['QUERY PLAN'][0];
      expect(root.Plan['Actual Rows']).toBe(1);
      if(process.env.CATALOG_EXPLAIN) console.info('CATALOG_EXPLAIN',name,JSON.stringify(root));
    }
    const total=await db.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT count(*) FROM aritzia_products.catalog_products WHERE snapshot_id=1`);
    expect(total.rows[0]['QUERY PLAN'][0].Plan['Actual Rows']).toBe(1);
    if(process.env.CATALOG_EXPLAIN) console.info('CATALOG_EXPLAIN exact-total',JSON.stringify(total.rows[0]['QUERY PLAN'][0]));
  });
});
