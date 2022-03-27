import dayjs, {Dayjs} from 'dayjs';
import {DataSet} from '../Types';
import {getLogger} from '../util/Log4javascriptFacade';

import isToday from 'dayjs/plugin/isToday';
dayjs.extend(isToday);

// 0 Time;
// 1 Power_Grid;
// 2 Power_Household;
// 3 inverterPower;
// 4 Power_PV;
// 5 Power_Power Electronics;
// 6 SOC_State of Charge

export class MappingService {
  private readonly logger = getLogger('MappingService');

  private readonly SEPARATOR_COLS = ';';
  private readonly SEPARATOR_LINES = '\r\n';
  private readonly RESOLUTION_IN_SECONDS = 1 * 60;

  private readonly IDX_TIME = 0;
  private readonly IDX_POWER_GRID = 1;
  private readonly IDX_POWER_HOUSEHOLD = 2;
  private readonly IDX_POWER_PV = 4;
  private readonly IDX_STATE_OF_CHARGE = 6;
  private readonly IDX_POWER_BATTERY = 3;

  constructor() {
    this.logger.info('constructor()');
  }

  transformData(product1rawCvs: string, product2rawCvs: string): DataSet[] {
    this.logger.debug('transformData()');

    // split csv into lines
    const linesBat1 = product1rawCvs.split(this.SEPARATOR_LINES);
    // remove: separator line
    linesBat1.shift();
    // remove header
    linesBat1.shift();

    const resultBat1 = linesBat1.map((line: string) => {
      const cols = line.trim().split(this.SEPARATOR_COLS);
      const entry: DataSet = {
        dateTime: new Date(cols[this.IDX_TIME])
      };

      if (cols[this.IDX_POWER_GRID]) {
        const powerGrid = parseInt(cols[this.IDX_POWER_GRID]);
        if (powerGrid > 0) {
          entry.powerFromGrid = powerGrid;
          entry.powerToGrid = 0;
        } else if (powerGrid < 0) {
          entry.powerFromGrid = 0;
          entry.powerToGrid = powerGrid * -1;
        } else {
          entry.powerFromGrid = 0;
          entry.powerToGrid = 0;
        }
      }

      if (cols[this.IDX_POWER_HOUSEHOLD]) {
        entry.powerHousehold = parseInt(cols[this.IDX_POWER_HOUSEHOLD]);
      }

      if (cols[this.IDX_POWER_PV]) {
        entry.powerPV = parseInt(cols[this.IDX_POWER_PV]);
      }

      if (cols[this.IDX_STATE_OF_CHARGE]) {
        entry.battery1Soc = parseFloat(cols[this.IDX_STATE_OF_CHARGE]);
      }

      if (cols[this.IDX_POWER_BATTERY]) {
        const powerBattery = parseInt(cols[this.IDX_POWER_BATTERY]);
        if (powerBattery > 0) {
          entry.battery1From = powerBattery;
          entry.battery1To = 0;
        } else if (powerBattery < 0) {
          entry.battery1From = 0;
          entry.battery1To = powerBattery * -1;
        } else {
          entry.battery1From = 0;
          entry.battery1To = 0;
        }
      }

      return entry;
    });

    // split csv into lines
    const linesBat2 = product2rawCvs.split(this.SEPARATOR_LINES);
    // remove: separator line
    linesBat2.shift();
    // remove header
    linesBat2.shift();

    const resultBat2 = linesBat2.map((line: string) => {
      const cols = line.trim().split(this.SEPARATOR_COLS);
      const entry: DataSet = {
        dateTime: new Date(cols[this.IDX_TIME])
      };

      if (cols[this.IDX_STATE_OF_CHARGE]) {
        entry.battery2Soc = parseFloat(cols[this.IDX_STATE_OF_CHARGE]);
      }

      if (cols[this.IDX_POWER_BATTERY]) {
        const powerBattery = parseInt(cols[this.IDX_POWER_BATTERY]);
        if (powerBattery > 0) {
          entry.battery2From = powerBattery;
          entry.battery2To = 0;
        } else if (powerBattery < 0) {
          entry.battery2From = 0;
          entry.battery2To = powerBattery * -1;
        } else {
          entry.battery2From = 0;
          entry.battery2To = 0;
        }
      }

      return entry;
    });

    const result = resultBat1.concat(resultBat2);

    result.sort((a: DataSet, b: DataSet) => {
      return a.dateTime.getTime() < b.dateTime.getTime() ? -1 : 1;
    });

    this.logger.debug('  entries: ', result.length);
    return this.mergeByTime(result);
  }

