# Product Price Explorer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace score-driven product/color rows with a product-centric, snapshot-backed catalog and a quiet editorial UI with transparent current prices, factual low labels, exact available sizes, and Highcharts product history.

**Architecture:** Commit normalized scrape observations first, then build and atomically activate an immutable PostgreSQL catalog snapshot. A product-level cursor API performs server-side filtering and returns complete products; the Next.js catalog consumes it in 24-product pages. Product-detail history continues to use normalized raw observations and renders client-side with Highcharts.

**Tech Stack:** PostgreSQL, Node.js/CommonJS ingestion modules, Next.js 16 App Router, React 19, TypeScript, Mantine 9, Jest, PostgreSQL integration tests, Highcharts Core with `@highcharts/react`

**Spec:** `docs/superpowers/specs/2026-10-13-product-price-explorer-redesign-design.md`

## Global Constraints

- Preserve timestamped CSV, JSONL, and database log artifacts.
- Do not alter scraper selectors.
- Every schema change requires a forward migration and matching `db/schema.sql` update.
- Raw `price_snapshots` and `stock_snapshots` remain the source of truth.
- A price is eligible only when the same `(product_no, color_id, scraped_date)` has at least one explicitly available size.
- Catalog cards contain no price-history chart; exact charts live only on product-detail pages.
- Customer-facing historical labels are exactly `Lowest ever`, `Lowest in 90 days`, and `Lowest in 30 days`.
- Default catalog sort is highest current discount; unavailable products sort last.
- Catalog pages contain 24 complete products and use snapshot-bound keyset cursors.
- Highcharts must not be installed or shipped until the user confirms the deployment has an appropriate license.
- Do not stage, reset, or overwrite unrelated pre-existing worktree changes.
- Use test-first implementation, run the full test suite after each task, and make one focused commit per task.

## Review Focus

- A price with missing same-observation stock must be `unknown`, excluded from `From`, and never treated as sold out; Task 2 pins this with an integration fixture.
- Color, size, price, sale, and discount filters must match one color together rather than different colors independently; Task 3 pins this with a catalog-query test.
- Equal sort values must paginate without duplicates or omissions, and expired snapshot cursors must fail explicitly; Task 3 pins both cases.
- A product with every color sold out must remain visible after available products with `Currently unavailable`; Tasks 2, 3, and 5 pin data, ordering, and presentation.
- Refresh timeout, overlap, or severe count regression must leave the previous snapshot active and log the failed stage; Task 2 pins rollback and validation behavior.

---

## Execution Preflight

Before Task 1, read the spec and current `AGENTS.md`, then create an isolated worktree with `superpowers:using-git-worktrees`. The current checkout contains extensive uncommitted work that this feature depends on; preserve it through the worktree tool's working-tree starting state or first obtain an explicit user decision about which changes belong in the feature. Do not reset or discard any current files.

Confirm the baseline with:

```bash
npm test
npm run build
```

Record existing failures or warnings before making feature changes.

### Task 1: Catalog Snapshot Schema and Database Test Harness

**Files:**
- Create: `db/migrations/009_add_catalog_read_model.sql`
- Modify: `db/schema.sql`
- Create: `tests/helpers/catalogTestDatabase.js`
- Create: `tests/catalogSchema.integration.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `products`, `product_colors`, `price_snapshots`, and `stock_snapshots` tables.
- Produces: `catalog_snapshots`, `catalog_product_colors`, `catalog_products`, and `catalog_product_price_history`; `npm run test:db` using `CATALOG_TEST_DATABASE_URL`.

- [ ] **Step 1: Write the failing schema integration test**

Create `tests/catalogSchema.integration.test.js` with tests named:

- `creates one-active-snapshot enforcement and snapshot lifecycle columns`
- `stores available size arrays and explicit availability states`
- `enforces unique product, color, and day rows within a snapshot`
- `creates the selective exact-observation stock index`

The helper must refuse to run against a database unless `CATALOG_TEST_DATABASE_URL` is set and the database name ends in `_test`.

- [ ] **Step 2: Run the integration test and verify it fails**

Run: `npm run test:db -- tests/catalogSchema.integration.test.js`

Expected: FAIL because migration 009 and the catalog tables do not exist.

- [ ] **Step 3: Add the migration and canonical schema definitions**

Implement the four tables and constraints from the spec. Add:

- GIN index on `catalog_product_colors.available_sizes`
- B-tree indexes for snapshot/product identity, effective price, sale percentage, observation time, and product history date
- Partial or ordered index supporting one active snapshot
- Raw stock index beginning `(product_no, color_id, scraped_date)` and including `product_size, product_status`

Use `availability_status` values `available`, `sold_out`, and `unknown`. Do not add scoring columns.

- [ ] **Step 4: Run schema tests and the full suite**

Run:

```bash
npm run test:db -- tests/catalogSchema.integration.test.js
npm test
```

Expected: both commands PASS.

- [ ] **Step 5: Inspect query plans for the new indexes**

Run representative `EXPLAIN (ANALYZE, BUFFERS)` statements for exact observation stock lookup, size overlap, and effective-price range. Save concise plan evidence in the task notes; do not add an overlapping index unless the measured plan requires it.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/009_add_catalog_read_model.sql db/schema.sql tests/helpers/catalogTestDatabase.js tests/catalogSchema.integration.test.js package.json
git commit -m "feat: add catalog snapshot schema"
```

