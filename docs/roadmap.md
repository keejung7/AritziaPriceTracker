# Roadmap

## Status Legend

- Not started
- In progress
- Blocked
- Done

## Milestones

### Milestone 1: Price History Query Layer

Status: Done

Goal:
Build reusable query functions for price history data.

Tickets:

- [x] Refactor `db/queries.js` into reusable exports
- [x] Add `getProductPriceHistory`
- [x] Add `getProductPriceForDate`
- [x] Add `getLatestPrices`
- [x] Support optional filters
- [x] Guard manual `main()` runner

Acceptance Criteria:

- Query functions can be imported without side effects
- Latest prices return one row per product/color
- Product history supports optional color/date filters

### Milestone 2: Price History Indexes

Status: Done

Tickets:

- [x] Add `002_price_history_indexes.sql`
- [x] Run migration on Neon
- [x] Verify indexes exist

### Milestone 3: Next.js API Routes

Status: Done

Tickets:

- [x] Add Next.js app setup
- [x] Add TypeScript config
- [x] Add price history route
- [x] Add price by date route
- [x] Add latest prices route
- [x] Validate route inputs
- [x] Verify endpoints manually

### Milestone 4: API Response Transformation

Status: Done

Tickets:

- [x] Add `services/priceHistoryService.ts`
- [x] Define raw DB row type
- [x] Define API response types
- [x] Add `formatPriceRow`
- [x] Add `formatProductPriceHistory`
- [x] Convert numeric strings to numbers
- [x] Convert dates to ISO strings
- [x] Update API routes to use service formatters
- [x] Verify API responses no longer expose snake_case DB fields

Acceptance Criteria:

- Product history response is grouped by color
- Latest/date responses use camelCase
- Numeric fields are numbers or null
- DB column names are hidden from API consumers

### Milestone 5: Automated Tests for API and Service Layer

Status: Not started

Goal:
Add automated coverage for formatter behavior and API input validation without requiring a live Neon database for every test.

Tickets:

- [ ] Add test setup for TypeScript service tests
- [ ] Add fixture rows for price history responses
- [ ] Test `formatProductPriceHistory`
- [ ] Test `formatLatestPrices`
- [ ] Test `formatProductPriceForDate`
- [ ] Verify numeric strings convert to numbers
- [ ] Verify null numeric values remain null
- [ ] Verify dates convert to ISO strings
- [ ] Add API validation tests for invalid product numbers
- [ ] Add API validation tests for invalid dates
- [ ] Add API validation tests for invalid limits

Acceptance Criteria:

- Formatter tests run without a live database
- Product history formatter groups rows by color
- Flat price formatters return camelCase arrays
- Invalid API inputs return `400`
- Tests can be run with one documented command

### Milestone 6: UI Foundation

Status: Not started

Goal:
Build the first usable frontend views for browsing latest prices and inspecting a product's price history.

Tickets:

- [ ] Add shared API fetch helpers
- [ ] Add latest prices page
- [ ] Add product price history page
- [ ] Add basic loading and error states
- [ ] Add product/color metadata display
- [ ] Add color selector or color-group display
- [ ] Add simple price history table
- [ ] Add empty-state handling for products with no history

Acceptance Criteria:

- Users can view latest product/color prices
- Users can view grouped price history for a product
- UI consumes transformed API responses, not raw DB rows
- Loading, error, and empty states are handled

### Milestone 7: Price History Visualization

Status: Not started

Goal:
Turn product price history into visual charts that make price changes easy to understand.

Tickets:

- [ ] Choose charting library or lightweight chart approach
- [ ] Add chart data adapter for grouped color history
- [ ] Plot effective price over time
- [ ] Support original price vs sale price display
- [ ] Add color filtering for chart series
- [ ] Add tooltip values for price/date
- [ ] Validate chart behavior with multiple colors

Acceptance Criteria:

- Product history page displays a readable price chart
- Each color can be inspected independently
- Sale price and original price are clearly distinguishable
- Chart handles missing/null sale prices gracefully

### Milestone 8: Sale Quality Score

Status: Not started

Goal:
Use price history to tell users whether the current sale price is weak, fair, good, or near the best observed price.

Tickets:

- [ ] Define sale quality scoring rules
- [ ] Add query/service support for historical low and current price
- [ ] Add sale quality response fields
- [ ] Add tests for scoring rules
- [ ] Display sale quality on latest prices
- [ ] Display sale quality on product history page

Acceptance Criteria:

- Current discount is compared against historical prices
- API returns stable sale quality fields
- UI can show a clear sale quality label
- Scoring logic is covered by automated tests
