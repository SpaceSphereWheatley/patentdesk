'use strict';
// Start-PatentDesk.ps1 as a shared server for several HTML apps (in its folder
// or listed in Start-PatentDesk.pages.txt):
// a launch attaches to a running server instead of restarting it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ps1 = fs.readFileSync(path.join(__dirname, '..', 'Start-PatentDesk.ps1'), 'utf8');

test('takes the page to open as a parameter, PatentDesk by default', () => {
  const firstCode = ps1.split('\n').find(l => l.trim() && !l.trim().startsWith('#'));
  assert.match(firstCode, /^param\(/, 'param() must be the first statement');
  assert.match(ps1, /\[string\]\$Page\s*=\s*'PatentDesk\.html'/);
});

test('only accepts a plain .html filename, in the app folder or listed in pages.txt', () => {
  assert.match(ps1, /\$pageName -notmatch '\^\[\\w\\- \.\]\+\\\.html\$'/);
  assert.match(ps1, /Test-Path -LiteralPath \(Join-Path \$appFolder \$pageName\) -PathType Leaf/);
  assert.match(ps1, /\$url = "http:\/\/localhost:\$port\/\$pageName"/);
});

test('a full path to an .html file elsewhere is remembered in Start-PatentDesk.pages.txt', () => {
  assert.match(ps1, /\$pagesFile = Join-Path \$appFolder 'Start-PatentDesk\.pages\.txt'/);
  const branch = ps1.slice(ps1.indexOf('IsPathRooted($Page)'), ps1.indexOf('$url = '));
  assert.match(branch, /Test-Path -LiteralPath \$Page -PathType Leaf/, 'the file must exist');
  assert.match(branch, /-not \(Test-Path -LiteralPath \(Join-Path \$appFolder \$pageName\)/,
    'a file in the app folder wins over one elsewhere with the same name');
  assert.match(branch, /-ine \$pageName/, 'an older entry with the same name is replaced');
  assert.match(branch, /Set-Content -LiteralPath \$pagesFile/);
});

test('the server serves a listed page only by its exact filename, and only if it exists', () => {
  const fn = ps1.slice(ps1.indexOf('function Find-ExtraPage'), ps1.indexOf('\n}', ps1.indexOf('function Find-ExtraPage')));
  assert.match(fn, /GetFileName\(\$p\) -ieq \$name/);
  assert.match(fn, /Test-Path -LiteralPath \$p -PathType Leaf/);
  const serve = ps1.slice(ps1.lastIndexOf('Resolve-Inside $appFolder $segments'));
  assert.match(serve, /\$segments\.Count -eq 1 -and \$segments\[0\] -match '\^\[\\w\\- \.\]\+\\\.html\$'/,
    'only a single .html name is looked up in the list');
  assert.match(serve, /Find-ExtraPage \$segments\[0\]/);
});

test('answers /__server with an id and the script version stamp', () => {
  assert.match(ps1, /\$segments\[0\] -eq '__server'/);
  assert.match(ps1, /Send-Json \$response @\{ app = 'patentdesk-server'; script = \$scriptStamp \}/);
  assert.match(ps1, /\$scriptStamp = .*LastWriteTimeUtc\.Ticks/);
});

test('attaches to a running server of the same version without restarting it', () => {
  const attach = ps1.indexOf("$running.app -eq 'patentdesk-server' -and $running.script -eq $scriptStamp");
  const kill = ps1.indexOf('Stop-Process');
  assert.ok(attach > 0, 'checks the running server');
  assert.ok(kill > attach, 'stopping an old server comes after the attach check');
  const branch = ps1.slice(attach, ps1.indexOf('\n}', attach));
  assert.match(branch, /Start-Process "msedge\.exe" \$url/);
  assert.match(branch, /exit/);
});

test('the check bypasses any system proxy and times out quickly', () => {
  assert.match(ps1, /\.Proxy = \$null/);
  assert.match(ps1, /\.Timeout = \d{3,4}\b/);
});

test('a mutex keeps two simultaneous launches from starting two servers', () => {
  assert.match(ps1, /New-Object System\.Threading\.Mutex\(\$false, 'Local\\PatentDeskServerStart'\)/);
  const wait = ps1.indexOf('.WaitOne(');
  const check = ps1.indexOf('Get-RunningServer', ps1.indexOf('function Get-RunningServer') + 30);
  const release = ps1.lastIndexOf('.ReleaseMutex()');
  assert.ok(wait > 0 && wait < check, 'waits for the mutex before checking');
  assert.ok(release > ps1.indexOf('$candidate.Start()'), 'releases only once the listener is up');
  assert.doesNotMatch(ps1, /^\s*\$startLock\.ReleaseMutex\(\)/m, 'releases only a mutex it owns');
});