### Task 2: Atomic Catalog Snapshot Refresh

**Files:**
- Create: `db/catalogReadModel.js`
- Create: `db/refresh_catalog_read_model.js`
- Create: `tests/catalogReadModel.test.js`
- Create: `tests/catalogReadModel.integration.test.js`
- Modify: `db/db.js`
- Modify: `db/loadLogging.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 catalog tables and normalized raw observations.
- Produces: `refreshCatalogReadModel(pool, options): Promise<CatalogRefreshResult>` and `npm run refresh-catalog`.

Define:

```js
refreshCatalogReadModel(pool, {
  historyDays = 90,
  statementTimeoutMs,
  warningRegressionRatio,
  failureRegressionRatio,
} = {})
```

Return `{ snapshotId, dataAsOf, productCount, colorCount, historyCount, queryDurationsMs, totalDurationMs }`.

- [ ] **Step 1: Write failing orchestration tests**

In `tests/catalogReadModel.test.js`, use a recording fake pool/client to assert:

- advisory lock is acquired before building
- `SET LOCAL statement_timeout` occurs inside the refresh transaction
- activation happens only after validation
- query durations and total duration are returned
- any query failure rolls back and never deactivates the prior snapshot
- severe count regression throws while a warning regression logs and proceeds

- [ ] **Step 2: Run the unit test and verify it fails**

Run: `npm test -- tests/catalogReadModel.test.js`

Expected: FAIL because `db/catalogReadModel.js` does not exist.

- [ ] **Step 3: Implement refresh orchestration and SQL stages**

Use set-based `INSERT ... SELECT` statements. Implement these named stages for logs and timings:

1. `create_snapshot`
2. `derive_current_colors`
3. `derive_products`
4. `derive_90_day_history`
5. `derive_all_time_lows`
6. `validate_counts`
7. `activate_snapshot`
8. `cleanup_snapshots`

Pair price and stock on exact product/color/timestamp. Compute `available_sizes`, `availability_status`, current `From` fields, responsible daily-minimum color, and prioritized low label. Store only the required 90 days of daily history; compute the scalar all-time eligible minimum separately so `Lowest ever` remains truthful without materializing older chart points. Retain the active snapshot plus the configured recent-snapshot count.

- [ ] **Step 4: Write failing data-semantic integration tests**

In `tests/catalogReadModel.integration.test.js`, seed small fixtures and assert:

- available same-observation size makes the price eligible
- all sold-out sizes exclude the price but retain the color and product
- missing same-observation stock yields `unknown`
- later stock cannot qualify an earlier price
- daily ties choose deterministic `color_id`
- history is limited to 90 days
- an eligible low older than 90 days can produce `Lowest ever` without appearing in stored daily history
- low-label priority is ever, then 90, then 30
- failed activation retains the previous active snapshot

- [ ] **Step 5: Run the integration test and verify it fails for missing derivation**

Run: `npm run test:db -- tests/catalogReadModel.integration.test.js`

Expected: FAIL on the first unimplemented derivation assertion.

- [ ] **Step 6: Complete derivation SQL and pipeline integration**

Call `refreshCatalogReadModel` only after `saveParsedProducts` commits. A refresh failure must log its stage, make `db/db.js` exit nonzero, preserve raw rows, and preserve the previous active snapshot. Route refresh stage records, query durations, total duration, counts, warnings, and failures through the existing `DB_LOG_PATH` run logger so they are saved beside the run's timestamped data artifacts. Add the refresh-only command without invoking the scraper or parser.

- [ ] **Step 7: Run focused, full, and build verification**

Run:

```bash
npm test -- tests/catalogReadModel.test.js
npm run test:db -- tests/catalogReadModel.integration.test.js
npm test
npm run build
```

Expected: all PASS; logs contain separate query and total durations.

- [ ] **Step 8: Commit**

```bash
git add db/catalogReadModel.js db/refresh_catalog_read_model.js db/db.js db/loadLogging.js package.json tests/catalogReadModel.test.js tests/catalogReadModel.integration.test.js
git commit -m "feat: derive atomic catalog snapshots"
```

### Task 3: Product-Level Filters, Cursor Pagination, and Catalog API

**Files:**
- Create: `db/catalogQueries.js`
- Create: `app/services/catalogTypes.ts`
- Create: `app/services/catalogCursor.ts`
- Create: `app/services/catalogService.ts`
- Create: `app/api/catalog/products/route.ts`
- Create: `tests/catalogCursor.test.js`
- Create: `tests/catalogService.test.js`
- Create: `tests/catalogQueries.integration.test.js`
- Modify: `tsconfig.test.json`

**Interfaces:**
- Consumes: Task 2 active snapshot and derived rows.
- Produces: `GET /api/catalog/products`, `CatalogResponse`, `CatalogProduct`, `CatalogColor`, `encodeCatalogCursor`, `decodeCatalogCursor`, and `getCatalogProducts`.

The query input is:

```ts
interface CatalogQuery {
  limit: number;
  sort: "discount-desc" | "price-asc" | "price-desc" | "observed-desc" | "name-asc";
  cursor: CatalogCursor | null;
  search: string | null;
  brand: string | null;
  category: string | null;
  color: string | null;
  sizes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  saleOnly: boolean;
  minDiscount: number | null;
}
```

- [ ] **Step 1: Write failing cursor and parameter tests**

Assert that cursors round-trip snapshot, sort, nullable sort value, and product number; reject malformed, wrong-version, and sort-mismatched cursors. Assert limit is 1–48, price bounds are non-negative and ordered, sizes are deduplicated, and minimum discount is accepted only with `saleOnly=true`.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- tests/catalogCursor.test.js tests/catalogService.test.js`

