CREATE SCHEMA aritzia_products;
SET search_path TO aritzia_products, public;

CREATE TABLE products(
    product_no bigint PRIMARY KEY,
    product_slug text NOT NULL,
    product_full_url text NOT NULL,
    product_name text,
    product_brand text
);

CREATE TABLE colors(
    color_id text PRIMARY KEY,
    color_name text
);

CREATE TABLE product_colors(
    color_id text NOT NULL REFERENCES colors (color_id),
    product_no bigint NOT NULL REFERENCES products (product_no),
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