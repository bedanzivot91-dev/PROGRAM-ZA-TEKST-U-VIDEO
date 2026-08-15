'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const VERSION = '15.4';
const APP_DIR = __dirname;
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(APP_DIR, 'data');
const TOOLS_DIR = path.join(DATA_DIR, 'runtime', 'research');
const YTDLP_EXE = path.join(TOOLS_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const YTDLP_META = path.join(TOOLS_DIR, 'yt-dlp-release.json');
const RESEARCH_FILE = path.join(DATA_DIR, 'research-last.json');
const CHANNEL_DNA_FILE = path.join(DATA_DIR, 'channel-dna-base.json');
const CHANNEL_ANALYSIS_FILE = path.join(DATA_DIR, 'channel-analysis-last.json');
const OWN_CHANNELS = [
  { id: 'UCeyZhUepd4s4LcvFHyVZmnA', title: 'Nedostaješ PUNOO', handle: '@nedostajespunooo91', url: 'https://www.youtube.com/@nedostajespunooo91' },
  { id: 'UCotSZNYmB-_zSnWntdGoNVg', title: 'Nedostaješ PUNOO pesme', handle: '@nedostajespunoo91pesme', url: 'https://www.youtube.com/@Nedostaje%C5%A1PUNOO91pesme' }
];
const GITHUB_RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(TOOLS_DIR, { recursive: true });

function clean(value, max = 4000) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}
function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}
function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16) || 32));
}
function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}
function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function hashText(text) { return crypto.createHash('sha256').update(String(text || '')).digest('hex'); }
function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchText(url, options = {}, timeoutMs = 20000) {
  const response = await fetch(url, {
    redirect: 'follow',
    ...options,
    headers: {
      'User-Agent': `Muzicki-Spot-Studio/${VERSION} (+local private research)`,
      'Accept-Language': 'sr-RS,sr;q=0.9,en;q=0.7',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} za ${new URL(url).hostname}`);
  return response.text();
}
async function fetchJson(url, options = {}, timeoutMs = 20000) {
  return JSON.parse(await fetchText(url, { ...options, headers: { Accept: 'application/vnd.github+json, application/json', ...(options.headers || {}) } }, timeoutMs));
}
async function downloadFile(url, file, timeoutMs = 180000) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': `Muzicki-Spot-Studio/${VERSION}`, Accept: 'application/octet-stream' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Preuzimanje nije uspelo: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const temp = `${file}.part`;
  fs.writeFileSync(temp, bytes);
  fs.renameSync(temp, file);
  return bytes.length;
}

function lyricKeywords(lyrics, limit = 8) {
  const stop = new Set('sam si je ga da se ne na u i a o od do za iz sa što sto kad kada koji koja koje moj moja moje tvoj tvoja tvoje tebe mene nama vama više vise opet nikad sada onda samo srce ljubav voli volim bila bio biti ima nema zbog svaki svaka jedan jedna'.split(/\s+/));
  const counts = new Map();
  clean(lyrics, 50000).toLocaleLowerCase('sr-RS').replace(/[^a-z0-9čćžšđ\s]/gi, ' ').split(/\s+/)
    .filter(word => word.length >= 5 && !stop.has(word))
    .forEach(word => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([word]) => word);
}
function buildQueries(input = {}) {
  const songTitle = clean(input.songTitle, 140);
  const genre = clean(input.genre, 80) || 'emotivna pop balada';
  const mood = clean(input.mood, 80) || 'emotivni muzički spot';
  const language = clean(input.language, 12) || 'sr';
  const region = clean(input.region, 8) || 'RS';
  const keywords = lyricKeywords(input.lyrics);
  const motif = keywords.slice(0, 2).join(' ');
  const year = new Date().getFullYear();

  // Upiti su namerno usmereni na filmski jezik muzičkih spotova. Ne šaljemo
  // dugačke nasumične nizove stihova pretraživaču jer reči poput "nikome",
  // "pričam" ili "glasno" mogu da vrate igre, konkurse i potpuno tuđe teme.
  const webQueries = [
    `music video visual storytelling cinematography editing trends ${year}`,
    `emotional ballad music video treatment narrative camera symbolism`,
    `low budget music video production visual hook storyboard cinematography`,
    `Balkan pop ballad music video visual narrative ${year}`
  ].map(query => clean(query, 220));
  const youtubeQueries = [
    `${genre} official music video cinematic story ${year}`,
    `Balkan pop ballad official video ${year}`,
    `emotional love song official music video visual narrative`,
    `${motif || mood || songTitle || genre} official music video`
  ].map(query => clean(query, 220));
  return {
    queries: [...new Set([...webQueries, ...youtubeQueries])].slice(0, 8),
    webQueries: [...new Set(webQueries)].slice(0, 4),
    youtubeQueries: [...new Set(youtubeQueries)].slice(0, 4),
    keywords, language, region
  };
}

const RESEARCH_HARD_NEGATIVE = /dead by daylight|\bbhvr\b|cosmetic contest|contest rules|community contest|giveaway|gameplay|gaming|video game|killer and survivor|nursery rhymes|kids songs|full movie|movie recap|reaction video|walkthrough|how to play|tournament|patch notes|forum contest|cosplay contest/i;
const RESEARCH_POSITIVE = /music video|muzički spot|muzicki spot|official video|lyric video|official music|cinematograph|visual storytelling|video treatment|storyboard|film director|camera movement|editing rhythm|montaž|balad|love song|emotional song|pesm|music production|music filmmaking|music visuals/i;

function researchText(item = {}) {
  return clean([item.title, item.snippet, item.query, item.channelTitle, ...(item.tags || [])].filter(Boolean).join(' '), 6000);
}
function isRelevantResearchResult(item = {}, type = 'web') {
  const text = researchText(item);
  if (!text || RESEARCH_HARD_NEGATIVE.test(text)) return false;
  if (RESEARCH_POSITIVE.test(text)) return true;
  // YouTube rezultat bez jasnog muzičkog signala nije dovoljno pouzdan za
  // kreativni paket. Za web prihvatamo samo domen/specifične filmske termine.
  if (type === 'youtube') return false;
  try {
    const host = new URL(item.url || '').hostname.toLowerCase();
    if (/youtube\.com|vimeo\.com|nofilmschool\.com|studiobinder\.com|premiumbeat\.com|musicbed\.com|directorslibrary\.com|promonews\.tv/.test(host)) {
      return /video|film|music|cinema|story|camera|editing|director/i.test(text);
    }
  } catch {}
  return false;
}
function filterRelevantWebResults(items = []) {
  return uniqueBy(items.filter(item => isRelevantResearchResult(item, 'web')), item => item.url).slice(0, 18);
}
function filterRelevantYoutubeResults(items = []) {
  return uniqueBy(items.filter(item => isRelevantResearchResult(item, 'youtube')), item => item.id || item.url).slice(0, 30);
}

function parseDuckDuckGoHtml(html, query) {
  const results = [];
  const source = String(html || '');
  const anchorRegex = /<a[^>]*(?:class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="[^"]*result__a[^"]*")[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRegex.exec(source))) {
    let href = decodeHtml(match[1] || match[2] || '');
    try {
      const parsed = new URL(href, 'https://html.duckduckgo.com');
      const redirected = parsed.searchParams.get('uddg');
      if (redirected) href = decodeURIComponent(redirected);
    } catch {}
    const url = safeUrl(href);
    if (!url) continue;
    const title = clean(stripTags(match[3]), 240);
    if (!title) continue;
    const tail = source.slice(anchorRegex.lastIndex, anchorRegex.lastIndex + 1800);
    const snippetMatch = tail.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)(?:<\/a>|<\/div>)/i);
    const snippet = clean(stripTags(snippetMatch ? snippetMatch[1] : ''), 700);
    results.push({ type: 'web', engine: 'duckduckgo-html', query, title, url, snippet });
  }
  return uniqueBy(results, item => item.url).slice(0, 10);
}
async function searchDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url, { headers: { Accept: 'text/html,application/xhtml+xml' } }, 25000);
  const results = parseDuckDuckGoHtml(html, query);
  if (!results.length) throw new Error('DuckDuckGo nije vratio čitljive rezultate.');
  return results;
}
function parseBingRss(xml, query) {
  const results = [];
  const items = String(xml || '').match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const item of items) {
    const get = tag => decodeHtml((item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')) || [,''])[1]);
    const title = clean(stripTags(get('title')), 240);
    const url = safeUrl(clean(get('link'), 1000));
    const snippet = clean(stripTags(get('description')), 700);
    if (title && url) results.push({ type: 'web', engine: 'bing-rss', query, title, url, snippet });
  }
  return uniqueBy(results, item => item.url).slice(0, 10);
}
async function searchBingRss(query) {
  const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
  const xml = await fetchText(url, { headers: { Accept: 'application/rss+xml,application/xml,text/xml' } }, 25000);
  const results = parseBingRss(xml, query);
  if (!results.length) throw new Error('Bing RSS nije vratio rezultate.');
  return results;
}
async function webSearch(query) {
  const errors = [];
  try { return { results: await searchDuckDuckGo(query), warning: '' }; }
  catch (error) { errors.push(`DuckDuckGo: ${error.message}`); }
  try { return { results: await searchBingRss(query), warning: errors.join(' | ') }; }
  catch (error) { errors.push(`Bing RSS: ${error.message}`); }
  return { results: [], warning: errors.join(' | ') };
}

function findExecutable(name) {
  const candidates = process.platform === 'win32'
    ? [path.join(process.env.LOCALAPPDATA || '', 'Programs', name), path.join(process.env.ProgramFiles || '', name), name]
    : [name];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    try {
      const tool = process.platform === 'win32' ? 'where.exe' : 'which';
      const output = childProcess.execFileSync(tool, [candidate], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const found = output.split(/\r?\n/).map(x => x.trim()).find(Boolean);
      if (found) return found;
    } catch {}
  }
  return '';
}
async function ensureYtDlp() {
  if (process.env.MSS_YTDLP_EXE && fs.existsSync(process.env.MSS_YTDLP_EXE)) return process.env.MSS_YTDLP_EXE;
  if (fs.existsSync(YTDLP_EXE) && fs.statSync(YTDLP_EXE).size > 1_000_000) return YTDLP_EXE;
  const system = findExecutable(process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (system) return system;
  if (process.env.MSS_DISABLE_TOOL_DOWNLOAD === '1') throw new Error('yt-dlp nije instaliran, a automatsko preuzimanje je isključeno.');

  const release = await fetchJson(GITHUB_RELEASE_API, {}, 30000);
  const expectedName = process.platform === 'win32' ? 'yt-dlp.exe' : (process.platform === 'linux' ? 'yt-dlp_linux' : 'yt-dlp_macos');
  const binary = (release.assets || []).find(asset => asset.name === expectedName);
  const sums = (release.assets || []).find(asset => asset.name === 'SHA2-256SUMS');
  if (!binary || !sums) throw new Error(`GitHub izdanje nema ${expectedName} ili SHA2-256SUMS.`);
  const sumText = await fetchText(sums.browser_download_url, {}, 30000);
  const line = sumText.split(/\r?\n/).find(row => row.trim().endsWith(`  ${expectedName}`) || row.trim().endsWith(` *${expectedName}`));
  const expectedHash = clean(line || '').split(/\s+/)[0].toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Nije pronađen validan SHA-256 za yt-dlp.');
  await downloadFile(binary.browser_download_url, YTDLP_EXE, 240000);
  const actualHash = sha256File(YTDLP_EXE);
  if (actualHash !== expectedHash) {
    try { fs.unlinkSync(YTDLP_EXE); } catch {}
    throw new Error('SHA-256 provera yt-dlp fajla nije prošla.');
  }
  if (process.platform !== 'win32') fs.chmodSync(YTDLP_EXE, 0o755);
  fs.writeFileSync(YTDLP_META, JSON.stringify({ tag: release.tag_name, publishedAt: release.published_at, sha256: actualHash, file: expectedName }, null, 2));
  return YTDLP_EXE;
}
function runCapture(executable, args, timeoutMs = 120000) {
  return new Promise(resolve => {
    childProcess.execFile(executable, args, {
      cwd: TOOLS_DIR, windowsHide: true, encoding: 'utf8', timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' }
    }, (error, stdout, stderr) => resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || ''), error: error?.message || '' }));
  });
}
function normalizeYoutubeEntry(entry, query) {
  const id = clean(entry?.id, 32);
  let url = safeUrl(entry?.webpage_url || entry?.url);
  if (!url && id) url = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  return {
    type: 'youtube', engine: 'yt-dlp', query,
    id, title: clean(entry?.title, 300), url,
    channel: clean(entry?.channel || entry?.uploader || entry?.channel_id, 200),
    duration: Number(entry?.duration) || 0,
    viewCount: Number(entry?.view_count) || 0,
    likeCount: Number(entry?.like_count) || 0,
    uploadDate: clean(entry?.upload_date || entry?.release_date, 16),
    timestamp: Number(entry?.timestamp) || Number(entry?.release_timestamp) || 0,
    description: clean(entry?.description, 800),
    thumbnail: safeUrl(entry?.thumbnail || entry?.thumbnails?.[0]?.url || ''),
    tags: Array.isArray(entry?.tags) ? entry.tags.slice(0, 12).map(tag => clean(tag, 80)).filter(Boolean) : []
  };
}
async function youtubeSearch(query, maxResults = 15) {
  const executable = await ensureYtDlp();
  const search = `ytsearch${Math.max(5, Math.min(30, Number(maxResults) || 15))}:${query}`;
  const args = [
    '--dump-single-json', '--flat-playlist', '--skip-download', '--no-warnings', '--ignore-errors',
    '--socket-timeout', '20', '--retries', '2', '--extractor-retries', '2',
    '--js-runtimes', `node:${process.execPath}`, search
  ];
  const result = await runCapture(executable, args, 150000);
  if (!result.ok && !result.stdout.trim()) throw new Error(clean(result.stderr || result.error, 1000) || 'yt-dlp YouTube pretraga nije uspela.');
  let payload;
  try { payload = JSON.parse(result.stdout); }
  catch { throw new Error('yt-dlp nije vratio ispravan JSON.'); }
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  return uniqueBy(entries.map(entry => normalizeYoutubeEntry(entry, query)).filter(item => item.title && item.url), item => item.id || item.url).slice(0, maxResults);
}

function loadChannelDnaBase() {
  try { return JSON.parse(fs.readFileSync(CHANNEL_DNA_FILE, 'utf8')); }
  catch { return { version: VERSION, channels: OWN_CHANNELS, referenceVideos: [], brandDna: {}, visualFamilies: [], diversityRules: {} }; }
}
function parseDateValue(entry) {
  const timestamp = Number(entry?.timestamp || entry?.release_timestamp || 0);
  if (timestamp > 0) return new Date(timestamp * 1000);
  const raw = clean(entry?.upload_date || entry?.release_date, 16);
  if (/^\d{8}$/.test(raw)) return new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(`${raw.slice(0,10)}T00:00:00Z`);
  return null;
}
function median(values) {
  const list = values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!list.length) return 0;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
}
function publicMomentum(entry, medianViews = 1, medianVpd = 1) {
  const date = parseDateValue(entry);
  const ageDays = date ? Math.max(1, (Date.now() - date.getTime()) / 86400000) : 365;
  const views = Math.max(0, Number(entry.viewCount || entry.view_count || 0));
  const viewsPerDay = views / ageDays;
  const outlierRatio = views / Math.max(1, medianViews);
  const velocityRatio = viewsPerDay / Math.max(0.01, medianVpd);
  const score = Math.round(Math.min(100, 22 * Math.log10(1 + outlierRatio) + 28 * Math.log10(1 + velocityRatio) + Math.min(20, Math.log10(1 + views) * 4)));
  return { ageDays: Number(ageDays.toFixed(1)), viewsPerDay: Number(viewsPerDay.toFixed(2)), outlierRatio: Number(outlierRatio.toFixed(2)), velocityRatio: Number(velocityRatio.toFixed(2)), publicMomentumScore: score };
}
async function youtubeChannelFeed(channel, section = 'videos', maxResults = 60) {
  const executable = await ensureYtDlp();
  const url = `${channel.url.replace(/\/$/, '')}/${section}`;
  const args = [
    '--dump-single-json', '--flat-playlist', '--skip-download', '--no-warnings', '--ignore-errors',
    '--playlist-end', String(Math.max(10, Math.min(100, Number(maxResults) || 60))),
    '--socket-timeout', '20', '--retries', '2', '--extractor-retries', '2',
    '--js-runtimes', `node:${process.execPath}`, url
  ];
  const result = await runCapture(executable, args, 180000);
  if (!result.ok && !result.stdout.trim()) throw new Error(clean(result.stderr || result.error, 1000) || `Kanal ${channel.title} nije mogao da se pročita.`);
  let payload;
  try { payload = JSON.parse(result.stdout); }
  catch { throw new Error(`Kanal ${channel.title} nije vratio ispravan JSON.`); }
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  return entries.map(entry => normalizeYoutubeEntry(entry, `${channel.title}/${section}`)).filter(item => item.title && item.url);
}
async function youtubeChannelRss(channel) {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel.id)}`, { headers:{ Accept:'application/atom+xml,application/xml,text/xml' } }, 25000);
  const entries = String(xml || '').match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  return entries.map(item => {
    const id = clean((item.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/i) || [,''])[1], 32);
    const title = clean(decodeHtml((item.match(/<title>([\s\S]*?)<\/title>/i) || [,''])[1]), 300);
    const published = clean((item.match(/<published>([\s\S]*?)<\/published>/i) || [,''])[1], 40);
    const author = clean(decodeHtml((item.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i) || [,''])[1]), 200);
    const timestamp = published ? Math.floor(new Date(published).getTime() / 1000) : 0;
    return { type:'youtube', engine:'youtube-channel-rss', query:`${channel.title}/rss`, id, title, url:id?`https://www.youtube.com/watch?v=${id}`:'', channel:author || channel.title, duration:0, viewCount:0, likeCount:0, uploadDate:published.slice(0,10).replace(/-/g,''), timestamp, description:'', tags:[] };
  }).filter(item => item.id && item.title);
}

