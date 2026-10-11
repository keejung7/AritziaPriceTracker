const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const logger = require("./logError"); // Use the single logger instance
const {
  SIZE_DROPDOWN_SELECTOR,
  extractSizesFromDropdown,
} = require("./sizeDropdown");

const NotAvailable = "N/A";
const DEFAULT_TIMEOUT_MS = process.env.CI ? 60000 : 30000;
const NAV_TIMEOUT_MS = 60000;
const PDP_READY_TIMEOUT_MS = process.env.CI ? 20000 : 15000;
const VARIANT_URL_TIMEOUT_MS = 5000;
const SIZE_UI_TIMEOUT_MS = 2000;
const SIZE_OPTIONS_TIMEOUT_MS = 2000;
const RETRY_DELAY_MS = 2000;
const BROWSER_CLOSE_TIMEOUT_MS = 15000;
const HEADLESS = process.env.HEADLESS !== "false";

// Apply stealth plugin to help avoid bot detection
chromium.use(stealth());
// --- Configuration ---
const inputCsvPath =
  process.env.PRODUCT_LINKS_PATH || path.join(__dirname, "product_links.csv");

const outputJsonPath =
  process.env.PRODUCT_DETAILS_PATH ||
  path.join(__dirname, "product_details.jsonl");

fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });

const logFile = path.join(__dirname, "details_scraper.log");

logger.setLogFile(logFile); // Configure the logger

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function parseProductLinkCsv(data) {
  const productsByUrl = new Map();

  data
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [url, categories = ""] = parseCsvLine(line);

      if (!url.startsWith("http")) {
        return;
      }

      if (!productsByUrl.has(url)) {
        productsByUrl.set(url, new Set());
      }

      categories
        .split("|")
        .map((category) => category.trim())
        .filter(Boolean)
        .forEach((category) => productsByUrl.get(url).add(category));
    });

  return [...productsByUrl].map(([url, categories]) => ({
    url,
    source_categories: [...categories],
  }));
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

async function getProductColorImageUrl(page, colorCode) {
  if (colorCode) {
    await page
      .waitForFunction(
        (selectedColorCode) => {
          const urls = Array.from(
            document.querySelectorAll(
              '[data-testid="product-images"] a[href], [data-testid="product-images"] img[src]',
            ),
            (element) => element.href || element.src || "",
          );

          return urls.some((url) => url.includes(`_${selectedColorCode}_`));
        },
        colorCode,
        { timeout: 2500 },
      )
      .catch(() => {});
  }

  return page.evaluate(() => {
    const gallery = document.querySelector('[data-testid="product-images"]');
    if (!gallery) return null;

    const imageLink = gallery.querySelector("a");
    if (imageLink?.href) return imageLink.href;

    const image = gallery.querySelector('img[src*="/image/upload/"]');
    return image?.src || null;
  });
}

async function getSwatchImageUrl(swatch) {
  const swatchImageUrl = await swatch
    .evaluate((button) => {
      const images = Array.from(button.querySelectorAll("img"));
      const getImageUrls = (image) => [
        image.getAttribute("src"),
        image.src,
        image.currentSrc,
      ];
      const swatchImage =
        images.find((image) => {
          return getImageUrls(image).some((url) => url?.includes("_sw"));
        }) || images[0];

      if (!swatchImage) return null;

      return (
        getImageUrls(swatchImage).find((url) => url?.includes("_sw")) ||
        swatchImage.getAttribute("src") ||
        swatchImage.src ||
        swatchImage.currentSrc ||
        null
      );
    })
    .catch(() => null);

  return getCloudinarySizedImageUrl(swatchImageUrl, 50, 50);
}

function getCloudinarySizedImageUrl(url, width, height) {
  if (!url) return null;

  const uploadPath = "/image/upload/";
  const uploadIndex = url.indexOf(uploadPath);
  if (uploadIndex === -1) return url;

  const transformStart = uploadIndex + uploadPath.length;
  const transformEnd = url.indexOf("/", transformStart);
  if (transformEnd === -1) return url;

  const existingTransforms = url.slice(transformStart, transformEnd);
  const sizeTransforms = `c_fill,w_${width},h_${height}`;

  if (
    existingTransforms.includes(`w_${width}`) &&
    existingTransforms.includes(`h_${height}`)
  ) {
    return url;
  }

  return `${url.slice(
    0,
    transformStart,
  )}${existingTransforms},${sizeTransforms}${url.slice(transformEnd)}`;
}

