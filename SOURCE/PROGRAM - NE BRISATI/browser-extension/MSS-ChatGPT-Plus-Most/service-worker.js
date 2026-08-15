'use strict';

const EXTENSION_VERSION = '15.6.0';
const DEFAULT_PORTS = Array.from({ length: 60 }, (_, index) => 4180 + index);

async function storedConnection() {
  return chrome.storage.local.get(['mssBaseUrl', 'mssBridgeKey']);
}
async function saveConnection(baseUrl, key) {
  await chrome.storage.local.set({ mssBaseUrl: baseUrl, mssBridgeKey: key, mssConnectedAt: new Date().toISOString() });
}
async function fetchJson(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || `HTTP ${response.status}` }; }
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}
async function connectToBase(preferred = '') {
  const stored = await storedConnection();
  const candidates = [preferred, stored.mssBaseUrl, ...DEFAULT_PORTS.flatMap(port => [`http://127.0.0.1:${port}`, `http://localhost:${port}`])]
    .filter(Boolean).map(value => String(value).replace(/\/$/, ''));
  for (const baseUrl of [...new Set(candidates)]) {
    try {
      const config = await fetchJson(`${baseUrl}/api/plus-bridge/config`, {}, 2500);
      if (config.ok && config.key) { await saveConnection(baseUrl, config.key); return { baseUrl, key: config.key, config }; }
    } catch {}
  }
  throw new Error('Muzički Spot Studio nije pronađen. Prvo pokreni program i ostavi ga otvorenim.');
}
async function connection() {
  const stored = await storedConnection();
  if (stored.mssBaseUrl && stored.mssBridgeKey) return { baseUrl: stored.mssBaseUrl, key: stored.mssBridgeKey };
  return connectToBase();
}
async function api(path, options = {}, requireKey = true) {
  let conn;
  try { conn = await connection(); }
  catch { conn = await connectToBase(); }
  const headers = { ...(options.headers || {}) };
  if (requireKey) headers['X-MSS-Bridge-Key'] = conn.key;
  try { return await fetchJson(`${conn.baseUrl}${path}`, { ...options, headers }); }
  catch (error) {
    conn = await connectToBase(conn.baseUrl);
    if (requireKey) headers['X-MSS-Bridge-Key'] = conn.key;
    try {
      return await fetchJson(`${conn.baseUrl}${path}`, { ...options, headers });
    } catch (retryError) {
      // Sekcija 5: umesto sirovog "Failed to fetch" (TypeError iz browsera bez konteksta),
      // korisnik dobija konkretnu, akcionu poruku sa tačnim portom i uputstvom.
      const port = (conn.baseUrl.match(/:(\d+)/) || [])[1] || '4180';
      const rawMessage = String(retryError?.message || retryError || '');
      if (/failed to fetch|networkerror|load failed/i.test(rawMessage)) {
        throw new Error(`Chrome ekstenzija ne može da pristupi lokalnom serveru na portu ${port}. CORS odgovor ili bridge veza nisu ispravni. Otvorite dijagnostiku mosta.`);
      }
      throw retryError;
    }
  }
}
async function heartbeat(page = '', source = '') {
  return api('/api/plus-bridge/heartbeat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, source, extensionVersion: EXTENSION_VERSION })
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const type = message?.type;
    if (type === 'MSS_LOCAL_PAGE') {
      const conn = await connectToBase(message.baseUrl || sender?.url && new URL(sender.url).origin);
      await heartbeat(sender?.url || message.baseUrl || 'local-app', 'local');
      return { ok: true, baseUrl: conn.baseUrl, version: EXTENSION_VERSION };
    }
    if (type === 'MSS_HEARTBEAT') return heartbeat(sender?.url || message.page || 'chatgpt', message.source || 'chatgpt');
    if (type === 'MSS_GET_STATUS') {
      const conn = await connection();
      const status = await fetchJson(`${conn.baseUrl}/api/plus-bridge/status`);
      return { ok: true, baseUrl: conn.baseUrl, status };
    }
    if (type === 'MSS_GET_JOB') return api('/api/plus-bridge/job');
    if (type === 'MSS_JOB_STATUS') return api('/api/plus-bridge/job-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message.payload || {})
    });
    if (type === 'MSS_POST_RESULT') return api('/api/plus-bridge/result', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message.payload || {})
    });
    if (type === 'MSS_NOTIFY') {
      try {
        await chrome.notifications?.create('', {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: message.title || 'Muzički Spot Studio',
          message: message.body || ''
        });
      } catch {}
      return { ok: true };
    }
    if (type === 'MSS_COPY_TEXT') {
      await chrome.scripting?.executeScript?.({ target: { tabId: sender.tab.id }, func: text => navigator.clipboard.writeText(text), args: [String(message.text || '')] });
      return { ok: true };
    }
    throw new Error('Nepoznata komanda dodatka.');
  })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});