function titleSignals(entries) {
  const text = entries.map(item => item.title || '').join(' ').toLocaleUpperCase('sr-RS');
  const groups = {
    seasonalSpecificEvent: ['DAN ZALJUBLJENIH','OSMI MART','8 MART','NOVA GODINA','BOŽIĆ','ROĐENDAN'],
    directConfession: ['VOLIM','NEDOSTAJEŠ','NISAM REKAO','KRIV','PUŠTAM TE','NE JAVLJAM'],
    finalDecision: ['KASNO JE','NEKA IDE','ŽIVOT IDE DALJE','OTIŠLA SI','OSTAVLJEN'],
    concretePlaceOrTime: ['GRAD','ULICA','IZLAZ','PET MINUTA','DESET GODINA','NOĆ','PUT'],
    questionOrTension: ['ZAŠTO','DA LI','MOŽE LI','AKO','KADA']
  };
  return Object.entries(groups).map(([name, patterns]) => ({ name, count: patterns.reduce((sum, pattern) => sum + (text.split(pattern).length - 1), 0), patterns })).sort((a,b)=>b.count-a.count);
}
function analyzeChannelPublic(channel, longEntries = [], shortEntries = []) {
  const all = [...longEntries.map(item => ({...item, format:'long'})), ...shortEntries.map(item => ({...item, format:'short'}))];
  const views = all.map(item => Number(item.viewCount || 0)).filter(v=>v>0);
  const vpdList = all.map(item => {
    const d=parseDateValue(item); const age=d?Math.max(1,(Date.now()-d.getTime())/86400000):365; return Number(item.viewCount||0)/age;
  }).filter(v=>v>0);
  const medViews = median(views) || 1;
  const medVpd = median(vpdList) || 1;
  const ranked = all.map(item => ({ ...item, ...publicMomentum(item, medViews, medVpd) }))
    .sort((a,b)=>b.publicMomentumScore-a.publicMomentumScore || b.viewCount-a.viewCount);
  return {
    id: channel.id, title: channel.title, handle: channel.handle, url: channel.url, sourceMode:'yt-dlp-public-metadata',
    analyzedAt: new Date().toISOString(), sample: { long: longEntries.length, shorts: shortEntries.length, total: all.length },
    medians: { views: Math.round(medViews), viewsPerDay: Number(medVpd.toFixed(2)) },
    titleSignals: titleSignals(all),
    topPublicMomentum: ranked.slice(0, 15).map(item => ({ id:item.id, title:item.title, url:item.url, format:item.format, duration:item.duration, views:item.viewCount, uploadDate:item.uploadDate, viewsPerDay:item.viewsPerDay, outlierRatio:item.outlierRatio, publicMomentumScore:item.publicMomentumScore })),
    note: 'Javni momentum je heuristika iz pregleda, starosti objave i odnosa prema medijani uzorka. Nije YouTube CTR, retention niti garancija viralnosti.'
  };
}
async function analyzeOwnChannels() {
  const base = loadChannelDnaBase();
  if (process.env.MSS_TEST_RESEARCH === '1') {
    const mock = { ok:true, sourceMode:'test-mock', analyzedAt:new Date().toISOString(), base, channels: base.channels.map((channel,index)=>({ id:channel.id,title:channel.title,handle:channel.handle,url:channel.url,sample:{long:12,shorts:20,total:32},medians:{views:900+index*200,viewsPerDay:12+index},titleSignals:[{name:'directConfession',count:8},{name:'seasonalSpecificEvent',count:3}],topPublicMomentum:(channel.publicOutliers||[]).map((item,i)=>({id:`mock-${index}-${i}`,title:item.title,url:channel.url,format:'long',views:item.views,viewsPerDay:20+i,publicMomentumScore:90-i*6,outlierRatio:4+i}))})) };
    fs.writeFileSync(CHANNEL_ANALYSIS_FILE, JSON.stringify(mock, null, 2));
    return mock;
  }
  const warnings = [];
  const channels = [];
  for (const channel of OWN_CHANNELS) {
    try {
      const [longEntries, shortEntries] = await Promise.all([
        youtubeChannelFeed(channel, 'videos', 60),
        youtubeChannelFeed(channel, 'shorts', 60)
      ]);
      channels.push(analyzeChannelPublic(channel, longEntries, shortEntries));
    } catch (error) {
      warnings.push(`${channel.title} yt-dlp: ${error.message}`);
      try {
        const rssEntries = await youtubeChannelRss(channel);
        const rssAnalysis = analyzeChannelPublic(channel, rssEntries, []);
        const fallback = (base.channels || []).find(item => item.id === channel.id) || {};
        rssAnalysis.fallback = 'youtube-rss';
        rssAnalysis.sourceMode = 'youtube-rss-fallback';
        rssAnalysis.publicSnapshot = fallback.publicSnapshot || null;
        rssAnalysis.publicOutliers = fallback.publicOutliers || [];
        if (!rssAnalysis.topPublicMomentum.some(item => item.views > 0)) rssAnalysis.topPublicMomentum = (fallback.publicOutliers || []).map((item,index)=>({title:item.title,views:item.views,url:channel.url,publicMomentumScore:Math.max(50,90-index*8),source:'embedded-public-snapshot'}));
        channels.push(rssAnalysis);
      } catch (rssError) {
        warnings.push(`${channel.title} RSS: ${rssError.message}`);
        const fallback = (base.channels || []).find(item => item.id === channel.id) || channel;
        channels.push({ ...fallback, analyzedAt:new Date().toISOString(), sourceMode:'embedded-public-snapshot', sample:{long:0,shorts:0,total:0}, topPublicMomentum:fallback.publicOutliers || [], fallback:'embedded-snapshot' });
      }
    }
  }
  const channelModes = channels.map(item => item.sourceMode || 'unknown');
  const sourceMode = channelModes.every(mode => mode === 'yt-dlp-public-metadata')
    ? 'live-youtube-public-metadata'
    : channelModes.every(mode => mode === 'embedded-public-snapshot')
      ? 'embedded-public-snapshot-fallback'
      : 'mixed-live-rss-and-fallback';
  const report = { ok: channels.length > 0, sourceMode, analyzedAt:new Date().toISOString(), base, channels, warnings };
  fs.writeFileSync(CHANNEL_ANALYSIS_FILE, JSON.stringify(report, null, 2));
  return report;
}
function scoreViralCandidates(items = []) {
  const views = items.map(item=>Number(item.viewCount||0)).filter(v=>v>0);
  const medViews = median(views) || 1;
  const vpd = items.map(item=>{ const d=parseDateValue(item); const age=d?Math.max(1,(Date.now()-d.getTime())/86400000):365; return Number(item.viewCount||0)/age; }).filter(v=>v>0);
  const medVpd = median(vpd) || 1;
  return items.map(item => ({...item, ...publicMomentum(item, medViews, medVpd)}))
    .sort((a,b)=>b.publicMomentumScore-a.publicMomentumScore || b.viewCount-a.viewCount)
    .slice(0, 30);
}
function seasonalOpportunities() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const opportunities = [];
  const add = (name, months, angle) => { if (months.some(m => Math.min((m-month+12)%12,(month-m+12)%12) <= 1)) opportunities.push({name, angle}); };
  add('Nova godina', [12,1], 'rastanak, ponoć, poruka koja nije poslata, slavlje nasuprot ličnoj tišini');
  add('Dan zaljubljenih', [2], 'prazan poklon, javni parovi, dan koji svi slave osim glavnog lika');
  add('8. mart', [3], 'cvet, neizgovoreno izvinjenje, sećanje na osobu koja više nije tu');
  add('Leto i putovanja', [6,7,8], 'stanica, obala, festival, put, povratak u grad ili susret posle vremena');
  add('Jesenji povratak', [9,10], 'škola, grad, prvi hladni dan, stari put i promenjena rutina');
  return opportunities;
}

