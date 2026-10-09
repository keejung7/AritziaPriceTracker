const path = require("path");

describe("db/parser", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.PRODUCT_DETAILS_PATH;
  });

  test("parses product details fixture into SQL-ready records", () => {
    process.env.PRODUCT_DETAILS_PATH = path.join(
      __dirname,
      "fixtures",
      "product_details_small.jsonl.fixture",
    );

    const { getProductDataForInsert } = require("../db/parser");
    const result = getProductDataForInsert();

    expect(result).toHaveLength(1);

    const [product] = result;

    expect(product.product).toEqual({
      product_no: 123456,
      product_slug: "product/test-product/123456.html",
      product_full_url:
        "https://www.aritzia.com/us/en/product/test-product/123456.html",
      product_name: "Test Product",
      product_brand: "Aritzia",
    });

    expect(product.categories).toEqual([
      { category_slug: "dresses" },
      { category_slug: "wilfred" },
    ]);
    expect(product.productCategories).toEqual([
      { product_no: 123456, category_slug: "dresses" },
      { product_no: 123456, category_slug: "wilfred" },
    ]);

    expect(product.colors).toEqual([
      {
        color_id: "1274",
        color_name: "BLACK",
        swatch_image_url: "https://cdn.example.test/1274_sw.jpg",
      },
      {
        color_id: "18891",
        color_name: "RICH MOCHA BROWN",
        swatch_image_url: null,
      },
    ]);

    expect(product.productColors).toEqual([
      {
        product_no: 123456,
        color_id: "1274",
        product_color_image_url: "https://cdn.example.test/1274_on_a.jpg",
      },
      {
        product_no: 123456,
        color_id: "18891",
        product_color_image_url: null,
      },
    ]);

    expect(product.priceSnapshots).toEqual([
      {
        product_no: 123456,
        color_id: "1274",
        original_price: 100,
        sale_price: null,
        sale_percent: null,
        scraped_date: new Date("2026-06-02T10:00:00.000Z"),
      },
      {
        product_no: 123456,
        color_id: "18891",
        original_price: 80,
        sale_price: 60,
        sale_percent: 0.25,
        scraped_date: new Date("2026-06-02T10:00:00.000Z"),
      },
    ]);

    expect(product.stockSnapshots).toEqual([
      {
        product_no: 123456,
        color_id: "1274",
        product_size: "S",
        product_status: "In Stock",
        scraped_date: new Date("2026-06-02T10:00:00.000Z"),
      },
      {
        product_no: 123456,
        color_id: "1274",
        product_size: "M",
        product_status: "Sold Out Online",
        scraped_date: new Date("2026-06-02T10:00:00.000Z"),
      },
      {
        product_no: 123456,
        color_id: "18891",
        product_size: "S",
        product_status: "Only a Few Left",
        scraped_date: new Date("2026-06-02T10:00:00.000Z"),
      },
    ]);
  });
});
