const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");

class ScraperLogger extends EventEmitter {
  constructor() {
    super();
    this.logFile = path.join(__dirname, "scraper.log");

    // The logger 'listens' to these events
    this.on("info", this._logInfo);
    this.on("error", this._logError);
  }

  setLogFile(filePath) {
    this.logFile = filePath;
  }

  _logInfo(msg) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(this.logFile, `[${timestamp}] INFO: ${msg}\n`);
    console.log(msg);
  }

  _logError(msg, err) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(
      this.logFile,
      `[${timestamp}] ERROR: ${msg} ${err || ""}\n`
    );
    console.error(msg, err);
  }
}

const logger = new ScraperLogger();
module.exports = logger;
