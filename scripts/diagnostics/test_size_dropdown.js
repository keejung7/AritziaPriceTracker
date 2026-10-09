const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PRODUCT_URL =
  process.env.PRODUCT_URL ||
  "https://www.aritzia.com/en/product/agency-pant/127437.html";
const HEADLESS = process.env.HEADLESS !== "false";
const PDP_READY_TIMEOUT_MS = 15000;
const NAV_TIMEOUT_MS = 60000;
const COLOR_SELECTION_TIMEOUT_MS = 5000;
const DEFAULT_SIZE_OPTION_TIMEOUTS_MS = [250, 1000, 5000];
const SIZE_OPTION_TIMEOUTS_MS = parseTimeouts(
  process.env.SIZE_OPTION_TIMEOUTS_MS,
);
const SWATCH_SELECTOR = '[data-testid="color-swatches"] button';
const LEGACY_SIZE_DROPDOWN_SELECTOR =
  '[data-testid="pdp-size-dropdown"] button#dropdown';
const CANDIDATE_SIZE_DROPDOWN_SELECTOR =
  '[data-testid="pdp-size-dropdown"] button#pdp-size-dropdown';
const SIZE_OPTION_SELECTOR = 'ul[role="listbox"] li[role="option"]';

chromium.use(stealth());

function parseTimeouts(value) {
  if (!value) return DEFAULT_SIZE_OPTION_TIMEOUTS_MS;

  const timeouts = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((timeout) => Number.isInteger(timeout) && timeout > 0);

  if (timeouts.length === 0) {
    throw new Error(
      "SIZE_OPTION_TIMEOUTS_MS must be comma-separated positive integers.",
    );
  }

  return [...new Set(timeouts)];
}

async function readSwatches(page) {
  return page.locator(SWATCH_SELECTOR).evaluateAll((buttons) =>
    buttons
      .map((button) => {
        const images = Array.from(button.querySelectorAll("img"));
        const imageUrls = images.flatMap((image) => [
          image.getAttribute("src"),
          image.src,
          image.currentSrc,
        ]);
        const swatchImageUrl = imageUrls.find((url) => url?.includes("_sw"));
        const colorIdMatch = swatchImageUrl?.match(/_(\d+)_sw(?:[?#]|$)/);
        const style = window.getComputedStyle(button);
        const rect = button.getBoundingClientRect();

        return {
          label: button.getAttribute("aria-label"),
          testId: button.getAttribute("data-testid"),
          colorId: colorIdMatch?.[1] ?? null,
          isVisible:
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0,
        };
      })
      .filter((swatch) => swatch.label),
  );
}

async function selectColor(page, { label, colorId }) {
  const matchingSwatches = page
    .getByRole("button", { name: label, exact: true })
    .filter({ visible: true });
  const matchingCount = await matchingSwatches.count();

  if (matchingCount === 0) {
    throw new Error(`No visible swatch found for ${label}.`);
  }

  const swatch = matchingSwatches.first();

  if ((await swatch.getAttribute("aria-pressed")) === "true") {
    const selectedColorId = new URL(page.url()).searchParams.get("color");
    if (colorId != null && selectedColorId !== colorId) {
      throw new Error(
        `Swatch ${label} is pressed but URL color is ${selectedColorId ?? "missing"}; expected ${colorId}.`,
      );
    }
    return selectedColorId;
  }

  await swatch.click({ force: true });
  await page.waitForFunction(
    ({ selectedLabel, expectedColorId }) => {
      const selectedButton = Array.from(
        document.querySelectorAll('[data-testid="color-swatches"] button'),
      ).find(
        (button) => {
          const style = window.getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return (
            button.getAttribute("aria-label") === selectedLabel &&
            button.getAttribute("aria-pressed") === "true" &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        },
      );
      const selectedColorId = new URL(window.location.href).searchParams.get(
        "color",
      );

      return (
        selectedButton != null &&
        (expectedColorId == null || selectedColorId === expectedColorId)
      );
    },
    { selectedLabel: label, expectedColorId: colorId },
    { timeout: COLOR_SELECTION_TIMEOUT_MS },
  );

  return new URL(page.url()).searchParams.get("color");
}

async function inspectColor(page, label, timeoutMs) {
  const legacyDropdownCount = await page
    .locator(LEGACY_SIZE_DROPDOWN_SELECTOR)
    .count();
  const candidateDropdown = page.locator(CANDIDATE_SIZE_DROPDOWN_SELECTOR);
  const candidateDropdownCount = await candidateDropdown.count();
  const selectedColorId = new URL(page.url()).searchParams.get("color");
  const originalPrice = await page
    .locator('[data-testid="product-list-price-text"]')
    .innerText()
    .catch(() => null);
  const salePrice = await page
    .locator('p[data-testid="product-list-sale-text"]')
    .first()
    .innerText()
    .catch(() => null);

  if (candidateDropdownCount === 0) {
    const sizeRelatedElements = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          '[data-testid*="size" i], [id*="size" i], [aria-label*="size" i], [role="listbox"]',
        ),
      )
        .slice(0, 40)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          testId: element.getAttribute("data-testid"),
          id: element.id || null,
          role: element.getAttribute("role"),
          ariaLabel: element.getAttribute("aria-label"),
          text: element.innerText?.trim().slice(0, 120) ?? "",
        })),
    );

    return {
      color: label,
      selectedColorId,
      timeoutMs,
      legacyDropdownCount,
      candidateDropdownCount,
      originalPrice,
      salePrice,
      status: "dropdown-not-found",
      optionCount: 0,
      sizeRelatedElements,
      sizes: [],
    };
  }

  try {
    await candidateDropdown.first().click({ force: true });
    const options = page.locator(SIZE_OPTION_SELECTOR);
    const waitStartedAt = Date.now();
    await options.first().waitFor({
      state: "attached",
      timeout: timeoutMs,
    });
    const waitDurationMs = Date.now() - waitStartedAt;
    const sizes = await options.evaluateAll((items) =>
      items.map((item) => ({
        size: item.querySelector("label")?.innerText.trim() ?? null,
        status:
          item
            .querySelector('p[data-design-system="text"]')
            ?.innerText.trim() ?? "In Stock",
      })),
    );

    return {
      color: label,
      selectedColorId,
      timeoutMs,
      legacyDropdownCount,
      candidateDropdownCount,
      originalPrice,
      salePrice,
      status: sizes.length > 0 ? "options-found" : "options-empty",
      optionCount: sizes.length,
      waitDurationMs,
      sizes,
    };
  } catch (error) {
    return {
      color: label,
      selectedColorId,
      timeoutMs,
      legacyDropdownCount,
      candidateDropdownCount,
      originalPrice,
      salePrice,
      status: "option-wait-timeout-or-error",
      optionCount: await page.locator(SIZE_OPTION_SELECTOR).count(),
      error: error.message,
      sizes: [],
    };
  }
}

