/* eslint-disable no-console */
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import introJs from 'intro.js';
import 'intro.js/introjs.css';
import log4javascript from 'log4javascript';
import demoData from './demoData.json';
import {GraphManager, PathData} from './GraphManager';
import tavoCalendar from './lib/tavo-calendar';
import {CacheService} from './service/CacheService';
import {DataService} from './service/DataService';
import {MappingService} from './service/MappingService';
import {MessageService} from './service/MessageService';
import {NetworkService} from './service/NetworkService';
import {StatsViewer} from './StatsViewer';
import {Battery, Color, DataSet, Log4jWindow} from './Types';
import {UiController} from './UiController';
import {initializeLogging} from './util/Log4javascriptFacade';
import version from './version.json';

window.log4javascript = log4javascript;

dayjs.extend(customParseFormat);

(document.querySelector('.version > a') as HTMLElement).innerHTML = `v ${version.version} (${version.buildDate})`;

declare const window: Log4jWindow;

let calendar: any;

let messageService: MessageService;
let networkService: NetworkService;
let dataService: DataService;
let cacheService: CacheService;
let mappingService: MappingService;
let graphManager: GraphManager;
let uiController: UiController;
let statsViewer: StatsViewer;

let isArrowNavigationEnabled = true;
let resizeTimeout: number | null;
let resizeOldWidth: number | null;

let batteryList: Battery[] = [
  // {
  //   productId: '190',
  //   serialNumber: 'AD0301',
  //   online: true,
  //   errors: []
  // },
  // {
  //   productId: '250',
  //   serialNumber: 'AD0361',
  //   online: true,
  //   errors: []
  // }
];

const timeShiftInHours = 5;

setTimeout(init, 1);

async function init() {
  initializeLogging();

  attachHandler();

  await initBaseServices();

  if (networkService.isToken()) {
    document.querySelector('#loginBlock')?.classList.add('hidden');
    initWhenLoggedIn();
  } else {
    startIntro();
    return;
  }
}

async function initWhenLoggedIn() {
  await initServices();

  await initCalendar();

  initDataManagementDates();

  initResizeSupport();

  // in mobile view, don't show diagram, request fullscreen mode first
  if (navigator.userAgent.indexOf('Android') > -1) {
    addMobileStuff();
  } else {
    show();
  }
}

function addMobileStuff() {
  document.querySelector('#bFullscreen')?.classList.remove('hidden');

  // check fullscreen change
  document.addEventListener('fullscreenchange', event => {
    // fullscreen mode => hide button
    if (document.fullscreenElement) {
      document.querySelector('#bFullscreen')?.classList.add('hidden');
    } else {
      // no fullscreen mode => show button
      document.querySelector('#bFullscreen')?.classList.remove('hidden');
    }
  });

  // request fullscreen on mobile (android) devices
  document.querySelector('#bFullscreen')?.addEventListener('click', () => {
    // TODO support also apple and more
    window.document.documentElement.requestFullscreen();
  });
}

function initResizeSupport() {
  // set initial width
  resizeOldWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    // only do it for width changes (because height is also changed on scrolling)
    if (resizeOldWidth !== window.innerWidth) {
      resizeOldWidth = window.innerWidth;
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
        resizeTimeout = null;
      }
      resizeTimeout = window.setTimeout(() => {
        // window.location.reload();^
        const todayFormatted = dayjs().format('YYYY-MM-DD');
        const dateSelected = calendar.getSelected();

        if (todayFormatted === dateSelected) {
          changeDate(-1);
        } else {
          show();
        }
      }, 100);
    }
  });
}

