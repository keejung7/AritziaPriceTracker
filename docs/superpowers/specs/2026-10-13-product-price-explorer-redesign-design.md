# Product Price Explorer Redesign

Date: 2026-10-13
Status: Approved conversational design; written specification awaiting review

## Purpose

Redesign the Aritzia catalog and product-history experience around transparent price evidence rather than opaque scores. The catalog should help shoppers compare products quickly while making it clear when a product-wide price differs from the currently selected color.

The implementation spans the scraper database pipeline, a derived PostgreSQL read model, catalog and product-history APIs, and the Next.js UI. Raw scrape observations remain the source of truth.

## Goals

- Present a quiet, editorial shopping experience rather than an analytics dashboard.
- Make current price, historical context, color-specific price, and available sizes easy to understand.
- Ensure a price contributes to product-wide summaries only when that color had at least one available size in the same scrape observation.
- Support product-level filtering, sorting, and pagination without splitting colors across pages.
- Serve complete, immutable catalog snapshots and retain the previous valid snapshot when refresh fails.
- Replace deal, popularity, and scarcity scoring with factual prices, discounts, history, and size availability.

## Non-goals

- Predicting future prices or assigning an inferred deal-quality score.
- Claiming knowledge of prices before tracking began.
- Making catalog sparklines fully interactive.
- Persisting catalog filters in URL parameters in the first version.
- Incrementally rebuilding only affected products in the first version.

## Terminology and Price Semantics

### Effective price

For one product/color observation, the effective price is `sale_price` when present and otherwise `original_price`.

### Eligible color observation

A color observation is eligible for a product-wide price calculation only when at least one size is explicitly available in `stock_snapshots` with the exact same `(product_no, color_id, scraped_date)` as the price observation.

An observation with stock rows but no available size is sold out. An observation with no corresponding stock rows has unknown availability. Neither sold-out nor unknown observations contribute to product-wide minima.

### Current product-wide price

The catalog's primary price is `From $X`, where `$X` is the minimum effective price among the product's currently eligible colors. The regular price and discount shown beside `From` must come from that same color observation.

If no current color is eligible, the product remains in the catalog, displays `Currently unavailable`, and sorts after products with an eligible color.

### Daily product-wide price history

For each product, color, and calendar day, use the latest complete observation on that day. Among the day's eligible color observations, select the minimum effective price, breaking ties deterministically by `color_id`. Store the responsible color with the point.

Days without an eligible observation are gaps. They are never represented as zero and are not carried forward.

### Historical labels

The customer-facing labels are:

- `Lowest ever`
- `Lowest in 90 days`
- `Lowest in 30 days`

Only one label appears, using that priority. A 30-day or 90-day claim is permitted only when tracked history spans the full calendar range. `Lowest ever` means the lowest eligible point since tracking began. Product pages include quiet supporting copy: `Based on prices tracked since <date>.`

Catalog labels use the product-wide daily-minimum series. Selected-color labels on the product page use only that color's eligible history.

## Catalog Experience

### Header

The catalog header contains:

- `Aritzia Price Tracker`
- Shopper-focused supporting copy
- A quiet `Updated <date/time>` value

It does not contain tracked-row counts, loaded-row badges, aggregate sale metrics, or operational pipeline statistics. Those belong in logs or a future admin/status view.

### Card hierarchy

Each product card presents:

1. Product image
2. Brand and product name
3. `From` price, paired regular price, and discount when applicable
4. One always-visible 90-day SVG sparkline
5. At most one historical-low label
6. Selected color name and its actual current price
7. The selected color's regular price and discount when it is on sale
8. Actual available size labels
9. Color swatches

Category chips, color counts, deal scores, popularity scores, scarcity scores, and redundant section headings do not appear on cards.

### Color interaction

The default selected color is the color establishing `From`. Selecting a swatch updates the image, selected color name, selected-color effective and regular prices, selected-color discount, and available sizes.

The card's primary `From` block and product-wide sparkline remain stable when swatches change. A selected color that differs from `From` must always expose its actual price. Examples:

```text
From $48.99   $98 · 50% off
Vintage Navy · $68.99   $98 · 30% off
```

