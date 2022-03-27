/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

// It seems, that in webpack5 externals are not working like in webpack4.
// In webpack5 there is always an error if the import is not available.
// If you need the types during development, switch the lines marked with SWITCH

// SWITCH
// import * as log4javascript from 'log4javascript';

// SWITCH
interface log4javascript {
  getLogger: any;
  BrowserConsoleAppender: any;
  PopUpAppender: any;
  PatternLayout: any;
  getRootLogger: any;
  setEnabled: any;
  Level: any;
}

interface Log4javascriptWindow extends Window {
  // SWITCH
  // log4javascript: typeof log4javascript;
  log4javascript: log4javascript;
}

declare const window: Log4javascriptWindow;

interface LoggingConfig {
  basicLogging?: boolean;
  log4javascript?: {
    enabled: boolean;
    switchToPopupAppender?: boolean;
    loggerLevels?: [
      {
        name: string;
        level: string;
      }
    ];
  };
}

export interface Logger {
  trace(...messages: any[]): void;
  debug(...messages: any[]): void;
  info(...messages: any[]): void;
  warn(...messages: any[]): void;
  error(...messages: any[]): void;
}

let basicLoggingEnabled = false;

export class LoggerFacade {
  private logger?: Logger;
  private name?: string;

  constructor(logger: Logger | string) {
    if (typeof logger === 'object') {
      this.logger = logger;
    } else if (typeof logger === 'string') {
      let nameFilled = '[' + logger + ']';

      // fill name with spaces to get a clear logging
      while (nameFilled.length < 20) {
        nameFilled += ' ';
      }

      this.name = nameFilled;
    } else {
      console.warn('logger initialization not correct!');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertMessagesToString(messages: any[]): string {
    let text = '';
    let first = true;
    messages.forEach(message => {
      if (first) {
        first = false;
      } else {
        text += ' ';
      }
      if (typeof message === 'object') {
        text += JSON.stringify(message);
      } else {
        text += message;
      }
    });
    return text;
  }

  public trace(...messages: any[]): void {
    if (this.logger) {
      this.logger.trace(this.convertMessagesToString(messages));
    }
    // no basic logging for trace level (too much messages)
  }

  public debug(...messages: any[]): void {
    if (this.logger) {
      this.logger.debug(this.convertMessagesToString(messages));
    }
    if (basicLoggingEnabled) {
      console.debug(this.name, this.convertMessagesToString(messages));
    }
  }

  public info(...messages: any[]): void {
    if (this.logger) {
      this.logger.info(this.convertMessagesToString(messages));
    }
    if (basicLoggingEnabled) {
      console.info(this.name, this.convertMessagesToString(messages));
    }
  }

  public warn(...messages: any[]): void {
    if (this.logger) {
      this.logger.warn(this.convertMessagesToString(messages));
    }
    if (basicLoggingEnabled) {
      console.warn(this.name, this.convertMessagesToString(messages));
    }
  }

  public error(...messages: any[]): void {
    if (this.logger) {
      this.logger.error(this.convertMessagesToString(messages));
    }
    if (basicLoggingEnabled) {
      console.error(this.name, this.convertMessagesToString(messages));
    }
  }
}

export const getLogger = (name: string): LoggerFacade => {
  if (window.log4javascript) {
    return new LoggerFacade(window.log4javascript.getLogger(name));
  }
  return new LoggerFacade(name);
};

// check for url parameter or session storage entry
// session storage is only written if logging is enabled by url parameter (to survive page reload)
export const initializeLogging = (): void => {
  const defaultLoggingConfig: LoggingConfig = {
    basicLogging: false,
    log4javascript: {
      enabled: true,
      switchToPopupAppender: true,
      loggerLevels: [
        {
          name: '',
          level: 'DEBUG'
        }
      ]
    }
  };

  // check logging configuration (url parameter or session storage)
  let config: LoggingConfig = {};
  const sessionStorageName = 'logging';
  const loggingParameter = 'logging';
  const loggingParameterTrue = loggingParameter + '=true';
  const loggingParameterFalse = loggingParameter + '=false';
  try {
    // if url parameter is available => set default logging config
    if (window.location.search.indexOf(loggingParameterTrue) !== -1) {
      sessionStorage.setItem(sessionStorageName, JSON.stringify(defaultLoggingConfig));
      // also fill config object because read of sessionStorage can fail if it's disabled in the browser
      config = defaultLoggingConfig;
    } else if (window.location.search.indexOf(loggingParameterFalse) !== -1) {
      sessionStorage.removeItem(sessionStorageName);
    }

    // read logging config from session storage
    const loggingValue = sessionStorage.getItem(sessionStorageName);
    if (loggingValue) {
      config = JSON.parse(loggingValue);
    }
  } catch (e) {
    console.info('Error parsing logging session storage. Can not configure client side logging.');
  }

  // enable basic logging (= simple console logging without the use of log4javascript)
  if (config.basicLogging && config.basicLogging === true) {
    basicLoggingEnabled = true;
  }

  if (config.log4javascript && config.log4javascript.enabled) {
    // check and enable log4javascript logging
    if (window.log4javascript) {
      const consoleAppender = new window.log4javascript.BrowserConsoleAppender();
      const popUpAppender = new window.log4javascript.PopUpAppender();
      const layout = new window.log4javascript.PatternLayout('%d{HH:mm:ss.SSS} %-5p %-20c - %m%n');

      let appender = consoleAppender;

      if (config.log4javascript.switchToPopupAppender) {
        appender = popUpAppender;
      }

      appender.setLayout(layout);
      window.log4javascript.getRootLogger().removeAllAppenders();
      window.log4javascript.getRootLogger().addAppender(appender);
      window.log4javascript.getRootLogger().setLevel(window.log4javascript.Level.DEBUG);

      window.log4javascript.setEnabled(false);

      // read global environment object to check if logging should be activated
      if (config.log4javascript.enabled === true) {
        window.log4javascript.setEnabled(true);
        window.log4javascript.getRootLogger().debug('logging enabled');
      }

      if (config.log4javascript.loggerLevels) {
        config.log4javascript.loggerLevels.forEach(entry => {
          if (entry.name === '') {
            window.log4javascript.getRootLogger().setLevel(mapLevel(entry.level));
          } else {
            window.log4javascript.getLogger(entry.name).setLevel(mapLevel(entry.level));
          }
        });
      }
    } else {
      // no log4javascript => enable basic logging as fallback
      basicLoggingEnabled = true;
    }
  }
};

// function mapLevel(levelAsString: string): log4javascript.Level { // SWITCH
function mapLevel(levelAsString: string): any {
  if (levelAsString.toUpperCase() === 'TRACE') {
    return window.log4javascript.Level.TRACE;
  } else if (levelAsString.toUpperCase() === 'DEBUG') {
    return window.log4javascript.Level.DEBUG;
  } else if (levelAsString.toUpperCase() === 'INFO') {
    return window.log4javascript.Level.INFO;
  } else if (levelAsString.toUpperCase() === 'WARN') {
    return window.log4javascript.Level.WARN;
  } else if (levelAsString.toUpperCase() === 'ERROR') {
    return window.log4javascript.Level.ERROR;
  }
  return window.log4javascript.Level.TRACE;
}