function attachHandler() {
  document.querySelector('#buttonLogin')?.addEventListener('click', login);
  document.querySelector('#buttonIntro')?.addEventListener('click', startIntro);
  document.querySelector('#buttonDeleteToken')?.addEventListener('click', deleteToken);
  document.querySelector('#buttonTest1')?.addEventListener('click', test1);
  document.querySelector('#buttonTest2')?.addEventListener('click', test2);

  // document.querySelector('#timeFrom')?.addEventListener('change', show);
  document.querySelector('#timeFrom')?.addEventListener('click', () => {
    console.log('clicker');
  });

  document.querySelector('#buttonDateBefore')?.addEventListener('click', () => {
    changeDate(-1);
  });
  document.querySelector('#buttonDateAfter')?.addEventListener('click', () => {
    changeDate(1);
  });

  document.querySelector('#smoothing')?.addEventListener('change', show);

  document.querySelector('#bPreload')?.addEventListener('click', () => {
    preload();
  });

  window.addEventListener('keyup', event => {
    if (!isArrowNavigationEnabled) {
      return;
    }

    event.preventDefault();

    // console.log(`KeyboardEvent: key='${event.key}' | code='${event.code}'`);
    if (event.key === 'ArrowLeft') {
      changeDate(-1);
      return false;
    } else if (event.key === 'ArrowRight') {
      changeDate(1);
      return false;
    }
  });
}

async function preload() {
  const year = (document.querySelector('.dataManagement select#year') as HTMLInputElement).value;
  const month = (document.querySelector('.dataManagement select#month') as HTMLInputElement).value;

  if (month === 'all') {
    messageService.addMessage('"all" is not supported in preload');
    return;
  }

  const startDate = dayjs(year + '-' + month, 'YYYY-MM');
  startDate.startOf('month');
  for (let i = 0; i < 31; i++) {
    const date = startDate.startOf('month').add(i, 'day');

    if (date.format('MM') !== month) {
      // don't load different month
      return;
    }

    await dataService.getData(date.toDate());
    messageService.addMessage('data loaded for: ' + date.format('YYYY.MM.DD'));
  }
}

async function login() {
  const user = (document.querySelector('#user') as HTMLInputElement).value;
  const password = (document.querySelector('#password') as HTMLInputElement).value;
  const expiration = parseInt((document.querySelector('#expiration') as HTMLInputElement).value);
  const successful = await networkService.login(user, password, expiration);
  if (successful) {
    document.querySelector('#loginBlock')?.classList.add('hidden');
    initWhenLoggedIn();
  }
}

async function initBaseServices() {
  messageService = new MessageService('#messageLog');
  networkService = new NetworkService(messageService);
  mappingService = new MappingService();
  graphManager = new GraphManager();
}

async function initServices() {
  batteryList = await networkService.getBatteryList();
  cacheService = new CacheService(messageService);
  dataService = new DataService(messageService, networkService, cacheService, batteryList);
  uiController = new UiController(messageService, cacheService, dataService);
  // TODO fix cast of undefined|Element to HTMLElement
  statsViewer = new StatsViewer(dataService, document.querySelector('#stats') as HTMLElement);
}

function changeDate(day: number) {
  const date = calendar.getSelected();
  const newDate = dayjs(date).add(day, 'day');

  setDate(newDate.toDate());
}

function setDate(date: Date) {
  const newDate = dayjs(date);
  const formatted = newDate.format('YYYY-MM-DD');

  // (document.querySelector('#timeFrom') as HTMLInputElement).value = formatted;

  calendar.clearSelected();
  calendar.addSelected(formatted);

  const newFocusMonth = newDate.format('MM');
  if (calendar.getFocusMonth() !== newFocusMonth) {
    calendar.setFocusMonth(newDate.format('MM'));
    if (newFocusMonth === '01' || newFocusMonth === '12') {
      calendar.setFocusYear(newDate.format('YYYY'));
    }
  }

  show();
}

