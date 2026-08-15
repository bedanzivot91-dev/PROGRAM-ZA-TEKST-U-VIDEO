'use strict';
// Testira bridge-prompts.js — v15.6.0 popravka kritičnog bug-a: ChatGPT most je ubacivao sirovu
// JSON šemu ("Vrati samo JSON: {...}") u chat poruku, što je izazivalo ChatGPT grešku
// "Hmm...something seems to have gone wrong." Ovaj modul šalje prirodan tekst i parsira odgovor
// po naslovima/oznakama umesto JSON-a.
const assert = require('assert');
const {
  buildBridgeTestPrompt, parseBridgeTestText, buildRound1Prompt, parseRound1IdeasText,
  buildStoryboardBatchPrompt, parseStoryboardBatchText, buildFinalPackagePrompt, parseFinalPackageText,
  buildPromptToSpotPrompt, buildImagePromptBatchPrompt, parseImagePromptBatchText,
  buildVideoPromptBatchPrompt, parseVideoPromptBatchText, buildFollowUpPrompt, buildShortRetryPrompt,
  MAIN_GPT_INSTRUCTIONS
} = require('../PROGRAM - NE BRISATI/public/bridge-prompts');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== BridgePrompts testovi (kritičan bug: sirova JSON šema u ChatGPT chat-u) ==');

const ALL_PROMPT_BUILDERS = () => [
  buildBridgeTestPrompt(),
  buildRound1Prompt({ songTitle: 'Test', lyrics: 'la la la' }),
  buildStoryboardBatchPrompt({ songTitle: 'Test', selectedIdea: { title: 'Ideja X' }, timingMap: [{ number: 1, start: 0, end: 5, duration: 5, section: 'Verse', lyric: 'x' }] }, { batchIndex: 0, batchTotal: 2, batchSceneNumbers: [1, 2, 3] }),
  buildFinalPackagePrompt({ songTitle: 'Test', selectedIdea: { title: 'Ideja X' } }),
  buildPromptToSpotPrompt({ songTitle: 'Test', promptToSpot: { prompt: 'napravi spot' } }),
  buildImagePromptBatchPrompt([{ number: 1, description: 'x', location: 'y', timeWeather: 'z' }], 'IDENTITET', '16:9'),
  buildVideoPromptBatchPrompt([{ number: 1, imagePrompt: 'x' }], [{ number: 1, durationMs: 5000 }]),
  buildFollowUpPrompt('IDEJA 7 nedostaje', 'minimalni podaci'),
  buildShortRetryPrompt('napravi samo IDEJU 7', 'naslov pesme i tekst'),
  MAIN_GPT_INSTRUCTIONS
];

test('NIJEDAN prompt ne sadrži "Vrati samo JSON" (KRITIČAN bug iz screenshot-a korisnika)', () => {
  for (const prompt of ALL_PROMPT_BUILDERS()) {
    assert.ok(!prompt.includes('Vrati samo JSON'), `prompt sadrži zabranjenu frazu:\n${prompt.slice(0, 200)}`);
  }
});

