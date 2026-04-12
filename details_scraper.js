const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const logger = require("./logError"); // Use the single logger instance

const NotAvailable = "N/A";

// Apply stealth plugin to help avoid bot detection
chromium.use(stealth());

// --- Configuration ---
const inputCsvPath = path.join(__dirname, "product_links.csv");
const outputJsonPath = path.join(__dirname, "product_details.jsonl");
const logFile = path.join(__dirname, "details_scraper.log");

logger.setLogFile(logFile); // Configure the logger

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
    logger.emit("error", `Error reading input file: ${inputCsvPath}`);
    logger.emit("error", error.message);
    return; // Exit if we can't read the links
  }

  // Create a write stream. flags: 'w' overwrites the file (starts fresh).
  // If you want to append to an existing file from a previous run, change 'w' to 'a'.
  const outputStream = fs.createWriteStream(outputJsonPath, { flags: "w" });

  logger.emit(
    "info",
    `Found ${urls.length} unique product links to scrape for details.`,
  );

  // 2. Set up Playwright
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  // GitHub Actions runners have limited resources (2 vCPU cores).
  // Reducing concurrency prevents CPU overload and timeouts.
  const CONCURRENCY = process.env.CI ? 2 : 4;

  // Worker function to scrape a single product
  const scrapeProduct = async (url) => {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let context;
      let page;

      try {
        // Create a new context for each page to ensure isolation (cookies, etc.)
        context = await browser.newContext();
        // Set default timeout (60s for CI, 30s for local)
        context.setDefaultTimeout(process.env.CI ? 60000 : 30000);
        page = await context.newPage();

        // Block fonts and media to speed up loading, but allow images
        await page.route("**/*", (route) => {
          const type = route.request().resourceType();
          if (["font", "media"].includes(type)) route.abort();
          else route.continue();
        });

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

        // Wait for color swatches to ensure they are loaded
        await page.waitForSelector('[data-testid="color-swatches"] button', {
          timeout: process.env.CI ? 20000 : 15000,
        });

        const swatchLocator = page.locator(
          '[data-testid="color-swatches"] button',
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
            const isPressed = await swatch.getAttribute("aria-pressed");
            if (isPressed !== "true") {
              await Promise.all([
                page.waitForURL((url) => url.searchParams.has("color"), {
                  timeout: 5000,
                }),
                swatch.click({ force: true }),
              ]);
              // Wait for URL and text to update
            }

            // Read color text
            const colorText = await swatch.getAttribute("aria-label");

            // Extract Prices
            const originalPriceText = await page
              .locator('[data-testid="product-list-price-text"]')
              .innerText()
              .catch(() => NotAvailable);

            let salePriceText = NotAvailable;

            if (hasIndicator) {
              const salePrice = page
                .locator('p[data-testid="product-list-sale-text"]')
                .first();

              try {
                salePriceText = (await salePrice.isVisible())
                  ? (await salePrice.innerText()).trim()
                  : null;
              } catch {
                salePriceText = NotAvailable;
              }
            }

            // Calculate Sale Percent
            let salePercent = null;
            const parsePrice = (str) => {
              if (!str || str === NotAvailable) return null;
              const match = str.match(/[\d,.]+/);
              return match ? parseFloat(match[0].replace(/,/g, "")) : null;
            };

            const originalPriceVal = parsePrice(originalPriceText);
            const salePriceVal = parsePrice(salePriceText);

            if (originalPriceVal && salePriceVal) {
              salePercent = parseFloat(
                ((originalPriceVal - salePriceVal) / originalPriceVal).toFixed(
                  2,
                ),
              );
            }

            // Extract sizing and stock availability
            const sizeDropdown = page.locator(
              '[data-testid="pdp-size-dropdown"] button#dropdown',
            );
            const hasSizeDropdown = (await sizeDropdown.count()) > 0;

            let sizes = [];
            if (hasSizeDropdown) {
              await sizeDropdown.click();
              await page.waitForSelector(
                'ul[role="listbox"] li[role="option"]',
                { timeout: 5000 },
              );
              sizes = await page.evaluate(() => {
                return Array.from(
                  document.querySelectorAll(
                    'ul[role="listbox"] li[role="option"]',
                  ),
                ).map((li) => {
                  const size = li.querySelector("label")?.innerText.trim();
                  const statusEl = li.querySelector(
                    'p[data-design-system="text"]',
                  );
                  return {
                    size,
                    status: statusEl ? statusEl.innerText.trim() : "In Stock",
                  };
                });
              });
            }

            const colorCode = getColorCodeFromUrl(page.url());
            if (colorCode && !colorMap.has(colorCode)) {
              colorMap.set(colorCode, {
                color_text: colorText,
                original_price: originalPriceText,
                sale_price: salePriceText,
                sale_percent: salePercent,
                sizes,
              });
            }
          }
        }

        const productData = {
          product_link: url,
          colors: Array.from(colorMap, ([key, value]) => ({ [key]: value })),
        };

        // Write to stream (much faster than appendFileSync)
        outputStream.write(JSON.stringify(productData) + "\n");
        return; // Success, exit the retry loop
      } catch (error) {
        // If we failed all retries, save the product with empty colors so it's not lost
        if (attempt === maxRetries) {
          logger.emit(
            "error",
            `Failed after ${maxRetries} attempts: ${url} - ${error.message}`,
          );
          const productData = {
            product_link: url,
            colors: [],
          };
          outputStream.write(JSON.stringify(productData) + "\n");
        }
      } finally {
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
      }
      // Optional: wait a bit before retrying
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 2000));
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
      })(),
    );
  }

  await Promise.all(workers);
  outputStream.end(); // Close the stream when done

  logger.emit(
    "info",
    `\n✅ Scraping complete. All data saved to ${outputJsonPath}`,
  );

  await browser.close();
})();