For a full-price selected color, omit `0% off` and the crossed-out price.

Sold-out colors remain available as swatches and retain their image, current known price, and history. Selecting one displays `Currently unavailable` and no available size labels.

### Catalog sparkline

There is one sparkline per product, not one per color. It renders the product-wide daily-minimum series and therefore corresponds to the stable `From` methodology.

Implement it as a native, non-interactive SVG rather than a Highcharts instance:

- Responsive `viewBox`, visually about 100–140 px wide and 32–40 px high
- Four-pixel internal padding
- Timestamp mapped to x and effective price mapped to y
- Separate path segments across missing-day gaps
- One path, no per-point DOM markers
- `vector-effect="non-scaling-stroke"`
- A centered horizontal line for constant-price history
- A reserved placeholder reading `Price history is still building` for fewer than two valid points
- Accessible title/description summarizing the range and period

The component consumes the same normalized price-point contract as the product-detail chart and is memoized. Exact interactive inspection belongs on the product page.

## Catalog Sorting and Filtering

### Controls

The desktop primary bar contains:

- Search
- Category
- Brand
- `On sale`
- Sort
- `More filters`

`More filters` contains:

- Color
- Available size
- Price range
- Minimum discount, visible only when `On sale` is enabled

The separate `Full price` mode is removed. The default catalog already includes full-price products. Mobile presents filters in a full-width drawer.

### Matching semantics

Search, brand, and category operate at product level. Color, size, price, sale, and discount operate at color-variant level.

A product qualifies only when one currently eligible color satisfies all active variant-level conditions together. Different colors cannot independently satisfy different conditions for the same result.

Multiple selected sizes use OR semantics within the size filter. Size remains ANDed with other variant filters. Price range uses the qualifying color's effective current price in CAD.

When variant filters are active, select the lowest-priced eligible color that satisfies all of them. With no variant filters, select the global `From` color. Sold-out and unknown-availability colors do not qualify filters.

### Sorting

Default sort is highest current discount, using the displayed selected/qualifying color's discount. With no variant filters, that color is the `From` color.

Alternative sorts are:

- Effective price, low to high
- Effective price, high to low
- Discount, high to low
- Most recently observed
- Product name, A to Z

Products with no currently eligible color sort after all available products, with `product_no` as the final deterministic tie-breaker.

Filter and sort state may remain local component state in the first version. URL synchronization is deferred.

## Product Detail Experience

The product page explicitly distinguishes product-wide history from selected-color history.

- Default view: selected color's price history
- Optional toggle: `Selected color` / `Lowest available color`
- Swatch selection updates image, current price, regular price, discount, available sizes, and selected-color history together
- Product-wide tooltips identify the responsible color and date for every point
- Historical annotations include price, color, and date
- Supporting copy explains that product-wide history is the lowest eligible color observed each day

Use Highcharts line charts for product-detail price and availability history through the official `highcharts` and `@highcharts/react` packages. Chart components remain client components. Enable Highcharts accessibility support, keyboard navigation, descriptive text, and reduced-motion behavior.

The product-detail API continues to query normalized raw price and stock history. It applies the same exact-observation eligibility rule when producing selected-color history and availability; the first version does not duplicate full color history into another snapshot table.

Highcharts may ship only when the deployment's license is appropriate for its use. If licensing is not confirmed, implementation stops for a product decision rather than silently shipping unlicensed use.

## Shared Price-Point Contract

Both native SVG and Highcharts renderers consume ordered points equivalent to:

```ts
interface PricePoint {
  timestamp: number;
  effectivePrice: number;
  originalPrice: number | null;
  salePercent: number | null;
  colorId: string;
  colorName: string | null;
}
```

The API, not each renderer, determines eligibility, responsible color, historical labels, and gaps.

## Derived PostgreSQL Read Model

Raw tables remain normalized and authoritative:

- `price_snapshots`: product/color/time grain
- `stock_snapshots`: product/color/size/time grain

Add snapshot-scoped derived tables through migrations.

### `catalog_snapshots`

Stores snapshot identity and lifecycle:

- `snapshot_id`
- `status`: `building`, `active`, `inactive`, or `failed`
- `data_as_of`
- `created_at`
- `activated_at`

