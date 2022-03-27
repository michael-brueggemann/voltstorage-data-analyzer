import {CacheService} from './service/CacheService';
import {DataService} from './service/DataService';
import {MessageService} from './service/MessageService';
import {getLogger} from './util/Log4javascriptFacade';

export class UiController {
  private readonly logger = getLogger('UiController');

  private messageService: MessageService;
  private cacheService: CacheService;
  private dataService: DataService;
  private isDebug = false;

  constructor(messageService: MessageService, cacheService: CacheService, dataService: DataService) {
    this.logger.info('constructor()');

    this.messageService = messageService;
    this.cacheService = cacheService;
    this.dataService = dataService;

    this.init();
  }

  private init() {
    this.logger.debug('init()');

    this.checkDebugMode();

    this.addDataManagementHandler();
    this.addDebugHandler();

    this.messageService.addListener('cache-changed', () => {
      //
    });
  }

  private checkDebugMode() {
    this.logger.debug('checkDebugMode()');

    if (window.location.search.indexOf('debug=true') > -1) {
      this.isDebug = true;
    } else if (window.location.search.indexOf('debug=false') > -1) {
      this.isDebug = false;
    } else {
      if (window.location.hostname === 'localhost') {
        this.isDebug = true;
      }
    }

    if (this.isDebug) {
      // show debug box
      const debugBox = document.querySelector('.debug.hidden');
      if (debugBox) {
        debugBox.classList.remove('hidden');
      }

      // activate raw data saving
      (document.querySelector('.saveRawData') as HTMLInputElement).checked = true;
      this.dataService.setSaveRawData(true);
    }
  }

  private addDataManagementHandler() {
    this.logger.debug('addDataManagementHandler()');

    const expImp = (exportImport: any) => () => {
      const year = (document.querySelector('.dataManagement select#year') as HTMLInputElement).value;
      const month = (document.querySelector('.dataManagement select#month') as HTMLInputElement).value;
      // cacheService.exportData(year, month);
      exportImport(year, month);
    };

    document.querySelector('#bExportData')?.addEventListener('click', expImp(this.cacheService.exportProcessedData));
    document.querySelector('#bExportRawData')?.addEventListener('click', expImp(this.cacheService.exportRawData));
    document.querySelector('#bDeleteData')?.addEventListener('click', expImp(this.cacheService.deleteProcessedData));
    document.querySelector('#bDeleteRawData')?.addEventListener('click', expImp(this.cacheService.deleteRawData));

    const fileImp = (cacheService: CacheService) => (event: any) => {
      this.fileImport(cacheService, event);
    };
    document.querySelector('#fileImport')?.addEventListener('change', fileImp(this.cacheService));
  }

  private addDebugHandler() {
    this.logger.debug('addDebugHandler()');

    document.querySelector('.saveRawData')?.addEventListener('click', event => {
      const isSaveRawData = (event.target as HTMLInputElement).checked;
      this.dataService.setSaveRawData(isSaveRawData);
    });
  }

  private async fileImport(cacheService: CacheService, event: any) {
    this.logger.debug('fileImport()');

    const files = (event.target as HTMLInputElement).files;
    // const fileList = this.files; /* now you can work with the file list */

    if (files) {
      for (let i = 0; i < files.length; i++) {
        cacheService.importData(files[i]);
      }
    }
  }
}