  public mergeByTime(inputData: DataSet[], timeDiffInSeconds: number = this.RESOLUTION_IN_SECONDS): DataSet[] {
    this.logger.debug('mergeByTime()');

    const newData: DataSet[] = [];

    let inputDataIndex = 0;
    let buffer: DataSet[] = [];

    // const startDate = dayjs(inputData[0].dateTime).startOf('day');
    // let date: Dayjs = startDate;
    // while (date.isSame(startDate, 'day') && inputDataIndex < inputData.length) {
    const startDate = dayjs(inputData[0].dateTime);
    let date: Dayjs = startDate;
    while (inputDataIndex < inputData.length) {
      const entry = {
        dateTime: date.toDate()
      };
      date = date.add(timeDiffInSeconds, 'second');

      while (inputDataIndex < inputData.length && inputData[inputDataIndex].dateTime.getTime() < date.toDate().getTime()) {
        buffer.push(inputData[inputDataIndex++]);
      }

      this.processBufferData(entry, buffer);
      newData.push(entry);
      buffer = [];
    }

    this.logger.debug('  entries: ', newData.length);
    return newData;
  }

  private processBufferData(entry: DataSet, buffer: DataSet[]): void {
    const keys = [
      'powerFromGrid',
      'powerToGrid',
      'powerHousehold',
      'powerPV',
      'battery1To',
      'battery1From',
      'battery1Soc',
      'battery2To',
      'battery2From',
      'battery2Soc'
    ];

    const zzz: any = {};
    keys.forEach(key => {
      zzz[key] = new MergeEntry();
    });

    buffer.forEach((line: DataSet) => {
      keys.forEach(key => {
        if (line[key as keyof DataSet]) {
          zzz[key as keyof DataSet].value += line[key as keyof DataSet];
          zzz[key as keyof DataSet].samples++;
        }
      });
    });

    entry.powerFromGrid = this.calculate(zzz.powerFromGrid.value, zzz.powerFromGrid.samples);
    entry.powerToGrid = this.calculate(zzz.powerToGrid.value, zzz.powerToGrid.samples);
    entry.powerHousehold = this.calculate(zzz.powerHousehold.value, zzz.powerHousehold.samples);
    entry.powerPV = this.calculate(zzz.powerPV.value, zzz.powerPV.samples);

    entry.battery1To = this.calculate(zzz.battery1To.value, zzz.battery1To.samples);
    entry.battery1From = this.calculate(zzz.battery1From.value, zzz.battery1From.samples);
    entry.battery1Soc = this.calculate(zzz.battery1Soc.value, zzz.battery1Soc.samples, 1000);

    entry.battery2To = this.calculate(zzz.battery2To.value, zzz.battery2To.samples);
    entry.battery2From = this.calculate(zzz.battery2From.value, zzz.battery2From.samples);
    entry.battery2Soc = this.calculate(zzz.battery2Soc.value, zzz.battery2Soc.samples, 1000);
  }

  private calculate(num1: number, num2: number, factor = 1): number | undefined {
    const result = Math.round((num1 / num2) * factor) / factor;
    if (isNaN(result)) {
      return undefined;
    }

    return result;
  }
}

class MergeEntry {
  public value: number;
  public samples: number;
  constructor() {
    this.value = 0;
    this.samples = 0;
  }
}
