import dayjs from 'dayjs';
import {Battery, DataApi} from '../Types';
import {getLogger} from '../util/Log4javascriptFacade';
import {MessageService} from './MessageService';

/**
 *
 * https://api-reference.voltstorage.com/
 *
 * Power_Power Electronics: Ladeleistung Batterie (negativ = laden)
 * Grid-Power: Netz (negativ = Einspeisung)
 * householdConsumption: Hausverbrauch (positiv)photovoltaicPower: PV Leistung (positiv)
 * stateOfCharge
 */
export class NetworkService implements DataApi {
  private readonly logger = getLogger('NetworkService');

  private readonly MESSAGE_INTERVAL = 1000;

  private messageService: MessageService;

  private readonly SEPARATOR_LINES = '\r\n';

  private readonly baseUrl = 'https://api.voltstorage.com/rest';
  private readonly storageKey = 'vs-token';

  private token: string | null;
  private tolerance = 0;
  private precision = 3;

  constructor(messageService: MessageService) {
    this.logger.info('constructor()');

    this.messageService = messageService;

    this.token = localStorage.getItem(this.storageKey);

    if (!this.token) {
      messageService.addMessage('no token, please login');
    }
  }

  isToken(): boolean {
    this.logger.debug('isToken()');

    if (this.token) {
      return true;
    }
    return false;
  }

  /**
   *
   * @param user
   * @param password
   * @returns true if the login was successful
   */
  async login(user: string, password: string, expirationInHours = 24): Promise<boolean> {
    this.logger.debug('login()', user);

    if (user && password) {
      const url = this.baseUrl + '/login/password';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: user,
          password: password,
          validity: expirationInHours * 3600
        })
      });

      const resultData = await response.json();

      if (resultData.errors && resultData.errors.length > 0) {
        this.logger.error('ERROR: ' + resultData.errors[0]);
      }

      if (response.status === 200) {
        this.logger.debug('login successful');
        this.updateToken(resultData.token);
        this.messageService.addMessage('login successful');
      } else {
        this.logger.warn('login failed');
        throw new Error('login failed');
      }
    }

    return new Promise(resolve => {
      resolve(true);
    });
  }

  async getBatteryList(): Promise<Battery[]> {
    this.logger.debug('getBatteryList()');

    if (!this.token) {
      this.logger.error('  no token available');
      throw new Error('no token available');
    }

    const url = this.baseUrl + '/products' + `?token=${this.token}`;
    this.logger.debug('url:', url);

    const response = await fetch(url);

    if (response.status === 400) {
      this.logger.error('  bad request, cannot get products');
      throw new Error('bad request, cannot get products');
    }

    if (response.status === 401) {
      this.updateToken(null);
      this.logger.error('  not authorized');
      throw new Error('not authorized');
    }

    const productsJson = await response.json();

    const batteryList: Battery[] = productsJson.map((entry: any) => {
      const battery: Battery = {
        productId: entry.id,
        serialNumber: entry.serialNumber,
        online: entry.online,
        errors: entry.errors
      };
      return battery;
    });

    return batteryList;
  }

  async getData(productId: string, fromDate: Date, toDate: Date): Promise<string | null> {
    this.logger.debug('getData()');

    if (!this.token) {
      this.logger.error('no token available');
      throw new Error('no token available');
    }

    const messageId = this.messageService.addMessage(`fetch data for ${dayjs(fromDate).format('YYYY.MM.DD')} for product ${productId} `);
    let counter = 0;
    const interval = window.setInterval(
      (function (messageService: MessageService) {
        return function () {
          if (counter % 10 === 0) {
            messageService.updateMessage(messageId, 'append', ' ');
          }
          messageService.updateMessage(messageId, 'append', '.');
          counter++;
        };
      })(this.messageService),
      this.MESSAGE_INTERVAL
    );

    const from = fromDate.getTime() / 1000;
    const to = toDate.getTime() / 1000;

    const url =
      this.baseUrl +
      '/data/export.csv' +
      `?token=${this.token}` +
      `&productId=${productId}` +
      `&from=${from}` +
      `&to=${to}` +
      `&tolerance=${this.tolerance}` +
      `&precision=${this.precision}` +
      '&separator=;';
    this.logger.debug('url:', url);

    const response = await fetch(url);

    if (response.status === 400) {
      window.clearInterval(interval);
      this.logger.error('bad request, perhaps time frame in the future');
      throw new Error('bad request, perhaps time frame in the future');
    }

    if (response.status === 401) {
      this.updateToken(null);
      window.clearInterval(interval);
      this.logger.error('not authorized');
      throw new Error('not authorized');
    }

    let resultData = await response.text();

    resultData = this.checkValidityAndFix(resultData);

    window.clearInterval(interval);
    this.messageService.updateMessage(messageId, 'append', ' done');

    return resultData;
  }

  /**
   * Checks and fixes some error
   *
   * @param csvData the raw csv string of the voltstorage api
   */
  private checkValidityAndFix(csvData: string): string {
    this.logger.debug('checkValidityAndFix()');

    // as separator ";" is requested, but it's still the default "," (12.01.2021)
    // headline row is fine, but the data rows a wrong
    // sep=;
    // Time;Power_Grid;Power_Household;inverterPower;Power_PV;Power_Power Electronics;SOC_State of Charge;Status
    // 2021-01-11T23:00:00.852Z,,,,,,,
    const lines = csvData.split(this.SEPARATOR_LINES);
    if (lines[0] === 'sep=;') {
      const cols = lines[2].split(';');
      if (cols.length === 1) {
        const cols2 = lines[2].split(',');
        if (cols2.length > 1) {
          // seems to be a wrong separator
          this.logger.warn('wrong data formant, fix column separator , => ;');
          this.messageService.addMessage('wrong data formant, fix column separator , => ;');
          return csvData.replace(/,/g, ';');
        }
      }
    }

    return csvData;
  }

  private updateToken(token: string | null) {
    this.logger.debug('updateToken()', token);

    this.token = token;

    if (token) {
      localStorage.setItem(this.storageKey, token);
    } else {
      localStorage.removeItem(this.storageKey);
    }
  }
}
