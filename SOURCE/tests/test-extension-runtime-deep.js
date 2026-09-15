'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'PROGRAM - NE BRISATI', 'browser-extension', 'MSS-ChatGPT-Plus-Most');
const SERVER = path.join(ROOT, 'PROGRAM - NE BRISATI', 'server.js');
let passed = 0;
function ok(value, message) { assert.ok(value, message); passed += 1; console.log(`  [OK] ${message}`); }

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

async function testVersionContract() {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const worker = fs.readFileSync(path.join(EXT, 'service-worker.js'), 'utf8');
  const server = fs.readFileSync(SERVER, 'utf8');
  const workerVersion = worker.match(/EXTENSION_VERSION\s*=\s*'([^']+)'/)?.[1];
  const expectedVersion = server.match(/EXPECTED_EXTENSION_VERSION\s*=\s*'([^']+)'/)?.[1];
  ok(Boolean(workerVersion && expectedVersion), 'extension/server verzijski ugovor je eksplicitno definisan');
  ok(manifest.version === workerVersion && workerVersion === expectedVersion, `manifest, worker i server očekuju isti bridge build ${expectedVersion}`);
}

async function testServiceWorker() {
  const source = fs.readFileSync(path.join(EXT, 'service-worker.js'), 'utf8');
  const storage = {};
  let listener = null;
  const notifications = [];
  const scripts = [];
  const requests = [];
  const chrome = {
    storage: { local: {
      get: async keys => Object.fromEntries((keys || []).map(key => [key, storage[key]])),
      set: async values => Object.assign(storage, values)
    } },
    runtime: { onMessage: { addListener: fn => { listener = fn; } } },
    notifications: { create: async (...args) => { notifications.push(args); return 'n1'; } },
    scripting: { executeScript: async spec => { scripts.push(spec); return []; } }
  };
  const fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const u = String(url);
    if (u.endsWith('/api/plus-bridge/config')) return responseJson({ ok:true, key:'bridge-key-123' });
    if (u.endsWith('/api/plus-bridge/heartbeat')) return responseJson({ ok:true, heartbeat:true });
    if (u.endsWith('/api/plus-bridge/status')) return responseJson({ ok:true, version:'15.6', extensionCompatible:true });
    if (u.endsWith('/api/plus-bridge/job')) return responseJson({ ok:true, job:{ id:'job-1', type:'test' } });
    if (u.endsWith('/api/plus-bridge/job-status')) return responseJson({ ok:true, saved:true });
    if (u.endsWith('/api/plus-bridge/result')) return responseJson({ ok:true, imported:true });
    return responseJson({ error:'not found' }, 404);
  };
  const context = vm.createContext({ chrome, fetch, Response, AbortController, URL, setTimeout, clearTimeout, console, Date, JSON, String, Error });
  vm.runInContext(source, context, { filename:'service-worker.js' });
  ok(typeof listener === 'function', 'service-worker registruje runtime onMessage handler');

  async function send(message, sender = { url:'http://127.0.0.1:4180/', tab:{ id:77 } }) {
    return new Promise((resolve, reject) => {
      const keepAlive = listener(message, sender, resolve);
      if (keepAlive !== true) reject(new Error(`handler nije zadržao async kanal za ${message.type}`));
      setTimeout(() => reject(new Error(`timeout ${message.type}`)), 3000).unref?.();
    });
  }

  const local = await send({ type:'MSS_LOCAL_PAGE', baseUrl:'http://127.0.0.1:4180' });
  ok(local.ok === true && local.baseUrl === 'http://127.0.0.1:4180', 'MSS_LOCAL_PAGE pronalazi lokalni Studio i vraća vezu');
  ok(storage.mssBaseUrl === 'http://127.0.0.1:4180' && storage.mssBridgeKey === 'bridge-key-123', 'service-worker čuva base URL i bridge ključ');
  const heartbeatCall = requests.find(item => item.url.endsWith('/api/plus-bridge/heartbeat'));
  ok(Boolean(heartbeatCall), 'lokalno povezivanje šalje heartbeat serveru');
  ok(heartbeatCall.options.headers['X-MSS-Bridge-Key'] === 'bridge-key-123', 'zaštićen bridge poziv šalje X-MSS-Bridge-Key');

  const status = await send({ type:'MSS_GET_STATUS' });
  ok(status.ok === true && status.status.extensionCompatible === true, 'MSS_GET_STATUS čita bridge status');
  const job = await send({ type:'MSS_GET_JOB' });
  ok(job.ok === true && job.job.id === 'job-1', 'MSS_GET_JOB čita aktivan posao');
  const jobStatus = await send({ type:'MSS_JOB_STATUS', payload:{ jobId:'job-1', status:'waiting-response' } });
  ok(jobStatus.ok === true && jobStatus.saved === true, 'MSS_JOB_STATUS šalje status lokalnom serveru');
  const posted = await send({ type:'MSS_POST_RESULT', payload:{ jobId:'job-1', raw:'{"bridgeTest":true}' } });
  ok(posted.ok === true && posted.imported === true, 'MSS_POST_RESULT vraća rezultat programu');
  const notified = await send({ type:'MSS_NOTIFY', title:'Test', body:'Radi' });
  ok(notified.ok === true && notifications.length === 1, 'MSS_NOTIFY izvršava Chrome notification tok');
  const copied = await send({ type:'MSS_COPY_TEXT', text:'kopiraj' });
  ok(copied.ok === true && scripts[0]?.target?.tabId === 77 && scripts[0]?.args?.[0] === 'kopiraj', 'MSS_COPY_TEXT izvršava scripting tok na pravom tabu');
  const unknown = await send({ type:'MSS_NEPOZNATO' });
  ok(unknown.ok === false && /Nepoznata komanda/.test(unknown.error), 'nepoznata extension poruka se bezbedno odbija');
}

