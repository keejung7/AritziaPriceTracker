# Product catalog API

`GET /api/catalog/products` returns `{ items, total, nextCursor, snapshot, filterOptions }`.
`snapshot` contains string `id`, ISO `dataAsOf` and `refreshedAt`, and `status`
(`current` or `stale`). A newer failed refresh marks the retained snapshot stale.
Public names conform to the approved spec; DB lifecycle status remains `active`.
There is no public `products` alias.

`filterOptions.colors` contains `{ id, name }` for all colors in the resolved snapshot,
independent of filters/pagination. One ID appears once; conflicting names choose the
first trimmed nonblank name in C order, falling back to the ID. Options sort by name
then ID; the UI appends IDs to repeated names. `filterOptions.sizes` contains distinct
observed `available_sizes` labels, ordered by alpha fit (including 3XS), numeric fit
(00 before 0), one-size (ONE/OS), then other labels naturally. Combined sizes sort
at their component midpoint. Values remain exact observed strings. Empty results
retain full metadata. Cursor pages use retained-snapshot metadata; initial requests
use the active snapshot. Products, freshness and options come from one SQL statement.

Parameters: `limit` (default 24, integer 1–48), `sort` (`discount-desc` default,
`price-asc`, `price-desc`, `observed-desc`, `name-asc`), opaque `cursor`, `search`
(literal name substring or product number substring), exact `brand`, `category`,
and color ID `color`, repeated `size`, nonnegative `minPrice`/`maxPrice`,
`saleOnly=true|false`, and `minDiscount` (0–100, requires `saleOnly=true`).
Sizes are OR; all other variant predicates must match the same available color.
Prices use effective price. Sale requires a sale price below original price.

Each product identifies `productNo` as a decimal string so bigint identifiers
remain exact. Each product contains its global From metadata (`fromColorId`, `fromPrice`,
`fromOriginalPrice`, `fromSalePercent`), `selectedColorId`, metadata, availability,
tracking start, insight label, and all current snapshot colors. A filtered
selection chooses the cheapest qualifying color; the From metadata stays paired
with the global From color. Without variant filters, unavailable products remain
and sort after available products. Every sort breaks ties by product number.
No price history arrays or score fields are included. Numeric prices are JSON
numbers and dates are canonical UTC ISO strings. Timestamp precision from the
database is retained, including six fractional digits when present. Snapshot
IDs and cursor identifiers are decimal strings too.

Keep sort and filters unchanged while following `nextCursor`; cursors are
versioned, bind to a retained snapshot, and do not advance to a newly active
snapshot. `total` is the exact count before cursor continuation. A valid empty
result returns 200 and `nextCursor: null`.

Errors have `{ error: { code, message } }`. Invalid parameters and cursors return
400 (`invalid_query`, `invalid_cursor`); removed snapshots return 400
`cursor_expired` (restart from page one). No active snapshot or a database failure
returns 503 `catalog_unavailable`. Database messages are not exposed.

## Product history

`GET /api/products/:productNo/price-history` includes normalized raw history and
`chartHistory: { product: { points, lowAnnotation }, colors: { [colorId]: {
price: { points, lowAnnotation }, availability } } }`. Renderers consume server-produced
series. Both price modes select the latest complete observation per color/UTC day
before availability filtering, exclude sold-out/unknown prices, preserve null gaps
and identify responsible color/date and lossless `observedAt`. Low annotations use
only prioritized exact labels `Lowest ever`, `Lowest in 90 days`, `Lowest in 30 days`
when the current eligible price qualifies; window claims require a full tracked span.
Annotations identify price, color and UTC date. Availability counts known available
sizes even alongside unknown statuses; zero requires every status to prove sold out.
Raw/date responses retain decimal product IDs and SQL timestamp strings.
Requests narrowed by `colorId`, `dateFrom` or `dateTo` omit low annotations because
the response cannot establish full product/tracking coverage; their eligible points
and gaps remain available. The detail UI requests the complete product history.
