/* eslint-disable @typescript-eslint/no-var-requires */
/* global require */

'use strict';

const fs = require('fs');
const pJson = require('../package.json');
const dayjs = require('dayjs');

const versionObj = {
  version: pJson.version,
  buildDate: dayjs().format('DD.MM.YYYY')
};

// eslint-disable-next-line no-console
console.log(versionObj);

const data = JSON.stringify(versionObj);
fs.writeFileSync('./src/version.json', data);
