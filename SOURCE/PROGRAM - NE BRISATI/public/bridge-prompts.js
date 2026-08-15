'use strict';

// Kanonski modul za sve ChatGPT most promptove (v15.6.0 popravka). PRE ove verzije, most je u
// ChatGPT chat ubacivao sirovu JSON šemu ("Vrati samo JSON: {"research":{...}}") na kraju svake
// poruke — ChatGPT bi to prikazao kao deo razgovora i često odgovarao crvenom greškom "Hmm...
// something seems to have gone wrong." Ovaj modul šalje prirodan, kratak tekst na srpskom i
// parsira ChatGPT-jev odgovor po jasnim naslovima/oznakama (ne po JSON-u). Svi delovi programa
// (app.js/v14-features.js, browser ekstenzija) MORAJU koristiti OVAJ modul — ne sme postojati
// druga kopija prompt teksta.
//
// Radi i u browseru (window.MSS_BRIDGE_PROMPTS) i u Node-u (module.exports), radi testabilnosti
// bez DOM-a — čist string/tekst modul, nema zavisnosti od window/document.

const BRIDGE_TEST_LINE = 'MOST RADI — MSS 15.6.0';

function safeText(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}
function joinNonEmpty(lines) {
  return lines.filter(line => line !== '' && line !== null && line !== undefined).join('\n');
}

// --- PROMPT 0 — glavna uputstva (ide u GPT Instructions polje, ne u svaku poruku) ---

const MAIN_GPT_INSTRUCTIONS = joinNonEmpty([
  'Ti si kreativni direktor Muzičkog Spot Studija. Tvoj posao je da analiziraš pesmu, audio podatke, korisnikovu zamisao, izabrane reference i postojeći plan, a zatim da pripremiš originalan muzički spot koji može stvarno da se pretvori u scene, slike i video-klipove.',
  '',
  'Piši prirodno i precizno. Ne postavljaj dodatna pitanja kada su potrebni podaci već poslati. Ne izmišljaj podatke koje nemaš. Kada nešto nije dostupno, jasno napiši da nije dostupno.',
  '',
  'Kada je traženo aktuelno istraživanje, pretraži web i YouTube. Koristi relevantne izvore o zvaničnim muzičkim spotovima, kinematografiji, režiji, kameri, montaži, rasveti i vizuelnom storytellingu. Ne koristi nepovezane rezultate, igrice, reakcije, movie recap sadržaj, dečje pesme i forume kao glavne reference.',
  '',
  'Iz drugih spotova smeš da preuzmeš samo apstraktne principe: način hooka, ritam montaže, tip pokreta kamere, paletu, strukturu priče, odnos performance i narativnih kadrova i način prelaza između prostora. Nikada ne kopiraj konkretnu radnju, kadar, lice, glumca, garderobu, lokaciju ili prepoznatljiv vizuelni identitet.',
  '',
  'Ne koristi automatski mračan stan, kišu, prozor, telefon, praznu stolicu, ogledalo ili hodnik samo zato što je pesma tužna. Svaka lokacija i radnja moraju imati razlog u tekstu, emociji, muzičkoj promeni ili izabranoj priči.',
  '',
  'Zaključani identitet glavne devojke je nepromenljiv. Ne menjaj njene godine, lice, kosu, dužinu kose, boju očiju, beauty mark, građu, tetovažu, njen položaj ili dizajn tetovaže. Ne skraćuj i ne prepričavaj zaključani identitet kada ga program pošalje. Crvena haljina nije obavezna. Garderoba mora biti moderna, savremena i prilagođena sceni, vremenu i lokaciji. Tetovaža je vidljiva samo kada je prirodno otkrivaju garderoba i kadar.',
  '',
  'Za image prompt piši na engleskom i opiši jednu konkretnu zamrznutu sliku: radnju, lokaciju, vreme, svetlo, kadar, objektiv, kompoziciju, prednji/srednji/zadnji plan, atmosferu, garderobu i detalje kontinuiteta. Ne dodaj tekst, titlove, logo ili watermark.',
  '',
  'Za video prompt piši na engleskom i polazi od postojeće slike. Sačuvaj isto lice, garderobu, lokaciju i svetlo. Opiši mikro-pokret osobe, promenu izraza, pokret okoline, kameru, brzinu i završetak kadra. Ne uvodi novu osobu, novu lokaciju ili novu garderobu koja ne postoji u početnoj slici.',
  '',
  'Odgovaraj tačno redosledom koji traži trenutni zadatak. Koristi iste naslove i oznake polja, jer program pomoću njih prepoznaje odgovor. Nemoj dodavati dugačak uvod, izvinjenja, objašnjenje svog procesa ili zaključak van traženih delova.'
]);

// --- PROMPT 1 — test mosta ---

function buildBridgeTestPrompt() {
  return joinNonEmpty([
    'Ovo je test veze između Muzičkog Spot Studija i ChatGPT-a.',
    '',
    'Odgovori samo ovom jednom linijom i ne dodaj ništa pre ili posle nje:',
    '',
    BRIDGE_TEST_LINE
  ]);
}

function parseBridgeTestText(text) {
  const ok = safeText(text).includes(BRIDGE_TEST_LINE);
  return { ok, raw: safeText(text) };
}

// --- Zajednički helperi za popunjavanje polja pesme/audio/reference u promptove ---

function formatAudioLine(audio) {
  const a = audio || {};
  const durationText = Number.isFinite(a.duration) ? `${Math.round(a.duration)}s` : 'nepoznato';
  const bpmText = a.confirmedBpm ? `potvrđen ${a.confirmedBpm}` : (a.bpmEstimate ? `procena ${a.bpmEstimate} (nepotvrđeno)` : 'nije dostupan');
  return `${durationText}, BPM: ${bpmText}`;
}
function formatReferences(list) {
  return (list || []).map((item, index) => `${index + 1}. ${safeText(item.title)} — ${safeText(item.url)}`).join('\n');
}

// --- PROMPT 2 — Krug 1: istraživanje i 10 ideja ---