test('NIJEDAN prompt ne sadrži praznu JSON šemu (npr. "searchedAt":"" ili "totalScore":0)', () => {
  for (const prompt of ALL_PROMPT_BUILDERS()) {
    assert.ok(!prompt.includes('"searchedAt"'), 'prompt sadrži JSON šemu (searchedAt)');
    assert.ok(!prompt.includes('"totalScore"'), 'prompt sadrži JSON šemu (totalScore)');
    assert.ok(!/\{\s*"[a-zA-Z]+"\s*:/.test(prompt), `prompt sadrži JSON-oblik strukture:\n${prompt.slice(0, 300)}`);
  }
});

test('NIJEDAN prompt ne pominje Cloudflare/tunnel (glavni bridge tok to ne koristi)', () => {
  for (const prompt of ALL_PROMPT_BUILDERS()) {
    assert.ok(!/cloudflare|tunnel/i.test(prompt), 'prompt pominje Cloudflare/tunnel');
  }
});

test('NIJEDAN prompt ne zahteva obaveznu crvenu haljinu', () => {
  for (const prompt of ALL_PROMPT_BUILDERS()) {
    assert.ok(!/crvena haljina (je )?obavezna|mora.*crvenu haljinu/i.test(prompt), 'prompt zahteva obaveznu crvenu haljinu');
  }
  assert.ok(MAIN_GPT_INSTRUCTIONS.includes('Crvena haljina nije obavezna'));
});

test('buildBridgeTestPrompt traži TAČNO jednu kratku liniju, bez JSON-a', () => {
  const prompt = buildBridgeTestPrompt();
  assert.ok(prompt.includes('MOST RADI — MSS 15.6.0'));
  assert.ok(prompt.length < 300, 'test prompt mora biti kratak');
});

test('parseBridgeTestText prihvata "MOST RADI — MSS 15.6.0"', () => {
  assert.strictEqual(parseBridgeTestText('MOST RADI — MSS 15.6.0').ok, true);
  assert.strictEqual(parseBridgeTestText('Naravno! MOST RADI — MSS 15.6.0 evo.').ok, true);
});
test('parseBridgeTestText odbija sve ostalo', () => {
  assert.strictEqual(parseBridgeTestText('Hmm...something seems to have gone wrong.').ok, false);
  assert.strictEqual(parseBridgeTestText('').ok, false);
});

function buildFullRound1ResponseText() {
  const lines = ['MSS ODGOVOR — KRUG 1', '', 'ISTRAŽIVANJE', 'Datum istraživanja: 2026-07-29', 'Korišćeni upiti: music video trends', 'Izvor 1 — Naslov X — https://youtube.com/watch?v=abc — nalaz o hook-u', 'Sažetak istraživanja: kratak pregled', 'Aktuelni vizuelni obrasci: neonske boje, retro', 'Obrasci koje treba izbegavati: mračan stan', ''];
  for (let i = 1; i <= 10; i += 1) {
    lines.push(
      `IDEJA ${i}`,
      `Naziv: Ideja broj ${i}`,
      'Vizuelna porodica: urbani neonski svet',
      `Ideja u jednoj rečenici: Devojka putuje kroz grad broj ${i}.`,
      'Narativni luk: od tuge ka oslobođenju',
      'Vizuelni svet: noćni grad',
      'Centralni simbol: svetlo semafora',
      'Hook scena: devojka trči kroz kišu',
      'Lokacija 1 i razlog: ulica, jer stih pominje grad',
      'Lokacija 2 i razlog: krov, jer refren govori o slobodi',
      'Lokacija 3 i razlog: metro, jer je tranzicija',
      'Lokacija 4 i razlog: park, jer je uspomena',
      'Lokacija 5 i razlog: stan, jer je početak priče',
      'Vreme i vremenski uslovi: noć, kiša',
      'Paleta boja: plava i ružičasta neonska',
      'Pravila kamere: ručna kamera, blizu lika',
      'Logika garderobe: moderna jakna i farmerke',
      'Motiv koji se vraća: semafor',
      'Završetak: svetla se gase',
      'Zašto je ideja jedinstvena: kombinacija neonskog grada i introspekcije',
      'Šta se u ovoj ideji ne sme ponavljati: kišna ulica u drugim idejama',
      'Zašto odgovara kanalu: publika voli urbane spotove',
      `Ocena od 0 do 100: ${70 + i}`,
      ''
    );
  }
  lines.push('KRAJ MSS ODGOVORA — KRUG 1');
  return lines.join('\n');
}

test('parseRound1IdeasText uspešno uvozi SVIH 10 označenih ideja iz običnog teksta', () => {
  const result = parseRound1IdeasText(buildFullRound1ResponseText());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.ideas.length, 10);
  assert.strictEqual(result.ideas[0].title, 'Ideja broj 1');
  assert.strictEqual(result.ideas[0].locations.length, 5);
  assert.strictEqual(result.ideas[0].totalScore, 71);
  assert.ok(result.research.summary.includes('kratak pregled'));
  assert.strictEqual(result.research.sources.length, 1);
  assert.strictEqual(result.research.sources[0].url, 'https://youtube.com/watch?v=abc');
});

test('parseRound1IdeasText ODBIJA odgovor sa samo 9 ideja i prijavljuje koja nedostaje', () => {
  const full = buildFullRound1ResponseText();
  const withoutIdea7 = full.split('\n').filter((line, index, arr) => {
    // ukloni blok IDEJA 7 (od "IDEJA 7" do sledeće prazne linije posle njega)
    return true;
  }).join('\n').replace(/IDEJA 7\n[\s\S]*?Ocena od 0 do 100: \d+\n\n/, '');
  const result = parseRound1IdeasText(withoutIdea7);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.ideas.length, 9);
  assert.ok(result.missingFields.some(m => m.includes('IDEJA 7')), `missingFields: ${JSON.stringify(result.missingFields)}`);
});

test('parseRound1IdeasText na praznom tekstu vraća ok:false bez bacanja greške', () => {
  const result = parseRound1IdeasText('');
  assert.strictEqual(result.ok, false);
  assert.deepStrictEqual(result.ideas, []);
});

