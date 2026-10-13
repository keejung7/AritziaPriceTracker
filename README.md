# Aritzia Price Tracker

This project scrapes product data from the Aritzia website using Playwright. It collects product URLs, cleans them, scrapes detailed product information (colors, prices, sale status), and generates an HTML view for analysis.

Data collection will be performed daily, ensuring changes in price, removal/addition of items will be tracked.

The project also includes a Next.js app with API routes for reading price history from PostgreSQL.

## System Design

![System design](system_design_simple.png)

## Prerequisites

- Node.js installed on your machine.
- `npm` (Node Package Manager).
- PostgreSQL, either local or hosted with a provider such as Neon.
- `psql` for running schema setup and migrations from the command line.

## Installation

1.  Install the required dependencies:
    ```bash
    npm install
    ```

## Database Setup

This project stores product, price, and stock history in PostgreSQL. The schema is defined in:

```bash
db/schema.sql
```

The Node scripts load database settings from `.env` using `dotenv`.

For a hosted PostgreSQL database such as Neon, add a connection string:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"
```

For local PostgreSQL, the scripts fall back to:

```bash
POSTGRES_USER="your_local_user"
POSTGRES_USER_PASSWORD="your_local_password"
```

with the local database name `aritzia_db`.

To create the schema and tables in a fresh database, run `db/schema.sql` directly with `psql`:

```bash
psql "postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require" -f db/schema.sql
```

If you want to use `DATABASE_URL` with `psql`, export it in your shell first:

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"
psql "$DATABASE_URL" -f db/schema.sql
```

Note: `.env` is loaded by the Node scripts, but `psql` does not automatically read `.env`.

## Usage Sequence

Run the scripts in the following order to perform a complete scrape:

### 1. Scrape Product URLs

Navigates the clothing categories and collects all product links.

```bash
node scraper.js
```

- **Output:** `product_links.csv`

### 2. Scrape Details

Visits each unique product page to extract colors, original prices, and sale prices.

```bash
node details_scraper.js
```

- **Input:** `product_links.csv`
- **Output:** `product_details.jsonl`

### 3. Save to PostgreSQL

Parses `product_details.jsonl` and upserts product metadata, colors, price snapshots, and stock snapshots into PostgreSQL.

```bash
node db/db.js
```

- **Input:** `product_details.jsonl`
- **Output:** rows inserted into PostgreSQL

### 4. Generate View

Creates a sortable HTML table to visualize the data.

```bash
node generate_view.js
```

- **Input:** `product_details.jsonl`
- **Output:** `view.html` (Open this file in your browser)
<img width="1900" height="697" alt="Screenshot 2026-01-09 at 4 34 49 PM" src="https://github.com/user-attachments/assets/b9ebb735-4b6b-4ca8-9ca1-ece6e95ce5f3" />

You can also run the full pipeline:

```bash
npm run pipeline
```

## Next.js App

Start the local Next.js development server:

```bash
npm run dev
```

The app exposes price history API routes:

```bash
GET /api/products/:productNo/price-history
GET /api/products/:productNo/prices/:date
```

`/api/prices/latest` has been removed; use `/api/catalog/products` for the product catalog.
Migration `010_remove_product_scores.sql` retires derived scoring, stock metrics,
and the unused latest-price table. Product history and date responses retain factual
prices and size availability without computed scores. Apply migration 009 before 010
on existing databases. Migration 010 is transactional and forward-only; take a database
backup first if retired derived data must be retained. Raw price/stock observations and
catalog snapshots are preserved.

## Catalog and product history contract

On an existing raw database, apply `db/migrations/009_add_catalog_read_model.sql`
then `db/migrations/010_remove_product_scores.sql`, using `psql "$DATABASE_URL" -f`
for each file. Migration 009 adds category/image metadata, versioned catalog tables,
and indexes without deleting raw observations. Migration 010 removes only the three
retired derived tables, in a transaction without `CASCADE`. It has no down migration;
restore a backup if you need those retired tables. Fresh installations use `db/schema.sql`.

