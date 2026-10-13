// All interpolated SQL below comes from fixed mappings. Request values are binds.
const SORTS = {
  'discount-desc': { expression: 'r.sale_percent', direction: 'DESC', comparator: '<', type: 'numeric' },
  'price-asc': { expression: 'r.effective_price', direction: 'ASC', comparator: '>', type: 'numeric' },
  'price-desc': { expression: 'r.effective_price', direction: 'DESC', comparator: '<', type: 'numeric' },
  'observed-desc': { expression: 'r.scraped_date', direction: 'DESC', comparator: '<', type: 'timestamptz' },
  'name-asc': { expression: 'p.product_name COLLATE "C"', direction: 'ASC', comparator: '>', type: 'text COLLATE "C"' },
};
let pool;
function getPool() {
  if (!pool) {
    require('dotenv').config();
    const { Pool } = require('pg');
    pool = new Pool(process.env.DATABASE_URL ? {connectionString:process.env.DATABASE_URL} : {
      host:'localhost',port:5432,database:'aritzia_db',user:process.env.POSTGRES_USER,password:process.env.POSTGRES_USER_PASSWORD,
    });
  }
  return pool;
}

function buildCatalogQuery(q) {
  const sort = SORTS[q.sort];
  if (!sort) throw new Error('Unsupported catalog sort');
  const values=[];
  const bind = value => {values.push(value); return `$${values.length}`;};
  const snapshotId = bind(q.cursor?.snapshotId ?? null);
  const variant = q.color !== null || q.sizes.length > 0 || q.minPrice !== null || q.maxPrice !== null || q.saleOnly || q.minDiscount !== null;
  const colorWhere = ['c.snapshot_id=p.snapshot_id','c.product_no=p.product_no'];
  if (variant) colorWhere.push("c.availability_status='available'",'c.effective_price IS NOT NULL');
  else colorWhere.push('c.color_id=p.from_color_id');
  if(q.color!==null) colorWhere.push(`c.color_id=${bind(q.color)}`);
  if(q.sizes.length) colorWhere.push(`c.available_sizes && ${bind(q.sizes)}::text[]`);
  if(q.minPrice!==null) colorWhere.push(`c.effective_price>=${bind(q.minPrice)}`);
  if(q.maxPrice!==null) colorWhere.push(`c.effective_price<=${bind(q.maxPrice)}`);
  if(q.saleOnly) colorWhere.push('c.sale_price IS NOT NULL AND c.sale_price<c.original_price');
  if(q.minDiscount!==null) colorWhere.push(`c.sale_percent>=${bind(q.minDiscount)}`);
  const productWhere = ['p.snapshot_id=s.snapshot_id'];
  if(variant) productWhere.push('r.color_id IS NOT NULL');
  if(q.search!==null) {
    const search=bind(q.search);
    productWhere.push(`(strpos(lower(COALESCE(p.product_name,'')),lower(${search}))>0 OR strpos(p.product_no::text,${search})>0)`);
  }
  if(q.brand!==null) productWhere.push(`p.product_brand=${bind(q.brand)}`);
  if(q.category!==null) productWhere.push(`${bind(q.category)}=ANY(p.categories)`);
  let continuation='true';
  if(q.cursor) {
    const no=bind(q.cursor.lastProductNo), value=bind(q.cursor.lastSortValue);
    const typed=`${value}::${sort.type}`;
    continuation=`(unavailable>(SELECT unavailable FROM eligible WHERE product_no=${no}::bigint)
      OR (unavailable=(SELECT unavailable FROM eligible WHERE product_no=${no}::bigint) AND (
        (${value}::text IS NOT NULL AND (sort_value ${sort.comparator} ${typed} OR sort_value IS NULL))
        OR (sort_value IS NOT DISTINCT FROM ${typed} AND product_no>${no}::bigint))))`;
  }
  const limit=bind(q.limit);
  const order=`unavailable ASC,sort_value ${sort.direction} NULLS LAST,product_no ASC`;
  const utc = column => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  const cursorSortValue = sort.type === 'timestamptz' ? utc('t.sort_value') : 't.sort_value::text';
  const text=`WITH snapshot AS (
      SELECT cs.*, EXISTS(SELECT 1 FROM aritzia_products.catalog_snapshots failed WHERE failed.status='failed' AND failed.snapshot_id>cs.snapshot_id) AS stale
      FROM aritzia_products.catalog_snapshots cs
      WHERE ((${snapshotId}::bigint IS NULL AND cs.status='active') OR (cs.snapshot_id=${snapshotId}::bigint AND cs.status IN ('active','inactive')))
    ), eligible AS MATERIALIZED (
      SELECT p.*,r.color_id AS selected_color_id,${sort.expression} AS sort_value,
        CASE WHEN p.availability_status='available' THEN 0 ELSE 1 END AS unavailable
      FROM snapshot s JOIN aritzia_products.catalog_products p ON p.snapshot_id=s.snapshot_id
      LEFT JOIN LATERAL (
        SELECT c.* FROM aritzia_products.catalog_product_colors c WHERE ${colorWhere.join(' AND ')}
        ORDER BY c.effective_price ASC NULLS LAST,c.color_id ASC LIMIT 1
      ) r ON true WHERE ${productWhere.join(' AND ')}
    ), page AS MATERIALIZED (
      SELECT * FROM eligible WHERE ${continuation} ORDER BY ${order} LIMIT (${limit}::int+1)
    ), trimmed AS (
      SELECT * FROM page ORDER BY ${order} LIMIT ${limit}::int
    )
    SELECT (SELECT jsonb_build_object('snapshot_id',snapshot_id::text,'data_as_of',${utc('data_as_of')},
      'activated_at',${utc('activated_at')},'stale',stale) FROM snapshot) AS snapshot,
      (SELECT count(*)::int FROM eligible) AS total,
      (SELECT count(*)>${limit}::int FROM page) AS has_more,
      COALESCE((SELECT jsonb_agg(to_jsonb(items) || jsonb_build_object('product_no',items.product_no::text,
        'tracking_started_at',${utc('items.tracking_started_at')}) ORDER BY items.unavailable ASC,items.sort_value ${sort.direction} NULLS LAST,items.product_no ASC)
      FROM (SELECT t.*,${cursorSortValue} AS cursor_sort_value,
        (SELECT COALESCE(jsonb_agg(to_jsonb(c) || jsonb_build_object('product_no',c.product_no::text,
          'snapshot_id',c.snapshot_id::text,'scraped_date',${utc('c.scraped_date')}) ORDER BY c.color_id),'[]'::jsonb)
         FROM aritzia_products.catalog_product_colors c WHERE c.snapshot_id=t.snapshot_id AND c.product_no=t.product_no) AS colors
        FROM trimmed t) items),'[]'::jsonb) AS products`;
  return {text,values};
}
async function queryCatalogProducts(q, database) {
  const {text,values}=buildCatalogQuery(q);
  return (await (database || getPool()).query(text,values)).rows[0];
}
module.exports={buildCatalogQuery,queryCatalogProducts};
