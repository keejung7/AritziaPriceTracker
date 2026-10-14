BEGIN;

-- Derived data only. DROP TABLE also removes each table's indexes. No CASCADE:
-- an unexpected external dependency must abort rather than discard more data.
DROP TABLE IF EXISTS aritzia_products.product_color_deal_scores;
DROP TABLE IF EXISTS aritzia_products.product_color_stock_metrics;
DROP TABLE IF EXISTS aritzia_products.latest_product_color_prices;

COMMIT;