(async () => {
  // 1. Read the list of unique product URLs from the cleaned CSV
  let productsToScrape;
  try {
    const data = fs.readFileSync(inputCsvPath, "utf8");
    productsToScrape = parseProductLinkCsv(data);
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
    `Found ${productsToScrape.length} unique product links to scrape for details.`,
  );

  // 2. Set up Playwright
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  // GitHub Actions runners have limited resources (2 vCPU cores).
  // Reducing concurrency prevents CPU overload and timeouts.
  const CONCURRENCY = process.env.CI ? 2 : 4;

  // Worker function to scrape a single product
  const scrapeProduct = async ({ url, source_categories }) => {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let context;
      let page;

      try {
        // Create a new context for each page to ensure isolation (cookies, etc.)
        context = await browser.newContext();
        // Set default timeout (60s for CI, 30s for local)
        context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
        page = await context.newPage();

        // Block fonts and media to speed up loading, but allow images
        await page.route("**/*", (route) => {
          const type = route.request().resourceType();
          if (["font", "media"].includes(type)) route.abort();
          else route.continue();
        });

        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: NAV_TIMEOUT_MS,
        });

        // Wait for color swatches to ensure they are loaded
        const swatchLocator = page.locator(
          '[data-testid="color-swatches"] button',
        );
        await swatchLocator.first().waitFor({
          state: "visible",
          timeout: PDP_READY_TIMEOUT_MS,
        });

        // get product name and brand
        const name = await page
          .locator('[data-testid="product-name-text"]')
          .innerText()
          .catch(() => null);
        const brand = await page
          .locator('[data-testid="product-brand-text"]')
          .innerText()
          .catch(() => null);
        const colorMap = new Map();
        const swatches = await swatchLocator.evaluateAll((buttons) =>
          buttons.map((button) => {
            const images = Array.from(button.querySelectorAll("img"));
            const getImageUrls = (image) => [
              image.getAttribute("src"),
              image.src,
              image.currentSrc,
            ];
            const swatchImage =
              images.find((image) =>
                getImageUrls(image).some((url) => url?.includes("_sw")),
              ) || images[0];

            return {
              colorText: button.getAttribute("aria-label"),
              hasIndicator: !!button.querySelector(
                'div[data-design-system="indicator"]',
              ),
              isPressed: button.getAttribute("aria-pressed") === "true",
              swatchImageUrl: swatchImage
                ? getImageUrls(swatchImage).find((url) => url?.includes("_sw")) ||
                  swatchImage.getAttribute("src") ||
                  swatchImage.src ||
                  swatchImage.currentSrc ||
                  null
                : null,
            };
          }),
        );

        if (swatches.length > 0) {
          for (const swatchInfo of swatches) {
            const { colorText, hasIndicator, swatchImageUrl } = swatchInfo;

            if (!colorText) {
              continue;
            }

            const expectedColorId =
              swatchImageUrl?.match(/_(\d+)_sw(?:[?#]|$)/)?.[1] ?? null;
            const matchingSwatches = page
              .getByRole("button", {
                name: colorText,
                exact: true,
              })
              .filter({ visible: true });

            try {
              if ((await matchingSwatches.count()) === 0) {
                throw new Error("No visible swatch matched this color.");
              }

              const swatch = matchingSwatches.first();
              if ((await swatch.getAttribute("aria-pressed")) !== "true") {
                await swatch.scrollIntoViewIfNeeded();
                await swatch.click({ force: true });
              }

              await page.waitForFunction(
                ({ colorText, expectedColorId }) => {
                  const selected = Array.from(
                    document.querySelectorAll(
                      '[data-testid="color-swatches"] button',
                    ),
                  ).some((button) => {
                    const style = getComputedStyle(button);
                    const rect = button.getBoundingClientRect();

                    return (
                      button.getAttribute("aria-label") === colorText &&
                      button.getAttribute("aria-pressed") === "true" &&
                      style.display !== "none" &&
                      style.visibility !== "hidden" &&
                      rect.width > 0 &&
                      rect.height > 0 &&
                      (expectedColorId === null ||
                        new URL(location.href).searchParams.get("color") ===
                          expectedColorId)
                    );
                  });

                  return selected;
                },
                { colorText, expectedColorId },
                { timeout: VARIANT_URL_TIMEOUT_MS },
              );
            } catch (selectionError) {
              logger.emit(
                "warn",
                `Skipping swatch ${colorText} for ${url} - ${selectionError.message}`,
              );
              continue;
            }

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
            const sizeDropdown = page
              .locator(SIZE_DROPDOWN_SELECTOR)
              .filter({ visible: true });
            const hasSizeDropdown = (await sizeDropdown.count()) > 0;

            let sizes = [];
            if (hasSizeDropdown) {
              try {
                sizes = await extractSizesFromDropdown(page, {
                  uiTimeoutMs: SIZE_UI_TIMEOUT_MS,
                  optionTimeoutMs: SIZE_OPTIONS_TIMEOUT_MS,
                });
              } catch (sizeError) {
                logger.emit(
                  "warn",
                  `Skipping size extraction for ${url} - ${sizeError.message}`,
                );
              }
            }

            const colorCode = getColorCodeFromUrl(page.url());
            const productColorImageUrl = await getProductColorImageUrl(
              page,
              colorCode,
            );
            if (colorCode && !colorMap.has(colorCode)) {
              colorMap.set(colorCode, {
                color_text: colorText,
                swatch_image_url: swatchImageUrl,
                product_color_image_url: productColorImageUrl,
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
          source_categories,
          product_name: name,
          product_brand: brand,
          scraped_at: new Date().toISOString(),
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
            source_categories,
            scraped_at: new Date().toISOString(),
            colors: [],
          };
          outputStream.write(JSON.stringify(productData) + "\n");
        }
      } finally {
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
      }
      // Optional: wait a bit before retrying
      if (attempt < maxRetries) await delay(RETRY_DELAY_MS);
    }
  };

  // 3. Process URLs in parallel batches
  const queue = [...productsToScrape];
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
  await new Promise((resolve, reject) => {
    outputStream.once("error", reject);
    outputStream.end(resolve);
  });

  logger.emit(
    "info",
    `\n✅ Scraping complete. All data saved to ${outputJsonPath}`,
  );

  const browserClosed = await closeBrowserWithTimeout(browser);
  if (!browserClosed) {
    logger.emit(
      "warn",
      `Browser close timed out after ${BROWSER_CLOSE_TIMEOUT_MS}ms; exiting after outputs were flushed.`,
    );
    process.exit(0);
  }
})();

async function closeBrowserWithTimeout(browser) {
  let timeout;
  const closed = await Promise.race([
    browser.close().then(() => true).catch(() => true),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve(false), BROWSER_CLOSE_TIMEOUT_MS);
    }),
  ]);

  clearTimeout(timeout);
  return closed;
}