function sourceSummary(results) {
  const words = new Map();
  for (const item of results) {
    `${item.title || ''} ${item.snippet || item.description || ''}`.toLocaleLowerCase('sr-RS').replace(/[^a-z0-9čćžšđ\s]/gi, ' ').split(/\s+/)
      .filter(word => word.length > 5)
      .forEach(word => words.set(word, (words.get(word) || 0) + 1));
  }
  const common = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word]) => word);
  return common;
}
function deriveRecommendations(webResults, youtubeResults, keywords, channelAnalysis) {
  const durationValues = youtubeResults.map(item => Number(item.duration)).filter(value => value > 0 && value < 3600);
  const avgDuration = durationValues.length ? Math.round(durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length) : 0;
  const common = sourceSummary([...webResults, ...youtubeResults]);
  const recommendations = [
    'Tekst pesme i konkretna radnja imaju prednost nad trendom. Viralni javni signali služe za hook, jasnoću ideje, tempo i thumbnail trenutak — ne za kopiranje tuđeg spota.',
    'Ne koristiti mračan stan, telefon, prozor, kišu ili praznu stolicu po automatizmu. Svaki od tih elemenata sme da postoji samo kada ga stih ili radnja opravdavaju.',
    'Tačno 10 ideja mora koristiti najmanje 8 različitih vizuelnih porodica. Najviše jedna ideja sme da bude vođena mračnim stanom.',
    'Obavezno uključiti najmanje tri svetlije/dnevne ideje i najmanje četiri ideje sa javnom, spoljašnjom ili putujućom radnjom.',
    `Motivi iz pesme koji imaju prednost: ${keywords.join(', ') || 'nema dovoljno jasnih ključnih motiva'}.`
  ];
  if (avgDuration) recommendations.push(`Prosečno trajanje videa sa dostupnim trajanjem u pronađenom YouTube uzorku je oko ${avgDuration} sekundi; to je opis uzorka, ne obavezno trajanje spota.`);
  if (common.length) recommendations.push(`Česti pojmovi u izvorima: ${common.join(', ')}. Koristi ih samo za proveru zasićenosti i izbegavanje ponavljanja.`);
  const fasterChannel = channelAnalysis?.channels?.find(item => item.title === 'Nedostaješ PUNOO pesme');
  if (fasterChannel) recommendations.push('Za kanal Nedostaješ PUNOO pesme prioritet su jasna priča, jedna odluka i jedan upečatljiv simbol; za glavni kanal spot mora lako da se iseče i u više samostalnih Shorts trenutaka.');
  return recommendations;
}

