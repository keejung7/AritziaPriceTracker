CREATE TABLE IF NOT EXISTS aritzia_products.product_color_stock_metrics (
    color_id text NOT NULL,
    product_no bigint NOT NULL,
    available_size_count integer NOT NULL DEFAULT 0,
    total_size_count integer NOT NULL DEFAULT 0,
    scarcity_score integer NOT NULL DEFAULT 0,
    popularity_score integer NOT NULL DEFAULT 0,
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (color_id, product_no),
    FOREIGN KEY (color_id, product_no)
      REFERENCES aritzia_products.product_colors (color_id, product_no),
    CHECK (available_size_count >= 0),
    CHECK (total_size_count >= 0),
    CHECK (scarcity_score >= 0 AND scarcity_score <= 100),
    CHECK (popularity_score >= 0 AND popularity_score <= 100)
);

CREATE INDEX IF NOT EXISTS product_color_stock_metrics_scarcity_idx
ON aritzia_products.product_color_stock_metrics (scarcity_score DESC);

CREATE INDEX IF NOT EXISTS product_color_stock_metrics_popularity_idx
ON aritzia_products.product_color_stock_metrics (popularity_score DESC);