async function show() {
  console.log('show()');

  try {
    // const time = new Date((document.querySelector('#timeFrom') as HTMLInputElement).value);
    const time = calendar.getSelected();
    const smoothing = parseInt((document.getElementById('smoothing') as HTMLInputElement).value);

    // window.location.hash = 'date=' + dayjs(time).format('YYYY-MM-DD');
    // change hash without triggering hashChange
    history.replaceState(null, '', document.location.pathname + '#' + 'date=' + dayjs(time).format('YYYY-MM-DD'));

    const from = dayjs(time).startOf('day').add(timeShiftInHours, 'hour').toDate();
    const to = dayjs(time).endOf('day').add(timeShiftInHours, 'hour').toDate();

    // clear old data
    graphManager.createBaseDiagram(from, to);

    const data = await dataService.getData(from, to);
    if (data) {
      renderData(from, to, data, smoothing);

      // if it's a small window, scroll down to the diagram
      if (window.innerWidth < 800) {
        window.scrollTo(0, 2000);
      }
    }

    statsViewer.setDate(from);
  } catch (error) {
    console.error(error);
    messageService.addMessage(error);

    // check if error is because of missing token
    if (!networkService.isToken()) {
      document.querySelector('#loginBlock')?.classList.remove('hidden');
    }
  }
}

function renderData(from: Date, to: Date, data: DataSet[], smoothing: number) {
  // clear again to only show the latest data (because of async of getData)
  graphManager.createBaseDiagram(from, to);

  const dataSmoothed = mappingService.mergeByTime(data, smoothing * 60);

  const color = new Color();

  const battery1MaxSoc = Math.round(
    Math.max(
      ...data.map(entry => {
        return entry.battery1Soc ? entry.battery1Soc : 0;
      })
    ) * 100
  );
  const battery2MaxSoc = Math.round(
    Math.max(
      ...data.map(entry => {
        return entry.battery2Soc ? entry.battery2Soc : 0;
      })
    ) * 100
  );

  graphManager.addGraph(
    {name: 'battery1Soc', label: `battery1Soc, ${battery1MaxSoc}%`, color: 'lightgrey', yAxis: 'y2'},
    mapData('battery1Soc', dataSmoothed)
  );
  graphManager.addGraph(
    {name: 'battery2Soc', label: `battery2Soc, ${battery2MaxSoc}%`, color: 'lightgrey', yAxis: 'y2'},
    mapData('battery2Soc', dataSmoothed)
  );

  // graphManager.addGraph({name: 'powerPV', color: color.gold}, mapData('powerPV', data));
  addPowerToGraph({name: 'powerPV', color: color.gold}, data, dataSmoothed, graphManager);

  // graphManager.addGraph({name: 'powerHousehold', color: 'blue'}, mapData('powerHousehold', data));
  // graphManager.addGraph({name: 'powerFromGrid', color: 'red'}, mapData('powerFromGrid', data));
  // graphManager.addGraph({name: 'powerToGrid', color: 'darkorange'}, mapData('powerToGrid', data));
  addPowerToGraph({name: 'powerHousehold', color: 'blue'}, data, dataSmoothed, graphManager);
  addPowerToGraph({name: 'powerFromGrid', color: 'red'}, data, dataSmoothed, graphManager);
  addPowerToGraph({name: 'powerToGrid', color: 'darkorange'}, data, dataSmoothed, graphManager);

  const batteryFrom4Graph = sumData(mapData('battery1From', dataSmoothed), mapData('battery2From', dataSmoothed));
  const batteryFrom4kWh = sumData(mapData('battery1From', data), mapData('battery2From', data));
  const kWhBatteryFrom = absoluteKilowattStunden(batteryFrom4kWh);

  const batteryTo4Graph = sumData(mapData('battery1To', dataSmoothed), mapData('battery2To', dataSmoothed));
  const batteryTo4kWh = sumData(mapData('battery1To', data), mapData('battery2To', data));
  const kWhBatteryTo = absoluteKilowattStunden(batteryTo4kWh);

  let wirkungsgrad = kWhBatteryFrom / kWhBatteryTo;
  wirkungsgrad = Math.round(wirkungsgrad * 100);

  graphManager.addGraph(
    {name: 'batteryFrom', label: 'batteryFrom,' + kWhBatteryFrom + ' kWh' + ' (' + wirkungsgrad + '%)', color: '#0D74E4'},
    batteryFrom4Graph
  );

  // batteryTo summarized or for each battery separate
  graphManager.addGraph({name: 'batteryTo', label: 'batteryTo,' + kWhBatteryTo + ' kWh', color: 'green'}, batteryTo4Graph);
  // addPowerToGraph({name: 'battery1To', color: 'green'}, data, dataSmoothed, graphManager);
  // addPowerToGraph({name: 'battery2To', color: 'green'}, data, dataSmoothed, graphManager);
}

