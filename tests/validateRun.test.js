/** @jest-environment node */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateRun } = require('../validateRun');

test('blocks incomplete colors and records every distinct issue before loading', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aritzia-validation-'));
  try {
    const linksPath = path.join(dir, 'links.csv');
    const detailsPath = path.join(dir, 'details.jsonl');
    const reportPath = path.join(dir, 'validation.json');
    const url = 'https://www.aritzia.com/en/product/example/123.html';
    fs.writeFileSync(linksPath, `URL,Categories\n${url},tops`);
    fs.writeFileSync(detailsPath, JSON.stringify({ product_link: url, product_name: 'Example', colors: [{ 1: { original_price: 'N/A', sale_price: 'N/A', sizes: [], issues: ['PRICE_MISSING', 'SIZE_EXTRACTION_FAILED'] } }] }));
    const result = validateRun({ linksPath, detailsPath, reportPath });
    expect(result.status).toBe('blocked');
    expect(new Set(result.findings.map(f => f.code))).toEqual(new Set(['PRICE_MISSING', 'SIZE_UNKNOWN', 'SIZE_EXTRACTION_FAILED']));
    expect(JSON.parse(fs.readFileSync(reportPath, 'utf8')).status).toBe('blocked');
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('admits a complete final record regardless of prior retry attempts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aritzia-validation-'));
  try {
    const linksPath = path.join(dir, 'links.csv');
    const detailsPath = path.join(dir, 'details.jsonl');
    const reportPath = path.join(dir, 'validation.json');
    const url = 'https://www.aritzia.com/en/product/example/123.html';
    fs.writeFileSync(linksPath, `URL,Categories\n${url},tops`);
    fs.writeFileSync(detailsPath, JSON.stringify({ product_link: url, product_name: 'Example', colors: [{ 1: { original_price: '$100', sale_price: 'N/A', sizes: [{ size: 'S', status: 'In Stock' }], size_outcome: 'observed', issues: [] } }], issues: [] }));
    expect(validateRun({ linksPath, detailsPath, reportPath }).status).toBe('passed');
  } finally { fs.rmSync(dir, { recursive: true }); }
});