Exactly one snapshot is active.

### `catalog_product_colors`

One row per snapshot/product/color:

- Product and color identifiers
- Original, sale, effective price, and sale percentage
- `available_sizes text[]`
- `availability_status`: `available`, `sold_out`, or `unknown`
- Price/stock observation timestamp
- Current image and swatch metadata required by the catalog

Use a GIN index on `available_sizes` and B-tree indexes for effective price, discount, observation time, product/color identity, and other whitelisted sort/filter columns.

### `catalog_products`

One row per snapshot/product:

- Product metadata and categories
- `from_color_id`
- `from_price`
- Paired regular price and discount
- Current availability state
- Tracking start date
- Prioritized factual insight label, when applicable

### `catalog_product_price_history`

One row per snapshot/product/day:

- Observation date
- Lowest eligible effective price
- Paired regular price and discount
- Responsible color identifier

Index by `(snapshot_id, product_no, observation_date)`.

## Derivation and Pipeline Behavior

Use two database phases:

1. Parse the JSONL once and commit normalized raw product, category, color, price, and stock observations.
2. Run a separate PostgreSQL read-model refresh transaction using `INSERT ... SELECT` statements and CTEs over the raw tables.

There is no second scrape and no second JSONL parse.

The refresh process:

1. Create a `building` snapshot.
2. Select the latest price for every product/color.
3. Exact-join stock rows from the same `(product_no, color_id, scraped_date)` and aggregate available sizes.
4. Insert current product/color rows with explicit availability state.
5. Rank eligible colors by effective price and create product-level `From` summaries.
6. Derive the prior 90 days of daily product-wide minima and responsible colors.
7. Derive and prioritize factual product-wide low labels.
8. Validate referential integrity, uniqueness, non-negative prices, eligible `From` colors, and plausible row counts.
9. Atomically activate the new snapshot and deactivate the previous one.

If any refresh or validation stage fails, roll back the new snapshot, log the stage and database error, exit the pipeline unsuccessfully, and continue serving the previous active snapshot. Valid raw observations remain committed for audit and a refresh-only retry command.

The first version performs a full rebuild after each daily load. The expected dataset of roughly 1,500 products does not justify incremental-refresh complexity. Incremental refresh is considered only after measurement.

## Catalog API

Introduce a product-centric endpoint while retaining the existing latest-price endpoint temporarily for compatibility:

```http
GET /api/catalog/products?limit=24&sort=discount-desc&cursor=<opaque>&...
```

Response envelope:

```json
{
  "items": [],
  "total": 141,
  "nextCursor": null,
  "snapshot": {
    "id": 42,
    "dataAsOf": "2026-10-13T21:45:00Z",
    "refreshedAt": "2026-10-13T23:30:00Z",
    "status": "current"
  }
}
```

Each item is one complete product with its current colors, sizes, selected/default state, and 90-day sparkline points.

### Cursor pagination

Use keyset pagination, not row offsets. The opaque cursor contains a version, snapshot identifier, sort identifier, last sort value, and last product number. Each whitelisted sort maps to an explicit SQL column, direction, and continuation predicate.

Fetch `limit + 1` product rows to determine whether another page exists. The product number is always the final tie-breaker.

Retain the active and recent previous snapshots long enough for normal paging. A cursor for an expired snapshot returns a typed `cursor_expired` response and the client restarts from page one. The initial UI uses a `Load more` button rather than infinite scrolling.

### API errors and freshness

- Invalid filters or cursors: typed `400`
- Valid empty result: `200` with empty `items` and `total: 0`
- No valid catalog snapshot: typed `503`
- Failed latest refresh with an older valid snapshot: serve it with `status: stale`
- Never return raw database errors publicly
- Never expose a partially built snapshot

## Retiring Scores and Old Metrics

Remove deal-quality, popularity, and scarcity scores from the public API, UI, sorting, tooltips, tests, documentation, and pipeline.

After the new read model is deployed and backfilled, use forward migrations to remove obsolete score tables, indexes, refresh scripts, and pipeline calls. Exact available-size arrays replace stock-count-derived presentation. Do not silently repurpose old score columns.

## Visual Language

