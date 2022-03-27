import {Battery, DataSet, Stats} from '../Types';
import {getLogger} from '../util/Log4javascriptFacade';
import dayjs, {Dayjs} from 'dayjs';
import {NetworkService} from './NetworkService';
import {MappingService} from './MappingService';

import isToday from 'dayjs/plugin/isToday';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import {MessageService} from './MessageService';
import {CacheService} from './CacheService';
dayjs.extend(isToday);
dayjs.extend(customParseFormat);

export class DataService {
  private readonly logger = getLogger('DataService');

  private messageService: MessageService;
  private networkService: NetworkService;
  private mappingService: MappingService;
  private cacheService: CacheService;
  private batteryList: Battery[];
  private isSaveRawData;

  constructor(
    messageService: MessageService,
    networkService: NetworkService,
    cacheService: CacheService,
    batteryList: Battery[],
    isSaveRawData = false
  ) {
    this.logger.info('constructor()');

    this.messageService = messageService;
    this.networkService = networkService;
    this.cacheService = cacheService;
    this.batteryList = batteryList;
    this.mappingService = new MappingService();
    this.isSaveRawData = isSaveRawData;
  }

  setSaveRawData(isDebug: boolean): void {
    this.logger.debug('setSaveRawData(),', isDebug);
    this.isSaveRawData = isDebug;
  }

  /**
   * Create the stats for the given data.
   *
   * Hint: data should be for 24 hours
   *
   * @param data
   * @returns
   */
  createStatsForDay(data: DataSet[]): Stats {
    this.logger.debug('createStats()');

    const stats: Stats = {
      dateTime: data[0].dateTime
    };

    let statsBatterySoc = this.calculateStatMinMax(data, 'battery1Soc');
    stats.battery1SocMin = statsBatterySoc.min;
    stats.battery1SocMax = statsBatterySoc.max;

    statsBatterySoc = this.calculateStatMinMax(data, 'battery2Soc');
    stats.battery2SocMin = statsBatterySoc.min;
    stats.battery2SocMax = statsBatterySoc.max;

    stats.powerPV = this.calculateAbsoluteKilowattStunden(data.map(entry => (entry.powerPV ? entry.powerPV : 0)));
    stats.powerHousehold = this.calculateAbsoluteKilowattStunden(data.map(entry => (entry.powerHousehold ? entry.powerHousehold : 0)));
    stats.powerFromGrid = this.calculateAbsoluteKilowattStunden(data.map(entry => (entry.powerFromGrid ? entry.powerFromGrid : 0)));
    stats.powerToGrid = this.calculateAbsoluteKilowattStunden(data.map(entry => (entry.powerToGrid ? entry.powerToGrid : 0)));

    stats.failures = this.checkForFailure(data);

    return stats;
  }

