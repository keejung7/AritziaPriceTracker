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

test('admits clean products and quarantines each faulty product as a whole', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aritzia-validation-'));
  try {
    const linksPath = path.join(dir, 'links.csv');
    const detailsPath = path.join(dir, 'details.jsonl');
    const reportPath = path.join(dir, 'validation.json');
    const acceptedPath = path.join(dir, 'accepted.jsonl');
    const quarantinePath = path.join(dir, 'quarantine.jsonl');
    const cleanUrl = 'https://www.aritzia.com/en/product/clean/123.html';
    const faultyUrl = 'https://www.aritzia.com/en/product/faulty/456.html';
    const clean = { product_link: cleanUrl, product_name: 'Clean', colors: [{ 1: { original_price: '$100', sale_price: 'N/A', sizes: [{ size: 'S', status: 'In Stock' }], size_outcome: 'observed', issues: [] } }], issues: [] };
    const faulty = { product_link: faultyUrl, product_name: 'Faulty', colors: [{ 2: { original_price: '$80', sale_price: 'N/A', sizes: [{ size: 'M', status: 'In Stock' }], size_outcome: 'observed', issues: [] } }], issues: ['SWATCH_SELECTION_FAILED'] };
    fs.writeFileSync(linksPath, `URL,Categories\n${cleanUrl},tops\n${faultyUrl},tops`);
    fs.writeFileSync(detailsPath, `${JSON.stringify(clean)}\n${JSON.stringify(faulty)}\n`);

    const result = validateRun({ linksPath, detailsPath, reportPath, acceptedPath, quarantinePath });

    expect(result).toMatchObject({
      status: 'partial',
      acceptedProducts: 1,
      quarantinedProducts: 1,
      quarantinedProductNos: [456],
      acceptedPath,
      quarantinePath,
    });
    expect(fs.readFileSync(acceptedPath, 'utf8').trim()).toBe(JSON.stringify(clean));
    expect(fs.readFileSync(quarantinePath, 'utf8').trim()).toBe(JSON.stringify(faulty));
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('keeps structural run failures blocked instead of partially ingesting', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aritzia-validation-'));
  try {
    const linksPath = path.join(dir, 'links.csv');
    const detailsPath = path.join(dir, 'details.jsonl');
    const reportPath = path.join(dir, 'validation.json');
    const acceptedPath = path.join(dir, 'accepted.jsonl');
    const quarantinePath = path.join(dir, 'quarantine.jsonl');
    const url = 'https://www.aritzia.com/en/product/example/123.html';
    fs.writeFileSync(linksPath, `URL,Categories\n${url},tops`);
    fs.writeFileSync(detailsPath, 'not-json\n');

    const result = validateRun({ linksPath, detailsPath, reportPath, acceptedPath, quarantinePath });

    expect(result.status).toBe('blocked');
    expect(result.acceptedProducts).toBe(0);
    expect(fs.existsSync(acceptedPath)).toBe(false);
    expect(fs.existsSync(quarantinePath)).toBe(false);
  } finally { fs.rmSync(dir, { recursive: true }); }
});