function buildRound1Prompt(p) {
  const project = p || {};
  const audio = project.audio || {};
  const brief = project.creativeBrief || {};
  const refs = formatReferences(brief.selectedReferences);
  const oldIdeas = (project.previousIdeaFingerprints || []).map(x => safeText(x.title)).filter(Boolean).join(', ');

  return joinNonEmpty([
    'Muzički Spot Studio ti šalje podatke za novu pesmu.',
    '',
    `Naziv pesme: ${safeText(project.songTitle) || 'Nova pesma'}`,
    `Izvođač ili kanal: ${safeText(project.artistName)}`,
    `Format spota: ${safeText(project.format) || '16:9'}`,
    `Žanr: ${safeText(project.genre) || 'izvedi iz teksta'}`,
    `Raspoloženje: ${safeText(project.mood) || 'izvedi iz teksta'}`,
    `Trajanje: ${Number.isFinite(audio.duration) ? Math.round(audio.duration) + 's' : 'nepoznato'}`,
    `Potvrđeni BPM ili kandidati: ${formatAudioLine(audio)}`,
    brief.optionalPrompt ? `Korisnikova dodatna zamisao: ${safeText(brief.optionalPrompt)}` : '',
    refs ? `Izabrane reference i šta iz njih treba analizirati:\n${refs}` : '',
    `Tekst pesme:\n${safeText(project.lyrics)}`,
    oldIdeas ? `Ranije korišćene ideje koje ne smeju da se ponove: ${oldIdeas}` : '',
    '',
    'Uradi aktuelno web i YouTube istraživanje. Zatim osmisli tačno 10 veoma različitih ideja za spot. U ovom krugu ne pravi storyboard i ne biraj pobedničku ideju. Korisnik će sam izabrati jednu ideju u programu.',
    '',
    'Obavezna raznovrsnost:',
    '- koristi najmanje 8 različitih vizuelnih porodica;',
    '- najmanje 3 ideje neka budu svetle ili dnevne;',
    '- najmanje 4 ideje neka koriste javne, spoljašnje, putujuće ili događajne prostore;',
    '- najviše jedna ideja sme da bude zasnovana na mračnom stanu;',
    '- najviše dve ideje smeju da koriste telefon ili poruke kao glavni mehanizam;',
    '- centralni simboli, hook scene, završeci i vizuelni svetovi moraju biti različiti;',
    '- svaka ideja mora imati najmanje 5 lokacija ili jasno odvojenih prostora;',
    '- uz svaku lokaciju objasni zašto pripada određenom stihu, strofi, refrenu, muzičkoj promeni ili narativnom luku.',
    '',
    'Odgovor napiši tačno ovim redosledom:',
    '',
    'MSS ODGOVOR — KRUG 1',
    '',
    'ISTRAŽIVANJE',
    'Datum istraživanja:',
    'Korišćeni upiti:',
    'Izvor 1 — naslov, link i najvažniji nalaz:',
    'Izvor 2 — naslov, link i najvažniji nalaz:',
    'Izvor 3 — naslov, link i najvažniji nalaz:',
    'Dodatni izvori, ako su korisni:',
    'Sažetak istraživanja:',
    'Aktuelni vizuelni obrasci:',
    'Obrasci koje treba izbegavati:',
    'Kako će svih 10 ideja ostati originalne:',
    '',
    buildIdeaFieldTemplate(1),
    '',
    'Ponovi potpuno isti skup oznaka za IDEJU 2, IDEJU 3, IDEJU 4, IDEJU 5, IDEJU 6, IDEJU 7, IDEJU 8, IDEJU 9 i IDEJU 10.',
    '',
    'Na kraju napiši samo:',
    '',
    'KRAJ MSS ODGOVORA — KRUG 1',
    '',
    'Ne piši izabranu ideju i ne pravi scene.'
  ]);
}

function buildIdeaFieldTemplate(number) {
  return joinNonEmpty([
    `IDEJA ${number}`,
    'Naziv:',
    'Vizuelna porodica:',
    'Ideja u jednoj rečenici:',
    'Narativni luk:',
    'Vizuelni svet:',
    'Centralni simbol:',
    'Hook scena:',
    'Lokacija 1 i razlog:',
    'Lokacija 2 i razlog:',
    'Lokacija 3 i razlog:',
    'Lokacija 4 i razlog:',
    'Lokacija 5 i razlog:',
    'Dodatne lokacije, ako postoje:',
    'Vreme i vremenski uslovi:',
    'Paleta boja:',
    'Pravila kamere:',
    'Logika garderobe:',
    'Motiv koji se vraća:',
    'Završetak:',
    'Zašto je ideja jedinstvena:',
    'Šta se u ovoj ideji ne sme ponavljati:',
    'Zašto odgovara kanalu:',
    'Ocena od 0 do 100:'
  ]);
}

// --- Generički tolerantni parser za "Oznaka: vrednost" blokove ---
// Prihvata mala odstupanja u razmacima, crticama, velikim slovima i znaku ':'. Vrednost se
// nastavlja na sledećim linijama dok se ne naiđe na sledeću poznatu oznaku.
// Linije koje označavaju granicu sekcije/odgovora — kada se pojave, prekidaju "nastavak
// vrednosti na sledećim linijama" umesto da se tiho nalepe na poslednje pronađeno polje
// (npr. "KRAJ MSS ODGOVORA — ..." posle poslednjeg polja u bloku).
const SECTION_BOUNDARY_REGEX = /^(MSS ODGOVOR|KRAJ MSS ODGOVORA|ISTRAŽIVANJE|YOUTUBE PAKET|KONTROLA KVALITETA|KONAČNI KONCEPT|KONCEPT|PLAN PRIČE|SCENA\s+\d+|IDEJA\s+\d+)\b/i;