Expected: FAIL because the catalog service files do not exist.

- [ ] **Step 3: Implement TypeScript contracts, cursor codec, and request parsing**

Use a versioned base64url JSON cursor containing `snapshotId`, `sort`, `lastSortValue`, and `lastProductNo`. Treat it as opaque publicly and validate every decoded field. Map every sort to a fixed SQL expression and comparator; never interpolate arbitrary request text.

- [ ] **Step 4: Write failing catalog-query integration tests**

Seed products whose filters are satisfied by the same and different colors. Assert:

- color plus sale does not cross-match different colors
- multiple sizes use OR within size and AND with other variant filters
- price range uses qualifying effective price
- default selection is the global `From` color; filtered selection is the cheapest qualifying color
- unavailable products remain but sort last when no variant filter excludes them
- equal discounts paginate without duplicate or missing product numbers
- page two remains on the cursor snapshot after a newer snapshot activates
- an expired snapshot cursor returns `cursor_expired`
- a previous active snapshot is served with `status: "stale"` when a newer refresh failed
- only colors for the 24 paged products are aggregated

- [ ] **Step 5: Run query tests and verify they fail**

Run: `npm run test:db -- tests/catalogQueries.integration.test.js`

Expected: FAIL because `getCatalogProducts` is not implemented.

- [ ] **Step 6: Implement query and route**

Fetch `limit + 1` product identifiers first, then fetch/aggregate their colors. Return complete product objects, exact product total, next cursor, and `{ id, dataAsOf, refreshedAt, status }`. Derive `status: "stale"` when a newer failed snapshot exists while continuing to serve the last active snapshot. Return typed 400 responses, typed 503 when no valid snapshot exists, `cursor_expired` for removed snapshots, and 200 for valid empty results. Do not expose database messages.

- [ ] **Step 7: Profile catalog query plans**

Capture `EXPLAIN (ANALYZE, BUFFERS)` for default sort, combined color/size/price/sale filters, exact total, and cursor continuation. Adjust only measured index gaps through a new migration amendment; do not add speculative indexes.

