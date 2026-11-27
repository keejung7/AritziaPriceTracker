INSERT INTO aritzia_products.products(product_no,product_slug,product_full_url,product_name,product_brand)
SELECT n,'product-'||n,'https://example.test/product/'||n,'Product '||lpad(n::text,3,'0'),'Test Brand' FROM generate_series(1,120) n;
INSERT INTO aritzia_products.categories VALUES('tops');
INSERT INTO aritzia_products.product_categories SELECT n,'tops' FROM generate_series(1,120) n;
INSERT INTO aritzia_products.colors(color_id,color_name) VALUES('1274','Black'),('18891','Red');
INSERT INTO aritzia_products.product_colors(product_no,color_id) SELECT n,c FROM generate_series(1,120) n CROSS JOIN unnest(ARRAY['1274','18891']) c;

INSERT INTO aritzia_products.price_snapshots(product_no,color_id,original_price,sale_price,sale_percent,scraped_date)
SELECT n,c,100,CASE WHEN c='18891' THEN 40+n%50+d ELSE NULL END,
  CASE WHEN c='18891' THEN (60-n%50-d)/100.0 ELSE NULL END,
  '2026-10-13T10:00:00Z'::timestamptz-d*interval '1 day'
FROM generate_series(1,120) n CROSS JOIN unnest(ARRAY['1274','18891']) c CROSS JOIN generate_series(0,2) d;

INSERT INTO aritzia_products.stock_snapshots(product_no,color_id,product_size,product_status,scraped_date)
SELECT n,c,CASE WHEN c='18891' THEN 'M' ELSE 'S' END,CASE WHEN n=120 THEN 'Sold Out' ELSE 'In Stock' END,
  '2026-10-13T10:00:00Z'::timestamptz-d*interval '1 day'
FROM generate_series(1,120) n CROSS JOIN unnest(ARRAY['1274','18891']) c CROSS JOIN generate_series(0,2) d;

INSERT INTO aritzia_products.stock_snapshots(product_no,color_id,product_size,product_status,scraped_date)
SELECT 1,'1274',size,'In Stock','2026-10-13T10:00:00Z'::timestamptz-d*interval '1 day'
FROM unnest(ARRAY['3XS','ONE','2','10','2/4','XS/S','M/L']) size CROSS JOIN generate_series(0,2) d;
