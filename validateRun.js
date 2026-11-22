const fs = require('fs');
const path = require('path');

function readLinks(filePath, addFinding) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    if (lines.shift() !== 'URL,Categories') addFinding('INVALID_LINK_HEADER', 'run');
    const links = lines.map(line => line.split(',')[0]);
    if (!links.length) addFinding('EMPTY_LINKS', 'run');
    return links;
  } catch (error) {
    addFinding('LINKS_UNREADABLE', 'run', error.message);
    return [];
  }
}

function readProducts(filePath, addFinding) {
  const products = [];
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      try {
        products.push(JSON.parse(line));
      } catch (error) {
        addFinding('INVALID_DETAIL_JSON', `line:${index + 1}`, error.message);
      }
    });
  } catch (error) {
    addFinding('DETAILS_UNREADABLE', 'run', error.message);
  }
  return products;
}

function checkDiscovery(filePath, addFinding) {
  if (!filePath) return;
  try {
    const discovery = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const categories = discovery.categories;
    if (!discovery.complete || !categories?.length || categories.some(category => !category.complete)) {
      addFinding('CATEGORY_INCOMPLETE', 'run');
    }
  } catch (error) {
    addFinding('DISCOVERY_UNREADABLE', 'run', error.message);
  }
}

function checkColor(color, scope, addFinding) {
  const priceMissing = !color ||
    (color.original_price === 'N/A' && color.sale_price === 'N/A') ||
    (!color.original_price && !color.sale_price);
  if (priceMissing) addFinding('PRICE_MISSING', scope);

  const sizesUnknown = !Array.isArray(color?.sizes) ||
    (!color.sizes.length && color.size_outcome !== 'not_applicable');
  if (sizesUnknown) addFinding('SIZE_UNKNOWN', scope);

  for (const code of color?.issues || []) addFinding(code, scope);
}

function checkProduct(product, addFinding) {
  const url = product.product_link;
  const issues = new Set(product.issues || []);
  if (!product.product_name) issues.add('PRODUCT_NAME_MISSING');
  if (!Array.isArray(product.colors) || !product.colors.length) issues.add('PRODUCT_COLORS_MISSING');
  for (const code of issues) addFinding(code, url);

  for (const wrapper of product.colors || []) {
    for (const [colorId, color] of Object.entries(wrapper)) {
      checkColor(color, `${url}#${colorId}`, addFinding);
    }
  }
}

function productNoFromUrl(url) {
  const match = String(url || '').match(/\/(\d+)\.html$/);
  return match ? Number(match[1]) : null;
}

function checkCoverage(links, products, addFinding) {
  const expected = new Set(links);
  if (expected.size !== links.length) addFinding('DUPLICATE_LINK', 'run');

  const seen = new Set();
  for (const product of products) {
    const url = product.product_link;
    if (!url || seen.has(url)) addFinding('DUPLICATE_OR_MISSING_PRODUCT', url || 'unknown');
    seen.add(url);
    if (!expected.has(url)) addFinding('UNEXPECTED_PRODUCT', url || 'unknown');
  }
  for (const url of expected) {
    if (!seen.has(url)) addFinding('DETAIL_MISSING', url);
  }
}

function writeReport(reportPath, report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const temporary = `${reportPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2));
  fs.renameSync(temporary, reportPath);
}

function writeJsonLines(filePath, products) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  const content = products.length ? `${products.map(product => JSON.stringify(product)).join('\n')}\n` : '';
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, filePath);
}

function artifactPaths(reportPath, acceptedPath, quarantinePath) {
  const directory = path.dirname(reportPath);
  const suffix = path.basename(reportPath).replace(/^validation_/, '').replace(/\.json$/, '');
  return {
    acceptedPath: acceptedPath || path.join(directory, `accepted_product_details_${suffix}.jsonl`),
    quarantinePath: quarantinePath || path.join(directory, `quarantine_product_details_${suffix}.jsonl`),
  };
}

function validateRun({ linksPath, detailsPath, reportPath, discoveryPath, acceptedPath, quarantinePath }) {
  const findings = [];
  const findingKeys = new Set();
  const addFinding = (code, scope, detail) => {
    const key = `${code}\u0000${scope}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings.push({ code, scope, ...(detail ? { detail } : {}) });
  };

  const links = readLinks(linksPath, addFinding);
  const products = readProducts(detailsPath, addFinding);
  checkDiscovery(discoveryPath, addFinding);
  checkCoverage(links, products, addFinding);

  const structuralFindingCount = findings.length;
  const accepted = [];
  const quarantined = [];
  for (const product of products) {
    const before = findings.length;
    checkProduct(product, addFinding);
    if (findings.length === before) accepted.push(product);
    else quarantined.push(product);
  }

  const outputPaths = artifactPaths(reportPath, acceptedPath, quarantinePath);
  const blocked = structuralFindingCount > 0 || accepted.length === 0;
  const status = blocked ? 'blocked' : quarantined.length ? 'partial' : 'passed';
  const quarantinedProductNos = [...new Set(quarantined
    .map(product => productNoFromUrl(product.product_link))
    .filter(Number.isInteger))];

  const report = {
    status,
    links: links.length,
    products: products.length,
    acceptedProducts: blocked ? 0 : accepted.length,
    quarantinedProducts: blocked ? products.length : quarantined.length,
    quarantinedProductNos: blocked ? [] : quarantinedProductNos,
    acceptedPath: blocked ? null : outputPaths.acceptedPath,
    quarantinePath: blocked ? null : outputPaths.quarantinePath,
    findings,
  };
  if (!blocked) {
    writeJsonLines(outputPaths.acceptedPath, accepted);
    writeJsonLines(outputPaths.quarantinePath, quarantined);
  }
  writeReport(reportPath, report);
  return report;
}

module.exports = { validateRun };