async function runResearch(input = {}) {
  const built = buildQueries(input);
  const baseChannelDna = loadChannelDnaBase();
  if (process.env.MSS_TEST_RESEARCH === '1') {
    const channelAnalysis = await analyzeOwnChannels();
    const mockVideos = [
      { type:'youtube',engine:'mock',query:'test',id:'abc123',title:'Bright multi-location emotional ballad',url:'https://www.youtube.com/watch?v=abc123',channel:'Test',duration:210,viewCount:120000,uploadDate:'20260701',timestamp:0 },
      { type:'youtube',engine:'mock',query:'test',id:'def456',title:'Minimal red white performance music video',url:'https://www.youtube.com/watch?v=def456',channel:'Test 2',duration:195,viewCount:80000,uploadDate:'20260615',timestamp:0 }
    ];
    const mock = {
      ok: true, version: VERSION, sourceMode: 'test-mock', fetchedAt: new Date().toISOString(),
      queries: built.queries, keywords: built.keywords,
      webResults: [
        { type:'web',engine:'mock',query:'test',title:'Cinematic visual storytelling',url:'https://example.com/story',snippet:'Visual hooks and motivated camera movement.' },
        { type:'web',engine:'mock',query:'test',title:'Music video editing patterns',url:'https://example.org/editing',snippet:'Editing rhythm and visual continuity.' }
      ],
      youtubeResults: mockVideos,
      viralCandidates: scoreViralCandidates(mockVideos),
      channelDna: baseChannelDna,
      channelAnalysis,
      seasonalOpportunities: seasonalOpportunities(),
      diversityRules: baseChannelDna.diversityRules || {},
      recommendations: deriveRecommendations([], mockVideos, built.keywords, channelAnalysis), warnings: []
    };
    mock.fingerprint = hashText(JSON.stringify(mock));
    fs.writeFileSync(RESEARCH_FILE, JSON.stringify(mock, null, 2));
    return mock;
  }
  const warnings = [];
  const webResults = [];
  const youtubeResults = [];
  let channelAnalysis = null;
  try { channelAnalysis = await analyzeOwnChannels(); }
  catch (error) { warnings.push(`Analiza tvoja dva kanala: ${error.message}`); channelAnalysis = { ok:false, base:baseChannelDna, channels:baseChannelDna.channels || [], warnings:[error.message] }; }

  for (const query of built.webQueries.slice(0, 3)) {
    const result = await webSearch(query);
    webResults.push(...result.results);
    if (result.warning) warnings.push(result.warning);
    await sleep(200);
  }
  try {
    for (const query of built.youtubeQueries.slice(0, 4)) youtubeResults.push(...await youtubeSearch(query, 15));
  } catch (error) { warnings.push(`YouTube bez API ključa: ${error.message}`); }

  const rawUniqueWeb = uniqueBy(webResults, item => item.url);
  const rawUniqueYoutube = uniqueBy(youtubeResults, item => item.id || item.url);
  const uniqueWeb = filterRelevantWebResults(rawUniqueWeb);
  const uniqueYoutube = filterRelevantYoutubeResults(rawUniqueYoutube);
  const removedWeb = Math.max(0, rawUniqueWeb.length - uniqueWeb.length);
  const removedYoutube = Math.max(0, rawUniqueYoutube.length - uniqueYoutube.length);
  if (removedWeb || removedYoutube) warnings.push(`Filter relevantnosti je uklonio ${removedWeb} web i ${removedYoutube} YouTube rezultata koji nisu bili muzički spotovi.`);
  const viralCandidates = scoreViralCandidates(uniqueYoutube);
  const report = {
    ok: uniqueWeb.length > 0 || uniqueYoutube.length > 0 || Boolean(channelAnalysis?.channels?.length),
    version: VERSION,
    sourceMode: uniqueWeb.length || uniqueYoutube.length
      ? 'live-web-youtube-own-channels'
      : channelAnalysis?.sourceMode === 'live-youtube-public-metadata'
        ? 'live-own-channels-only'
        : 'embedded-channel-snapshot-gpt-web-search-needed',
    fetchedAt: new Date().toISOString(),
    queries: built.queries,
    keywords: built.keywords,
    webResults: uniqueWeb,
    youtubeResults: uniqueYoutube,
    viralCandidates,
    channelDna: baseChannelDna,
    channelAnalysis,
    seasonalOpportunities: seasonalOpportunities(),
    diversityRules: baseChannelDna.diversityRules || {},
    recommendations: deriveRecommendations(uniqueWeb, uniqueYoutube, built.keywords, channelAnalysis),
    warnings: [...new Set([...warnings, ...(channelAnalysis?.warnings || [])].filter(Boolean))]
  };
  report.fingerprint = hashText(JSON.stringify({ queries: report.queries, web: report.webResults.map(x => x.url), youtube: report.youtubeResults.map(x => x.id || x.url), channels: report.channelAnalysis?.channels?.map(x=>x.id), fetchedAt: report.fetchedAt }));
  fs.writeFileSync(RESEARCH_FILE, JSON.stringify(report, null, 2));
  return report;
}