  async getData(time: Date, to?: Date): Promise<DataSet[] | null> {
    this.logger.debug('getData()');

    // get cached data
    const fromKeyDate = dayjs(time).format('YYYY.MM.DD');
    const fromKey = fromKeyDate + '-vs-processed';
    const fromCachedCsvData = await this.cacheService.getProcessedData(fromKey);

    let data: DataSet[] | null = null;
    if (fromCachedCsvData) {
      data = this.parseCsv(fromCachedCsvData);
    }

    if (to) {
      const toKeyDate = dayjs(to).format('YYYY.MM.DD');

      // if to day different than from, don't use the whole day but only the from/to 24 hour slice
      if (fromKeyDate !== toKeyDate) {
        this.logger.debug('to date defined and day different to from:', fromKeyDate, toKeyDate);
        const toKey = toKeyDate + '-vs-processed';
        const toCachedCsvData = await this.cacheService.getProcessedData(toKey);

        if (data && toCachedCsvData) {
          this.logger.debug('append data of the to day');
          data = data.concat(this.parseCsv(toCachedCsvData));

          data = data.filter(entry => {
            return entry.dateTime >= time;
          });
          data = data.filter(entry => {
            return entry.dateTime < to;
          });
        }
      }
    }

    // if no cached data, fetch data and store in the cache
    if (!data) {
      this.logger.debug('  no cached data available');

      const from = dayjs(time).startOf('day');
      const to = dayjs(time).endOf('day');

      if (from.isAfter(dayjs())) {
        this.messageService.addMessage('cannot load future data for ' + from.format('DD.MM.YYYY'));
        return new Promise(resolve => {
          resolve(null);
        });
      }

      // try to get cached raw data
      // const rawData1 = await this.getRawData(this.batteryList[0].productId, from, to);
      // const rawData2 = await this.getRawData(this.batteryList[1].productId, from, to);

      const [rawData1, rawData2] = await Promise.all([
        this.getRawData(this.batteryList[0].productId, from, to),
        this.getRawData(this.batteryList[1].productId, from, to)
      ]);

      if (!rawData1 || !rawData2) {
        this.logger.warn('no raw data, something went wrong');
        return new Promise(resolve => {
          resolve(null);
        });
      }

      this.logger.debug('  raw data 1 loaded, size: ', rawData1.length);
      this.logger.debug('  raw data 2 loaded, size: ', rawData2.length);

      data = this.mappingService.transformData(rawData1, rawData2);

      // cache only complete data, not today (it's not a whole day) or future
      if (to.toDate().getTime() < Date.now() && !dayjs(to).isToday()) {
        this.logger.debug('  save aggregated data, key:', fromKey);
        // await localforage.setItem(key, this.toCsv(data));
        await this.cacheService.setProcessedData(fromKey, this.toCsv(data));
        document.dispatchEvent(new CustomEvent('cache-changed'));
      }
    }

    return new Promise(resolve => {
      resolve(data);
    });
  }

  private async getRawData(productId: string, from: Dayjs, to: Dayjs): Promise<string | null> {
    this.logger.debug('getRawData()', productId);

    const timeKey = from.format('YYYY.MM.DD');
    const key = timeKey + '-vs-raw-' + productId;

    // let rawData = await localforage.getItem<string>(key);
    let rawData = await this.cacheService.getRawData(key);

    if (!rawData) {
      this.logger.debug('  no raw data');

      rawData = await this.networkService.getData(productId, from.toDate(), to.toDate());

      if (rawData) {
        this.logger.debug('  raw data loaded, size: ', rawData.length);

        // in debug mode, save also raw data
        if (this.isSaveRawData) {
          this.logger.debug('save raw data for', key);
          if (to.toDate().getTime() < Date.now() && !dayjs(to).isToday()) {
            // localforage.setItem(key, rawData);
            this.cacheService.setRawData(key, rawData);
          }
        }
      }
    }

    return new Promise(resolve => {
      resolve(rawData);
    });
  }

  private toCsv(data: DataSet[]): string {
    this.logger.debug('toCsv(), entries:', data.length);

    // headline
    let csv =
      // eslint-disable-next-line max-len
      'dateTime;powerFromGrid;powerToGrid;powerHousehold;powerPV;battery1To;battery1From;battery1Soc;battery2To;battery2From;battery2Soc\n';

    // add content
    data.forEach(entry => {
      // "short" iso string, remove seconds and milliseconds
      csv += entry.dateTime.toISOString().replace(':00.000', '');
      csv += ';' + (entry.powerFromGrid ? entry.powerFromGrid : '');
      csv += ';' + (entry.powerToGrid ? entry.powerToGrid : '');
      csv += ';' + (entry.powerHousehold ? entry.powerHousehold : '');
      csv += ';' + (entry.powerPV ? entry.powerPV : '');
      csv += ';' + (entry.battery1To ? entry.battery1To : '');
      csv += ';' + (entry.battery1From ? entry.battery1From : '');
      csv += ';' + (entry.battery1Soc ? entry.battery1Soc : '');
      csv += ';' + (entry.battery2To ? entry.battery2To : '');
      csv += ';' + (entry.battery2From ? entry.battery2From : '');
      csv += ';' + (entry.battery2Soc ? entry.battery2Soc : '');
      csv += '\n';
    });

    this.logger.debug('  size:', csv.length);
    return csv;
  }

