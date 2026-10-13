# Catalog validation evidence

Captured 2026-10-13 on local macOS arm64, production Next.js build, PostgreSQL in a
new temporary instance, Playwright 1.57 Chromium (1440×1000 desktop and iPhone 13
viewport). No user/production database was contacted. Browser fixtures contain 120
products, 240 colors, 720 raw price and 720 raw stock observations across three days;
one product is sold out. Images use the missing-image fallback. These are local lab
regression measurements, without CPU/network throttling, not field Web Vitals or a
claim about image-heavy catalogs or longer browsing sessions.

## Browser measurements

`CATALOG_TEST_DATABASE_URL=postgresql://task8@127.0.0.1:55987/task8_catalog_final_test npm run test:e2e`
passed all 14 scenarios in 20.2 seconds. The setup refuses non-`_test` databases and
existing catalog schemas. Create a new disposable database when reproducing the run.

| Measurement | Desktop | Mobile | Asserted budget |
| --- | ---: | ---: | ---: |
| Catalog JS encoded bytes | 205,219 | 205,219 | <650,000 |
| Catalog JS transferred bytes including headers | 208,219 | 208,219 | recorded |
| Initial catalog render | 195.9 ms | 197.3 ms | <2,500 ms |
| LCP | 44 ms | 128 ms | <2,500 ms |
| CLS during measured session | 0.0368 | 0 | <0.1 |
| Largest Event Timing duration | 64 ms | 56 ms | diagnostic; not field INP |
| Search/filter latency (debounce + UI) | 327.1 ms | 422.0 ms | <1,500 ms |
| Scroll p95 frame after Load More | 17.6 ms | 16.8 ms | <50 ms |
| DOM nodes after 120 cards | 7,975 | 7,555 | <20,000 |
| JS heap growth after Load More | 2,878,284 B | 7,812,420 B | <40 MiB |
| Detail chart render | 433.8 ms | 432.7 ms | <2,500 ms |
| Additional detail/chart JS | 182,790 B | 182,790 B | <500,000 B |

The catalog's transferred chunks contain no Highcharts container implementation;
the detail route requests its separate chart chunks. Before repair, the stale banner
was cleared on every filter reload, then reinserted: three 75.7 px shifts accumulated
CLS 0.1103 on desktop. Keeping last-known freshness while the next page settles
reduced this to the single initial 0.0368 shift. No windowing was added: 120-card DOM,
heap and scrolling measurements passed. Reassess with larger sessions/real images.

Browser tests cover exact labels/default discount sorting, same-color filters,
size OR and minimum discount, inclusive bounds/category/brand, unique Load More pages,
sold-out-last, swatch price/size changes, empty/reset filters, stale notice, accessible
selected-color Highcharts points, product-wide toggle, and performance at both widths.
Full JSON attachments/failure traces are under `test-results/`.

## Query plans

