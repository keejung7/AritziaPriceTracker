# Product Service Opportunities

## Current shipped boundary (catalog redesign)

The active product is a factual price explorer: a paginated product catalog, same-color
availability/price filters, selected-color swatches, and lazy product price/availability
history. It has no scoring endpoint or computed deal, popularity, scarcity, demand, or
buy/wait recommendations. The concepts below are research ideas, not shipped behavior.
Migration 009 adds the snapshot read model and metadata; migration 010 retires the old
score/stock-metric/latest-price tables. `/api/prices/latest` is removed.

Catalog labels are exactly `Lowest ever`, `Lowest in 90 days`, or `Lowest in 30 days`,
with one shown in that priority order. They describe observed eligible daily prices,
not all retail prices. Product-wide minima require available stock at the same color
and timestamp; selected-color history can include sold-out observations. Unknown stock
remains unknown. Catalog DTOs expose size arrays, not inventory or size-count metrics.

Raw data commits before atomic derived refresh. Failed refreshes preserve the previous
snapshot, produce a stale notice, and can be retried with `npm run refresh-catalog`.
Source categories and images require enriched artifacts or existing metadata: current
scrapers do not emit those optional fields. See the README for API/cursor errors,
migrations, DB_LOG_PATH logs, read-only profiling, and disposable-database E2E commands.

Highcharts free use is limited to qualifying personal/educational non-commercial use;
personal use is also non-professional. Any commercial/professional use requires license
reevaluation and the applicable commercial license. See the
[Highcharts EULA](https://shop.highcharts.com/license-eula).

## Context

Aritzia already offers a polished shopping experience, including product pages, app shopping, saved items, closet-oriented features, and some stock notification flows. This project should avoid simply recreating the storefront. The stronger opportunity is to provide shopping intelligence that helps users decide whether, when, and why to buy.

Core positioning:

```text
Aritzia tells users what is available now.
This app tells users whether, when, and why to buy.
```

## Existing Wedge

The current data model already supports:

- Price history
- Latest product/color prices
- Price and availability change detection
- Size/color-level stock tracking

These are the foundation for higher-value services.

## Candidate Services

### Sale Quality Score

Tell users whether a sale is actually good compared with historical pricing.

Example output:

```text
Current sale: 20% off
Historical low: 35% off
Usual markdown range: 10-25%
Recommendation: Wait
```

Why it matters:

- Turns price history into a decision.
- Helps users avoid buying during weak markdowns.
- Uses data already being collected.

### Restock Reliability Tracker

Track how often an item, color, or size comes back after selling out.

Example output:

```text
Black / XS restocked 4 times in the last 30 days.
Average time out of stock: 3.2 days.
Likelihood of restock: High.
```

Why it matters:

- Helps users decide whether to wait or buy another size/color.
- Adds context beyond a simple back-in-stock alert.

### Disappearing Product Watch

Track when products disappear from the site and later return.

Signals to capture:

- Product removed from site
- Product returned to site
- Price before removal
- Stock before removal
- Whether removal happened during a sale window

Why it matters:

- Creates transparency around products that vanish during sale periods.
- Differentiates the app from basic price trackers.

### Size-Specific Availability Intelligence

Track stock behavior by size and color, not just product-level availability.

Example output:

```text
Size S in Scarab has sold out 3 times this month.
Size M is consistently available.
Size XS usually restocks overnight.
```

Why it matters:

- Aritzia buying decisions are often size/color-specific.
- Product-level availability is too coarse for many shoppers.

### Buy / Wait Recommendation

Combine price, sale history, restock frequency, and stock risk into a simple recommendation.

Example statuses:

```text
Buy now: low stock + good discount
Wait: frequent restocks + weak discount
Watch: price stable but stock volatile
```

Why it matters:

- Converts raw tracking into product judgment.
- Gives users a clear next action.

### Wishlist Health Dashboard

Let users save or paste product URLs and monitor their watched items in one dashboard.

Dashboard sections:

- Items currently on sale
- Items near historical low
- Items at risk of selling out
- Items that disappeared
- Items restocked today

Why it matters:

- Creates a recurring use case.
- Gives users a reason to return even when they are not actively browsing.

### Similar Item Finder Within Aritzia

Suggest similar Aritzia products when a watched item is sold out or overpriced.

Similarity signals:

- Category
- Silhouette
- Fabric
- Brand line
- Color
- Price range
- Product name

Why it matters:

- Helps users continue shopping inside the Aritzia catalog.
- Useful when a desired color/size is unavailable.

### Color / Size Drop Monitor

Track when new colors or sizes appear on existing product pages.

Why it matters:

- Aritzia often rotates colors and variants.
- Users may care about a style more than a specific current color.

### Wardrobe Gap / Closet Planning

Provide analytical closet and wishlist insights.

Example insights:

```text
You already own three black contour tops.
This item matches five things in your wishlist.
You keep watching similar trousers; here are the best-value options.
```

Why it matters:

- Moves the product beyond alerts into planning.
- Could become a higher-retention feature later.

### Sale Event Intelligence

Track patterns during Clientele, Black Friday, archive sales, and other sale periods.

Signals:

- Categories discounted
- Average markdown by category
- Products removed before or during sale
- Products with meaningful discounts vs small discounts
- Items that return after a sale ends

Why it matters:

- Helps users prepare for major sale windows.
- Builds trust through historical transparency.

## Recommended Next Feature

Build **Sale Quality Score** after the current API response shaping milestone.

Reasons:

- It uses the existing price history foundation.
- It is simpler than full alerting or recommendation systems.
- It gives users a clear buying decision.
- It is differentiated from Aritzia's storefront experience.

Initial version:

```text
For a product/color:
- Current effective price
- Historical lowest price
- Highest observed price
- Average sale percent
- Current discount quality: weak, fair, good, best observed
```

Future version:

```text
Buy now / wait / watch recommendation based on:
- discount quality
- stock risk
- restock reliability
- sale event timing
```

## Product Principle

Avoid building another product listing page. The product should act like a shopping analyst: it should explain patterns, surface timing, and help users make better decisions.
