BEGIN;

ALTER TABLE aritzia_products.colors
    ADD COLUMN IF NOT EXISTS swatch_image_url text;

ALTER TABLE aritzia_products.product_colors
    ADD COLUMN IF NOT EXISTS product_color_image_url text;

COMMIT;
