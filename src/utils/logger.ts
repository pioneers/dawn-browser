export class Logger {
  loggerName: string;

  constructor(loggerName: string) {
    this.loggerName = loggerName;
  }

  log = (message?: any, ...optionalParams: any[]) => {
    console.log(`${this.loggerName}: ${message}`, ...optionalParams);
  }
}