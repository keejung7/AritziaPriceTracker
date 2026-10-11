# Aritzia Price Tracker

This project scrapes product data from the Aritzia website using Playwright. It collects product URLs and categories, scrapes color, price, size, and availability details, then stores price and stock history in PostgreSQL.

Data collection will be performed daily, ensuring changes in price, removal/addition of items will be tracked.

## Prerequisites

- Node.js installed on your machine.
- `npm` (Node Package Manager).

## Installation

1.  Install the required dependencies:
    ```bash
    npm install
    ```

## Usage Sequence

Run the scripts in the following order to perform a complete scrape:

### 1. Scrape Product URLs

Navigates the clothing categories and collects all product links.

```bash
node scraper.js
```

- **Output:** `product_links.csv` with `URL` and pipe-separated `Categories` columns

### 2. Scrape Details

Visits each unique product page to extract colors, original prices, and sale prices.

```bash
node details_scraper.js
```

- **Input:** `product_links.csv`
- **Output:** `product_details.jsonl`, including `source_categories` from the link scrape

### 3. Save to PostgreSQL

Parses the JSONL output and upserts product metadata, source categories, color images, price snapshots, and stock snapshots.

```bash
node db/db.js
```

Set `DATABASE_URL` for a hosted database, or `POSTGRES_USER` and `POSTGRES_USER_PASSWORD` for local PostgreSQL.

For a new database, apply `db/schema.sql`. For an existing database, apply migrations `db/migrations/001` through `004` in order.

### 4. Generate View

Creates a sortable HTML table to visualize the data.

```bash
node generate_view.js
```

- **Input:** `product_details.jsonl`
- **Output:** `view.html` (Open this file in your browser)
<img width="1900" height="697" alt="Screenshot 2026-01-09 at 4 34 49 PM" src="https://github.com/user-attachments/assets/b9ebb735-4b6b-4ca8-9ca1-ece6e95ce5f3" />


Run the full scraper and database import with:

```bash
npm run pipeline
```

The pipeline saves timestamped link and detail files under `data/YYYY-MM-DD/` and imports the detail file into PostgreSQL.