function buildStoryboardResponseText(sceneNumbers) {
  const lines = ['MSS ODGOVOR — STORYBOARD PAKET 1', ''];
  for (const n of sceneNumbers) {
    lines.push(
      `SCENA ${n}`, `Početak: ${n * 5}`, `Kraj: ${n * 5 + 5}`, 'Trajanje: 5', 'Deo pesme: Verse', 'Stih: neki stih',
      'Značenje stiha u ovoj sceni: tuga', 'Glavna emocija: tuga', `Naziv scene: Scena ${n}`, 'Detaljna radnja: hoda ulicom',
      'Mikro-pokret glavnog lika: okreće glavu', 'Lokacija: ulica', 'Zašto lokacija pripada ovom delu pesme: stih to traži',
      'Vreme i vremenski uslovi: noć', 'Osvetljenje: neonsko', 'Vrsta kadra: srednji', 'Objektiv: 35mm', 'Pokret kamere: dolly',
      'Kompozicija: centralna', 'Prednji plan: kiša', 'Srednji plan: devojka', 'Zadnji plan: grad', 'Atmosfera: melanholična',
      'Garderoba: jakna', 'Kontinuitet sa prethodnom i sledećom scenom: nastavlja hod', 'Ulazni prelaz: fade in',
      'Izlazni prelaz: cut', 'Likovi u sceni: Glavna devojka', 'Jedinstveni vizuelni potpis: neonski odsjaj',
      `Image prompt na engleskom: cinematic photo scene ${n}`, `Video prompt na engleskom: subtle motion scene ${n}`, ''
    );
  }
  lines.push('KRAJ MSS ODGOVORA — STORYBOARD PAKET 1');
  return lines.join('\n');
}

test('parseStoryboardBatchText uvozi SAMO tražene scene, odbacuje ostale', () => {
  const text = buildStoryboardResponseText([1, 2, 3, 4, 5, 6]); // ChatGPT vratio 6 scena
  const result = parseStoryboardBatchText(text, [1, 2, 3, 4, 5]); // batch traži samo 5
  assert.strictEqual(result.scenes.length, 5, 'scena 6 ne sme biti uvezena jer nije tražena u ovom batch-u');
  assert.ok(!result.scenes.some(s => s.number === 6));
});

test('buildStoryboardBatchPrompt NIKAD ne traži više od 5 scena po paketu (batch limit)', () => {
  const prompt = buildStoryboardBatchPrompt(
    { songTitle: 'Test', timingMap: [] },
    { batchIndex: 0, batchTotal: 1, batchSceneNumbers: [1, 2, 3, 4, 5] }
  );
  const match = prompt.match(/Obradi samo scene: (.+)/);
  assert.ok(match);
  const sceneCount = match[1].split(',').length;
  assert.ok(sceneCount <= 5, `batch prompt traži ${sceneCount} scena, max je 5`);
});

test('parseStoryboardBatchText tačno parsira vremena i prompt polja', () => {
  const result = parseStoryboardBatchText(buildStoryboardResponseText([1]), [1]);
  const scene = result.scenes[0];
  assert.strictEqual(scene.start, 5);
  assert.strictEqual(scene.end, 10);
  assert.strictEqual(scene.imagePrompt, 'cinematic photo scene 1');
  assert.strictEqual(scene.videoPrompt, 'subtle motion scene 1');
  assert.deepStrictEqual(scene.characterNames, ['Glavna devojka']);
});

test('parseFinalPackageText izvlači koncept i YouTube paket iz teksta', () => {
  const text = [
    'MSS ODGOVOR — ZAVRŠNI PAKET', '', 'KONAČNI KONCEPT', 'Naziv koncepta: Neonski Grad', 'Žanr spota: pop',
    'Kompletna priča: devojka putuje kroz grad', '', 'YOUTUBE PAKET', 'Glavni naslov: Neonski Grad — Official Video',
    'SEO opis: opis videa', 'Hashtagovi: #pop #balada', 'Shorts 1 — naslov, početak, kraj, hook i poziv na akciju: Short 1 opis',
    '', 'KONTROLA KVALITETA', 'Da li prve 3 sekunde imaju hook: da', 'KRAJ MSS ODGOVORA — ZAVRŠNI PAKET'
  ].join('\n');
  const result = parseFinalPackageText(text);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.concept.title, 'Neonski Grad');
  assert.strictEqual(result.youtube.title, 'Neonski Grad — Official Video');
  assert.strictEqual(result.youtube.shorts.length, 1);
  assert.strictEqual(result.qualityAudit.hook3, 'da');
});

test('parseImagePromptBatchText i parseVideoPromptBatchText parsiraju batch po sceni', () => {
  const imgText = 'MSS ODGOVOR — IMAGE PROMPTOVI\n\nSCENA 1\nImage prompt: cinematic shot\nNegativni prompt: blurry\n\nKRAJ MSS ODGOVORA — IMAGE PROMPTOVI';
  const imgResult = parseImagePromptBatchText(imgText);
  assert.strictEqual(imgResult.ok, true);
  assert.strictEqual(imgResult.scenes[0].imagePrompt, 'cinematic shot');

  const vidText = 'MSS ODGOVOR — VIDEO PROMPTOVI\n\nSCENA 1\nVideo prompt: subtle motion\nPočetni kadar: wide\n\nKRAJ MSS ODGOVORA — VIDEO PROMPTOVI';
  const vidResult = parseVideoPromptBatchText(vidText);
  assert.strictEqual(vidResult.ok, true);
  assert.strictEqual(vidResult.scenes[0].videoPrompt, 'subtle motion');
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