The pipeline runs URL scrape → detail scrape → raw database transaction → derived
catalog refresh. The raw transaction commits first. Refresh uses repeatable-read,
an advisory lock, validation and atomic activation: readers see the previous snapshot
until the new one commits. A refresh failure preserves committed raw data and the
active snapshot, records a failed-attempt marker in a separate transaction, and exits
nonzero. Retry without scraping:

```bash
DB_LOG_PATH="data/manual/db_refresh_$(date -u +%Y-%m-%dT%H-%M-%SZ).log" npm run refresh-catalog
```

`DATABASE_URL` selects the database; Node loads `.env`. The refresh-only command does
not invoke either scraper. `DB_LOG_PATH` is optional and appends timestamped DB messages
to the specified file as well as the terminal. Refresh messages include each named
query duration, product/color/history counts, failure stage and total duration. Full
pipeline run artifacts use `data/YYYY-MM-DD/product_links_<run-id>.csv`,
`product_details_<run-id>.jsonl`, and, when configured by the runner,
`db_load_<run-id>.log`. Preserve these timestamped artifacts when investigating a run.
Defaults are a 120,000 ms per-statement timeout, 90 history days, a warning below 75%
of previous product/color counts, failure below 50%, and retention of the active
snapshot plus the two newest inactive/failed snapshots. Failure markers are pruned by
the next successful refresh. See `db/catalogReadModel.md` for the derivation rules.

The parser accepts optional `source_categories: string[]` on each raw product and
`swatch_image_url` / `product_color_image_url` on each color. The loader persists these
through migration 009 metadata tables; missing metadata preserves existing image
URLs. The current checked-in scrapers still emit URL-only CSV and do not collect this
optional category/image metadata. Enrich raw artifacts or populate metadata before
expecting category matches or product images; older artifacts remain valid.

`GET /api/catalog/products` returns one product per card, all its current colors, an
exact filtered `total`, `nextCursor` (or null), and `snapshot` with `id`, `dataAsOf`,
`refreshedAt`, and `status` (`active` or `stale`). Product and snapshot IDs are decimal
strings, including values above JavaScript's safe integer range. Catalog timestamps
are UTC ISO strings preserving PostgreSQL microseconds. Prices are numeric CAD values,
nullable when unknown. Colors expose `availableSizes` and `availabilityStatus`
(`available`, `sold_out`, `unknown`); the catalog omits `availableSizeCount`,
`totalSizeCount`, scores, and full price histories.

| Parameter | Meaning |
| --- | --- |
| `limit` | Integer 1–48; default 24 |
| `sort` | `discount-desc` (default), `price-asc`, `price-desc`, `observed-desc`, `name-asc` |
| `cursor` | Opaque continuation from the previous response; reuse the same filters/sort |
| `search` | Case-insensitive product-name substring or product-number substring |
| `brand`, `category` | Exact brand or category slug |
| `color` | Exact color ID, rather than its display name |
| repeated `size` | OR across selected sizes, e.g. `size=S&size=M` |
| `minPrice`, `maxPrice` | Inclusive nonnegative effective-price bounds |
| `saleOnly` | `true` or `false`; default false |
| `minDiscount` | 0–100 percentage points; requires `saleOnly=true` |

Color, size, sale, discount and price predicates must all match the **same available
color**. A black full-price color cannot combine with a red sale color to match
`color=black&saleOnly=true`. Changing filters starts a fresh first page. Global
`From` metadata stays paired with the cheapest available color; a filtered card can
select a different matching color and show its own price/sizes. Swatches change the
selected color, not the global `From` price. Default sorting ranks discount descending,
ties by product number, with unavailable products last. Product histories load only on
the detail page, where Highcharts is lazy loaded.

Cursor pages stay on their retained snapshot even if a new one activates. Once cleanup
removes that snapshot, the client must restart pagination. Errors have shape
`{"error":{"code":"…","message":"…"}}`: `invalid_query`, `invalid_cursor`, and
`cursor_expired` return 400; `catalog_unavailable` returns 503. A failed refresh newer
than the active snapshot marks responses `stale` and displays the stale notice;
timestamp age alone does not set that flag. `/api/prices/latest` is removed (404).

