const fs = require("fs");
const path = require("path");

function createDbLogger({
  now = () => new Date(),
  info = console.info,
  warn = console.warn,
  error = console.error,
  logPath = process.env.DB_LOG_PATH,
} = {}) {
  const format = (message) => `${now().toISOString()} [DB] ${message}`;
  const writeToFile = logPath
    ? (message) => {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, `${message}\n`, "utf8");
      }
    : () => {};

  return {
    info: (message) => {
      const formatted = format(message);
      info(formatted);
      writeToFile(formatted);
    },
    error: (message) => {
      const formatted = format(message);
      error(formatted);
      writeToFile(formatted);
    },
    warn: (message) => {
      const formatted = format(message);
      warn(formatted);
      writeToFile(formatted);
    },
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
