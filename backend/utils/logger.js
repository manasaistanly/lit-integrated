const fs = require('fs');
const path = require('path');

/**
 * Logger utility
 * Logs messages to console and optionally to a file
 */
class Logger {
  constructor(options = {}) {
    this.logToFile = options.logToFile || false;
    this.logFilePath = options.logFilePath || path.join(__dirname, '../logs/app.log');

    // Ensure logs folder exists if logging to file
    if (this.logToFile) {
      const logDir = path.dirname(this.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  /**
   * Log info messages
   * @param  {...any} messages
   */
  info(...messages) {
    const logMessage = `[INFO] [${new Date().toISOString()}] ${messages.join(' ')}`;
    console.log(logMessage);
    this.writeToFile(logMessage);
  }

  /**
   * Log error messages
   * @param  {...any} messages
   */
  error(...messages) {
    const logMessage = `[ERROR] [${new Date().toISOString()}] ${messages.join(' ')}`;
    console.error(logMessage);
    this.writeToFile(logMessage);
  }

  /**
   * Internal function to write logs to file
   * @param {string} message
   */
  writeToFile(message) {
    if (this.logToFile) {
      fs.appendFileSync(this.logFilePath, message + '\n', 'utf8');
    }
  }
}

// Export a singleton logger instance
module.exports = new Logger({
  logToFile: true, // set to false if you don't want file logging
  logFilePath: path.join(__dirname, '../logs/app.log')
});
