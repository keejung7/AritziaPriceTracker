/** @jest-environment node */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { productId, resolveProducts } = require('../scripts/scrape_products');

test('resolves only requested IDs from saved product links and retains their categories', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aritzia-targeted-'));
  try {
    const links = path.join(dir, 'product_links.csv');
    fs.writeFileSync(links, `URL,Categories\nhttps://www.aritzia.com/en/product/bailey-aviator-jacket/134678.html,coats-jackets\nhttps://www.aritzia.com/en/product/sorrenti-aviator-jacket/136363.html,coats-jackets\nhttps://www.aritzia.com/en/product/other/999.html,tops\n`);
    expect(resolveProducts(['136363', '134678'], [links])).toEqual([
      { url: 'https://www.aritzia.com/en/product/sorrenti-aviator-jacket/136363.html', categories: 'coats-jackets' },
      { url: 'https://www.aritzia.com/en/product/bailey-aviator-jacket/134678.html', categories: 'coats-jackets' },
    ]);
    expect(resolveProducts(['134678', '134678'], [links])).toHaveLength(1);
    expect(resolveProducts(['https://www.aritzia.com/en/product/new/123.html'], [links])).toEqual([
      { url: 'https://www.aritzia.com/en/product/new/123.html', categories: '' },
    ]);
    expect(() => resolveProducts(['123'], [links])).toThrow('No saved product URL for 123');
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('rejects non-product URLs before scraping or loading', () => {
  expect(productId('https://www.aritzia.com/en/product/coat/123.html')).toBe('123');
  for (const url of ['http://www.aritzia.com/en/product/coat/123.html',
    'https://www.aritzia.com.evil.test/en/product/coat/123.html',
    'https://www.aritzia.com/en/clothing',
    'https://www.aritzia.com/en/product/coat/123.html?redirect=elsewhere']) {
    expect(() => resolveProducts([url], [])).toThrow('Invalid product ID or Aritzia product URL');
  }
});
