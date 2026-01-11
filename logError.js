const fs = require("fs");
const path = require("path");

let currentLogFile = path.join(__dirname, "scraper.log");

const setLogFile = (filePath) => {
  currentLogFile = filePath;
};

// ---------------------
// Simple logger
const log = (msg) => {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(currentLogFile, `[${timestamp}] ${msg}\n`);
  console.log(msg);
};
const logError = (msg, err) => {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(
    currentLogFile,
    `[${timestamp}] ERROR: ${msg} ${err || ""}\n`
  );
  console.error(msg, err);
};

module.exports = { log, logError, setLogFile };