async function testLocalApp() {
  const source = fs.readFileSync(path.join(EXT, 'local-app.js'), 'utf8');
  const events = [];
  const messages = [];
  class CustomEventMock { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  const window = { dispatchEvent: event => { events.push(event); return true; } };
  const chrome = { runtime: { sendMessage: async message => { messages.push(message); return { ok:true, version:'15.6.0' }; } } };
  const context = vm.createContext({ window, chrome, location:{ origin:'http://127.0.0.1:4180' }, CustomEvent:CustomEventMock, setInterval:() => 1, console, String });
  vm.runInContext(source, context, { filename:'local-app.js' });
  await new Promise(resolve => setImmediate(resolve));
  ok(messages[0]?.type === 'MSS_LOCAL_PAGE' && messages[0]?.baseUrl === 'http://127.0.0.1:4180', 'local-app javlja trenutni lokalni origin service-workeru');
  ok(events[0]?.type === 'mss-plus-bridge-extension' && events[0]?.detail?.ok === true, 'local-app vraća rezultat Studiju kroz CustomEvent');
}

async function testPopup() {
  const source = fs.readFileSync(path.join(EXT, 'popup.js'), 'utf8');
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, textContent:'', listeners:{}, addEventListener(type, fn){ this.listeners[type] = fn; } });
    return elements.get(id);
  }
  const opened = [];
  const document = { getElementById: element };
  const chrome = {
    tabs: { create: payload => opened.push(payload) },
    runtime: { sendMessage: async message => message.type === 'MSS_GET_STATUS' ? { ok:true, status:{ version:'15.6', extensionVersion:'15.6.0', expectedExtensionVersion:'15.6.0', extensionCompatible:true, localPageConnected:true, chatgptTabConnected:true, job:null } } : { ok:false } }
  };
  vm.runInContext(source, vm.createContext({ document, chrome, Number, console }), { filename:'popup.js' });
  ok(typeof element('open-gpt').listeners.click === 'function' && typeof element('check').listeners.click === 'function', 'popup registruje oba glavna click handlera');
  element('open-gpt').listeners.click();
  ok(opened[0]?.url?.includes('chatgpt.com/g/g-6a62e905'), 'popup otvara tačno podešen privatni GPT');
  await element('check').listeners.click();
  ok(/Program: POVEZAN/.test(element('status').textContent) && /Kompatibilnost: ISPRAVNA/.test(element('status').textContent), 'popup prikazuje uspešan bridge status i kompatibilnost');
}

