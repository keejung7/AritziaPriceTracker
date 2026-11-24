const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateRun } = require('../validateRun');

const root = path.resolve(__dirname, '..');

function productId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.aritzia.com' || parsed.search || parsed.hash) return null;
    return parsed.pathname.match(/^\/en\/product\/[^/]+\/(\d+)\.html$/)?.[1] ?? null;
  } catch { return null; }
}

function linkFiles(dataDir = path.join(root, 'data')) {
  const files = [];
  if (fs.existsSync(dataDir)) {
    for (const day of fs.readdirSync(dataDir).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse()) {
      const directory = path.join(dataDir, day);
      if (!fs.statSync(directory).isDirectory()) continue;
      for (const file of fs.readdirSync(directory).filter(name => /^product_links_.*\.csv$/.test(name)).sort().reverse()) {
        files.push(path.join(directory, file));
      }
    }
  }
  files.push(path.join(root, 'product_links.csv'));
  return files;
}

function resolveProducts(inputs, files = linkFiles()) {
  if (!inputs.length) throw new Error('Provide one or more product IDs or Aritzia product URLs.');
  const ids = inputs.map(input => {
    const id = /^\d+$/.test(input) ? input : productId(input);
    if (!id) throw new Error(`Invalid product ID or Aritzia product URL: ${input}`);
    return id;
  });
  const wanted = new Set(ids);
  const found = new Map();
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(1)) {
      const [url, categories = ''] = line.split(',');
      const id = productId(url);
      if (wanted.has(id) && !found.has(id)) found.set(id, { url, categories });
    }
    if (found.size === wanted.size) break;
  }
  const result = ids.map((id, index) => {
    const existing = found.get(id);
    if (existing) return existing;
    const url = inputs[index];
    if (productId(url) === id) return { url, categories: '' };
    throw new Error(`No saved product URL for ${id}; pass its full Aritzia product URL.`);
  });
  return [...new Map(result.map(product => [product.url, product])).values()];
}

function run(script, env) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root, env: { ...process.env, ...env }, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed with status ${result.status ?? result.signal}`);
}

function main(inputs) {
  const products = resolveProducts(inputs);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = path.join(root, 'data', 'manual', `product_${timestamp}`);
  fs.mkdirSync(output, { recursive: true });
  const linksPath = path.join(output, `product_links_${timestamp}.csv`);
  const detailsPath = path.join(output, `product_details_${timestamp}.jsonl`);
  const reportPath = path.join(output, `validation_${timestamp}.json`);
  const acceptedPath = path.join(output, `accepted_product_details_${timestamp}.jsonl`);
  const quarantinePath = path.join(output, `quarantine_product_details_${timestamp}.jsonl`);
  fs.writeFileSync(linksPath, `URL,Categories\n${products.map(p => `${p.url},${p.categories}`).join('\n')}\n`);
  const env = { PRODUCT_LINKS_PATH: linksPath, PRODUCT_DETAILS_PATH: detailsPath,
    VALIDATION_PATH: reportPath, ACCEPTED_DETAILS_PATH: acceptedPath,
    QUARANTINE_DETAILS_PATH: quarantinePath, DB_LOG_PATH: path.join(output, `db_load_${timestamp}.log`) };
  console.log(`Scraping ${products.length} product(s). Artifacts: ${output}`);
  run('details_scraper.js', env);
  const report = validateRun({ linksPath, detailsPath, reportPath, acceptedPath, quarantinePath });
  if (report.status !== 'passed') throw new Error(`Targeted scrape was ${report.status}; no database changes made. See ${reportPath}`);
  run('db/db.js', env);
  console.log(`Catalog refreshed for ${products.map(p => productId(p.url)).join(', ')}.`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { productId, resolveProducts, main };
