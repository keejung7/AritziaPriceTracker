function createDbLogger({
  now = () => new Date(),
  info = console.info,
  error = console.error,
} = {}) {
  const format = (message) => `${now().toISOString()} [DB] ${message}`;

  return {
    info: (message) => info(format(message)),
    error: (message) => error(format(message)),
  };
}

function summarizeRows(rows) {
  return {
    products: rows.products.length,
    categories: rows.categories.length,
    productCategories: rows.productCategories.length,
    colors: rows.colors.length,
    productColors: rows.productColors.length,
    priceSnapshots: rows.priceSnapshots.length,
    stockSnapshots: rows.stockSnapshots.length,
  };
}

function formatCounts(counts) {
  return Object.entries(counts)
    .map(([name, count]) => `${name}=${count}`)
    .join(", ");
}

module.exports = { createDbLogger, summarizeRows, formatCounts };
