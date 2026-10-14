BEGIN;

CREATE TABLE IF NOT EXISTS aritzia_products.latest_product_color_prices (
    color_id text NOT NULL,
    product_no bigint NOT NULL,
    original_price numeric,
    sale_price numeric,
    sale_percent numeric,
    effective_price numeric,
    scraped_date timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (color_id, product_no),
    FOREIGN KEY (color_id, product_no)
      REFERENCES aritzia_products.product_colors (color_id, product_no)
);

CREATE INDEX IF NOT EXISTS latest_product_color_prices_product_color_idx
ON aritzia_products.latest_product_color_prices (product_no, color_id);

CREATE INDEX IF NOT EXISTS latest_product_color_prices_sale_idx
ON aritzia_products.latest_product_color_prices (product_no, color_id)
WHERE sale_price IS NOT NULL;

COMMIT;