async function searchYoutubeReferences(query, maxResults = 12, sort = 'momentum') {
  const cleanedQuery = clean(query, 240);
  if (cleanedQuery.length < 3) throw new Error('YouTube upit je previše kratak.');
  if (process.env.MSS_TEST_RESEARCH === '1') {
    const mock = [
      {type:'youtube',engine:'mock',query:cleanedQuery,id:'mssref001',title:'Urban multi location emotional official music video',url:'https://www.youtube.com/watch?v=mssref001',channel:'Test Music',duration:220,viewCount:180000,uploadDate:'20260701',thumbnail:''},
      {type:'youtube',engine:'mock',query:cleanedQuery,id:'mssref002',title:'Bright cinematic pop ballad official video',url:'https://www.youtube.com/watch?v=mssref002',channel:'Test Visuals',duration:205,viewCount:95000,uploadDate:'20260620',thumbnail:''},
      {type:'youtube',engine:'mock',query:cleanedQuery,id:'mssref003',title:'Symbolic performance music video visual storytelling',url:'https://www.youtube.com/watch?v=mssref003',channel:'Test Director',duration:198,viewCount:70000,uploadDate:'20260515',thumbnail:''}
    ];
    return scoreViralCandidates(mock);
  }
  const raw = await youtubeSearch(cleanedQuery, Math.max(5, Math.min(30, Number(maxResults) || 12)));
  let videos = filterRelevantYoutubeResults(raw);
  videos = scoreViralCandidates(videos);
  if (sort === 'views') videos.sort((a,b)=>Number(b.viewCount||0)-Number(a.viewCount||0));
  else if (sort === 'recent') videos.sort((a,b)=>(parseDateValue(b)?.getTime()||0)-(parseDateValue(a)?.getTime()||0));
  else if (sort === 'relevance') videos.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
  return videos.slice(0, Math.max(5, Math.min(30, Number(maxResults)||12)));
}

function lastResearch() {
  try { return JSON.parse(fs.readFileSync(RESEARCH_FILE, 'utf8')); }
  catch { return null; }
}

module.exports = { runResearch, lastResearch, buildQueries, parseDuckDuckGoHtml, parseBingRss, hashText, ensureYtDlp, analyzeOwnChannels, loadChannelDnaBase, scoreViralCandidates, isRelevantResearchResult, filterRelevantWebResults, filterRelevantYoutubeResults, youtubeSearch, searchYoutubeReferences };
