BEGIN;

CREATE TABLE IF NOT EXISTS aritzia_products.product_color_deal_scores (
    color_id text NOT NULL,
    product_no bigint NOT NULL,
    deal_quality_score integer NOT NULL DEFAULT 0,
    score_version text NOT NULL DEFAULT 'v1',
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (color_id, product_no),
    FOREIGN KEY (color_id, product_no)
      REFERENCES aritzia_products.product_colors (color_id, product_no),
    CHECK (deal_quality_score >= 0 AND deal_quality_score <= 100)
);

CREATE INDEX IF NOT EXISTS product_color_deal_scores_score_idx
ON aritzia_products.product_color_deal_scores (deal_quality_score DESC);

COMMIT;
