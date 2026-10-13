# Product catalog API

`GET /api/catalog/products` returns `{ products, total, nextCursor, snapshot }`.
`snapshot` contains string `id`, ISO `dataAsOf` and `refreshedAt`, and `status`
(`active` or `stale`). A newer failed refresh marks the retained snapshot stale.

Parameters: `limit` (default 24, integer 1–48), `sort` (`discount-desc` default,
`price-asc`, `price-desc`, `observed-desc`, `name-asc`), opaque `cursor`, `search`
(literal name substring or product number substring), exact `brand`, `category`,
and color ID `color`, repeated `size`, nonnegative `minPrice`/`maxPrice`,
`saleOnly=true|false`, and `minDiscount` (0–100, requires `saleOnly=true`).
Sizes are OR; all other variant predicates must match the same available color.
Prices use effective price. Sale requires a sale price below original price.

Each product contains its global From metadata (`fromColorId`, `fromPrice`,
`fromOriginalPrice`, `fromSalePercent`), `selectedColorId`, metadata, availability,
tracking start, insight label, and all current snapshot colors. A filtered
selection chooses the cheapest qualifying color; the From metadata stays paired
with the global From color. Without variant filters, unavailable products remain
and sort after available products. Every sort breaks ties by product number.
No price history arrays or score fields are included. Numeric prices are JSON
numbers and dates are ISO strings.

Keep sort and filters unchanged while following `nextCursor`; cursors are
versioned, bind to a retained snapshot, and do not advance to a newly active
snapshot. `total` is the exact count before cursor continuation. A valid empty
result returns 200 and `nextCursor: null`.

Errors have `{ error: { code, message } }`. Invalid parameters and cursors return
400 (`invalid_query`, `invalid_cursor`); removed snapshots return 400
`cursor_expired` (restart from page one). No active snapshot or a database failure
returns 503 `catalog_unavailable`. Database messages are not exposed.
