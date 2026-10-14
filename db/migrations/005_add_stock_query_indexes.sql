BEGIN;

CREATE INDEX IF NOT EXISTS price_snapshots_sale_product_color_date_idx
ON aritzia_products.price_snapshots (product_no, color_id, scraped_date DESC)
WHERE sale_price IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_snapshots_product_color_size_date_idx
ON aritzia_products.stock_snapshots (product_no, color_id, product_size, scraped_date DESC)
INCLUDE (product_status);

COMMIT;