async function testChatGptBridgePureLogic() {
  let source = fs.readFileSync(path.join(EXT, 'chatgpt-bridge.js'), 'utf8');
  const marker = '\nbuildPanel();\n';
  if (!source.includes(marker)) throw new Error('chatgpt-bridge bootstrap marker nije pronađen');
  source = source.replace(marker, `\nglobalThis.__MSS_BRIDGE_TEST__ = { extractJsonObject, removePossibleIdentityPrefix, enforceLockedIdentityInAnswer, promptRequirements, validResearchSources, validatePromptScenes, validateAnswerForJob, jobLabel };\n`);
  source = source.replace(/setInterval\(\(\) => refreshJob[\s\S]*$/m, '');
  const context = vm.createContext({
    chrome:{ runtime:{ sendMessage:()=>{} }, storage:{ local:{ get:()=>{}, set:()=>{} } } },
    document:{}, window:{}, navigator:{ clipboard:{} }, location:{ hostname:'chatgpt.com', pathname:'/g/g-6a62e905ca608191be135254d6f2fbcc', href:'https://chatgpt.com/g/g-6a62e905ca608191be135254d6f2fbcc' },
    console, JSON, String, Number, Array, Object, Math, Date, Promise, URL, setTimeout, clearTimeout
  });
  vm.runInContext(source, context, { filename:'chatgpt-bridge.js' });
  const t = context.__MSS_BRIDGE_TEST__;
  ok(Boolean(t), 'chatgpt-bridge čista logika je izvršena u izolovanom content-script kontekstu');
  const parsed = t.extractJsonObject('```json\n{"bridgeTest":true}\n```');
  ok(parsed?.value?.bridgeTest === true, 'chatgpt-bridge izdvaja JSON iz fenced odgovora');

  const identity = 'LOCKED GIRL IDENTITY';
  const answer = { value:{ scenes:[{ imagePrompt:'SCENA 1 cinematic image prompt', videoPrompt:'Scene 1 cinematic video prompt' }] }, raw:'' };
  const locked = t.enforceLockedIdentityInAnswer(answer, { payload:{ project:{ lockedGirlIdentity:identity } } });
  ok(locked.value.scenes[0].imagePrompt.startsWith(identity) && locked.value.scenes[0].videoPrompt.startsWith(identity), 'locked identity se automatski dodaje image i video promptovima');

  const scenes = [1,2,3].map(number => ({
    number,
    description:`Konkretna emotivna radnja u sceni ${number}`,
    location:'gradska ulica',
    imagePrompt:'I'.repeat(120),
    videoPrompt:'V'.repeat(90)
  }));
  const validJob = { phase:'prompt-to-spot', payload:{ project:{ promptToSpot:{ requireYoutubeSources:true, requireImagePrompts:true, requireVideoPrompts:true, maxScenes:6 } } } };
  const validAnswer = { value:{ concept:{ title:'Test' }, storyPlan:{ recommendedSceneCount:3, estimatedImageCount:3, imagePromptCount:3, videoPromptCount:3 }, research:{ sources:[{url:'https://youtube.com/watch?v=1'},{url:'https://youtu.be/2'},{url:'https://example.com/source'}] }, scenes } };
  ok(t.validateAnswerForJob(validAnswer, validJob) === '', 'prompt-to-spot validator prihvata kompletan validan storyboard odgovor');
  const broken = JSON.parse(JSON.stringify(validAnswer));
  broken.value.scenes[0].imagePrompt = 'kratko';
  ok(/imagePrompt/.test(t.validateAnswerForJob(broken, validJob)), 'prompt-to-spot validator odbija nedovoljno detaljan image prompt');
  ok(t.validateAnswerForJob({ value:{ bridgeTest:true } }, { type:'test' }) === '', 'bridge test odgovor sa bridgeTest:true prolazi');
  ok(/bridgeTest/.test(t.validateAnswerForJob({ value:{ bridgeTest:false } }, { type:'test' })), 'bridge test odgovor bez bridgeTest:true se odbija');
}

(async () => {
  console.log('== Chrome extension deep runtime testovi ==');
  await testVersionContract();
  await testServiceWorker();
  await testLocalApp();
  await testPopup();
  await testChatGptBridgePureLogic();
  console.log(`\n== REZULTAT: ${passed} prošlo, 0 nije prošlo ==`);
})().catch(error => {
  console.error(`\n[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
