'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-advanced-deep-'));
process.env.MSS_DATA_DIR = temp;
process.env.NODE_ENV = 'test';
process.env.MSS_TEST_CRYPTO_PROVIDER = 'fallback';

const advanced = require(path.join(ROOT, 'PROGRAM - NE BRISATI', 'advanced-tools.js'));
let passed = 0;
function ok(value, message) { assert.ok(value, message); passed++; console.log(`  [OK] ${message}`); }

function writeSafetensors(file) {
  const header = Buffer.from(JSON.stringify({
    '__metadata__': { source: 'test' },
    'tensor.test': { dtype: 'F32', shape: [1], data_offsets: [0, 4] }
  }), 'utf8');
  const len = Buffer.alloc(8);
  len.writeBigUInt64LE(BigInt(header.length));
  const padding = Buffer.alloc(1024 * 1024 + 32, 0);
  fs.writeFileSync(file, Buffer.concat([len, header, padding]));
}

try {
  console.log('== AdvancedTools deep execution testovi ==');

  const atomic = path.join(temp, 'nested', 'atomic.json');
  advanced.writeJsonAtomic(atomic, { hello: 'svet' });
  ok(advanced.readJson(atomic).hello === 'svet', 'writeJsonAtomic + readJson stvarno rade na disku');

  const secure = advanced.secureFile('deep-secret');
  advanced.writeSecureJson(secure, { token: 'tajna', count: 7 });
  const envelope = advanced.readJson(secure);
  ok(envelope.provider === 'local-aes-gcm-test-fallback', 'test režim eksplicitno izvršava AES-GCM fallback provider');
  ok(advanced.readSecureJson(secure).token === 'tajna', 'fallbackProtect/fallbackUnprotect rade puni round-trip');
  ok(!fs.readFileSync(secure, 'utf8').includes('tajna'), 'secure JSON ne čuva tajnu kao plaintext');

  const plain = path.join(temp, 'legacy-provider.json');
  fs.writeFileSync(plain, JSON.stringify({ apiKey: 'legacy-secret' }), 'utf8');
  const migrated = advanced.migratePlainJson(plain, 'migrated-provider', {});
  ok(migrated.migrated === true && !fs.existsSync(plain), 'migratePlainJson šifruje i uklanja legacy plaintext');
  ok(advanced.readSecureJson(advanced.secureFile('migrated-provider')).apiKey === 'legacy-secret', 'migrirani secure JSON se uspešno otključava');
  const secondMigration = advanced.migratePlainJson(plain, 'migrated-provider', {});
  ok(secondMigration.migrated === false, 'ponovljena migracija je idempotentna');

  const hashFile = path.join(temp, 'hash.bin');
  fs.writeFileSync(hashFile, 'abc');
  ok(advanced.fileSha256(hashFile) === crypto.createHash('sha256').update('abc').digest('hex'), 'fileSha256 daje tačan SHA-256');

  const modelDir = path.join(temp, 'models');
  fs.mkdirSync(path.join(modelDir, 'sub'), { recursive: true });
  const safetensor = path.join(modelDir, 'wan-test.safetensors');
  writeSafetensors(safetensor);
  const verified = advanced.verifyModelFile(safetensor, { fullHash: true });
  ok(verified.exists && verified.ok && verified.kind === 'WAN', 'verifyModelFile prepoznaje validan WAN safetensors model');
  ok(verified.metadata?.tensorCount === 1 && verified.sha256?.length === 64, 'verifyModelFile čita safetensors metadata i puni hash');
  const candidate = path.join(modelDir, 'sub', 'instantid.bin');
  fs.writeFileSync(candidate, Buffer.alloc(32));
  const candidates = advanced.findCandidateModels([modelDir]);
  ok(candidates.includes(safetensor) && candidates.includes(candidate), 'findCandidateModels rekurzivno nalazi podržane modele');
  ok(advanced.verifyModelFile(path.join(temp, 'missing.safetensors')).exists === false, 'verifyModelFile bezbedno prijavljuje nepostojeći model');

  const h1 = advanced.addHistory({ id: 'one', songTitle: 'Prva', views: 10, likes: 2 });
  const h2 = advanced.addHistory({ id: 'two', songTitle: 'Druga', views: 30, likes: 5 });
  ok(h1.id === 'one' && h2.id === 'two', 'addHistory upisuje zapise');
  const loaded = advanced.loadHistory();
  ok(loaded.records.length === 2, 'loadHistory vraća sačuvane zapise');
  const summary = advanced.historySummary();
  ok(summary.count === 2 && summary.totals.views === 40 && summary.topByViews[0].id === 'two', 'historySummary pravilno sabira i rangira istoriju');

  const status = advanced.securityStatus();
  ok(status.ok === true && Array.isArray(status.files), 'securityStatus vraća validan pregled secure fajlova');

  console.log(`\n== REZULTAT: ${passed} prošlo, 0 nije prošlo ==`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
