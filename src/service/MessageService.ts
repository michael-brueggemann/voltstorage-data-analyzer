import {getLogger} from '../util/Log4javascriptFacade';

export class MessageService {
  private readonly logger = getLogger('MessageService');

  private messageIdCounter = 0;
  private messageLog: HTMLElement;

  private timeoutId?: number;

  private eventListeners: Listeners = {};

  constructor(selector: string) {
    this.logger.info('constructor()');

    this.messageLog = document.querySelector(selector) as HTMLElement;
  }

  addMessage(message: string): number {
    this.logger.debug('addMessage()', message);

    // create new message entry
    const messageHtml = `<span class="message" id="messageServiceMessage${this.messageIdCounter}">${message}</span>`;

    this.messageLog.innerHTML += messageHtml;
    this.scrollToEnd();
    this.changed();

    return this.messageIdCounter++;
  }

  updateMessage(id: number, mode: 'replace' | 'append', message: string): void {
    this.logger.debug('updateMessage()', id, message);

    const messageElement = this.messageLog.querySelector('#messageServiceMessage' + id) as HTMLElement;
    if (mode === 'append') {
      messageElement.innerHTML += message;
    } else if (mode === 'replace') {
      messageElement.innerHTML = message;
    } else {
      this.logger.info('mode not implemented: ' + mode);
    }

    this.changed();
  }

  private scrollToEnd() {
    this.messageLog.scrollTo(0, 100000);
  }

  private changed(): void {
    const element = document.querySelector('.messageBox') as HTMLElement;
    // const element = this.messageLog;

    element.classList.remove('changedBackground');
    element.classList.add('changedBackground');

    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
    }
    this.timeoutId = window.setTimeout(function () {
      element.classList.remove('changedBackground');
    }, 5000);
  }

  dispatchEvent(eventName: string): void {
    this.eventListeners[eventName].forEach(callback => {
      callback();
    });
  }

  addListener(event: string, callback: any): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [callback];
    } else {
      this.eventListeners[event].push(callback);
    }
  }
}

interface Listeners {
  [details: string]: [any];
}
