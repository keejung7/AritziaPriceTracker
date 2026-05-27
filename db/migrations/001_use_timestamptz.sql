BEGIN;

ALTER TABLE aritzia_products.price_snapshots
    ALTER COLUMN scraped_date TYPE timestamptz
    USING scraped_date AT TIME ZONE 'America/Vancouver';

ALTER TABLE aritzia_products.stock_snapshots
    ALTER COLUMN scraped_date TYPE timestamptz
    USING scraped_date AT TIME ZONE 'America/Vancouver';

COMMIT;