function addPowerToGraph(config: {name: string; color: string}, data: DataSet[], dataSmoothed: DataSet[], graphManager: GraphManager) {
  const pathData: PathData[] = mapData(config.name, dataSmoothed);
  const kWhData: PathData[] = mapData(config.name, data);
  const kWh = absoluteKilowattStunden(kWhData);
  graphManager.addGraph({name: config.name, label: config.name + ', ' + kWh + ' kWh', color: config.color}, pathData);
}

function absoluteKilowattStunden(data: PathData[]): number {
  let sum = 0;
  data.forEach(entry => {
    sum += entry.value ? entry.value : 0;
  });

  return Math.round(sum / 60 / 100) / 10;
}

function mapData(key: string, data: DataSet[]): PathData[] {
  return data.map((entry: DataSet) => {
    return {time: entry.dateTime, value: entry[key as keyof DataSet] as number};
  });
}

function sumData(data1: PathData[], data2: PathData[]): PathData[] {
  const result: PathData[] = [];

  for (let i = 0; i < data1.length; i++) {
    const entry1 = data1[i];
    const entry2 = data2[i];
    if (entry1.time === entry2.time) {
      result.push({
        time: entry1.time,
        value: (entry1.value ? entry1.value : 0) + (entry2.value ? entry2.value : 0)
      });
    } else {
      console.warn('cannot add data, data in not complete!');
      return [];
    }
  }

  return result;
}

async function test1() {
  const products = await networkService.getBatteryList();
  console.log('products:', JSON.stringify(products, null, 2));
}

async function test2() {
  const color = new Color();
  const propList = Object.getOwnPropertyNames(color);
  for (let i = 0; i < propList.length; i++) {
    const propName = propList[i];
    const div = document.createElement('div');
    div.innerHTML = propName;
    div.setAttribute('class', 'colorExample');
    div.style.backgroundColor = color[propName as keyof Color];
    // for the first colors (dark), change text color to white
    if (i < 5) {
      div.style.color = 'white';
    }
    document.body.appendChild(div);
  }
}

async function initCalendar() {
  let keys = await cacheService.getProcessedDataKeys();

  // filter only for ready data (no raw data)
  keys = keys.filter((entry: string) => {
    return entry.endsWith('-vs-processed');
  });

  keys = keys.map((entry: string) => {
    return entry.substr(0, 10);
  });

  // map to other date format
  keys = keys.map((entry: string) => {
    return entry.replace('.', '-').replace('.', '-');
  });

  // set start date to yesterday day
  const startDateFormatted = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

  const options = {
    locale: 'de',
    highlight_sunday: false,
    date: startDateFormatted,
    highlight: keys,
    future_select: false,
    past_select: true
  };

  calendar = new tavoCalendar('.calendar', options);

  document.querySelector('.calendar')?.addEventListener('calendar-select', event => {
    show();
  });

  document.addEventListener('cache-changed', event => {
    // localforage.keys().then(keysParam => {
    cacheService.getProcessedDataKeys().then(keysParam => {
      // filter only for ready data (no raw data)
      keys = keysParam.filter((entry: string) => {
        return entry.endsWith('-vs-processed');
      });

      keys = keys.map((entry: string) => {
        return entry.substr(0, 10);
      });

      // map to other date format
      keys = keys.map((entry: string) => {
        return entry.replace('.', '-').replace('.', '-');
      });

      const state = calendar.getState();
      const config = calendar.getConfig();
      state.highlight = keys;
      config.highlight = keys;
      // calendar.setConfig(config);
      calendar.sync({state, config});
    });
  });

  window.addEventListener('hashchange', () => {
    const urlDateIndex = window.location.hash.indexOf('date=');
    if (urlDateIndex > -1) {
      const dateFormatted = window.location.hash.substring(urlDateIndex + 5);
      const newDate = dayjs(dateFormatted, 'YYYY-MM-DD').startOf('day').toDate();
      setDate(newDate);
    }
  });

  calendar.clearSelected();
  calendar.addSelected(startDateFormatted);

  // set start based on url parameter
  const urlDateIndex = window.location.hash.indexOf('date=');
  if (urlDateIndex > -1) {
    const dateFormatted = window.location.hash.substring(urlDateIndex + 5);
    const newDate = dayjs(dateFormatted, 'YYYY-MM-DD').startOf('day').toDate();
    setDate(newDate);
  }
}

