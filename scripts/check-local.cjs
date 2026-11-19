'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let checked = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules','.git','.vercel','.local-tools','.release-readonly'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|cjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) throw Error('SYNTAX_CHECK_FAILED: ' + path.relative(root, file));
      checked++;
    }
  }
}
walk(root);
console.log(JSON.stringify({ status: 'PASS', javascriptFiles: checked, build: 'STATIC_SITE_NO_BUILD_SCRIPT' }));