`CATALOG_PROFILE_DATABASE_URL=postgresql://task8@127.0.0.1:55987/task8_catalog_run3_test node scripts/diagnostics/profile_catalog_queries.js`
reported `transaction_read_only=on`, raw counts 120/720/720, and exact total 120.
The script runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` inside `BEGIN READ ONLY`
with a 120-second timeout and rolls back. It cannot refresh or seed data.

| Query | 120 products execution | 120 products wall | 10,000 products execution | 10,000 products shared hits |
| --- | ---: | ---: | ---: | ---: |
| Default page including exact total | 1.251 ms | 2.558 ms | 23.427 ms | 30,206 |
| Combined available-color filters | 1.327 ms | 3.415 ms | 26.258 ms | 30,209 |
| Snapshot continuation including total | 1.426 ms | 2.930 ms | 26.093 ms | 30,225 |
| Exact snapshot total alone | 0.607 ms | 0.984 ms | 0.960 ms | 134 |

The 10,000-product/20,000-color fixture is the existing isolated-schema DB integration
profile, run with `CATALOG_EXPLAIN=1 npm run test:db`. All four plans had zero shared
disk reads (warm cache). Plans use snapshot partial/primary indexes and per-product
color primary-key lookups; exact total scans the eligible catalog. Because the exact
total is calculated, work scales with eligible rows even for continuation. At this
cardinality the measured plans did not justify a query rewrite. Full plans are emitted
by the profiler and by `CATALOG_EXPLAIN`; retain stdout with the run artifacts.

## Refresh-only and failure evidence

The E2E setup invokes `node db/refresh_catalog_read_model.js` four times with an
explicit test `DATABASE_URL` and timestamped `DB_LOG_PATH`. It then introduces one
negative raw sale price in the disposable fixture, verifies a rejected fifth refresh,
and restores that raw fixture value. The active snapshot remains `4`; failed attempt
`5` persists. Before failure, retained statuses are one active/two inactive. Snapshot
4 cleanup deleted one old snapshot. All successful builds contain 120 products,
240 colors and 357 eligible daily history rows. The timeout logged is 120,000 ms.

| Stage, fourth refresh | Duration |
| --- | ---: |
| create_snapshot | 1.23 ms |
| derive_current_colors | 5.98 ms |
| derive_products | 7.97 ms |
| derive_90_day_history | 12.91 ms |
| derive_all_time_lows | 4.18 ms |
| validate_counts | 3.00 ms |
| activate_snapshot | 0.30 ms |
| cleanup_snapshots | 1.93 ms |
| Total | 44.46 ms |

Earlier successful totals were 73.85, 73.86 and 42.48 ms. The intentional failure
logged `stage=validate_counts`, negative-price rejection, total 40.86 ms, and a durable
failure marker at 41.67 ms. Logs and JSON evidence are retained under
`.validation-artifacts/catalog/2026-10-13T16-35-30.662Z/` for this run. New successful
refreshes prune inactive/failed snapshots according to the two-snapshot retention
policy; the failed refresh itself does not prune the previous active snapshot.

## Verification repairs and limits

The baseline parser dropped category arrays and image fields. Regression tests now
verify deduplicated `source_categories`, empty legacy defaults and optional image URLs;
a real SQL loader test verifies metadata persistence. Migration 009 already provides
the tables/columns, so no schema change was needed. The current scraper does not yet
emit category/image metadata; enriched artifacts/existing DB metadata are still needed.

The browser fixture uses real scraper-style fractional discounts (`0.6`). It exposed
the catalog's `0.6% off` error and broken `minDiscount=20` matches. Derived catalog/
history now calculate rounded percentage points from paired prices (`100 → 40 = 60`),
guarding null/zero originals and ignoring contradictory raw percentages. Raw data is
preserved. Existing negative-price validation still rejects invalid eligible values.

The product-card fixture now uses the permitted exact `Lowest ever` label; DTO tests
explicitly exclude both legacy size-count fields. Both lazy charts share pure palette
tokens, preserving the catalog/Highcharts bundle boundary. No scraper selector changed.
Build still reports pre-existing static Recharts sizing warnings in `/ui-concepts`.
Dependency installation reports existing audit findings; no broad dependency update was
performed. Playwright's production version remains 1.57.0 and tests are pinned to it.

Highcharts free-use eligibility is restricted to qualifying personal/educational
non-commercial use, with personal use also non-professional. Any commercial or
professional use needs reevaluation and the applicable commercial license; see the
README and [Highcharts EULA](https://shop.highcharts.com/license-eula).

## Final whole-branch review verification — 2026-10-13

The final fix wave uses realistic color IDs (1274/18891) and observed 3XS, ONE,
numeric and combined-size options. Its fixture has 120 products, 240 colors, 720 raw
prices and 741 raw stock rows. Four refreshes each produce 357 eligible daily points;
the intentional failed fifth refresh preserves active snapshot 4 and its failed marker.
History regression checks compare only common dates, excluding natural window expiry.

The independent staged export at `/private/tmp/aritzia-final-index.QbtNFC` installed
its own lockfile dependencies. It passed 89/89 tracked unit tests, 37/37 PostgreSQL
tests, typecheck, production build, and 19/19 applicable browser scenarios in 26.7 s.
The single skipped case is a duplicate mobile-project invocation of the scenario
that already checks 320, 600, 834, 1080 and 1440 px in the desktop project. Geometry
assertions cover 1/1/2/3/4 columns, mobile drawers at 100% viewport width, no overflow,
offscreen keyboard focus after 120 cards, and 340/260 px chart loading/empty states.

Final clean-export performance (desktop/mobile): catalog encoded JS 205,575 B each,
initial render 117.9/197.1 ms, LCP 40/32 ms, CLS 0/0, maximum Event Timing 48/56 ms,
filter latency 335.1/421.0 ms, scroll p95 17.4/17.2 ms, DOM 8,065/7,663 nodes, heap
growth 1,846,980/2,299,484 B, and detail charts 480.0/417.5 ms. Additional detail JS
is 182,444 B. Catalog chunks contain no Highcharts implementation. All local budgets
pass with shared fonts/separators and content-visibility enabled; these remain local
unthrottled fallback-image measurements, not field or mobile-network claims.

Read-only profile captured at 2026-10-13T19:46:06Z: default/combined/continuation/
exact-total execution 1.522/1.479/1.479/0.201 ms on the 120-product fixture. Combined
filters actually match 61 products using a snapshot color ID, replacing the old
name-like diagnostic value. The clean DB suite's 10,000-product/20,000-color plans
execute in 35.827/39.314/39.869/1.216 ms with zero disk reads. Full evidence is in
the final-fix report and `/private/tmp/aritzia-final-{clean-unit,clean-db,clean-build,clean-e2e}.log`.
