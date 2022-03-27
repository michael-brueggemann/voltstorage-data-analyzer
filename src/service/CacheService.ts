import {getLogger} from '../util/Log4javascriptFacade';
import localforage from 'localforage';
import {MessageService} from './MessageService';
import JSZip from 'jszip';
import {saveAs} from 'file-saver';

export class CacheService {
  private readonly logger = getLogger('CacheService');

  private dataStoreProcessed: LocalForage;
  private dataStoreRaw: LocalForage;

  private messageService: MessageService;

  constructor(messageService: MessageService) {
    this.logger.info('constructor()');

    this.messageService = messageService;

    this.dataStoreProcessed = localforage.createInstance({
      name: 'voltstorage-processed'
    });

    this.dataStoreRaw = localforage.createInstance({
      name: 'voltstorage-raw'
    });

    this.cacheChanged();
  }

  async getProcessedData(key: string): Promise<string | null> {
    this.logger.debug('getProcessedData()', key);
    return this.dataStoreProcessed.getItem(key);
  }

  async setProcessedData(key: string, data: any): Promise<void> {
    this.logger.debug('setProcessedData()', key);
    await this.dataStoreProcessed.setItem(key, data);
    this.cacheChanged();
  }

  async getRawData(key: string): Promise<string | null> {
    this.logger.debug('getRawData()', key);
    return this.dataStoreRaw.getItem(key);
  }

  async setRawData(key: string, data: any): Promise<void> {
    this.logger.debug('setRawData()', key);
    await this.dataStoreRaw.setItem(key, data);
    this.cacheChanged();
  }

  async getProcessedDataKeys() {
    this.logger.debug('getProcessedDataKeys()');
    return this.dataStoreProcessed.keys();
  }

  async getRawDataKeys() {
    this.logger.debug('getRawDataKeys()');
    return this.dataStoreRaw.keys();
  }

  isData(key: string): boolean {
    //
    return false;
  }

  isRawData(key: string): boolean {
    //
    return false;
  }

  exportProcessedData = async (year: string, month: string): Promise<void> => {
    this.logger.debug('exportProcessedData()', year, month);
    return this.exportImpl('processed', this.dataStoreProcessed, year, month);
  };

  exportRawData = async (year: string, month: string): Promise<void> => {
    this.logger.debug('exportRawData()', year, month);
    return this.exportImpl('raw', this.dataStoreRaw, year, month);
  };

  async exportImpl(type: string, database: LocalForage, year: string, month: string): Promise<void> {
    this.logger.debug('exportImpl()', type, year, month);

    const messageId = this.messageService.addMessage('creating ZIP file ...');

    let keyPrefix = '';
    if (year && month) {
      keyPrefix += year;
      if (month !== 'all') {
        keyPrefix += '.' + month;
      }
    }

    const zip = new JSZip();

    // get keys
    let keys = await database.keys();

    // filter only for ready data (no raw data)
    keys = keys.filter((entry: string) => {
      return entry.indexOf('-vs-' + type);
      // return entry.indexOf('-vs-raw') > 0;
    });

    // filter by year / month
    if (keyPrefix.length > 0) {
      this.logger.debug('  add prefix filter:', keyPrefix);
      keys = keys.filter((entry: string) => {
        return entry.startsWith(keyPrefix);
      });
    }

    for (const index in keys) {
      const key = keys[index];
      const data = await database.getItem<string>(key);
      if (data) {
        zip.file(key + '.csv', data);
      }
    }

    // generate zip file/blob and resolve
    zip
      .generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: {
            level: 9 // force a compression and a compression level for this file
          }
        },
        metadata => {
          this.messageService.updateMessage(
            messageId,
            'replace',
            `creating ZIP file ${Math.round(metadata.percent)}% ${
              metadata.currentFile ? ', ' + metadata.currentFile + ' ...' : ''
            }`
          );
        }
      )
      .then(zipData => {
        // const zipBlob = new Blob([content], { type: "application/zip" });
        this.messageService.addMessage('ZIP file created, starting download ...');
        let filename = 'VDA-export';
        filename += '-' + type;
        if (keyPrefix) {
          filename += '-' + keyPrefix;
        }
        filename += '.zip';
        saveAs(zipData, filename);
      });
  }

  async importData(file: any): Promise<void> {
    this.logger.debug('importData()');

    const name: string = file.name;

    const database: LocalForage = name.indexOf('raw') > -1 ? this.dataStoreRaw : this.dataStoreProcessed;

    const zip = await JSZip.loadAsync(file);

    const that = this;

    if (zip) {
      zip.forEach(async function (relativePath, zipEntry) {
        that.logger.debug('  check zip entry:', zipEntry.name);

        const cacheKey = zipEntry.name.slice(0, zipEntry.name.length - 4);

        // check of data already exists
        // const cacheContent = await database.getItem(cacheKey);
        const cacheContent = null;

        if (!cacheContent) {
          that.logger.debug('  data imported', zipEntry.name);
          const zipContent = await zipEntry.async('string');
          database.setItem(cacheKey, zipContent);
          that.messageService.addMessage('data imported: ' + zipEntry.name);
          that.cacheChanged();
        } else {
          that.logger.debug('  data already existing => not imported', zipEntry.name);
        }
      });
    }
  }

  deleteProcessedData = async (year: string, month: string): Promise<void> => {
    this.logger.debug('deleteProcessedData()', year, month);
    return this.deleteImpl(this.dataStoreProcessed, year, month);
  };

  deleteRawData = async (year: string, month: string): Promise<void> => {
    this.logger.debug('deleteRawData()', year, month);
    return this.deleteImpl(this.dataStoreRaw, year, month);
  };

  private async deleteImpl(database: LocalForage, year: string, month: string): Promise<void> {
    this.logger.debug('deleteImpl()', year, month);

    let keyPrefix = '';
    if (year && month) {
      keyPrefix += year;
      if (month !== 'all') {
        keyPrefix += '.' + month;
      }
    }

    // get all keys
    let keys = await database.keys();

    // filter by year / month
    if (keyPrefix.length > 0) {
      this.logger.debug('  filter by prefix:', keyPrefix);
      keys = keys.filter((entry: string) => {
        return entry.startsWith(keyPrefix);
      });
    }

    for (const index in keys) {
      const key = keys[index];
      this.logger.debug('delete', key);
      await database.removeItem(key);
    }

    this.messageService.addMessage('database entries deleted for: ' + keyPrefix);

    this.cacheChanged();
  }

  private async cacheChanged() {
    this.logger.debug('cacheChanged()');

    const size = await navigator.storage.estimate();
    const element = document.querySelector('#dbSize');
    if (element && size.quota && size.usage) {
      const sizeInMb = Math.round(size.usage / 1000 / 1000);
      element.innerHTML = sizeInMb + ' MegaByte - ';
      element.innerHTML += Math.round((size.usage / size.quota) * 100) + '%';
    }

    const keysProcessed = (await this.dataStoreProcessed.keys()).length;
    const processedElement = document.getElementById('dataKeys');
    if (processedElement) {
      processedElement.innerHTML = keysProcessed + ' entries';
    }

    const keysRaw = (await this.dataStoreRaw.keys()).length;
    const rawElement = document.getElementById('rawDataKeys');
    if (rawElement) {
      rawElement.innerHTML = keysRaw + ' entries';
    }

    const event = new CustomEvent('cache-changed');
    document.dispatchEvent(event);

    this.messageService.dispatchEvent('cache-changed');
  }
}
