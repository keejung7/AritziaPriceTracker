BEGIN;

CREATE TABLE IF NOT EXISTS aritzia_products.categories (
    category_slug text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS aritzia_products.product_categories (
    product_no bigint NOT NULL REFERENCES aritzia_products.products (product_no),
    category_slug text NOT NULL REFERENCES aritzia_products.categories (category_slug),
    PRIMARY KEY (product_no, category_slug)
);

COMMIT;