function initDataManagementDates() {
  (document.querySelector('#year') as HTMLInputElement).value = dayjs().format('YYYY');
  (document.querySelector('#month') as HTMLInputElement).value = dayjs().format('MM');
}

function deleteToken() {
  localStorage.removeItem('vs-token');
  document.querySelector('#loginBlock')?.classList.remove('hidden');
}

let introAlreadyShown = false;
async function startIntro() {
  if (introAlreadyShown) {
    return;
  }

  isArrowNavigationEnabled = false;

  // const data = await cacheService.getProcessedData('2021.05.17-vs-processed');
  // calendar.clearSelected();
  // calendar.addSelected('2021.05.01');
  // show();

  const from = dayjs('2021-05.15', 'YYYY-MM-DD').startOf('day').toDate();
  const to = dayjs('2021-05.15', 'YYYY-MM-DD').endOf('day').toDate();

  // IMPL better way?
  demoData.forEach(entry => {
    entry.dateTime = new Date(entry.dateTime);
  });

  renderData(from, to, demoData, 15);

  introJs()
    .setOptions({
      steps: [
        {
          title: 'Intro',
          intro: `Dies ist eine kleine Anleitung für den VoltStorage Data Analyzer.<br>
                  Sie kommt bei jedem Login, kann aber jederzeit geschlossen werden.`
        },
        {
          element: document.querySelector('.login') as Element,
          title: 'Login',
          intro: `Hier kannst Du dich einloggen und einstellen wie lange der Login gültig sein soll.<br>
                  Bei gültigem Login ist er ausgeblendet.`
        },
        {
          element: document.querySelector('.settings') as Element,
          title: 'Settings',
          intro: `Hier kann das Datum für die Anzeige ausgewählt werden. Beim Start ist immer der Vortag ausgewählt.<br>
                  Bei grün hinterlegten Tagen wurden die Daten bereits geladen und sind somit sofort verfügbar.<br>
                  Hinweis: Das Laden neuer Daten dauert je Tag bis zu 1 Minute.`
        },
        {
          element: document.querySelector('.settings .buttonNavigation') as Element,
          title: 'Navigation',
          intro: `Über diese Knöpfe kann je ein Tag zurück oder vor gesprungen werden.<br>
                  Ein Wechsel ist auch über die Pfeiltasten &#129044; &#129046; möglich.`
        },
        {
          element: document.querySelector('.settings .smoothing') as Element,
          title: 'Smoothing',
          intro: `Die Daten liegen in einer Auflösung von einer Minute vor.<br>
                  Da es dann aber unübersichtlich ist kann hier eine Glättung eingestellt werden.`
        },
        {
          title: 'Data Management',
          element: document.querySelector('.dataManagement') as Element,
          intro: `Das Laden der Daten dauert lange, daher empfiehlt sich eine Sicherung der Daten.<br>
                  Hier können die Daten Monats oder Jahresweise exportiert werdeb.<br>
                  Für jeden Tag wird eine CSV Datei erstellt und in einer ZIP Datei zusammen gepackt.<br>
                  Über "Import" können die zuvor exportierten Daten wieder eingespielt werden.`
        },
        {
          title: 'Data Management - Date',
          element: document.querySelector('.dataManagement .date') as Element,
          intro: `Das Datum für die Aktionen.<br>
                  Zum Beispiel: "Export von April 2021"<br>
                  "Raw data" werden normalerweise nicht gespeichert und sind nur im Debug Modus verfügbar (sehr groß).`
        },
        {
          title: 'Data Management - Import',
          element: document.querySelector('#fileImport') as Element,
          intro: `Hier können Daten importiert werden. Einfach die entsprechende ZIP Datei auswählen.<br>
                  Es können auch mehrere Dateien ausgewählt bzw. per Drag & Drop auf den "Datei auswählen" Button gezogen werden.`
        },
        {
          title: 'Messages',
          element: document.querySelector('.messages') as Element,
          intro: `Hier werden besondere Nachrichten angezeigt. z.B:<br>
                  Ungültiger Login, Daten werden geladen, Export, ...`
        },
        {
          title: 'Diagram',
          element: document.querySelector('.diagram') as Element,
          intro: 'Hier werden die Diegramme für den ausgewählte Tag angezeigt'
        },
        {
          title: 'Legende',
          element: document.querySelector('text.powerHousehold') as Element,
          intro: `Wenn die Maus über der Legende ist wird die entsprechende Linie hervorgehoben.<br>
                  Bei Klick auf die Legende wird die Linie ausgeblendet.<br>
                  ACHTUNG: der kWh Wert ist gron berechnet, keine Garantie für Genauigkeit!`
        }
      ]
    })
    .onexit(function () {
      console.log('intro onexit');
      isArrowNavigationEnabled = true;
      // show seleted date, overwrite demo graph
      show();
    })
    .start();

  // better use callback of the intro object
  introAlreadyShown = true;
}

