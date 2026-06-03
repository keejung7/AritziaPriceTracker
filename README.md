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
GET /api/prices/latest
```
