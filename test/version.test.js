'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('APP_VERSION matches the latest CHANGELOG.md entry', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');

  const versionMatch = /var APP_VERSION\s*=\s*'v([\d.]+)'/.exec(html);
  assert.ok(versionMatch, 'APP_VERSION not found in PatentDesk.html');

  // Keep a Changelog: first dated/numbered release heading after [Unreleased],
  // e.g. "## [4.14.0] - 2026-06-22". The bracketed version is captured.
  const changelogMatch = /^##\s*\[(\d[\d.]*)\]/m.exec(
    changelog.replace(/^##\s*\[Unreleased\].*$/m, ''));
  assert.ok(changelogMatch, 'No version entry found in CHANGELOG.md');

  assert.strictEqual(versionMatch[1], changelogMatch[1],
    'APP_VERSION (v' + versionMatch[1] + ') does not match the latest CHANGELOG.md entry ([' + changelogMatch[1] + '])');
});
