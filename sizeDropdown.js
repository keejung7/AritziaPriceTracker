const SIZE_DROPDOWN_SELECTOR =
  '[data-testid="pdp-size-dropdown"] button#pdp-size-dropdown';
const SIZE_OPTION_SELECTOR = 'ul[role="listbox"] li[role="option"]';

async function extractSizesFromDropdown(
  page,
  { uiTimeoutMs = 5000, optionTimeoutMs = 5000, attempts = 2 } = {},
) {
  const dropdown = page
    .locator(SIZE_DROPDOWN_SELECTOR)
    .filter({ visible: true })
    .first();
  const sizeOptions = page
    .locator(SIZE_OPTION_SELECTOR)
    .filter({ visible: true });

  await dropdown.waitFor({ state: "visible", timeout: uiTimeoutMs });

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if ((await dropdown.getAttribute("aria-expanded")) !== "true") {
        await dropdown.click({ timeout: uiTimeoutMs });
      }

      await sizeOptions.first().waitFor({
        state: "visible",
        timeout: optionTimeoutMs,
      });

      return sizeOptions.evaluateAll((items) =>
        items.map((item) => ({
          size: item.querySelector("label")?.innerText.trim(),
          status:
            item
              .querySelector('p[data-design-system="text"]')
              ?.innerText.trim() ?? "In Stock",
        })),
      );
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;

      if ((await dropdown.getAttribute("aria-expanded")) === "true") {
        await dropdown.click({ timeout: uiTimeoutMs }).catch(() => {});
      }
    }
  }

  throw lastError;
}

module.exports = {
  SIZE_DROPDOWN_SELECTOR,
  SIZE_OPTION_SELECTOR,
  extractSizesFromDropdown,
};
