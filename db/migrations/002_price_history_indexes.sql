BEGIN;

CREATE INDEX IF NOT EXISTS price_snapshots_product_color_date_idx
ON aritzia_products.price_snapshots (product_no, color_id, scraped_date DESC);

CREATE INDEX IF NOT EXISTS price_snapshots_date_idx
ON aritzia_products.price_snapshots (scraped_date DESC);

COMMIT;