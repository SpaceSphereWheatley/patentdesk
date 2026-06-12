'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('APP_VERSION matches the latest CHANGELOG.txt entry', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.txt'), 'utf8');

  const versionMatch = /var APP_VERSION\s*=\s*'(v[\d.]+)'/.exec(html);
  assert.ok(versionMatch, 'APP_VERSION not found in PatentDesk.html');

  const changelogMatch = /^(v[\d.]+)\s/m.exec(changelog);
  assert.ok(changelogMatch, 'No version entry found in CHANGELOG.txt');

  assert.strictEqual(versionMatch[1], changelogMatch[1],
    'APP_VERSION (' + versionMatch[1] + ') does not match the latest CHANGELOG.txt entry (' + changelogMatch[1] + ')');
});
