const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");

class ScraperLogger extends EventEmitter {
  constructor() {
    super();
    this.logFile = path.join(__dirname, "scraper.log");
    this.stream = fs.createWriteStream(this.logFile, { flags: "a" });

    // The logger 'listens' to these events
    this.on("info", this._logInfo);
    this.on("error", this._logError);
  }

  setLogFile(filePath) {
    this.logFile = filePath;
    if (this.stream) {
      this.stream.end();
    }
    this.stream = fs.createWriteStream(this.logFile, { flags: "a" });
  }

  _logInfo(msg) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] INFO: ${msg}\n`;
    this.stream.write(logMessage);
    console.log(msg);
  }

  _logError(msg, err) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${msg} ${err || ""}\n`;
    this.stream.write(logMessage);
    console.error(msg, err);
  }
}

const logger = new ScraperLogger();
module.exports = logger;
