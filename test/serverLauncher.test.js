'use strict';
// Start-PatentDesk.ps1 as a shared server for several HTML apps in its folder:
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

test('only accepts a plain .html filename that exists in the app folder', () => {
  assert.match(ps1, /\$Page -notmatch '\^\[\\w\\- \.\]\+\\\.html\$'/);
  assert.match(ps1, /Test-Path -LiteralPath \(Join-Path \$appFolder \$Page\) -PathType Leaf/);
  assert.match(ps1, /\$url = "http:\/\/localhost:\$port\/\$Page"/);
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
