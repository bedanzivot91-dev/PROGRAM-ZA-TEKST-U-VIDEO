'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const COVERAGE = path.join(ROOT, '.v8-coverage');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

fs.rmSync(COVERAGE, { recursive: true, force: true });
fs.mkdirSync(COVERAGE, { recursive: true });

// Static test namerno nije instrumentovan: on pokreće `node --check` nad browser vendor
// bundle-ovima i NODE_V8_COVERAGE menja ponašanje tih child procesa. Njega kompletan
// `npm test` proverava zasebno, bez instrumentation-a.
const excluded = new Set(['test:static']);
const scripts = Object.keys(pkg.scripts || {}).filter(name => name.startsWith('test:') && !excluded.has(name));
if (!scripts.length) throw new Error('Nema test:* skripti za coverage.');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const script of scripts) {
  console.log(`\n== V8 COVERAGE: npm run ${script} ==`);
  const result = childProcess.spawnSync(npmCmd, ['run', script], {
    cwd: ROOT,
    env: { ...process.env, NODE_V8_COVERAGE: COVERAGE },
    stdio: 'inherit',
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\nCoverage test suite završio: ${scripts.length} test skripti.`);
