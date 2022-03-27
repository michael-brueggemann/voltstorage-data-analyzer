import {getLogger} from './util/Log4javascriptFacade';
import {html, render} from 'lit';
import {map} from 'lit/directives/map.js';
import dayjs, {Dayjs} from 'dayjs';
import {Stats} from './Types';
import {DataService} from './service/DataService';

export class StatsViewer {
  private readonly logger = getLogger('StatsViewer');

  private dataService: DataService;
  private element!: HTMLElement;
  private date?: Dayjs;

  config: Config = {
    columnLabels: ['Datum', 'SOC min', 'SOC max', 'PV', 'Description']
  };

  private statsList: Stats[] = [];

  constructor(dataService: DataService, element: HTMLElement) {
    this.logger.info('constructor()');

    this.dataService = dataService;

    if (element) {
      this.element = element;
    } else {
      this.logger.warn('cannot render stats, no element given');
    }
  }

  async setDate(newDate: Date): Promise<void> {
    this.logger.debug('setDate()', newDate);

    if (!dayjs(newDate).isSame(this.date)) {
      this.logger.debug('date changed, update stats');
      this.date = dayjs(newDate);
      const stats = await this.loadStats4Month(this.date);
      this.renderStats(stats);
    }
  }

  private async loadStats4Month(date: Dayjs) {
    this.logger.debug('loadStats4Month()');

    const stats4Month: Stats[] = [];

    const monthForStats = date.format('MM');
    const startDate = date.startOf('month');
    for (let i = 0; i < 31; i++) {
      const date = startDate.startOf('month').add(i, 'day');

      // don't load stats different month
      if (date.format('MM') !== monthForStats || date.isToday()) {
        break;
      }

      const data = await this.dataService.getData(date.toDate(), null, {onlyCachedDate: true});

      if (data) {
        const statsForDay = this.dataService.createStatsForDay(data);
        stats4Month.push(statsForDay);
      }
    }

    return stats4Month;
  }

  private renderStats(stats: Stats[]) {
    this.logger.debug('renderStats()');

    const template = html`<table border="1">
      ${this.renderHeadline(this.config.columnLabels)}
      ${map(stats, day => {
        return this.renderDay(day);
      })}
    </table>`;

    if (this.element) {
      render(template, this.element);
    }
  }

  private renderHeadline(row: string[]) {
    const template = html`
      <thead>
        <tr>
          ${map(row, cell => html`<th>${cell}</th>`)}
        </tr>
      </thead>
    `;

    return template;
  }

  private renderDay(stats: Stats) {
    const template = html`<tr>
      <td>${this.renderDate(stats.dateTime)}</td>
      <td>${stats.battery1SocMin}/${stats.battery2SocMin}</td>
      <td>${stats.battery1SocMax}/${stats.battery2SocMax}</td>
      <td>${stats.powerPV}</td>
      <td>${stats.failures}</td>
    </tr>`;

    return template;
  }

  private renderDate(date: Date) {
    const dayShow = dayjs(date).format('DD.MM.YYYY');
    const dayHash = dayjs(date).format('YYYY-MM-DD');
    return html`<a href="#date=${dayHash}">${dayShow}</a>`;
  }
}

interface Config {
  columnLabels: string[];
}