function extractLabeledFields(blockText, labelToField) {
  const entries = Object.entries(labelToField).map(([label, field]) => ({
    field,
    regex: new RegExp('^\\s*[-•*]?\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '\\s*:\\s*(.*)$', 'i')
  }));
  const result = {};
  let currentField = null;
  for (const rawLine of safeText(blockText).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let matched = false;
    for (const entry of entries) {
      const m = line.match(entry.regex);
      if (m) {
        currentField = entry.field;
        result[currentField] = m[1].trim();
        matched = true;
        break;
      }
    }
    if (!matched && SECTION_BOUNDARY_REGEX.test(line)) {
      currentField = null;
    } else if (!matched && currentField) {
      result[currentField] = `${result[currentField] ? result[currentField] + ' ' : ''}${line}`;
    }
  }
  return result;
}

function splitByRepeatingHeader(text, headerRegex) {
  const blocks = [];
  let current = null;
  let currentNumber = null;
  for (const rawLine of safeText(text).split(/\r?\n/)) {
    const m = rawLine.match(headerRegex);
    if (m) {
      if (current !== null) blocks.push({ number: currentNumber, text: current.join('\n') });
      currentNumber = Number(m[1]);
      current = [];
    } else if (current !== null) {
      current.push(rawLine);
    }
  }
  if (current !== null) blocks.push({ number: currentNumber, text: current.join('\n') });
  return blocks;
}

function parseScoreNumber(text) {
  const m = safeText(text).match(/(\d{1,3})/);
  if (!m) return 0;
  return Math.max(0, Math.min(100, Number(m[1])));
}

const IDEA_LABEL_MAP = {
  'Naziv': 'title',
  'Vizuelna porodica': 'visualFamily',
  'Ideja u jednoj rečenici': 'oneSentence',
  'Narativni luk': 'narrativeArc',
  'Vizuelni svet': 'visualWorld',
  'Centralni simbol': 'centralSymbol',
  'Hook scena': 'hookScene',
  'Vreme i vremenski uslovi': 'timeWeather',
  'Paleta boja': 'colorPalette',
  'Pravila kamere': 'cameraGrammar',
  'Logika garderobe': 'costumeLogic',
  'Motiv koji se vraća': 'recurringMotif',
  'Završetak': 'ending',
  'Zašto odgovara kanalu': 'channelFitReason',
  'Ocena od 0 do 100': 'totalScoreRaw'
};

function extractIdeaFromBlock(blockText, number) {
  const fields = extractLabeledFields(blockText, IDEA_LABEL_MAP);
  const locations = [];
  const locationRegex = /^\s*Lokacija\s+(\d+)\s+i\s+razlog\s*:\s*(.*)$/i;
  let currentLocationIndex = null;
  for (const rawLine of safeText(blockText).split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(locationRegex);
    if (m) { currentLocationIndex = locations.length; locations.push(m[2].trim()); }
    else if (currentLocationIndex !== null && line && !/^Dodatne lokacije/i.test(line)) {
      locations[currentLocationIndex] = `${locations[currentLocationIndex]} ${line}`.trim();
    } else if (line) { currentLocationIndex = null; }
  }
  return {
    id: `idea-${number}`,
    title: fields.title || '',
    visualFamily: fields.visualFamily || '',
    oneSentence: fields.oneSentence || '',
    narrativeArc: fields.narrativeArc || '',
    visualWorld: fields.visualWorld || '',
    centralSymbol: fields.centralSymbol || '',
    hookScene: fields.hookScene || '',
    locations,
    timeWeather: fields.timeWeather || '',
    colorPalette: fields.colorPalette || '',
    cameraGrammar: fields.cameraGrammar || '',
    costumeLogic: fields.costumeLogic || '',
    recurringMotif: fields.recurringMotif || '',
    ending: fields.ending || '',
    channelFitReason: fields.channelFitReason || '',
    totalScore: parseScoreNumber(fields.totalScoreRaw)
  };
}

const RESEARCH_LABEL_MAP = {
  'Datum istraživanja': 'searchedAt',
  'Datum': 'searchedAt',
  'Korišćeni upiti': 'queriesRaw',
  'Sažetak istraživanja': 'summary',
  'Aktuelni vizuelni obrasci': 'visualTrendsRaw',
  'Obrasci koje treba izbegavati': 'avoidPatternsRaw'
};

function extractResearchFromText(text) {
  const fields = extractLabeledFields(text, RESEARCH_LABEL_MAP);
  const sources = [];
  const sourceRegex = /^\s*(?:Izvor\s+\d+|Dodatni izvori(?:, ako su korisni)?)\s*(?:—|-)\s*(.*)$/i;
  for (const rawLine of safeText(text).split(/\r?\n/)) {
    const m = rawLine.trim().match(sourceRegex);
    if (m && m[1]) {
      const urlMatch = m[1].match(/https?:\/\/\S+/);
      sources.push({ title: m[1].trim(), url: urlMatch ? urlMatch[0] : '', finding: m[1].trim() });
    }
  }
  return {
    searchedAt: fields.searchedAt || '',
    sources,
    summary: fields.summary || '',
    visualTrends: (fields.visualTrendsRaw || '').split(/[;,]/).map(s => s.trim()).filter(Boolean),
    avoidPatterns: (fields.avoidPatternsRaw || '').split(/[;,]/).map(s => s.trim()).filter(Boolean)
  };
}

// Parsira Krug 1 odgovor (natural-text). Vraća { ok, research, ideas, missingFields }.
// Odbija (ok:false) ako nema tačno 10 ideja i prijavljuje koja/koje nedostaju.
function parseRound1IdeasText(text) {
  const raw = safeText(text);
  if (!raw) return { ok: false, missingFields: ['ceo odgovor je prazan'], research: null, ideas: [] };

  const research = extractResearchFromText(raw);
  const ideaBlocks = splitByRepeatingHeader(raw, /^\s*IDEJA\s+(\d+)\s*$/i);
  const ideas = ideaBlocks.map(block => extractIdeaFromBlock(block.text, block.number)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const missingFields = [];
  const foundNumbers = new Set(ideaBlocks.map(b => b.number));
  for (let i = 1; i <= 10; i += 1) {
    if (!foundNumbers.has(i)) missingFields.push(`IDEJA ${i} nedostaje`);
  }
  for (const idea of ideas) {
    if (!idea.title) missingFields.push(`${idea.id}: nedostaje Naziv`);
    if (!idea.oneSentence) missingFields.push(`${idea.id}: nedostaje "Ideja u jednoj rečenici"`);
  }

  return { ok: missingFields.length === 0, missingFields, research, ideas, selectedIdeaId: '' };
}

// --- PROMPT 3 — Krug 2: storyboard paket ---

function buildStoryboardBatchPrompt(p, payload) {
  const project = p || {};
  const spec = payload || {};
  const sceneNumbers = spec.batchSceneNumbers || [];
  const timingMap = project.timingMap || [];
  const timingLines = timingMap.map(scene => `Scena ${scene.number}: ${scene.start}s–${scene.end}s (${scene.duration}s), deo pesme: ${safeText(scene.section)}, stih: "${safeText(scene.lyric)}"`).join('\n');

  return joinNonEmpty([
    'Nastavljamo već izabranu ideju. Ne pravi novih 10 ideja i ne menjaj izabranu ideju.',
    '',
    `Naziv pesme: ${safeText(project.songTitle) || 'Nova pesma'}`,
    `Izabrana ideja: ${safeText(project.selectedIdea?.title || project.selectedIdeaId)}`,
    `Format: ${safeText(project.format) || '16:9'}`,
    `Potvrđeni BPM i muzičke tačke: ${formatAudioLine(project.audio)}`,
    `Broj paketa: ${Number(spec.batchIndex) + 1} od ${spec.batchTotal}`,
    `Obradi samo scene: ${sceneNumbers.join(', ')}`,
    timingLines ? `Podaci za aktivne scene sa vremenom, delom pesme i stihovima:\n${timingLines}` : '',
    '',
    'Za svaku traženu scenu zadrži tačno početno vreme, završno vreme, trajanje, deo pesme i stih koji je program poslao. Ne vraćaj nijednu scenu koja nije navedena.',
    '',
    'Odgovor napiši ovim redosledom:',
    '',
    `MSS ODGOVOR — STORYBOARD PAKET ${Number(spec.batchIndex) + 1}`,
    '',
    buildSceneFieldTemplate(sceneNumbers[0] || 1),
    '',
    'Ponovi isti skup oznaka samo za ostale scene navedene u ovom paketu.',
    '',
    'Na kraju napiši:',
    '',
    `KRAJ MSS ODGOVORA — STORYBOARD PAKET ${Number(spec.batchIndex) + 1}`,
    '',
    'Ne dodaj završni YouTube paket, nove ideje ili scene iz drugih batch-eva.'
  ]);
}

function buildSceneFieldTemplate(number) {
  return joinNonEmpty([
    `SCENA ${number}`,
    'Početak:', 'Kraj:', 'Trajanje:', 'Deo pesme:', 'Stih:', 'Značenje stiha u ovoj sceni:',
    'Glavna emocija:', 'Naziv scene:', 'Detaljna radnja:', 'Mikro-pokret glavnog lika:', 'Lokacija:',
    'Zašto lokacija pripada ovom delu pesme:', 'Vreme i vremenski uslovi:', 'Osvetljenje:', 'Vrsta kadra:',
    'Objektiv:', 'Pokret kamere:', 'Kompozicija:', 'Prednji plan:', 'Srednji plan:', 'Zadnji plan:',
    'Atmosfera:', 'Garderoba:', 'Kontinuitet sa prethodnom i sledećom scenom:', 'Ulazni prelaz:',
    'Izlazni prelaz:', 'Likovi u sceni:', 'Jedinstveni vizuelni potpis:', 'Image prompt na engleskom:',
    'Video prompt na engleskom:'
  ]);
}

const SCENE_LABEL_MAP = {
  'Početak': 'startRaw', 'Kraj': 'endRaw', 'Trajanje': 'durationRaw', 'Deo pesme': 'section', 'Stih': 'lyric',
  'Značenje stiha u ovoj sceni': 'lyricMeaning', 'Glavna emocija': 'emotion', 'Naziv scene': 'sceneTitle',
  'Detaljna radnja': 'description', 'Mikro-pokret glavnog lika': 'microMovement', 'Lokacija': 'location',
  'Zašto lokacija pripada ovom delu pesme': 'locationReason', 'Vreme i vremenski uslovi': 'timeWeather',
  'Osvetljenje': 'lighting', 'Vrsta kadra': 'shot', 'Objektiv': 'lens', 'Pokret kamere': 'camera',
  'Kompozicija': 'composition', 'Prednji plan': 'foreground', 'Srednji plan': 'midground', 'Zadnji plan': 'background',
  'Atmosfera': 'atmosphere', 'Garderoba': 'wardrobe', 'Kontinuitet sa prethodnom i sledećom scenom': 'continuityNotes',
  'Ulazni prelaz': 'transitionIn', 'Izlazni prelaz': 'transitionOut', 'Likovi u sceni': 'characterNamesRaw',
  'Jedinstveni vizuelni potpis': 'referenceTechnique', 'Image prompt na engleskom': 'imagePrompt',
  'Video prompt na engleskom': 'videoPrompt'
};

function parseTimeToSeconds(text) {
  const raw = safeText(text);
  const mmss = raw.match(/^(\d+):(\d{1,2})(?:[.,](\d+))?$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]) + (mmss[3] ? Number(`0.${mmss[3]}`) : 0);
  const numeric = raw.match(/(\d+(?:[.,]\d+)?)/);
  return numeric ? Number(numeric[1].replace(',', '.')) : 0;
}

function extractSceneFromBlock(blockText, number) {
  const fields = extractLabeledFields(blockText, SCENE_LABEL_MAP);
  const start = parseTimeToSeconds(fields.startRaw);
  const end = parseTimeToSeconds(fields.endRaw);
  return {
    number,
    start, end,
    duration: fields.durationRaw ? parseTimeToSeconds(fields.durationRaw) : Math.max(0, end - start),
    section: fields.section || '', lyric: fields.lyric || '', lyricMeaning: fields.lyricMeaning || '',
    emotion: fields.emotion || '', sceneTitle: fields.sceneTitle || '', description: fields.description || '',
    microMovement: fields.microMovement || '', location: fields.location || '', locationReason: fields.locationReason || '',
    timeWeather: fields.timeWeather || '', lighting: fields.lighting || '', shot: fields.shot || '', lens: fields.lens || '',
    camera: fields.camera || '', composition: fields.composition || '', foreground: fields.foreground || '',
    midground: fields.midground || '', background: fields.background || '', atmosphere: fields.atmosphere || '',
    wardrobe: fields.wardrobe || '', continuityNotes: fields.continuityNotes || '', transitionIn: fields.transitionIn || '',
    transitionOut: fields.transitionOut || '',
    characterNames: (fields.characterNamesRaw || '').split(',').map(s => s.trim()).filter(Boolean),
    referenceTechnique: fields.referenceTechnique || '', imagePrompt: fields.imagePrompt || '', videoPrompt: fields.videoPrompt || ''
  };
}

function extractScenesFromText(text) {
  return splitByRepeatingHeader(text, /^\s*SCENA\s+(\d+)\s*$/i).map(block => extractSceneFromBlock(block.text, block.number));
}

// Parsira storyboard batch odgovor. Prihvata SAMO tražene scene (expectedSceneNumbers) — ako
// ChatGPT vrati druge brojeve, oni se odbacuju umesto da se tiho pomešaju sa drugim batch-evima.
function parseStoryboardBatchText(text, expectedSceneNumbers = []) {
  const raw = safeText(text);
  if (!raw) return { ok: false, missingFields: ['ceo odgovor je prazan'], scenes: [] };

  const allScenes = extractScenesFromText(raw);
  const expected = new Set((expectedSceneNumbers || []).map(Number));
  const scenes = expected.size ? allScenes.filter(s => expected.has(s.number)) : allScenes;

  const missingFields = [];
  for (const num of expected) {
    if (!scenes.some(s => s.number === num)) missingFields.push(`SCENA ${num} nedostaje`);
  }
  for (const scene of scenes) {
    if (!scene.imagePrompt) missingFields.push(`SCENA ${scene.number}: nedostaje image prompt`);
    if (!scene.videoPrompt) missingFields.push(`SCENA ${scene.number}: nedostaje video prompt`);
  }

  return { ok: missingFields.length === 0, missingFields, scenes };
}

// --- PROMPT 4 — završni koncept, YouTube paket, QA ---

function buildFinalPackagePrompt(p) {
  const project = p || {};
  return joinNonEmpty([
    'Storyboard je završen. Nemoj ponovo pisati scene i nemoj praviti nove ideje.',
    '',
    `Naziv pesme: ${safeText(project.songTitle) || 'Nova pesma'}`,
    `Izabrana ideja: ${safeText(project.selectedIdea?.title || project.selectedIdeaId)}`,
    `Sažetak gotovog storyboarda: ${project.storyboardSummary ? `${project.storyboardSummary.sceneCount || 0} scena` : 'nije dostupan'}`,
    project.youtubeCurrent ? `Podaci aktivnog YouTube kanala: ${safeText(project.youtubeCurrent.title)}` : '',
    '',
    'Pripremi završni kreativni koncept, kompletan paket za objavu i kontrolu kvaliteta.',
    '',
    'Odgovor napiši ovim redosledom:',
    '',
    'MSS ODGOVOR — ZAVRŠNI PAKET',
    '',
    'KONAČNI KONCEPT',
    'Naziv koncepta:', 'Žanr spota:', 'Raspoloženje:', 'Kompletna priča:', 'Vizuelni stil:', 'Paleta boja:',
    'Stil kamere:', 'Lokacije i njihova uloga:', 'Centralni simbol:', 'Hook prvih 3 sekunde:',
    'Hook prvih 5 sekundi:', 'Hook prvih 10 sekundi:', 'Završetak:',
    '',
    'YOUTUBE PAKET',
    'Glavni naslov:', 'Alternativni naslov 1:', 'Alternativni naslov 2:', 'Alternativni naslov 3:', 'SEO opis:',
    'Hashtagovi:', 'Tagovi:', 'Ključne reči:', 'Zakačeni komentar:', 'Poglavlja:',
    'Shorts 1 — naslov, početak, kraj, hook i poziv na akciju:',
    'Shorts 2 — naslov, početak, kraj, hook i poziv na akciju:',
    'Shorts 3 — naslov, početak, kraj, hook i poziv na akciju:',
    'Predlog naslovne slike:', 'Tekst na naslovnoj slici, samo ako je potreban:',
    '',
    'KONTROLA KVALITETA',
    'Da li prve 3 sekunde imaju hook:', 'Da li prvih 5 sekundi zadržava pažnju:',
    'Da li prvih 10 sekundi uvodi priču:', 'Problemi kontinuiteta:', 'Ponavljajuće radnje, kadrovi ili lokacije:',
    'Provera zaključanog identiteta:', 'Provera garderobe i tetovaže:', 'Provera izvora i originalnosti:',
    'Šta mora da se popravi pre slika i videa:',
    '',
    'KRAJ MSS ODGOVORA — ZAVRŠNI PAKET'
  ]);
}

const CONCEPT_LABEL_MAP = {
  'Naziv koncepta': 'title', 'Žanr spota': 'genre', 'Raspoloženje': 'mood', 'Kompletna priča': 'story',
  'Vizuelni stil': 'visualStyle', 'Paleta boja': 'colorPalette', 'Stil kamere': 'cameraStyle',
  'Lokacije i njihova uloga': 'locations', 'Centralni simbol': 'centralSymbol',
  'Hook prvih 3 sekunde': 'openingHook3', 'Hook prvih 5 sekundi': 'openingHook5',
  'Hook prvih 10 sekundi': 'openingHook10', 'Završetak': 'ending'
};
const YOUTUBE_LABEL_MAP = {
  'Glavni naslov': 'title', 'SEO opis': 'description', 'Hashtagovi': 'hashtags', 'Zakačeni komentar': 'pinned',
  'Poglavlja': 'chapters', 'Tagovi': 'tags', 'Ključne reči': 'keywords'
};
const QUALITY_LABEL_MAP = {
  'Da li prve 3 sekunde imaju hook': 'hook3', 'Da li prvih 5 sekundi zadržava pažnju': 'hook5',
  'Da li prvih 10 sekundi uvodi priču': 'hook10', 'Problemi kontinuiteta': 'continuityWarningsRaw',
  'Ponavljajuće radnje, kadrovi ili lokacije': 'repeatedPatternsRaw', 'Provera izvora i originalnosti': 'sourceCheckRaw'
};

function extractConceptFromText(text) {
  const fields = extractLabeledFields(text, CONCEPT_LABEL_MAP);
  return {
    title: fields.title || '', genre: fields.genre || '', mood: fields.mood || '', story: fields.story || '',
    visualStyle: fields.visualStyle || '', colorPalette: fields.colorPalette || '', cameraStyle: fields.cameraStyle || '',
    locations: fields.locations || '', centralSymbol: fields.centralSymbol || '',
    openingHook: [fields.openingHook3, fields.openingHook5, fields.openingHook10].filter(Boolean).join(' | '),
    ending: fields.ending || ''
  };
}
function extractYoutubeFromText(text) {
  const fields = extractLabeledFields(text, YOUTUBE_LABEL_MAP);
  const shorts = [];
  for (const m of safeText(text).matchAll(/^Shorts\s+(\d+)\s*—\s*(.*)$/gmi)) {
    shorts.push({ title: m[2].trim(), start: 0, end: 30, hook: m[2].trim(), cta: '' });
  }
  return {
    title: fields.title || '', description: fields.description || '', hashtags: fields.hashtags || '',
    pinned: fields.pinned || '', chapters: fields.chapters || '', shorts
  };
}
function extractQualityAuditFromText(text) {
  const fields = extractLabeledFields(text, QUALITY_LABEL_MAP);
  return {
    hook3: fields.hook3 || '', hook5: fields.hook5 || '', hook10: fields.hook10 || '',
    continuityWarnings: (fields.continuityWarningsRaw || '').split(/[;,]/).map(s => s.trim()).filter(Boolean),
    repeatedPatterns: (fields.repeatedPatternsRaw || '').split(/[;,]/).map(s => s.trim()).filter(Boolean),
    sourceCheck: (fields.sourceCheckRaw || '').split(/[;,]/).map(s => s.trim()).filter(Boolean)
  };
}

function parseFinalPackageText(text) {
  const raw = safeText(text);
  if (!raw) return { ok: false, missingFields: ['ceo odgovor je prazan'], concept: null, youtube: null, qualityAudit: null };
  const concept = extractConceptFromText(raw);
  const youtube = extractYoutubeFromText(raw);
  const qualityAudit = extractQualityAuditFromText(raw);
  const missingFields = [];
  if (!concept.title) missingFields.push('KONAČNI KONCEPT: nedostaje Naziv koncepta');
  if (!youtube.title) missingFields.push('YOUTUBE PAKET: nedostaje Glavni naslov');
  return { ok: missingFields.length === 0, missingFields, concept, youtube, qualityAudit };
}

// --- PROMPT 5 — direktan prompt u kompletan spot ---

function buildPromptToSpotPrompt(p) {
  const project = p || {};
  const custom = project.promptToSpot || {};
  const refs = formatReferences(custom.selectedReferences);
  return joinNonEmpty([
    'Korisnik ne želi 10 ideja. Napravi jedan kompletan spot prema njegovom promptu.',
    '',
    `Naziv pesme: ${safeText(project.songTitle) || 'Novi video spot'}`,
    `Format: ${safeText(project.format) || '16:9'}`,
    `Trajanje: ${custom.requestedDuration || 60} s`,
    `BPM i audio dinamika: ${formatAudioLine(project.audio)}`,
    `Vrsta spota: ${safeText(custom.spotType) || 'auto'}`,
    `Vizuelni ton: ${safeText(custom.visualTone) || 'auto'}`,
    `Budžet: ${safeText(custom.budget) || 'low'}`,
    `Plan lokacija: ${safeText(custom.locationPlan) || 'auto'}`,
    `Maksimalan broj scena: ${custom.maxScenes || 16}`,
    `Odnos kadrova: ${safeText(custom.shotMix) || 'balanced'}`,
    `Korisnikov glavni prompt:\n${safeText(custom.prompt)}`,
    refs ? `Izabrane reference:\n${refs}` : '',
    `Tekst pesme:\n${safeText(project.lyrics)}`,
    '',
    'Uradi aktuelno web i YouTube istraživanje kada je uključeno. Korisnikov prompt je glavni kreativni brief. Napravi jednu priču, ne 10 opcija. Broj scena mora odgovarati trajanju i ne sme preći zadati maksimum.',
    '',
    'Odgovor napiši ovim redosledom:',
    '',
    'MSS ODGOVOR — DIREKTAN SPOT',
    '',
    'ISTRAŽIVANJE',
    'Datum:', 'Korišćeni upiti:', 'Najmanje tri relevantna izvora sa naslovom, linkom i nalazom:',
    'Apstraktne tehnike koje se koriste:', 'Elementi koji se namerno ne kopiraju:',
    '',
    'KONCEPT',
    'Naziv:', 'Žanr:', 'Raspoloženje:', 'Kompletna priča:', 'Vizuelni stil:', 'Paleta boja:', 'Stil kamere:',
    'Plan lokacija:', 'Centralni simbol:', 'Početni hook:', 'Završetak:',
    '',
    'PLAN PRIČE',
    'Sažetak priče:', 'Zašto odgovara pesmi:', 'Preporučeni broj scena:', 'Procenjeni broj slika:',
    'Procenjeni broj video-klipova:', 'Prosečno trajanje scene:', 'Ritam montaže:', 'Plan hooka:',
    '',
    'Zatim napiši sve scene koristeći isti skup oznaka iz prompta „KRUG 2: STORYBOARD ZA AKTIVNI BATCH".',
    '',
    'Posle scena napiši YOUTUBE PAKET i KONTROLU KVALITETA koristeći isti skup oznaka iz završnog prompta.',
    '',
    'Na kraju napiši:',
    '',
    'KRAJ MSS ODGOVORA — DIREKTAN SPOT'
  ]);
}

const STORY_PLAN_LABEL_MAP = {
  'Sažetak priče': 'storySummary', 'Zašto odgovara pesmi': 'whyItFitsSong',
  'Preporučeni broj scena': 'recommendedSceneCountRaw', 'Procenjeni broj slika': 'estimatedImageCountRaw',
  'Procenjeni broj video-klipova': 'videoPromptCountRaw', 'Prosečno trajanje scene': 'averageSceneDurationRaw',
  'Ritam montaže': 'rhythmNote', 'Plan hooka': 'hookNote'
};
function extractStoryPlanFromText(text) {
  const fields = extractLabeledFields(text, STORY_PLAN_LABEL_MAP);
  const toNumber = raw => { const m = safeText(raw).match(/(\d+)/); return m ? Number(m[1]) : undefined; };
  return {
    storySummary: fields.storySummary || '', whyItFitsSong: fields.whyItFitsSong || '',
    recommendedSceneCount: toNumber(fields.recommendedSceneCountRaw),
    estimatedImageCount: toNumber(fields.estimatedImageCountRaw),
    imagePromptCount: toNumber(fields.estimatedImageCountRaw),
    videoPromptCount: toNumber(fields.videoPromptCountRaw),
    averageSceneDuration: toNumber(fields.averageSceneDurationRaw),
    rhythmNote: fields.rhythmNote || '', hookNote: fields.hookNote || '', locationPlan: ''
  };
}

function parsePromptToSpotText(text) {
  const raw = safeText(text);
  if (!raw) return { ok: false, missingFields: ['ceo odgovor je prazan'] };
  const research = extractResearchFromText(raw);
  const concept = extractConceptFromText(raw);
  const storyPlan = extractStoryPlanFromText(raw);
  const scenes = extractScenesFromText(raw);
  const youtube = extractYoutubeFromText(raw);
  const qualityAudit = extractQualityAuditFromText(raw);
  const missingFields = [];
  if (!concept.title) missingFields.push('KONCEPT: nedostaje Naziv');
  if (!scenes.length) missingFields.push('Nijedna scena nije pronađena');
  return { ok: missingFields.length === 0, missingFields, research, concept, storyPlan, scenes, youtube, qualityAudit };
}

// --- Centralni dispatcher: detektuje fazu iz teksta (ili koristi meta.phase) i vraća result
// objekat u ISTOM obliku koji je ranije proizvodio JSON.parse(...) odgovor — omogućava da se
// postojeća logika za primenu odgovora u state (applyGptResponse u v14-features.js) NE menja,
// samo joj se drugačije napuni "result" ulaz.

function detectNaturalTextPhase(text) {
  const raw = safeText(text);
  if (/MSS ODGOVOR\s*—\s*DIREKTAN SPOT/i.test(raw)) return 'prompt-to-spot';
  if (/MSS ODGOVOR\s*—\s*STORYBOARD PAKET/i.test(raw)) return 'round2-scenes';
  if (/MSS ODGOVOR\s*—\s*ZAVRŠNI PAKET/i.test(raw)) return 'round2-final';
  if (/MSS ODGOVOR\s*—\s*KRUG 1/i.test(raw)) return 'round1-ideas';
  if (/MSS ODGOVOR\s*—\s*DOPUNA/i.test(raw)) return 'follow-up';
  return null;
}

function isNaturalTextResponse(text) {
  return /MSS ODGOVOR\s*—/i.test(safeText(text));
}

// meta: { phase, batchSceneNumbers } — isti oblik koji applyGptResponse već prima.
function parseBridgeResponseText(raw, meta = {}) {
  const phase = safeText(meta.phase) || detectNaturalTextPhase(raw);
  if (phase === 'prompt-to-spot') {
    const parsed = parsePromptToSpotText(raw);
    return { ok: parsed.ok, missingFields: parsed.missingFields, phase, result: { phase, research: parsed.research, concept: parsed.concept, storyPlan: parsed.storyPlan, scenes: parsed.scenes, youtube: parsed.youtube, qualityAudit: parsed.qualityAudit } };
  }
  if (phase === 'round2-scenes') {
    const parsed = parseStoryboardBatchText(raw, meta.batchSceneNumbers || []);
    return { ok: parsed.ok, missingFields: parsed.missingFields, phase, result: { phase, scenes: parsed.scenes } };
  }
  if (phase === 'round2-final') {
    const parsed = parseFinalPackageText(raw);
    return { ok: parsed.ok, missingFields: parsed.missingFields, phase, result: { phase, concept: parsed.concept, youtube: parsed.youtube, qualityAudit: parsed.qualityAudit } };
  }
  if (phase === 'round1-ideas') {
    const parsed = parseRound1IdeasText(raw);
    return { ok: parsed.ok, missingFields: parsed.missingFields, phase, result: { phase, research: parsed.research, ideas: parsed.ideas, selectedIdeaId: parsed.selectedIdeaId } };
  }
  return { ok: false, missingFields: ['Odgovor ne sadrži prepoznatljiv "MSS ODGOVOR" naslov.'], phase: phase || null, result: null };
}

// --- PROMPT 6 — dopuna nepotpunog odgovora ---

function buildFollowUpPrompt(missingFieldsDescription, minimalData) {
  return joinNonEmpty([
    'Prethodni odgovor je delimično uvezen, ali sledeći delovi nedostaju ili nisu dovoljno detaljni:',
    '',
    safeText(missingFieldsDescription),
    '',
    'Ne prepravljaj delove koji su već prihvaćeni. Dopuni samo navedene ideje, scene ili polja. Koristi iste naslove i oznake kao u prvobitnom zadatku.',
    '',
    minimalData ? `Podaci potrebni za dopunu:\n${safeText(minimalData)}` : '',
    '',
    'Odgovor počni sa:',
    '',
    'MSS ODGOVOR — DOPUNA',
    '',
    'Zatim napiši samo tražene delove.',
    '',
    'Odgovor završi sa:',
    '',
    'KRAJ MSS ODGOVORA — DOPUNA'
  ]);
}

// --- PROMPT 7/8 — image/video prompt batch ---

function buildImagePromptBatchPrompt(sceneList, identityBlock, format) {
  const scenesText = (sceneList || []).map(s => `Scena ${s.number}: ${safeText(s.description)} (${safeText(s.location)}, ${safeText(s.timeWeather)})`).join('\n');
  return joinNonEmpty([
    'Za sledeće scene napiši samo detaljne image promptove na engleskom. Ne menjaj priču, vreme, lokaciju, garderobu ili identitet.',
    '',
    `Zaključani identitet:\n${safeText(identityBlock)}`,
    `Scene u ovom paketu:\n${scenesText}`,
    `Format slike: ${safeText(format) || '16:9'}`,
    '',
    'Svaki image prompt mora da opisuje jednu jasnu sliku i da sadrži konkretnu radnju, lokaciju, vreme, svetlo, kadar, objektiv, kompoziciju, prednji/srednji/zadnji plan, atmosferu, garderobu i continuity detalje. Bez teksta, titlova, logotipa i watermarka.',
    '',
    'Odgovor napiši ovako:',
    '',
    'MSS ODGOVOR — IMAGE PROMPTOVI',
    '',
    'SCENA [BROJ]', 'Image prompt:', 'Negativni prompt:', 'Kontrola identiteta:', 'Kontrola tetovaže i garderobe:',
    '',
    'Ponovi samo za scene iz ovog paketa.',
    '',
    'KRAJ MSS ODGOVORA — IMAGE PROMPTOVI'
  ]);
}

function parseImagePromptBatchText(text) {
  const labelMap = { 'Image prompt': 'imagePrompt', 'Negativni prompt': 'negativePrompt', 'Kontrola identiteta': 'identityCheck', 'Kontrola tetovaže i garderobe': 'wardrobeCheck' };
  const scenes = splitByRepeatingHeader(text, /^\s*SCENA\s+(\d+)\s*$/i).map(block => ({ number: block.number, ...extractLabeledFields(block.text, labelMap) }));
  const missingFields = scenes.filter(s => !s.imagePrompt).map(s => `SCENA ${s.number}: nedostaje Image prompt`);
  return { ok: scenes.length > 0 && missingFields.length === 0, missingFields, scenes };
}

function buildVideoPromptBatchPrompt(sceneList, durations) {
  const scenesText = (sceneList || []).map(s => `Scena ${s.number}: ${safeText(s.imagePrompt).slice(0, 200)}`).join('\n');
  const durationsText = (durations || []).map(d => `Scena ${d.number}: ${d.durationMs ? Math.round(d.durationMs / 1000) : 5}s`).join('\n');
  return joinNonEmpty([
    'Za sledeće scene napiši samo detaljne image-to-video promptove na engleskom. Svaki prompt mora da počne od postojeće slike i sačuva isto lice, anatomiju, garderobu, lokaciju, predmete i osvetljenje.',
    '',
    `Scene i opis njihovih početnih slika:\n${scenesText}`,
    `Tačno trajanje svakog klipa:\n${durationsText}`,
    '',
    'Opiši mikro-pokret osobe, izraz, pokret kose ili odeće kada je logičan, pokret okoline, kameru, brzinu, parallax i završni kadar. Ne uvodi novu osobu, novu garderobu ili novu lokaciju. Bez morphinga, deformacija, flickera, promene lica i duplih ekstremiteta.',
    '',
    'Odgovor napiši ovako:',
    '',
    'MSS ODGOVOR — VIDEO PROMPTOVI',
    '',
    'SCENA [BROJ]', 'Video prompt:', 'Negativni prompt:', 'Početni kadar:', 'Završni kadar:', 'Kontrola kontinuiteta:',
    '',
    'Ponovi samo za scene iz ovog paketa.',
    '',
    'KRAJ MSS ODGOVORA — VIDEO PROMPTOVI'
  ]);
}

function parseVideoPromptBatchText(text) {
  const labelMap = { 'Video prompt': 'videoPrompt', 'Negativni prompt': 'negativePrompt', 'Početni kadar': 'startFrame', 'Završni kadar': 'endFrame', 'Kontrola kontinuiteta': 'continuityCheck' };
  const scenes = splitByRepeatingHeader(text, /^\s*SCENA\s+(\d+)\s*$/i).map(block => ({ number: block.number, ...extractLabeledFields(block.text, labelMap) }));
  const missingFields = scenes.filter(s => !s.videoPrompt).map(s => `SCENA ${s.number}: nedostaje Video prompt`);
  return { ok: scenes.length > 0 && missingFields.length === 0, missingFields, scenes };
}

// --- PROMPT 10 — kratak ponovni pokušaj posle greške ---

function buildShortRetryPrompt(singleTask, minimalData) {
  return joinNonEmpty([
    'Prethodni pokušaj nije završen zbog tehničke greške. Uradi samo sledeći mali zadatak:',
    '',
    safeText(singleTask),
    '',
    'Koristi samo ove neophodne podatke:',
    '',
    safeText(minimalData),
    '',
    'Ne ponavljaj celo istraživanje, celu pesmu ili već završene delove. Koristi iste oznake polja kao u originalnom zadatku i napiši samo traženi deo.'
  ]);
}

const MSS_BRIDGE_PROMPTS = {
  BRIDGE_TEST_LINE,
  MAIN_GPT_INSTRUCTIONS,
  buildBridgeTestPrompt, parseBridgeTestText,
  buildRound1Prompt, parseRound1IdeasText,
  buildStoryboardBatchPrompt, parseStoryboardBatchText,
  buildFinalPackagePrompt, parseFinalPackageText,
  buildPromptToSpotPrompt, parsePromptToSpotText,
  buildFollowUpPrompt,
  buildImagePromptBatchPrompt, parseImagePromptBatchText,
  buildVideoPromptBatchPrompt, parseVideoPromptBatchText,
  buildShortRetryPrompt,
  detectNaturalTextPhase, isNaturalTextResponse, parseBridgeResponseText,
  extractLabeledFields, splitByRepeatingHeader, parseTimeToSeconds
};

if (typeof window !== 'undefined') window.MSS_BRIDGE_PROMPTS = MSS_BRIDGE_PROMPTS;
if (typeof module !== 'undefined' && module.exports) module.exports = MSS_BRIDGE_PROMPTS;