Only one catalog price insight is shown, with exact priority/labels: `Lowest ever`,
`Lowest in 90 days`, then `Lowest in 30 days`. These compare eligible daily observations,
not a complete retail price record. Product detail defaults to the selected color's
daily observed price, including sold-out prices. `Product lowest available` chooses
the daily cheapest color with an available size at the exact observation timestamp.
Missing days remain gaps; unknown stock is not zero. Detail tooltips show CAD price,
regular price, discount, color and observation date; availability charts count sizes,
not inventory units.

Catalog and derived-history discount percentages use paired original/effective prices
in percentage points (`100 → 40` is `60% off`), regardless of raw fractional metadata.
Unknown or zero original prices leave the discount unknown; negative eligible prices
reject the refresh. Last-known snapshot freshness stays visible while filters reload,
preventing a stale notice from repeatedly moving the product grid.

Highcharts is proprietary. Free-license eligibility is limited to qualifying personal
or educational **non-commercial** use. Personal use must also be non-professional;
company/client work, professional use, funded research, commercialization, or a change
in project use requires reevaluating eligibility and obtaining the applicable commercial
license. Installing the package does not grant a commercial license. Review the
[Highcharts EULA](https://shop.highcharts.com/license-eula) and
[education terms](https://www.highcharts.com/education/) before deployment.

## Reproducible validation and troubleshooting

```bash
npm test
CATALOG_TEST_DATABASE_URL="postgresql://USER@localhost/catalog_test" npm run test:db
npm run typecheck
npm run build
npx playwright install chromium
CATALOG_TEST_DATABASE_URL="postgresql://USER@localhost/catalog_e2e_test" npm run test:e2e
CATALOG_PROFILE_DATABASE_URL="postgresql://USER@localhost/catalog_e2e_test" npm run profile:catalog
```

Use dedicated disposable databases ending in `_test`, never a user/production database.
DB unit integration suites create isolated schemas and roll them back. E2E seeds 120
products / 240 colors / three observation days and refuses an existing
`aritzia_products` schema; create a fresh disposable database for each E2E invocation.
It runs the production server on port 3108, exercises desktop/mobile filters, paging,
swatches, stale snapshots and lazy charts, and performs four successful refresh-only
builds plus an intentional failed refresh. Timestamped refresh logs and preservation/
retention evidence are kept under `.validation-artifacts/catalog/<run-time>/`; browser
results, performance JSON attachments and failure traces are under `test-results/`.

The profiler requires its own explicit URL and executes only SELECT/EXPLAIN statements
inside a read-only transaction with a 120-second timeout. It prints JSON query plans
and wall durations for default, combined-filter, continuation and exact-total queries.
It never seeds or refreshes a database. Use the seeded database for reproducible results.

Performance assertions are local regression budgets, not field Core Web Vitals:
catalog script encoded bytes <650 kB; initial render/LCP <2.5 s; CLS <0.1; filter
interaction <1.5 s including debounce/drawer; scroll p95 frame <50 ms; 120 cards
<20,000 DOM nodes and <40 MiB heap growth; detail charts <2.5 s with <500 kB additional
encoded JS. The test also records Event Timing durations as an interaction diagnostic;
these short lab sessions cannot establish field INP or mobile-network performance.
Windowing should be revisited when larger browsing sessions exceed these budgets.

For 503, verify migrations and run `refresh-catalog` once. For stale data, inspect the
failed stage and counts in the DB log, fix raw observations or query issues, and retry
refresh-only. For `cursor_expired`, clear the cursor and restart. For no category/image
results, check raw metadata before changing selectors. A missing browser executable
requires `npx playwright install chromium`; an occupied port 3108 must be freed before
running E2E. The optional `ui-concepts` prototype routes may emit Recharts static-render
size warnings during build; catalog/product-detail verification uses the production views.