  private parseCsv(csv: string): DataSet[] {
    this.logger.debug('parseCsv(), size:', csv.length);

    const data: DataSet[] = [];

    // split csv into lines
    const lines = csv.split('\n');

    // remove header line
    lines.shift();

    lines.forEach(line => {
      const cols = line.split(';');
      if (cols.length < 2) {
        this.logger.debug('skip line because to less columns:', line);
        return;
      }
      const entry: DataSet = {
        dateTime: new Date(cols[0]),
        powerFromGrid: parseInt(cols[1]),
        powerToGrid: parseInt(cols[2]),
        powerHousehold: parseInt(cols[3]),
        powerPV: parseInt(cols[4]),
        battery1To: parseInt(cols[5]),
        battery1From: parseInt(cols[6]),
        battery1Soc: parseFloat(cols[7]),
        battery2To: parseInt(cols[8]),
        battery2From: parseInt(cols[9]),
        battery2Soc: parseFloat(cols[10])
      };
      data.push(entry);
    });

    this.logger.debug('  entries:', data.length);
    return data;
  }

  private calculateStatMinMax(data: DataSet[], property: keyof DataSet) {
    const mapped = data.map(entry => {
      const value = entry[property];
      if (typeof value === 'number') {
        return value ? value : 0;
      } else {
        return 0;
      }
    });

    return {
      min: Math.round(Math.min(...mapped) * 100),
      max: Math.round(Math.max(...mapped) * 100)
    };
  }

  private calculateAbsoluteKilowattStunden(data: number[]): number {
    if (data.length !== 1440) {
      this.logger.warn('wrong number of entries. Need 1440 for a whole day');
      return 0;
    }

    let sum = 0;
    data.forEach(entry => {
      sum += entry ? entry : 0;
    });

    // because of a data resolution of a minute and watt
    // for kWh (kilo watt per hour)
    // => we need an hour (=> divided by 60)
    // => we need kilo-watt (=> divided by 1000)
    return Math.round(sum / 60 / 100) / 10;
  }

  private checkForFailure(data: DataSet[]): string {
    let description = '';

    let failCounter = 0;
    const failThresholdWatt = 100;
    const failThresholdCounter = 15;

    data.forEach(entry => {
      if (
        this.isGreater(entry.powerToGrid, 1000) &&
        ((this.isLower(entry.battery1Soc, 90) && this.isLower(entry.battery1To, failThresholdWatt)) ||
          (this.isLower(entry.battery2Soc, 90) && this.isLower(entry.battery2To, failThresholdWatt)))
      ) {
        failCounter++;
        // console.log(`${dayjs(entry.dateTime).format('DD.MM HH:mm')}: ${entry.powerToGrid} > ${entry.battery1To} / ${entry.battery2To}`);
      }
    });

    if (failCounter > failThresholdCounter) {
      description = `power to grid but to less power to battery for  ${failCounter} minutes`;
    }

    return description;
  }

  private isPositiv(num: number | undefined) {
    if ((num ? num : 0) > 0) {
      return true;
    }
    return false;
  }

  private isZero(num: number | undefined) {
    if ((num ? num : 0) === 0) {
      return true;
    }
    return false;
  }

  private isGreater(num1: number | undefined, num2: number | undefined) {
    if ((num1 ? num1 : 0) > (num2 ? num2 : 0)) {
      return true;
    }
    return false;
  }

  private isLower(num1: number | undefined, num2: number | undefined) {
    if ((num1 ? num1 : 0) < (num2 ? num2 : 0)) {
      return true;
    }
    return false;
  }
}
