const { extractSizesFromDropdown } = require("../sizeDropdown");

function createPage({ failFirstOptionsWait = false } = {}) {
  let uiReady = false;
  let clickCount = 0;
  let optionsWaitCount = 0;

  const dropdown = {
    filter: ({ visible }) => {
      if (visible !== true) throw new Error("dropdown must be filtered to visible");
      return dropdown;
    },
    first: () => dropdown,
    waitFor: async ({ state }) => {
      if (state !== "visible") throw new Error("dropdown must be visible");
      uiReady = true;
    },
    isEnabled: async () => uiReady,
    click: async () => {
      if (!uiReady) throw new Error("clicked before the server UI was ready");
      clickCount++;
    },
    getAttribute: async (name) => {
      if (name !== "aria-expanded") return null;
      return clickCount > optionsWaitCount ? "true" : "false";
    },
  };

  const options = {
    filter: ({ visible }) => {
      if (visible !== true) throw new Error("options must be filtered to visible");
      return options;
    },
    first: () => options,
    waitFor: async ({ state }) => {
      if (state !== "visible") throw new Error("options must be visible");
      optionsWaitCount++;
      if (failFirstOptionsWait && optionsWaitCount === 1) {
        throw new Error("server had not loaded options yet");
      }
    },
    evaluateAll: async () => [
      { size: "S", status: "In Stock" },
      { size: "M", status: "Only a Few Left" },
    ],
  };

  const page = {
    locator: (selector) => {
      if (
        selector ===
        '[data-testid="pdp-size-dropdown"] button#pdp-size-dropdown'
      ) {
        return dropdown;
      }
      if (selector === 'ul[role="listbox"] li[role="option"]') {
        return options;
      }
      throw new Error(`unexpected selector: ${selector}`);
    },
  };

  return {
    page,
    getClickCount: () => clickCount,
  };
}

describe("extractSizesFromDropdown", () => {
  test("waits for the visible PDP dropdown and its visible server-loaded items", async () => {
    const fixture = createPage();

    await expect(extractSizesFromDropdown(fixture.page)).resolves.toEqual([
      { size: "S", status: "In Stock" },
      { size: "M", status: "Only a Few Left" },
    ]);
    expect(fixture.getClickCount()).toBe(1);
  });

  test("retries opening when the first click does not load visible items", async () => {
    const fixture = createPage({ failFirstOptionsWait: true });

    await expect(extractSizesFromDropdown(fixture.page)).resolves.toHaveLength(2);
    expect(fixture.getClickCount()).toBe(2);
  });
});
