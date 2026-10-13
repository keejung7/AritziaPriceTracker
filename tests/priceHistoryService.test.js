/** @jest-environment node */
const { formatLatestPrices, formatProductPriceHistory } = require("../app/services/priceHistoryService");

const product = {
  product_no: 123456,
  product_full_url: "https://www.aritzia.com/us/en/product/test-product/123456.html",
  product_name: "Test Product",
  product_brand: "Aritzia",
};

// Assert the committed legacy contract. Imported additive stock/metric fields
// are outside catalog client work and intentionally do not drive these tests.
describe("priceHistoryService", () => {
  test("groups history by color and normalizes prices and dates", () => {
    const rows = [
      { ...product, color_id: "1274", color_name: "BLACK", original_price: "100", sale_price: null, sale_percent: null, scraped_date: new Date("2026-06-03T10:00:00.000Z") },
      { ...product, color_id: "1274", color_name: "BLACK", original_price: "100", sale_price: "70", sale_percent: "0.3", scraped_date: "2026-06-04T10:00:00.000Z" },
      { ...product, color_id: "18891", color_name: "BROWN", original_price: "80", sale_price: "60", sale_percent: "0.25", scraped_date: "2026-06-04T10:00:00.000Z" },
    ];
    expect(formatProductPriceHistory(rows)).toMatchObject({
      productNo: '123456',
      productUrl: "https://www.aritzia.com/us/en/product/test-product/123456.html",
      productName: "Test Product",
      productBrand: "Aritzia",
      colors: [
        { colorId: "1274", colorName: "BLACK", history: [
          { originalPrice: 100, salePrice: null, salePercent: null, scrapedDate: "2026-06-03T10:00:00.000Z" },
          { originalPrice: 100, salePrice: 70, salePercent: 0.3, scrapedDate: "2026-06-04T10:00:00.000Z" },
        ] },
        { colorId: "18891", colorName: "BROWN", history: [
          { originalPrice: 80, salePrice: 60, salePercent: 0.25, scrapedDate: "2026-06-04T10:00:00.000Z" },
        ] },
      ],
    });
  });

  test("formats latest prices with numeric prices, nullable values, and ISO dates", () => {
    expect(formatLatestPrices([
      { ...product, color_id: "18891", color_name: "BROWN", original_price: "80", sale_price: "60", sale_percent: "0.25", scraped_date: new Date("2026-06-03T10:00:00.000Z") },
      { ...product, color_id: "1274", color_name: "BLACK", original_price: null, sale_price: null, sale_percent: null, scraped_date: "2026-06-04T10:00:00.000Z" },
    ])).toMatchObject([
      { productNo: 123456, productName: "Test Product", colorId: "18891", colorName: "BROWN", originalPrice: 80, salePrice: 60, salePercent: 0.25, scrapedDate: "2026-06-03T10:00:00.000Z" },
      { productNo: 123456, productName: "Test Product", colorId: "1274", colorName: "BLACK", originalPrice: null, salePrice: null, salePercent: null, scrapedDate: "2026-06-04T10:00:00.000Z" },
    ]);
  });
});