- [ ] **Step 8: Run verification and commit**

Run:

```bash
npm test -- tests/catalogCursor.test.js tests/catalogService.test.js
npm run test:db -- tests/catalogQueries.integration.test.js
npm test
npm run build
```

Then:

```bash
git add db/catalogQueries.js app/services/catalogTypes.ts app/services/catalogCursor.ts app/services/catalogService.ts app/api/catalog/products/route.ts tests/catalogCursor.test.js tests/catalogService.test.js tests/catalogQueries.integration.test.js tsconfig.test.json
git commit -m "feat: add product catalog API"
```

### Task 4: Catalog Client Data Flow and Filter Controls

**Files:**
- Create: `app/components/catalog/useCatalogProducts.ts`
- Create: `app/components/catalog/CatalogFilters.tsx`
- Create: `app/components/catalog/CatalogExplorer.tsx`
- Create: `tests/catalogFilters.test.tsx`
- Create: `tests/catalogDataFlow.test.tsx`
- Modify: `app/components/LatestProductsExplorer.tsx`
- Modify: `package.json`
- Create: `jest.config.cjs`
- Create: `jest.setup.ts`
- Modify: `tests/priceHistoryService.test.js`

**Interfaces:**
- Consumes: Task 3 `CatalogResponse` and `/api/catalog/products`.
- Produces: `useCatalogProducts(filters)`, responsive `CatalogFilters`, and `CatalogExplorer` with 24-product Load More behavior.

- [ ] **Step 1: Add React component-test support with a failing behavior test**

Add compatible versions of Testing Library, jest-dom, user-event, and jsdom. Configure `next/jest` in `jest.config.cjs` to transform TypeScript/TSX and use jsdom, while database tests opt into the Node environment with a file docblock. Update the existing service test to import its TypeScript source directly and replace the `.test-dist` precompile dependency with a separate typecheck script. Write failing tests asserting:

- desktop primary controls are Search, Category, Brand, On sale, Sort, and More filters
- More filters contains Color, Size, and Price range
- Minimum discount appears only when On sale is enabled
- Full price is absent
- mobile uses one Filters trigger/drawer

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- tests/catalogFilters.test.tsx`

Expected: FAIL because the new catalog controls do not exist.

- [ ] **Step 3: Implement filter state and controls**

Keep first-version state local, not in URL parameters. Debounce search, abort superseded requests, reset accumulated pages when any filter/sort changes, and send exact Task 3 query names. Preserve size OR semantics in the request.

- [ ] **Step 4: Write failing pagination and state tests**

Assert initial request limit 24, Load More uses `nextCursor`, products append once, stale snapshot notice renders, cursor-expired clears pages and refetches page one, errors preserve already loaded products, and reset clears every control.

- [ ] **Step 5: Implement the data hook and explorer shell**

`LatestProductsExplorer.tsx` becomes a compatibility re-export or thin wrapper around `CatalogExplorer`. Reserve card geometry during loading and show product-level counts only.

- [ ] **Step 6: Run focused/full tests and commit**

Run:

```bash
npm test -- tests/catalogFilters.test.tsx tests/catalogDataFlow.test.tsx
npm test
npm run build
```

Then commit the files with message `feat: add product catalog filters and pagination`.

### Task 5: Editorial Product Cards, Theme, and Catalog States

**Files:**
- Create: `app/theme.ts`
- Create: `app/components/catalog/ProductCard.tsx`
- Create: `app/components/catalog/ColorSwatches.tsx`
- Create: `app/components/catalog/AvailableSizes.tsx`
- Create: `tests/productCard.test.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `app/components/catalog/CatalogExplorer.tsx`
- Modify: `app/components/catalog/CatalogFilters.tsx`

**Interfaces:**
- Consumes: Task 3 `CatalogProduct`/`CatalogColor` and Task 4 catalog shell.
- Produces: accessible editorial product cards and shared Mantine theme tokens.

- [ ] **Step 1: Write failing card behavior tests**

Assert:

