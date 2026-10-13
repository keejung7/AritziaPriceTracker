# Catalog refresh

Run `npm run refresh-catalog` to rebuild the catalog from committed raw observations,
without scraping or parsing. Apply migration 009 first. The database loader also
refreshes the catalog immediately after committing raw rows. A refresh failure exits
nonzero, preserving both raw rows and the previously active snapshot. After rollback,
a separate transaction writes a durable failed snapshot marker, reusing its allocated
ID and data-as-of timestamp. Its created_at records the attempt start; DB_LOG_PATH
records failure stage and elapsed duration. Marker-write failure is logged without
masking the original refresh error.

`refreshCatalogReadModel(pool, options)` returns `snapshotId`, `dataAsOf`,
`productCount`, `colorCount`, `historyCount`, `queryDurationsMs`, and `totalDurationMs`.
Defaults: `historyDays=90`, `statementTimeoutMs=120000`,
`warningRegressionRatio=0.75`, `failureRegressionRatio=0.50`,
`retainedSnapshots=2`. Ratios compare new product/color counts to the active
snapshot; below 0.75 warns, below 0.50 aborts. Retention keeps the active snapshot
plus the two most recent inactive/failed snapshots. `logger` may be injected;
the default saves stage durations, counts, warnings, failures, and total duration
through `DB_LOG_PATH` beside the pipeline's timestamped artifacts.

Stock qualifies a price only at the exact product/color/timestamp. Available sizes
have trimmed, case-insensitive `In Stock`, `Only a Few Left`, or `Available` status.
All explicitly `Sold Out`/`Unavailable` sizes yield `sold_out`; absent, NULL, or
unrecognized stock yields `unknown` unless another size is available.
Current From price uses the lowest available color price, breaking ties by color ID.
Sold-out and unknown colors/products remain visible with no eligible From price.

`dataAsOf` is the latest price or stock observation. UTC calendar dates define the
90-day chart window (as-of date and previous 89 dates). First select the latest
complete price/stock observation per color and UTC day, then exclude unavailable
observations and choose the product daily minimum, breaking ties by color ID. Later
sold-out or unknown observations supersede earlier available observations. All-time
and window minima use that same daily series as scalar aggregates. Label priority
is `Lowest ever`, `Lowest in 90 days`, then
`Lowest in 30 days`. Older points never enter the materialized chart history.

The refresh uses a repeatable-read transaction, a transaction-scoped advisory lock,
a local statement timeout, validation before activation, and transactional cleanup.
Readers see the previous active snapshot until all stages commit.
Before publication, validation rejects negative eligible effective, original, or sale
prices in current colors, product From fields, materialized history, and the all-time
daily color series. The raw observations remain available for diagnosis.
