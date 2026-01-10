const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

// Apply stealth plugin to help avoid bot detection
chromium.use(stealth());

// --- Configuration ---
const inputCsvPath = path.join(__dirname, "product_links.csv");
const outputJsonPath = path.join(__dirname, "product_details.jsonl");
// ---------------------

/**
 * Extracts the 'color' query parameter from a URL string.
 * @param {string} urlString - The URL to parse.
 * @returns {string|null} The color code or null if not found.
 */
function getColorCodeFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.searchParams.get("color");
  } catch (e) {
    console.error(`Could not parse URL: ${urlString}`);
    return null;
  }
}

(async () => {
  // 1. Read the list of unique product URLs from the cleaned CSV
  let urls;
  try {
    const data = fs.readFileSync(inputCsvPath, "utf8");
    urls = data
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("http")); // Basic validation

    // Deduplicate URLs
    urls = [...new Set(urls)];
  } catch (error) {
    console.error(`Error reading input file: ${inputCsvPath}`);
    console.error(error.message);
    return; // Exit if we can't read the links
  }

  console.log(
    `Found ${urls.length} unique product links to scrape for details.`
  );

  // 2. Set up Playwright
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  // Concurrency limit
  const CONCURRENCY = 5;

  // Worker function to scrape a single product
  const scrapeProduct = async (url) => {
    // Create a new context for each page to ensure isolation (cookies, etc.)
    const context = await browser.newContext();
    const page = await context.newPage();

    // Block images, fonts, and media to speed up loading and reduce bandwidth usage
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["media"].includes(type)) route.abort();
      else route.continue();
    });

    try {
      console.log(`\nScraping: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Wait for color swatches to ensure they are loaded
      await page.waitForSelector('[data-testid="color-swatches"] button', {
        timeout: 10000,
      });

      const swatchLocator = page.locator(
        '[data-testid="color-swatches"] button'
      );
      const swatchCount = await swatchLocator.count();

      const colorMap = new Map();

      if (swatchCount > 0) {
        for (let i = 0; i < swatchCount; i++) {
          const swatch = swatchLocator.nth(i);
          // Check for indicator (e.g. Sale, New) before clicking, as clicking might affect state
          const hasIndicator =
            (await swatch
              .locator('div[data-design-system="indicator"]')
              .count()) > 0;

          // only click if current swatch is not already selected
          if (!swatch.getAttribute("aria-pressed")) {
            await swatch.click({ force: true });
            await page.waitForTimeout(2000); // Wait for URL and text to update
          }

          // Handle multiple color text elements.
          const colorTexts = await page
            .locator('[data-testid="product-color-text"]')
            .allInnerTexts();

          let colorText = "";
          const colorCode = getColorCodeFromUrl(page.url());
          // Case 1: Colors are in single row, color is the entire selected text
          // Case 2: Colors are in multiple rows, color comes after dash
          if (colorTexts.length <= 1) {
            colorText = colorTexts[0].trim();
          } else {
            const textWithDash = colorTexts.find((t) => t.includes("—"));

            colorText = textWithDash ? textWithDash.split("—")[1].trim() : "";
          }

          // Extract Prices
          const originalPriceText = await page
            .locator('[data-testid="product-list-price-text"]')
            .innerText()
            .catch(() => "N/A");

          let salePriceText = "N/A";

          if (hasIndicator) {
            const salePriceLocator = page.locator(
              'p[data-testid="product-list-sale-text"]'
            );
            if (
              (await salePriceLocator.count()) > 0 &&
              (await salePriceLocator.isVisible())
            ) {
              salePriceText = await salePriceLocator.innerText();
            }
          }

          // Calculate Sale Percent
          let salePercent = null;
          const parsePrice = (str) => {
            if (!str || str === "N/A") return null;
            const match = str.match(/[\d,.]+/);
            return match ? parseFloat(match[0].replace(/,/g, "")) : null;
          };

          const originalPriceVal = parsePrice(originalPriceText);
          const salePriceVal = parsePrice(salePriceText);

          if (originalPriceVal && salePriceVal) {
            salePercent = (originalPriceVal - salePriceVal) / originalPriceVal;
          }

          if (colorCode && !colorMap.has(colorCode)) {
            colorMap.set(colorCode, {
              color_text: colorText,
              original_price: originalPriceText,
              sale_price: salePriceText,
              sale_percent: salePercent,
            });
            console.log(
              `  - Found color: ${colorText} (${colorCode}) | Price: ${originalPriceText} | Sale: ${salePriceText}`
            );
          }
        }
      }

      const productData = {
        product_link: url,
        colors: Array.from(colorMap, ([key, value]) => ({ [key]: value })),
      };
      // Save progress after each product to prevent data loss
      fs.appendFileSync(outputJsonPath, JSON.stringify(productData) + "\n");
    } catch (error) {
      console.error(`  -> Failed to scrape ${url}: ${error.message}`);
    } finally {
      await page.close();
      await context.close();
    }
  };

  // 3. Process URLs in parallel batches
  const queue = [...urls];
  const workers = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const url = queue.shift();
          if (url) await scrapeProduct(url);
        }
      })()
    );
  }

  await Promise.all(workers);

  console.log(`\n✅ Scraping complete. All data saved to ${outputJsonPath}`);

  await browser.close();
})();