Use shared Mantine/theme tokens instead of component-local colors:

```text
Canvas             #F5F1EA
Elevated surface   #FBF8F3
Primary text       #2B2825
Secondary text     #756F68
Separator          #DDD5CB
Oxblood accent     #722F3D
Accent wash        #F0E2E5
```

Use warm ivory instead of pure white, charcoal instead of black, oxblood as the single expressive accent, more whitespace, fewer borders, and soft hairline separators. Remove most bright pills and outlined boxes.

Use sentence-case labels and a refined system sans stack beginning with `Avenir Next` and `Helvetica Neue`. Body text uses 400, labels 500, and prices/headings approximately 600–650 rather than pervasive 800–850. Prices use tabular numerals.

Highcharts and SVG sparklines use the same charcoal, oxblood, and separator tokens.

## Accessibility and Responsive Behavior

- Desktop catalog: four to three columns depending on width; tablet: two; narrow mobile: one.
- Mobile filters open in a full-width drawer.
- Swatches are real buttons with accessible names, selected state, visible focus, and sufficient touch targets.
- Selection never relies on color alone.
- Show an initial swatch subset plus `+N`; expansion must not create page-level horizontal overflow.
- Available size labels wrap within the card.
- Sparkline SVGs use an accessible title/description.
- Highcharts enables its accessibility module and keyboard navigation.
- Respect reduced-motion preferences.
- Price reductions remain understandable without color through regular price, strikethrough, and percentage text.
- Reserve image and chart dimensions to prevent layout shift.

## Loading, Empty, and Incomplete States

- Initial load: fixed-size skeleton cards matching final geometry.
- No filter matches: `No products match these filters` with a clear-filters action.
- No valid snapshot: full-page unavailable state with retry.
- Stale snapshot: retain usable results with a quiet last-updated notice.
- Missing image: neutral ivory placeholder.
- Fewer than two history points: reserved sparkline space with `Price history is still building`.
- Missing stock observation: `Availability unavailable`; do not infer sold out.
- Selected sold-out color: `Currently unavailable`, with no available-size labels.
- Partial color failure: retain valid colors and exclude the failed color from minimum calculations.
- Every color sold out: retain the product in the catalog, show `Currently unavailable`, retain historical context, and sort it after available products.

## Logging and Operations

The pipeline writes timestamped database-load and read-model-refresh logs beside the run's data artifacts. Logs identify:

- Input artifact and run identifier
- Raw insert counts by table
- Snapshot identifier
- Derived row counts by table
- Validation results
- Refresh duration
- Activation success
- Failure stage and stack/database error

Timestamped CSV, JSONL, and log artifacts remain preserved. A refresh-only command rebuilds the catalog snapshot from committed raw data without rerunning the scraper.

## Verification

Implementation verification must include:

- Unit tests for price eligibility, exact observation pairing, effective price, daily minima, label priority, size OR matching, same-variant filters, and cursor encoding/continuation.
- SQL/integration tests for snapshot activation, failed-refresh rollback, stale fallback, sold-out/unknown availability, deterministic ties, and product-level pagination.
- API contract tests for filters, totals, cursors, typed errors, and snapshot metadata.
- UI tests for swatch state, selected-color price/discount, size labels, sold-out state, filter behavior, and accessible names.
- Visual/responsive checks for editorial tokens, card hierarchy, mobile filter drawer, chart placeholders, and layout stability.
- Performance measurement using a realistic catalog page. Native SVG card sparklines are retained unless measured rendering or scrolling performance is unacceptable.
- Production build and TypeScript checks.

## Delivery Sequence

1. Add read-model migrations and refresh logic without switching the UI.
2. Backfill and validate an initial active snapshot.
3. Add the product-centric API and contract tests.
4. Build shared price-point adapters, native SVG sparklines, and Highcharts detail components.
5. Replace the catalog UI, filters, sorting, pagination, and states.
6. Replace the product-detail charts and selected-color interaction.
7. Apply the shared editorial theme and accessibility behavior.
8. Remove score-based UI/API behavior and obsolete pipeline refreshes through forward migrations.
9. Run full verification, profile catalog rendering, and update README/API documentation.
