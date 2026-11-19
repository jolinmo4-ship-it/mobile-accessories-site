'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createMediaResolver } = require('../server/media-map');
module.exports = createMediaResolver({ loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../data/r2-verified-media.json'), 'utf8'));
} });