async function runTimeoutTrial(browser, timeoutMs) {
  const context = await browser.newContext();
  try {
    context.setDefaultTimeout(30000);
    const page = await context.newPage();

    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (["font", "media"].includes(resourceType)) route.abort();
      else route.continue();
    });

    const response = await page.goto(PRODUCT_URL, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });

    const swatches = page.locator(`${SWATCH_SELECTOR}:visible`);
    try {
      await swatches.first().waitFor({
        state: "visible",
        timeout: PDP_READY_TIMEOUT_MS,
      });
    } catch (error) {
      return {
        productUrl: PRODUCT_URL,
        headless: HEADLESS,
        timeoutMs,
        pageStatus: response?.status() ?? null,
        finalUrl: page.url(),
        pageTitle: await page.title().catch(() => null),
        pageTextSnippet: (await page.locator("body").innerText().catch(() => ""))
          .slice(0, 1200),
        swatchesFound: await swatches.count(),
        trialError: error.message,
        results: [],
      };
    }

    const allSwatches = await readSwatches(page);
    const seenLabels = new Set();
    const colorList = allSwatches.filter((swatch) => {
      if (!swatch.isVisible || seenLabels.has(swatch.label)) return false;
      seenLabels.add(swatch.label);
      return true;
    });
    const results = [];

    for (const swatch of colorList) {
      try {
        const selectedColorId = await selectColor(page, swatch);
        results.push({
          ...(await inspectColor(page, swatch.label, timeoutMs)),
          expectedColorId: swatch.colorId,
          selectedColorId,
          selectionVerified:
            swatch.colorId == null || selectedColorId === swatch.colorId,
        });
      } catch (error) {
        results.push({
          color: swatch.label,
          expectedColorId: swatch.colorId,
          timeoutMs,
          status: "color-selection-error",
          error: error.message,
          sizes: [],
        });
      }
    }

    return {
      productUrl: PRODUCT_URL,
      headless: HEADLESS,
      timeoutMs,
      pageStatus: response?.status() ?? null,
      finalUrl: page.url(),
      pageTitle: await page.title().catch(() => null),
      legacyDropdownSelector: LEGACY_SIZE_DROPDOWN_SELECTOR,
      candidateDropdownSelector: CANDIDATE_SIZE_DROPDOWN_SELECTOR,
      optionSelector: SIZE_OPTION_SELECTOR,
      swatchesFound: colorList.length,
      swatchesInDom: allSwatches.length,
      hiddenSwatches: allSwatches.filter((swatch) => !swatch.isVisible).length,
      results,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const trials = [];
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    for (const timeoutMs of SIZE_OPTION_TIMEOUTS_MS) {
      console.log(`Running ${timeoutMs} ms trial for ${PRODUCT_URL}`);
      try {
        trials.push(await runTimeoutTrial(browser, timeoutMs));
      } catch (error) {
        trials.push({
          timeoutMs,
          trialError: error.message,
          results: [],
        });
      }
    }
  } finally {
    await browser.close();
  }

  const report = {
    createdAt: new Date().toISOString(),
    productUrl: PRODUCT_URL,
    headless: HEADLESS,
    trials: trials.map((trial) => ({
      timeoutMs: trial.timeoutMs,
      trialError: trial.trialError ?? null,
      pageStatus: trial.pageStatus ?? null,
      finalUrl: trial.finalUrl ?? null,
      pageTitle: trial.pageTitle ?? null,
      pageTextSnippet: trial.pageTextSnippet ?? null,
      swatchesFound: trial.swatchesFound,
      swatchesInDom: trial.swatchesInDom ?? null,
      hiddenSwatches: trial.hiddenSwatches ?? null,
      statusCounts: (trial.results ?? []).reduce((counts, result) => {
        counts[result.status] = (counts[result.status] || 0) + 1;
        return counts;
      }, {}),
      results: trial.results ?? [],
    })),
  };

  const reportPath = path.join(
    os.tmpdir(),
    `aritzia-size-dropdown-${Date.now()}.json`,
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Diagnostic report saved to ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
