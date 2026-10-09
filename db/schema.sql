CREATE SCHEMA IF NOT EXISTS aritzia_products;
SET search_path TO aritzia_products, public;

CREATE TABLE products(
    product_no bigint PRIMARY KEY,
    product_slug text NOT NULL,
    product_full_url text NOT NULL,
    product_name text,
    product_brand text
);

CREATE TABLE categories(
    category_slug text PRIMARY KEY
);

CREATE TABLE product_categories(
    product_no bigint NOT NULL REFERENCES products (product_no),
    category_slug text NOT NULL REFERENCES categories (category_slug),
    PRIMARY KEY (product_no, category_slug)
);

CREATE TABLE colors(
    color_id text PRIMARY KEY,
    color_name text,
    swatch_image_url text
);

CREATE TABLE product_colors(
    color_id text NOT NULL REFERENCES colors (color_id),
    product_no bigint NOT NULL REFERENCES products (product_no),
    product_color_image_url text,
    PRIMARY KEY (color_id, product_no)
);

CREATE TABLE price_snapshots (
    color_id text NOT NULL,
    product_no bigint NOT NULL,
    original_price numeric,
    sale_price numeric,
    sale_percent numeric,
    scraped_date timestamptz NOT NULL,
    PRIMARY KEY (color_id, product_no, scraped_date),
    FOREIGN KEY (color_id, product_no)
      REFERENCES product_colors (color_id, product_no)
);

CREATE INDEX price_snapshots_product_color_date_idx
ON price_snapshots (product_no, color_id, scraped_date DESC);

CREATE INDEX price_snapshots_date_idx
ON price_snapshots (scraped_date DESC);

CREATE TABLE stock_snapshots (
    product_size text NOT NULL,
    color_id text NOT NULL,
    product_no bigint NOT NULL,
    product_status text,
    scraped_date timestamptz NOT NULL,
    PRIMARY KEY (product_size, color_id, product_no, scraped_date),
    FOREIGN KEY (color_id, product_no)
      REFERENCES product_colors (color_id, product_no)
);