// FIXME global stuff
// https://stackoverflow.com/questions/15084675/how-to-implement-swipe-gestures-for-mobile-devices
function detectswipe(elId, func) {
  window.swipe_det = new Object();
  window.swipe_det.sX = 0;
  window.swipe_det.sY = 0;
  window.swipe_det.eX = 0;
  window.swipe_det.eY = 0;
  const min_x = 30; // min x swipe for horizontal swipe
  const max_x = 30; // max x difference for vertical swipe
  const min_y = 50; // min y swipe for vertical swipe
  const max_y = 60; // max y difference for horizontal swipe
  let direc = '';
  const ele = document.getElementById(elId);
  ele.addEventListener(
    'touchstart',
    function (e) {
      const t = e.touches[0];
      window.swipe_det.sX = t.screenX;
      window.swipe_det.sY = t.screenY;
    },
    false
  );
  ele.addEventListener(
    'touchmove',
    function (e) {
      // e.preventDefault();
      const t = e.touches[0];
      window.swipe_det.eX = t.screenX;
      window.swipe_det.eY = t.screenY;
    },
    false
  );
  ele.addEventListener(
    'touchend',
    function (event) {
      // horizontal detection
      if (
        (window.swipe_det.eX - min_x > window.swipe_det.sX || window.swipe_det.eX + min_x < window.swipe_det.sX) &&
        window.swipe_det.eY < window.swipe_det.sY + max_y &&
        window.swipe_det.sY > window.swipe_det.eY - max_y &&
        window.swipe_det.eX > 0
      ) {
        if (window.swipe_det.eX > window.swipe_det.sX) direc = 'r';
        else direc = 'l';
      }
      // vertical detection
      else if (
        (window.swipe_det.eY - min_y > window.swipe_det.sY || window.swipe_det.eY + min_y < window.swipe_det.sY) &&
        window.swipe_det.eX < window.swipe_det.sX + max_x &&
        window.swipe_det.sX > window.swipe_det.eX - max_x &&
        window.swipe_det.eY > 0
      ) {
        if (window.swipe_det.eY > window.swipe_det.sY) direc = 'd';
        else direc = 'u';
      }

      if (direc != '') {
        if (typeof func == 'function') func(elId, direc);
      }
      direc = '';
      window.swipe_det.sX = 0;
      window.swipe_det.sY = 0;
      window.swipe_det.eX = 0;
      window.swipe_det.eY = 0;
    },
    false
  );
}

function myfunction(el, d) {
  // alert("you swiped on element with id '" + el + "' to " + d + ' direction');
  if (d === 'l') {
    changeDate(1);
  } else if (d === 'r') {
    changeDate(-1);
  }
}

detectswipe('myGraphs', myfunction);
