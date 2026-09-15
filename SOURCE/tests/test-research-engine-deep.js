'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'PROGRAM - NE BRISATI', 'research-engine.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-research-deep-'));
process.env.MSS_DATA_DIR = temp;
process.env.MSS_TEST_RESEARCH = '1';
process.env.NODE_ENV = 'test';

function loadWithInternals() {
  const source = fs.readFileSync(FILE, 'utf8') + `\nmodule.exports.__test = { clean, stripTags, decodeHtml, safeUrl, uniqueBy, sha256File, sleep, fetchText, fetchJson, downloadFile, lyricKeywords, researchText, searchDuckDuckGo, searchBingRss, webSearch, findExecutable, runCapture, normalizeYoutubeEntry, parseDateValue, median, publicMomentum, titleSignals, seasonalOpportunities, sourceSummary, deriveRecommendations };\n`;
  const mod = new Module(FILE, module);
  mod.filename = FILE;
  mod.paths = Module._nodeModulePaths(path.dirname(FILE));
  mod._compile(source, FILE);
  return mod.exports;
}

const research = loadWithInternals();
const t = research.__test;
let passed = 0;
function ok(value, message) { assert.ok(value, message); passed++; console.log(`  [OK] ${message}`); }

(async () => {
  try {
    console.log('== ResearchEngine deep execution testovi ==');

    ok(t.clean('  a   b  ') === 'a b', 'clean normalizuje razmake');
    ok(t.decodeHtml('&amp;&#269;&#x107;') === '&čć', 'decodeHtml dekodira named/decimal/hex entitete');
    ok(t.stripTags('<style>x{}</style><b>Ljubav</b> &amp; bol').includes('Ljubav'), 'stripTags uklanja HTML i čuva tekst');
    ok(t.safeUrl('javascript:alert(1)') === '' && t.safeUrl('https://example.com/a').startsWith('https://'), 'safeUrl odbija opasne protokole');
    ok(t.uniqueBy([{id:1},{id:1},{id:2}], x => x.id).length === 2, 'uniqueBy uklanja duplikate');
    ok(research.hashText('abc') === research.hashText('abc') && research.hashText('abc').length === 64, 'hashText je deterministički SHA-256');

    const hashFile = path.join(temp, 'hash.txt');
    fs.writeFileSync(hashFile, 'research');
    ok(t.sha256File(hashFile).length === 64, 'sha256File računa hash stvarnog fajla');
    const before = Date.now();
    await t.sleep(2);
    ok(Date.now() >= before, 'sleep završava asinhrono bez greške');

    const queries = research.buildQueries({ songTitle:'Nedostaješ', genre:'pop balada', lyrics:'Usamljena noć, uspomene ostaju, uspomene bole' });
    ok(queries.queries.length > 0 && queries.keywords.includes('uspomene'), 'buildQueries + lyricKeywords grade fokusirane upite');

    const ddg = `<a class="result__a" href="https://example.com/music-video">Music video visual storytelling</a><div class="result__snippet">cinematic camera editing rhythm</div>`;
    const parsedDdg = research.parseDuckDuckGoHtml(ddg, 'music video');
    ok(parsedDdg.length === 1 && parsedDdg[0].title.includes('Music video'), 'DuckDuckGo HTML parser čita rezultat');
    const bing = `<rss><channel><item><title>Emotional music video cinematography</title><link>https://example.org/video</link><description>camera storytelling</description></item></channel></rss>`;
    const parsedBing = research.parseBingRss(bing, 'music video');
    ok(parsedBing.length === 1, 'Bing RSS parser čita rezultat');

    const web = research.filterRelevantWebResults([
      ...parsedDdg,
      { title:'Dead by Daylight contest rules', url:'https://example.net/game', snippet:'gaming contest' },
      parsedDdg[0]
    ]);
    ok(web.length === 1, 'web relevance filter odbacuje hard-negative i duplikate');
    const yt = research.filterRelevantYoutubeResults([
      { id:'1', title:'Official music video emotional ballad', url:'https://youtube.com/watch?v=1' },
      { id:'2', title:'Gameplay patch notes', url:'https://youtube.com/watch?v=2' }
    ]);
    ok(yt.length === 1 && yt[0].id === '1', 'YouTube relevance filter odbacuje nerelevantan sadržaj');
    ok(research.isRelevantResearchResult({title:'official music video cinematic story',url:'https://x.test'}, 'youtube') === true, 'isRelevantResearchResult prepoznaje muzički signal');

    const originalFetch = global.fetch;
    global.fetch = async url => {
      const u = String(url);
      if (u.includes('duckduckgo.com')) return new Response(ddg, { status: 200, headers:{'content-type':'text/html'} });
      if (u.includes('bing.com')) return new Response(bing, { status: 200, headers:{'content-type':'application/rss+xml'} });
      if (u.endsWith('/json')) return new Response(JSON.stringify({ok:true,value:7}), { status:200, headers:{'content-type':'application/json'} });
      if (u.endsWith('/bin')) return new Response(Buffer.from('download-body'), { status:200 });
      return new Response('plain body', { status:200 });
    };
    try {
      ok((await t.fetchText('https://local.test/plain')) === 'plain body', 'fetchText izvršava uspešan HTTP tok preko mock transporta');
      ok((await t.fetchJson('https://local.test/json')).value === 7, 'fetchJson parsira JSON odgovor');
      const downloaded = path.join(temp, 'download.bin');
      ok((await t.downloadFile('https://local.test/bin', downloaded)) > 0 && fs.readFileSync(downloaded, 'utf8') === 'download-body', 'downloadFile piše atomizovan preuzeti fajl');
      ok((await t.searchDuckDuckGo('music video')).length === 1, 'searchDuckDuckGo izvršava fetch + parser');
      ok((await t.searchBingRss('music video')).length === 1, 'searchBingRss izvršava fetch + parser');
      const ws = await t.webSearch('music video');
      ok(ws.results.length === 1, 'webSearch izvršava primarni search provider');
    } finally { global.fetch = originalFetch; }

    process.env.MSS_YTDLP_EXE = process.execPath;
    ok((await research.ensureYtDlp()) === process.execPath, 'ensureYtDlp poštuje eksplicitno postojeći executable bez mreže');
    delete process.env.MSS_YTDLP_EXE;

    const capture = await t.runCapture(process.execPath, ['-e', 'process.stdout.write("capture-ok")']);
    ok(capture.ok === true && capture.stdout.includes('capture-ok'), 'runCapture izvršava proces i hvata stdout');
    const captureFail = await t.runCapture(process.execPath, ['-e', 'process.stderr.write("boom");process.exit(2)']);
    ok(captureFail.ok === false, 'runCapture bezbedno vraća neuspeh child procesa');

    const normalized = t.normalizeYoutubeEntry({ id:'abc', title:'Official music video', webpage_url:'https://youtube.com/watch?v=abc', duration:201, view_count:1000, upload_date:'20260901', channel:'Test' }, 'q');
    ok(normalized.id === 'abc' && normalized.viewCount === 1000, 'normalizeYoutubeEntry normalizuje yt-dlp zapis');
    ok(t.parseDateValue({uploadDate:'20260901'}) instanceof Date, 'parseDateValue čita YYYYMMDD');
    ok(t.median([9,1,5]) === 5 && t.median([1,3,5,7]) === 4, 'median radi za neparan i paran niz');
    ok(t.publicMomentum({viewCount:10000,uploadDate:'20260901'}, 1000, 10).publicMomentumScore >= 0, 'publicMomentum računa momentum metrike');
    ok(t.titleSignals([{title:'NE MOGU BEZ TEBE 💔'},{title:'Septembar 2026 ljubav'}]).length > 0, 'titleSignals analizira obrasce naslova');

    const scored = research.scoreViralCandidates([
      {id:'a',viewCount:1000,uploadDate:'20260801'},
      {id:'b',viewCount:100000,uploadDate:'20260901'}
    ]);
    ok(scored.length === 2 && scored[1].publicMomentumScore >= scored[0].publicMomentumScore, 'scoreViralCandidates koristi median/publicMomentum');

    const dna = research.loadChannelDnaBase();
    ok(Array.isArray(dna.channels) && dna.channels.length >= 2, 'loadChannelDnaBase vraća bazu kanala');
    const own = await research.analyzeOwnChannels();
    ok(own.ok && own.sourceMode === 'test-mock', 'analyzeOwnChannels deterministički test tok radi bez spoljne mreže');
    const refs = await research.searchYoutubeReferences('emotional music video', 3, 'momentum');
    ok(refs.results.length === 3, 'searchYoutubeReferences test tok vraća i rangira reference');
    const report = await research.runResearch({songTitle:'Test pesma',genre:'pop balada',lyrics:'Nedostaješ mi svake noći'});
    ok(report.ok === true && report.channelAnalysis?.sourceMode === 'test-mock', 'runResearch kompletan deterministički tok završava uspešno');
    ok(research.lastResearch()?.ok === true, 'lastResearch čita poslednji sačuvani report');

    console.log(`\n== REZULTAT: ${passed} prošlo, 0 nije prošlo ==`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(`\n[FAIL] ${error.stack || error.message}`); process.exitCode = 1; });
