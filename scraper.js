const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const logger = require("./logError");

// Apply the stealth plugin to evade detection
chromium.use(stealth());

(async () => {
  // Launch browser (headless: false allows you to see the process)
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  logger.setLogFile(path.join(__dirname, "scraper.log"));

  // Block images, fonts, and media to speed up loading
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["image", "font", "media"].includes(type)) route.abort();
    else route.continue();
  });

  try {
    logger.emit("info", "Navigating to Aritzia to find categories...");
    await page.goto("https://www.aritzia.com/en/clothing", {
      waitUntil: "domcontentloaded",
      timeout: 60000, // Increased timeout for larger initial load
    });

    // Wait for the category elements to render to avoid getting 0 results
    logger.emit("info", "Waiting for categories to load...");
    await page.waitForSelector('a[data-testid="swiper-item"]');

    // Extract subcategory links
    const categoryLinks = await page.evaluate(() => {
      // Select elements and map to href in one step
      return Array.from(
        document.querySelectorAll('a[data-testid="swiper-item"]'),
        (a) => a.href
      ).filter(
        (href) =>
          href.includes("/en/clothing") &&
          href !== "https://www.aritzia.com/en/clothing"
      );
    });

    const uniqueCategories = [...new Set(categoryLinks)];
    logger.emit("info", `Found ${uniqueCategories.length} subcategories.`);

    const allProductLinks = new Set();

    for (const categoryUrl of uniqueCategories) {
      logger.emit("info", `Navigating to category: ${categoryUrl}`);
      try {
        // Append ?lastViewed=300 to try and load all items in this category at once
        const urlWithParams = categoryUrl.includes("?")
          ? `${categoryUrl}&lastViewed=300`
          : `${categoryUrl}?lastViewed=300`;

        await page.goto(urlWithParams, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        logger.emit("info", "Initial load complete. Scrolling...");
        await autoScroll(page);

        const productLinks = await page.evaluate(() => {
          const anchors = Array.from(
            document.querySelectorAll('a[href*="/en/product"]')
          );
          return anchors.map((a) => a.href.split("?")[0]);
        });

        productLinks.forEach((link) => allProductLinks.add(link));
        logger.emit(
          "info",
          `Total unique products so far: ${allProductLinks.size}`
        );
        logger.emit(
          "info",
          `Total unique products so far: ${allProductLinks.size}`
        );
      } catch (e) {
        logger.emit("error", `Failed to scrape category ${categoryUrl}:`, e);
      }
    }

    // Save links to CSV
    const uniqueLinks = [...allProductLinks];
    logger.emit("info", `Found total ${uniqueLinks.length} unique products.`);
    const csvContent = "URL\n" + uniqueLinks.join("\n");
    fs.writeFileSync("product_links.csv", csvContent);
    logger.emit("info", "Links saved to product_links.csv");
  } catch (error) {
    logger.emit("error", "Error during scraping:", error);
  } finally {
    await browser.close();
  }
})();

// Helper function to handle infinite scroll
async function autoScroll(page) {
  // Extract the total count from the <sup> sibling of the heading
  const targetCount = await page.evaluate(() => {
    const sup = document.querySelector('h1[data-testid="page-heading"] ~ sup');
    return sup ? parseInt(sup.innerText.replace(/\D/g, ""), 10) : 0;
  });

  logger.emit("info", `Target item count: ${targetCount}`);

  let previousCount = 0;
  let currentCount = await page.evaluate(() => {
    const anchors = Array.from(
      document.querySelectorAll('a[href*="/en/product"]')
    );
    return new Set(anchors.map((a) => a.href.split("?")[0])).size;
  });
  let noChangeCount = 0;

  while (noChangeCount < 2) {
    if (targetCount > 0 && currentCount >= targetCount) {
      logger.emit("info", "Reached target item count.");
      break;
    }

    previousCount = currentCount;

    // Scroll to bottom
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(2000);

    // Wait longer for new items to load (network can be slow with many items)
    await page.waitForTimeout(4000);
    // Scroll up a bit to trigger lazy loading or "load more" triggers
    await page.evaluate("window.scrollBy(0, -1000)");
    await page.waitForTimeout(1000);

    // Scroll back to bottom
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(3000);

    currentCount = await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll('a[href*="/en/product"]')
      );
      return new Set(anchors.map((a) => a.href.split("?")[0])).size;
    });

    logger.emit("info", `Scrolled... Products found: ${currentCount}`);

    if (currentCount === previousCount) {
      noChangeCount++;
      // Try to find and click a "Load More" button if scrolling didn't help
      const loadMoreBtn = page
        .locator('button:has-text("Load More"), button:has-text("Show More")')
        .first();
      if (await loadMoreBtn.isVisible()) {
        logger.emit("info", "Clicking 'Load More' button...");
        await loadMoreBtn.click({ force: true });
        await page.waitForTimeout(3000);
        noChangeCount = 0; // Reset counter since we took action
      } else {
        noChangeCount++;
      }
    } else {
      noChangeCount = 0;
    }
  }
}
