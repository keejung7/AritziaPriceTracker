# Aritzia Price Tracker

This project scrapes product data from the Aritzia website using Playwright. It collects product URLs, cleans them, scrapes detailed product information (colors, prices, sale status), and generates an HTML view for analysis.

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

- **Output:** `product_links.csv`

### 2. Clean Links

Removes duplicates and formats the links for the detail scraper.

```bash
node clean_links.js
```

- **Input:** `product_links.csv`
- **Output:** `unique_products.csv`

### 3. Scrape Details

Visits each unique product page to extract colors, original prices, and sale prices.

```bash
node details_scraper.js
```

- **Input:** `unique_products.csv`
- **Output:** `product_details.jsonl`

### 4. Generate View

Creates a sortable HTML table to visualize the data.

```bash
node generate_view.js
```

- **Input:** `product_details.jsonl`
- **Output:** `view.html` (Open this file in your browser)