- primary block says `From`, pairs regular price/discount from the same color, and uses tabular numbers
- only the strongest exact historical label appears
- swatch selection changes image, selected-color price/discount, and available size labels without changing `From`
- full-price colors omit crossed-out price and `0% off`
- sold-out selection says `Currently unavailable`
- unknown stock says `Availability unavailable`
- fully sold-out product remains rendered and marked unavailable
- swatches expose accessible names, pressed state, focusability, and `+N` expansion
- no deal, popularity, scarcity, category-chip, color-count, or chart content appears

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- tests/productCard.test.tsx`

Expected: FAIL against the score-driven current card.

- [ ] **Step 3: Implement shared editorial tokens**

Create Mantine theme and CSS variables with exact spec colors: `#F5F1EA`, `#FBF8F3`, `#2B2825`, `#756F68`, `#DDD5CB`, `#722F3D`, and `#F0E2E5`. Use the approved system font stack, sentence case, 400/500/600–650 weights, soft separators, restrained borders, and oxblood as the sole expressive accent.

- [ ] **Step 4: Implement card and state components**

Use lazy images with reserved dimensions. Available sizes wrap. Cards support keyboard swatches and do not rely on color alone. Implement loading skeleton, empty-filter action, stale notice, missing-image placeholder, and unavailable states. Apply `content-visibility: auto` only after confirming it does not break focus or measurement in supported browsers.

- [ ] **Step 5: Run tests, build, responsive browser checks, and commit**

Run the focused/full tests and `npm run build`. Use Playwright at desktop, tablet, and 390 px mobile widths to verify no horizontal overflow, stable image/card geometry, keyboard focus, and readable prices. Commit with message `feat: redesign catalog product cards`.

### Task 6: Highcharts Product-Detail History

**Files:**
- Create: `app/components/product/PriceHistoryChart.tsx`
- Create: `app/components/product/AvailabilityHistoryChart.tsx`
- Create: `app/services/productChartService.ts`
- Create: `tests/productChartService.test.js`
- Create: `tests/productHistoryExplorer.test.tsx`
- Modify: `app/components/ProductPriceHistoryExplorer.tsx`
- Modify: `app/api/products/[productNo]/price-history/route.ts`
- Modify: `app/services/priceHistoryService.ts`
- Modify: `package.json`
- Modify: `tsconfig.test.json`

**Interfaces:**
- Consumes: normalized raw history and same-observation availability semantics.
- Produces: selected-color default Highcharts view, product-wide lowest-available toggle, and normalized `PricePoint[]`.

- [ ] **Step 1: Confirm Highcharts license authorization**

Stop this task if the user cannot confirm that the target deployment qualifies for the intended Highcharts license. Do not install the packages before confirmation.

- [ ] **Step 2: Write failing price-point adapter tests**

Assert selected-color history contains only that color, product-wide history excludes sold-out/unknown observations, gaps remain gaps, daily responsible color/date/price/regular-price/discount are retained, and low annotations identify color and date.

- [ ] **Step 3: Run adapter tests and verify they fail**

Run: `npm test -- tests/productChartService.test.js`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Install official Highcharts packages and implement adapters**

Install `highcharts` and `@highcharts/react`. Dynamically import chart components so Highcharts is excluded from the catalog bundle. Do not add Highcharts Boost.

- [ ] **Step 5: Write failing product-detail interaction tests**

Assert selected-color is the default mode, swatches update current data and selected-color series, the toggle switches to product-wide lowest available history, supporting text states tracking start date and methodology, insufficient history shows `Price history is still building`, and keyboard-accessible chart descriptions exist.

- [ ] **Step 6: Replace production detail charts**

Use Highcharts datetime axes, CAD formatting, exact color/date/price tooltips, accessibility module, keyboard navigation, reduced motion, and editorial tokens. Keep price and availability charts in focused client components rather than the already-large explorer file.

- [ ] **Step 7: Run tests, build, bundle check, visual check, and commit**

Verify Highcharts chunks are absent from the catalog route and present only on product-detail navigation. Run the full suite and build, then commit with message `feat: add Highcharts product history`.

### Task 7: Remove Score and Obsolete Stock-Metric Subsystems

**Files:**
- Create: `db/migrations/010_remove_product_scores.sql`
- Modify: `db/schema.sql`
- Modify: `db/db.js`
- Modify: `db/queries.js`
- Modify: `app/services/priceHistoryService.ts`
- Modify: `tests/priceHistoryService.test.js`
- Modify: `package.json`
- Delete: `db/dealScores.js`
- Delete: `db/refresh_deal_scores.js`
- Delete: `db/stockMetrics.js`
- Delete: `db/refresh_stock_metrics.js`
- Delete after confirming no imports: score/stock-metric-only tests

