/** @jest-environment node */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadValidatedArtifact } = require('../db/db');

test('loads only admitted products and excludes quarantined products from the catalog', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aritzia-partial-loader-'));
  try {
    const inputPath = path.join(dir, 'product_details_run.jsonl');
    const linksPath = path.join(dir, 'links.csv');
    const reportPath = path.join(dir, 'validation.json');
    const acceptedPath = path.join(dir, 'accepted.jsonl');
    const quarantinePath = path.join(dir, 'quarantine.jsonl');
    fs.writeFileSync(inputPath, '{}\n');
    fs.writeFileSync(linksPath, 'URL,Categories\n');
    const report = {
      status: 'partial', acceptedProducts: 1, quarantinedProducts: 1,
      acceptedPath, quarantinePath, quarantinedProductNos: [456], findings: [{}], links: 2, products: 2,
    };
    const parsed = [{ product: { product_no: 123 } }];
    const rows = {
      products: [{ product_no: 123 }], categories: [], productCategories: [],
      colors: [], productColors: [], priceSnapshots: [], stockSnapshots: [],
    };
    const validate = jest.fn(() => report);
    const parse = jest.fn(() => parsed);
    const collect = jest.fn(() => rows);
    const save = jest.fn(async () => ({ products: 1 }));
    const refresh = jest.fn(async () => ({ snapshotId: '17' }));
    const logger = { info: jest.fn() };

    const result = await loadValidatedArtifact({
      pool: {}, inputPath, linksPath, reportPath, acceptedPath, quarantinePath,
      validate, parse, collect, save, refresh, logger,
    });

    expect(parse).toHaveBeenCalledWith(acceptedPath);
    expect(save).toHaveBeenCalledWith({}, rows);
    expect(refresh).toHaveBeenCalledWith({}, { excludedProductNos: [456] });
    expect(result).toMatchObject({ report, affectedRows: { products: 1 }, catalog: { snapshotId: '17' } });
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('does not write or refresh when structural validation blocks the run', async () => {
  const save = jest.fn();
  const refresh = jest.fn();
  await expect(loadValidatedArtifact({
    pool: {}, inputPath: 'details', linksPath: 'links', reportPath: 'report',
    validate: () => ({ status: 'blocked', acceptedProducts: 0, quarantinedProducts: 2, findings: [], links: 2, products: 0 }),
    parse: jest.fn(), collect: jest.fn(), save, refresh, logger: { info: jest.fn() },
  })).rejects.toThrow('Artifact validation blocked database load');
  expect(save).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