**Interfaces:**
- Consumes: Tasks 2–6 replacements for catalog price, size, and history behavior.
- Produces: no deal-quality, popularity, or scarcity fields in the pipeline, database schema, public services, or UI.

- [ ] **Step 1: Write failing absence/contract tests**

Update service expectations to assert factual prices, sizes, and history only. Add a repository-level test or check that public response fixtures contain none of `dealQualityScore`, `popularityScore`, `scarcityScore`, their snake-case equivalents, or score-version metadata.

- [ ] **Step 2: Run tests and verify they fail against current score fields**

Run: `npm test -- tests/priceHistoryService.test.js`

Expected: FAIL because current formatting still returns score fields.

- [ ] **Step 3: Remove runtime score dependencies**

Remove score joins, refresh calls, package scripts, service fields, tooltips, sort modes, and UI helpers. Keep `latest_product_color_prices` and `/api/prices/latest` temporarily only if compatibility consumers still require them; document the compatibility boundary rather than dropping them implicitly.

- [ ] **Step 4: Add and verify the forward migration**

Drop obsolete score/stock-metric tables and indexes only after Tasks 2–6 no longer read them. Run migration integration tests against a populated test database and confirm rollback/backups follow the project's migration practice.

- [ ] **Step 5: Run repository search, tests, build, and commit**

Run:

```bash
rg -n "deal.?score|popularity.?score|scarcity.?score|product_color_stock_metrics|product_color_deal_scores" app db tests README.md package.json
npm test
npm run test:db
npm run build
```

Expected: search returns only migration/history documentation references that are intentionally retained. Commit with message `refactor: remove product scoring subsystems`.

### Task 8: End-to-End Validation, Performance Budgets, and Documentation

**Files:**
- Create: `scripts/diagnostics/profile_catalog_queries.js`
- Create: `tests/catalog.e2e.spec.ts`
- Modify: `README.md`
- Modify: `docs/product_service_opportunities.md`
- Modify: `run_pipeline.js` only if a distinct refresh stage is required after Task 2
- Modify: `package.json`

**Interfaces:**
- Consumes: complete Tasks 1–7.
- Produces: documented API/pipeline contract, reproducible query profiling, and final browser/pipeline evidence.

- [ ] **Step 1: Add failing end-to-end scenarios**

Add `@playwright/test` as a development dependency and a `test:e2e` script. Cover catalog load, same-color combined filters, size OR behavior, price bounds, default discount order, Load More without duplicates, sold-out-last ordering, swatch price/size updates, product-detail selected-color chart, product-wide toggle, empty filters, and stale snapshot notice.

- [ ] **Step 2: Run E2E tests and resolve only feature defects**

Run the configured Playwright test command against a seeded test database. Expected: all scenarios PASS at desktop and mobile widths.

- [ ] **Step 3: Add reproducible SQL and pipeline profiling**

The diagnostic script records `EXPLAIN (ANALYZE, BUFFERS)` for required catalog queries without mutating production data. Run a refresh-only build and record product/color/history counts, individual query durations, total refresh duration, statement timeout, and snapshot cleanup result.

- [ ] **Step 4: Measure UI performance**

Measure catalog JavaScript transferred, initial render, Core Web Vitals, filter latency, scrolling responsiveness, memory after repeated Load More, and product-detail Highcharts load. If DOM growth is unacceptable, implement and retest windowing or old-page removal in the catalog shell.

- [ ] **Step 5: Update documentation**

Document migrations, refresh-only command, log locations, catalog endpoint parameters/response/errors, snapshot/stale semantics, filter matching, exact price labels, Highcharts licensing requirement, and troubleshooting steps.

- [ ] **Step 6: Run final verification**

Run:

```bash
npm test
npm run test:db
npm run build
```

Run a refresh-only database build followed by the E2E suite. Review the generated DB log and verify the prior snapshot survives an intentionally failed test refresh.

- [ ] **Step 7: Commit**

```bash
git add scripts/diagnostics/profile_catalog_queries.js tests/catalog.e2e.spec.ts README.md docs/product_service_opportunities.md run_pipeline.js package.json
git commit -m "docs: verify product catalog redesign"
```

## Final Branch Review

After Task 8, use `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. The reviewer must compare the implementation to the spec, inspect migrations and rollback behavior, verify no unrelated worktree changes entered commits, and review query plans, bundle output, accessibility, and the complete test/build evidence before integration.
