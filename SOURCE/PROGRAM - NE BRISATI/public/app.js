Warning: truncated output (original token count: 119105)
Total output lines: 6888

'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function uuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((value, index) => `${[4, 6, 8, 10].includes(index) ? '-' : ''}${value.toString(16).padStart(2, '0')}`).join('');
}

function stableTextFingerprint(value) {
  const text = String(value || '').toLocaleLowerCase('sr-RS').replace(/\s+/g, ' ').trim();
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
}
function currentSongFingerprintFromValues(title, lyrics, genre = '', mood = '') {
  return stableTextFingerprint([title, lyrics, genre, mood].join('\n---\n'));
}
function currentSongFingerprint() {
  return currentSongFingerprintFromValues(
    $('#songTitle')?.value || state?.songTitle || '',
    $('#lyrics')?.value || state?.lyrics || '',
    $('#manualGenre')?.value || state?.genre || '',
    $('#manualMood')?.value || state?.mood || ''
  );
}

const LAUNCH_INSTANCE_ID = new URLSearchParams(window.location.search).get('launch') || 'direct-browser';
const SESSION_STORAGE_KEY = `muzickiSpotStudioActiveSessionV153:${LAUNCH_INSTANCE_ID}`;
const EXPLICIT_SAVE_KEY = 'muzickiSpotStudioExplicitSaveV153';
const PREVIOUS_EXPLICIT_SAVE_KEYS = ['muzickiSpotStudioExplicitSaveV149', 'muzickiSpotStudioExplicitSaveV148'];
const LEGACY_SESSION_KEYS = ['muzickiSpotStudioActiveSessionV149', 'muzickiSpotStudioActiveSessionV148'];
const LEGACY_AUTO_KEYS = ['muzickiSpotStudioFreeV12','muzickiSpotStudioFreeV11','muzickiSpotStudioFreeV10'];
const STORAGE_KEY = SESSION_STORAGE_KEY;
const DB_NAME = 'muzickiSpotStudioFreeAssets';
const DB_STORE = 'assets';
const STEP1_MAX_AUDIO_BYTES = 500 * 1024 * 1024;
const STEP1_SUPPORTED_AUDIO_EXTENSIONS = Object.freeze(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'webm', 'flac']);

const LOCKED_GIRL_ID = 'locked-girl-permanent-v1';
const LOCKED_GIRL_BLOCK = window.LOCKED_GIRL_IDENTITY_BLOCK || '';
const LOCKED_GIRL_SPLIT = LOCKED_GIRL_BLOCK.split(/\s+Negative prompt:\s+/i);
const LOCKED_GIRL_POSITIVE = LOCKED_GIRL_SPLIT[0] || LOCKED_GIRL_BLOCK;
const LOCKED_GIRL_NEGATIVE = LOCKED_GIRL_SPLIT.slice(1).join(' Negative prompt: ') || '';

const LOCKED_GIRL_IDENTITY_MARKERS = ['SCENA ', 'Scene ', 'IMAGE PROMPT:', 'VIDEO PROMPT:'];
function removePreviousGirlIdentityPrefix(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith(LOCKED_GIRL_BLOCK)) return text.slice(LOCKED_GIRL_BLOCK.length).trim();
  if (/^the same woman,\s*same identity,\s*same person in every image/i.test(text)) {
    const indexes = LOCKED_GIRL_IDENTITY_MARKERS.map(marker => text.indexOf(marker)).filter(index => index > 0);
    if (indexes.length) return text.slice(Math.min(...indexes)).trim();
  }
  return text;
}
function withLockedGirlIdentity(value) {
  const body = removePreviousGirlIdentityPrefix(value);
  return `${LOCKED_GIRL_BLOCK}

${body}`.trim();
}

const DEFAULT_GIRL = Object.freeze({
  id: LOCKED_GIRL_ID,
  name: 'Glavna devojka — TRAJNO ZAKLJUČANA',
  role: 'Ista zaključana glavna devojka; puni ID je obavezan u svakom promptu u kome se pojavljuje',
  locked: LOCKED_GIRL_BLOCK,
  negative: LOCKED_GIRL_NEGATIVE,
  immutable: true
});

const DEFAULT_MAN = {
  id: 'default-man-v1',
  name: 'Glavni muškarac',
  role: 'Glavni muški lik',
  locked: 'the same man, same identity, same person in every image, ultra-realistic Balkan man, 28 years old, short dark brown hair, light stubble, tired brown eyes, defined masculine jawline, straight nose, natural skin texture, lean athletic build, dark modern clothing adapted to the scene, emotionally restrained body language, identical face and body proportions in every image, photorealistic cinematic realism, realistic anatomy',
  negative: 'different person, changed face, blonde hair, long hair, clean cartoon look, plastic skin, anime, illustration, deformed hands, duplicated limbs, text, logo, watermark'
};

function createInitialState() {
  return {
    schemaVersion: '15.4',
    savedByUser: false,
    dirtySinceSave: false,
    projectId: uuid(),
    updatedAt: new Date().toISOString(),
    name: '',
    songTitle: '',
    artistName: 'Nedostaješ PUNOO pesme',
    format: '16:9',
    sceneDuration: 5,
    lyrics: '',
    audio: {
      fileName: '',
      type: '',
      size: 0,
      duration: 0,
      sampleRate: 0,
      channels: 0,
      bpmEstimate: 0,
      bpmConfidence: 0,
      confirmedBpm: 0,
      averageEnergy: 0,
      energyCurve: [],
      analyzedAt: '',
      beatDetectorBpm: 0,
      beatOffset: 0,
      beatDetectorStatus: '',
      features: { spectralCentroid: 0, spectralRolloff: 0, spectralFlatness: 0, zcr: 0, rms: 0 }
    },
    genre: '',
    mood: '',
    concept: {
      title: '',
      story: '',
      visualStyle: 'photorealistic cinematic music video whose world is derived from the lyrics; use daylight, public spaces, travel, performance, nature or symbolic minimalism when justified; realistic people, natural skin and motivated lighting; never default automatically to a dark apartment',
      colorPalette: 'palette must change with the story and location; include bright, natural or high-contrast options when the lyrics support them; do not default every song to cold blue-gray',
      cameraStyle: 'motivated camera grammar that changes by section: wide establishing action, tracking or travel when the story moves, precise close-ups for emotional turns, and a distinct visual rule for the chorus',
      locations: '',
      genre: '', mood: '', centralSymbol: '', openingHook: '', ending: ''
    },
    creativeIdeas: [],
    selectedIdeaId: '',
    uniquenessHistory: [],
    ideaSourceFingerprint: '',
    ideaGenerationSource: '',
    ideaResearch: null,
    research: {
      status: 'idle', fetchedAt: '', fingerprint: '', queries: [], keywords: [],
      webResults: [], youtubeResults: [], referenceVideoAnalyses: [], recommendations: [], warnings: [], error: ''
    },
    characters: [{ ...DEFAULT_GIRL }],
    scenes: [],
    youtube: {
      title: '',
      description: '',
      hashtags: '',
      pinned: '',
      shorts: []
    },
    captions: {
      enabled: true,
      source: 'lyrics',
      language: 'sr',
      displayMode: 'original',
      items: [],
      status: '',
      translation: { sourceLanguage: 'sr', targetLanguage: 'en', items: [], text: '', status: '', protectedTerms: '' },
      dictionary: '',
      brandPresets: [],
      overlays: { titleEnabled: false, titleText: '', titleDuration: 4, ctaEnabled: false, ctaText: '', ctaDuration: 5 },
      preview: { format: '16:9', safeZonePlatform: 'youtube', showSafeZones: true, sceneId: '' },
      style: {
        position: 'bottom', align: 'center', fontSize: 5.5, mode: 'shadow', preset: 'custom', wordsPerLine: 7,
        uppercase: false, autoFit: true, fontFamily: 'Arial', textColor: '#ffffff', highlightColor: '#ff3b69',
        strokeColor: '#000000', strokeWidth: 8, boxColor: '#000000', boxOpacity: 68, maxWidth: 88,
        lineHeight: 122, verticalOffset: 0, animation: 'fade'
      }
    },
    imageAssetIds: {},
    videoAssetIds: {},
    lockedGirlReferenceAssetId: '',
    activeYoutubeChannelId: '',
    youtubeChannels: [],
    youtubeAnalysis: {},
    youtubeTrends: {
      apiKeySaved: false, query: '', region: 'RS', language: 'sr', days: 90,
      results: [], recommendations: [], analyzedAt: '', retentionVideoId: '', retentionPoints: []
    },
    chatgptBridge: {
      enabled: true, configured: false, imageEngine: 'manual-chatgpt', publicUrl: '', schemaUrl: '', instructions: '', gptEditorUrl: 'https://chatgpt.com/gpts/editor', privateGptUrl: 'https://chatgpt.com/g/g-6a62e905ca608191be135254d6f2fbcc-muzicki-spot-studio-privatni', configuredActionPublicUrl: '',
      tunnelProvider: 'cloudflare-quick-tunnel', tunnelSettings: {}, tunnelStatus: {},
      updateSeq: 0, autoContinue: true, waitingForIdeas: false, waitingForImages: false,
      lastSync: '', lastPoll: '', status: 'Most nije podešen.'
    },
    t2i: {
      endpoint: 'http://127.0.0.1:8188', connected: false, lastChecked: '', mode: 'instantid',
      checkpoint: 'sd_xl_base_1.0.safetensors', instantIdModel: 'ip-adapter.bin',
      controlNet: 'instantid/diffusion_pytorch_model.safetensors', provider: 'CPU',
      steps: 30, cfg: 4.5, autoI2vAfterImage: false
    },
    i2v: {
      endpoint: 'http://127.0.0.1:8188', connected: false, lastChecked: '',
      model: 'wan2.1_i2v_480p_14B_fp8_scaled.safetensors',
      textEncoder: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
      vae: 'wan_2.1_vae.safetensors', clipVision: 'clip_vision_h.safetensors',
      fps: 16, maxSeconds: 5, steps: 20, cfg: 6, useGeneratedClips: true,
      negativePrompt: 'watermark, logo, text, subtitles, deformed hands, extra fingers, duplicated limbs, changed identity, different face, flicker, jitter, low quality, blurry, frozen frame'
    },
    settings: {
      imageMaxSize: 2560,
      autoSmartCrop: true,
      autoPalette: true,
      renderResolution: 1080,
      renderFps: 30,
      transitionDuration: 0.7,
      renderScope: 'full',
      motionPreset: 'cinematic',
      motionStrength: 55,
      burnCaptions: true,
      preferAiClips: true,
      allowPlaceholderScenes: false,
      proxyRenderActive: false,
      weakPcMode: true,
      renderRecovery: true
    },
    savedAt: ''
  };
}

let state = loadState();
let audioBuffer = null;
let audioObjectUrl = '';
let renderSession = null;
let toastTimer = null;
let waveSurfer = null;
let sortableInstance = null;
let lastRenderedBlob = null;
let lastRenderedUrl = '';
let lastRenderedFileStem = '';
let ffmpegInstance = null;
let whisperTranscriber = null;
let transformersModule = null;
let i2vBatchCancelled = false;
let t2iBatchCancelled = false;
let t2iCurrentPromptId = '';
let youtubeAuthPollTimer = null;
let i2vCurrentPromptId = '';
let renderCompletionResolve = null;
let renderCompletionReject = null;
let captionPreviewObjectUrl = '';
let captionPreviewImageObjectUrl = '';
let captionPreviewTime = 0;
let captionPreviewIsDemo = true;
const i2vObjectUrls = new Set();
const galleryObjectUrls = new Set();

const TOOL_REGISTRY = [
  { id: 'wavesurfer', name: 'WaveSurfer.js', purpose: 'Interaktivni waveform, zum i traženje dela pesme', global: 'WaveSurfer', url: 'https://github.com/katspaugh/wavesurfer.js' },
  { id: 'meyda', name: 'Meyda', purpose: 'Napredne audio osobine: spektar, RMS i zero-crossing', global: 'Meyda', url: 'https://github.com/meyda/meyda' },
  { id: 'beat', name: 'web-audio-beat-detector', purpose: 'Preciznija BPM procena i prvi udar', dynamic: true, url: 'https://github.com/chrisguttandin/web-audio-beat-detector' },
  { id: 'sortable', name: 'SortableJS', purpose: 'Prevlačenje i promena redosleda scena', global: 'Sortable', url: 'https://github.com/SortableJS/Sortable' },
  { id: 'jszip', name: 'JSZip', purpose: 'Kompletna ZIP rezervna kopija sa pesmom i slikama', global: 'JSZip', url: 'https://github.com/Stuk/jszip' },
  { id: 'pica', name: 'Pica', purpose: 'Kvalitetno smanjivanje slika u pregledaču', global: 'pica', url: 'https://github.com/nodeca/pica' },
  { id: 'smartcrop', name: 'Smartcrop.js', purpose: 'Pametan kadar prema važnom delu slike', globalAny: ['smartcrop', 'SmartCrop'], url: 'https://github.com/jwagner/smartcrop.js' },
  { id: 'colorthief', name: 'Color Thief', purpose: 'Paleta boja i kontrola vizuelnog kontinuiteta', globalAny: ['ColorThief', 'colorthief'], url: 'https://github.com/lokesh/color-thief' },
  { id: 'papaparse', name: 'Papa Parse', purpose: 'Uvoz i izvoz storyboarda kao CSV', global: 'Papa', url: 'https://github.com/mholt/PapaParse' },
  { id: 'ffmpeg', name: 'FFmpeg.wasm', purpose: 'Lokalna konverzija WebM videa u MP4 i obrada videa', dynamic: true, url: 'https://github.com/ffmpegwasm/ffmpeg.wasm' },
  { id: 'transformers', name: 'Transformers.js + Whisper', purpose: 'Automatsko prepoznavanje srpskog govora i pravljenje vremenskih titlova', dynamic: true, url: 'https://github.com/huggingface/transformers.js' },
  { id: 'instantid', name: 'ComfyUI InstantID', purpose: 'Automatske slike sa istim referentnim licem i zaključanim identitetom', dynamic: true, url: 'https://github.com/cubiq/ComfyUI_InstantID' },
  { id: 'comfy-wan', name: 'ComfyUI + Wan 2.1 I2V', purpose: 'Pravi lokalni AI image-to-video bez API kredita i bez nametnutog watermarka', dynamic: true, url: 'https://github.com/Comfy-Org/ComfyUI' },
  { id: 'audio-tools', name: 'ComfyUI AudioTools — opciono', purpose: 'BPM, LUFS, stemovi, uklanjanje tišine i Whisper SRT', dynamic: true, url: 'https://github.com/lum3on/ComfyUI_AudioTools' },
  { id: 'faster-whisper', name: 'faster-whisper — opciono', purpose: 'Brzo lokalno izvlačenje teksta i vremenskih oznaka iz MP3 fajla', dynamic: true, url: 'https://github.com/SYSTRAN/faster-whisper' },
  { id: 'pyscenedetect', name: 'PySceneDetect — opciono', purpose: 'Analiza rezova, fade prelaza i tempa postojećeg videa', dynamic: true, url: 'https://github.com/Breakthrough/PySceneDetect' },
  { id: 'realesrgan', name: 'Real-ESRGAN — opciono', purpose: 'Povećanje rezolucije i popravljanje AI slika ili video-frejmova', dynamic: true, url: 'https://github.com/xinntao/Real-ESRGAN' },
  { id: 'rife', name: 'RIFE — opciono', purpose: 'Interpolacija frejmova za glatkiji 24/30/60 FPS video', dynamic: true, url: 'https://github.com/hzwer/ECCV2022-RIFE' },
  { id: 'hyperframes', name: 'HyperFrames — izvoz dodat', purpose: 'Deterministički HTML/FFmpeg MP4 render sa jednim izvezenim projektom', dynamic: true, url: 'https://github.com/heygen-com/hyperframes' },
  { id: 'librechat', name: 'LibreChat — opcioni konektor', purpose: 'Samostalni AI interfejs i provider hub; ne koristi ChatGPT Plus kao API', dynamic: true, url: 'https://github.com/danny-avila/LibreChat' },
  { id: 'open-generative-ai', name: 'Open Generative AI — opcioni konektor', purpose: 'Spoljni image/video provider ili udaljeni Wan2GP server', dynamic: true, url: 'https://github.com/Anil-matcha/Open-Generative-AI' }
];

function normalizeCharacters(input) {
  const list = Array.isArray(input) ? input.filter(Boolean).map(item => ({ ...item })) : [];
  const filtered = list.filter(item => item.id !== LOCKED_GIRL_ID && !String(item.name || '').toLowerCase().includes('trajno zaključana'));
  return [{ ...DEFAULT_GIRL }, ...filtered];
}

function ensureLockedGirlEverywhere() {
  state.characters = normalizeCharacters(state.characters);
  state.scenes.forEach(scene => {
    scene.characterIds = [...new Set([LOCKED_GIRL_ID, ...(scene.characterIds || [])])];
    if (!scene.imagePrompt || scene.promptSource === 'local') scene.imagePrompt = makeImagePrompt(scene);
    else scene.imagePrompt = withLockedGirlIdentity(scene.imagePrompt);
    if (!scene.videoPrompt || scene.promptSource === 'local') scene.videoPrompt = makeVideoPrompt(scene);
    else scene.videoPrompt = withLockedGirlIdentity(scene.videoPrompt);
  });
}

function normalizeState(input = {}) {
  const defaults = createInitialState();
  const data = input && typeof input === 'object' ? input : {};
  return {
    ...defaults,
    ...data,
    savedByUser: Boolean(data.savedByUser),
    dirtySinceSave: Boolean(data.dirtySinceSave),
    audio: { ...defaults.audio, ...(data.audio || {}), features: { ...defaults.audio.features, ...(data.audio?.features || {}) } },
    concept: { ...defaults.concept, ...(data.concept || {}) },
    creativeIdeas: Array.isArray(data.creativeIdeas) ? data.creativeIdeas.map((idea, index) => normalizeCreativeIdea(idea, index)) : [],
    selectedIdeaId: String(data.selectedIdeaId || ''),
    uniquenessHistory: Array.isArray(data.uniquenessHistory) ? data.uniquenessHistory.slice(-30) : [],
    ideaSourceFingerprint: String(data.ideaSourceFingerprint || ''),
    ideaGenerationSource: String(data.ideaGenerationSource || ''),
    ideaResearch: data.ideaResearch && typeof data.ideaResearch === 'object' ? data.ideaResearch : null,
    research: {
      ...defaults.research,
      ...(data.research && typeof data.research === 'object' ? data.research : {}),
      queries: Array.isArray(data.research?.queries) ? data.research.queries : [],
      keywords: Array.isArray(data.research?.keywords) ? data.research.keywords : [],
      webResults: Array.isArray(data.research?.webResults) ? data.research.webResults : [],
      youtubeResults: Array.isArray(data.research?.youtubeResults) ? data.research.youtubeResults : [],
      viralCandidates: Array.isArray(data.research?.viralCandidates) ? data.research.viralCandidates : [],
      referenceVideoAnalyses: Array.isArray(data.research?.referenceVideoAnalyses) ? data.research.referenceVideoAnalyses.slice(0, 20) : [],
      channelDna: data.research?.channelDna && typeof data.research.channelDna === 'object' ? data.research.channelDna : null,
      channelAnalysis: data.research?.channelAnalysis && typeof data.research.channelAnalysis === 'object' ? data.research.channelAnalysis : null,
      seasonalOpportunities: Array.isArray(data.research?.seasonalOpportunities) ? data.research.seasonalOpportunities : [],
      diversityRules: data.research?.diversityRules && typeof data.research.diversityRules === 'object' ? data.research.diversityRules : {},
      recommendations: Array.isArray(data.research?.recommendations) ? data.research.recommendations : [],
      warnings: Array.isArray(data.research?.warnings) ? data.research.warnings : []
    },
    youtube: { ...defaults.youtube, ...(data.youtube || {}), shorts: Array.isArray(data.youtube?.shorts) ? data.youtube.shorts : [] },
    captions: {
      ...defaults.captions,
      ...(data.captions || {}),
      items: Array.isArray(data.captions?.items) ? data.captions.items.map((item, index) => ({
        id: item.id || uuid(), start: Math.max(0, Number(item.start) || 0), end: Math.max(0, Number(item.end) || 0), text: String(item.text || '').trim(), index: index + 1
      })).filter(item => item.text && item.end > item.start) : [],
      translation: {
        ...defaults.captions.translation,
        ...(data.captions?.translation || {}),
        items: Array.isArray(data.captions?.translation?.items) ? data.captions.translation.items.map((item, index) => ({
          id: item.id || data.captions?.items?.[index]?.id || uuid(), start: Math.max(0, Number(item.start) || 0), end: Math.max(0, Number(item.end) || 0), text: String(item.text || '').trim()
        })).filter(item => item.text && item.end > item.start) : []
      },
      overlays: { ...defaults.captions.overlays, ...(data.captions?.overlays || {}) },
      preview: { ...defaults.captions.preview, ...(data.captions?.preview || {}) },
      brandPresets: Array.isArray(data.captions?.brandPresets) ? data.captions.brandPresets : [],
      style: { ...defaults.captions.style, ...(data.captions?.style || {}) }
    },
    settings: { ...defaults.settings, ...(data.settings || {}) },
    i2v: { ...defaults.i2v, ...(data.i2v || {}) },
    t2i: { ...defaults.t2i, ...(data.t2i || {}) },
    youtubeChannels: Array.isArray(data.youtubeChannels) ? data.youtubeChannels : [],
    youtubeAnalysis: data.youtubeAnalysis && typeof data.youtubeAnalysis === 'object' ? data.youtubeAnalysis : {},
    youtubeTrends: { ...defaults.youtubeTrends, ...(data.youtubeTrends || {}), results: Array.isArray(data.youtubeTrends?.results) ? data.youtubeTrends.results : [], recommendations: Array.isArray(data.youtubeTrends?.recommendations) ? data.youtubeTrends.recommendations : [], retentionPoints: Array.isArray(data.youtubeTrends?.retentionPoints) ? data.youtubeTrends.retentionPoints : [] },
    chatgptBridge: { ...defaults.chatgptBridge, ...(data.chatgptBridge || {}) },
    characters: normalizeCharacters(data.characters),
    scenes: Array.isArray(data.scenes) ? data.scenes.map((scene, index) => ({
      id: scene.id || uuid(), number: Number(scene.number) || index + 1,
      start: Number(scene.start) || 0, end: Number(scene.end) || 0,
      duration: Number(scene.duration) || Math.max(0, Number(scene.end) - Number(scene.start)),
      section: scene.section || 'Pesma', lyric: scene.lyric || '', emotion: scene.emotion || '',
      description: scene.description || '', shot: scene.shot || '', camera: scene.camera || '', location: scene.location || '', locationReason: scene.locationReason || '',
      sceneTitle: scene.sceneTitle || '', lyricMeaning: scene.lyricMeaning || '', microMovement: scene.microMovement || '',
      timeWeather: scene.timeWeather || '', lighting: scene.lighting || '', lens: scene.lens || '', composition: scene.composition || '',
      foreground: scene.foreground || '', midground: scene.midground || '', background: scene.background || '', atmosphere: scene.atmosphere || '',
      wardrobe: scene.wardrobe || '', continuityNotes: scene.continuityNotes || '', transitionIn: scene.transitionIn || '', transitionOut: scene.transitionOut || '',
      visualSignature: scene.visualSignature || '',
      characterIds: [...new Set([LOCKED_GIRL_ID, ...(Array.isArray(scene.characterIds) ? scene.characterIds : [])])], imagePrompt: scene.imagePrompt || '',
      videoPrompt: scene.videoPrompt || '', promptSource: scene.promptSource || 'local',
      palette: Array.isArray(scene.palette) ? scene.palette : [], paletteScore: Number(scene.paletteScore) || 0,
      imageInfo: scene.imageInfo || null, smartCrop: scene.smartCrop || null,
      t2i: { status: 'idle', promptId: '', progress: 0, error: '', generatedAt: '', filename: '', ...(scene.t2i || {}) },
      i2v: { status: 'idle', promptId: '', progress: 0, error: '', generatedAt: '', filename: '', ...(scene.i2v || {}) }
    })) : [],
    imageAssetIds: data.imageAssetIds && typeof data.imageAssetIds === 'object' ? data.imageAssetIds : {},
    videoAssetIds: data.videoAssetIds && typeof data.videoAssetIds === 'object' ? data.videoAssetIds : {}
  };
}

function loadState() {
  try {
    // Nesacuvan rad živi samo u trenutnom tabu. Novo pokretanje programa počinje prazno.
    const activeRaw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (activeRaw) return normalizeState(JSON.parse(activeRaw));

    // Samo eksplicitno sačuvan projekat sme da se vrati pri sledećem pokretanju.
    const candidates = [EXPLICIT_SAVE_KEY, ...PREVIOUS_EXPLICIT_SAVE_KEYS];
    for (const key of candidates) {
      const savedRaw = localStorage.getItem(key);
      if (!savedRaw) continue;
      const saved = JSON.parse(savedRaw);
      if (saved?.savedByUser !== true) continue;
      const migrated = normalizeState({ ...saved, schemaVersion: '15.4', dirtySinceSave: false });
      // Migrira se samo NAMERNO sačuvan 14.8 projekat. Stara nesacuvana sesija se nikad ne vraća.
      if (key !== EXPLICIT_SAVE_KEY) localStorage.setItem(EXPLICIT_SAVE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return createInitialState();
  } catch {
    return createInitialState();
  }
}

function migrateProjectStorage() {
  // Stari automatski projekti su uzrok što se pesma iz ranijih verzija vraćala sama.
  // Od 15.4 se ti ključevi namerno ignorišu i brišu.
  for (const key of LEGACY_AUTO_KEYS) {
    try { localStorage.removeItem(key); } catch {}
  }
  for (const key of LEGACY_SESSION_KEYS) {
    try { sessionStorage.removeItem(key); } catch {}
  }
  state.schemaVersion = '15.4';
  state.savedByUser = Boolean(state.savedByUser);
  state.dirtySinceSave = Boolean(state.dirtySinceSave);
  try { sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function persistState(markSaved = false, collect = true) {
  if (collect) collectFormState();
  state.updatedAt = new Date().toISOString();
  if (markSaved) {
    state.savedAt = state.updatedAt;
    state.savedByUser = true;
    state.dirtySinceSave = false;
  } else if (collect) {
    state.dirtySinceSave = true;
  }
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
    if (markSaved) localStorage.setItem(EXPLICIT_SAVE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Čuvanje projekta nije uspelo:', error);
    if (markSaved) showToast('Pregledač nema dovoljno prostora. Izvezi ZIP rezervnu kopiju.');
  }
  updateStatus();
}

function collectFormState() {
  state.name = $('#projectName').value.trim();
  state.songTitle = $('#songTitle').value.trim();
  state.artistName = $('#artistName').value.trim();
  state.format = $('#format').value;
  state.sceneDuration = Number($('#sceneDuration').value) || 5;
  state.lyrics = $('#lyrics').value;
  state.audio.confirmedBpm = Number($('#manualBpm').value) || 0;
  state.genre = $('#manualGenre').value.trim();
  state.mood = $('#manualMood').value.trim();
  state.concept = {
    ...state.concept,
    title: $('#conceptTitle').value.trim(),
    story: $('#conceptStory').value.trim(),
    visualStyle: $('#visualStyle').value.trim(),
    colorPalette: $('#colorPalette').value.trim(),
    cameraStyle: $('#cameraStyle').value.trim(),
    locations: $('#locations').value.trim(),
    genre: $('#step3Genre')?.value.trim() || state.genre || '',
    mood: $('#step3Mood')?.value.trim() || state.mood || '',
    centralSymbol: $('#centralSymbol')?.value.trim() || '',
    openingHook: $('#openingHook')?.value.trim() || '',
    ending: $('#conceptEnding')?.value.trim() || ''
  };
  state.youtube = {
    ...state.youtube,
    title: $('#youtubeTitle').value.trim(),
    description: $('#youtubeDescription').value.trim(),
    hashtags: $('#youtubeHashtags').value.trim(),
    pinned: $('#youtubePinned').value.trim()
  };
  state.t2i = {
    ...state.t2i,
    endpoint: $('#comfyEndpoint')?.value || state.t2i.endpoint,
    mode: $('#t2iMode')?.value || state.t2i.mode,
    checkpoint: $('#t2iCheckpoint')?.value.trim() || state.t2i.checkpoint,
    instantIdModel: $('#t2iInstantIdModel')?.value.trim() || state.t2i.instantIdModel,
    controlNet: $('#t2iControlNet')?.value.trim() || state.t2i.controlNet,
    provider: $('#t2iProvider')?.value || state.t2i.provider,
    steps: Number($('#t2iSteps')?.value) || state.t2i.steps,
    cfg: Number($('#t2iCfg')?.value) || state.t2i.cfg,
    autoI2vAfterImage: Boolean($('#autoI2vAfterImage')?.checked)
  };
  state.activeYoutubeChannelId = $('#youtubeChannelSelect')?.value || state.activeYoutubeChannelId || '';
  state.captions = {
    ...state.captions,
    enabled: Boolean($('#captionsEnabled')?.checked),
    source: $('#captionSource')?.value || state.captions.source || 'lyrics',
    language: $('#captionLanguage')?.value || state.captions.language || 'sr',
    displayMode: $('#captionDisplayMode')?.value || state.captions.displayMode || 'original',
    dictionary: $('#captionDictionary')?.value || state.captions.dictionary || '',
    translation: {
      ...state.captions.translation,
      sourceLanguage: $('#captionLanguage')?.value || state.captions.language || 'sr',
      targetLanguage: $('#captionTargetLanguage')?.value || state.captions.translation?.targetLanguage || 'en',
      text: $('#captionTranslationText')?.value || state.captions.translation?.text || '',
      protectedTerms: $('#captionProtectedTerms')?.value || state.captions.translation?.protectedTerms || ''
    },
    overlays: {
      ...state.captions.overlays,
      titleEnabled: Boolean($('#captionTitleEnabled')?.checked),
      titleText: $('#captionTitleText')?.value || '',
      titleDuration: Number($('#captionTitleDuration')?.value) || 4,
      ctaEnabled: Boolean($('#captionCtaEnabled')?.checked),
      ctaText: $('#captionCtaText')?.value || '',
      ctaDuration: Number($('#captionCtaDuration')?.value) || 5
    },
    preview: {
      ...state.captions.preview,
      format: $('#captionPreviewFormat')?.value || state.format || '16:9',
      safeZonePlatform: $('#captionSafeZonePlatform')?.value || 'youtube',
      showSafeZones: Boolean($('#captionShowSafeZones')?.checked),
      sceneId: $('#captionPreviewScene')?.value || ''
    },
    style: {
      ...state.captions.style,
      position: $('#captionPosition')?.value || 'bottom', align: $('#captionAlign')?.value || 'center',
      fontSize: Number($('#captionFontSize')?.value) || 5.5, mode: $('#captionStyle')?.value || 'shadow',
      preset: $('#captionPreset')?.value || 'custom', wordsPerLine: Number($('#captionWordsPerLine')?.value) || 7,
      uppercase: Boolean($('#captionUppercase')?.checked), autoFit: Boolean($('#captionAutoFit')?.checked),
      fontFamily: $('#captionFontFamily')?.value || state.captions.style.fontFamily || 'Arial',
      textColor: $('#captionTextColor')?.value || '#ffffff', highlightColor: $('#captionHighlightColor')?.value || '#ff3b69',
      strokeColor: $('#captionStrokeColor')?.value || '#000000', strokeWidth: Number($('#captionStrokeWidth')?.value) || 0,
      boxColor: $('#captionBoxColor')?.value || '#000000', boxOpacity: Number($('#captionBoxOpacity')?.value) || 0,
      maxWidth: Number($('#captionMaxWidth')?.value) || 88, lineHeight: Number($('#captionLineHeight')?.value) || 122,
      verticalOffset: Number($('#captionVerticalOffset')?.value) || 0, animation: $('#captionAnimation')?.value || 'fade'
    }
  };
  state.settings = {
    ...state.settings,
    imageMaxSize: Number($('#imageMaxSize')?.value) || 2560,
    autoSmartCrop: Boolean($('#autoSmartCrop')?.checked),
    autoPalette: Boolean($('#autoPalette')?.checked),
    renderResolution: Number($('#renderResolution')?.value) || 1080,
    renderFps: Number($('#renderFps')?.value) || 30,
    transitionDuration: Number($('#transitionDuration')?.value) || 0.7,
    renderScope: $('#renderScope')?.value || 'full',
    motionPreset: $('#motionPreset')?.value || 'cinematic',
    motionStrength: Number($('#motionStrength')?.value) || 0,
    burnCaptions: Boolean($('#burnCaptions')?.checked),
    preferAiClips: Boolean($('#preferAiClips')?.checked),
    allowPlaceholderScenes: Boolean($('#allowPlaceholderScenes')?.checked)
  };
  state.i2v = {
    ...state.i2v, endpoint: ($('#comfyEndpoint')?.value || state.i2v.endpoint || 'http://127.0.0.1:8188').trim(),
    fps: Number($('#i2vFps')?.value) || 16, maxSeconds: Number($('#i2vMaxSeconds')?.value) || 5,
    steps: Number($('#i2vSteps')?.value) || 20, cfg: Number($('#i2vCfg')?.value) || 6,
    useGeneratedClips: Boolean($('#useGeneratedClips')?.checked),
    model: ($('#i2vModel')?.value || state.i2v.model).trim(), textEncoder: ($('#i2vTextEncoder')?.value || state.i2v.textEncoder).trim(),
    vae: ($('#i2vVae')?.value || state.i2v.vae).trim(), clipVision: ($('#i2vClipVision')?.value || state.i2v.clipVision).trim(),
    negativePrompt: ($('#i2vNegativePrompt')?.value || state.i2v.negativePrompt).trim()
  };
}

function fillForm() {
  $('#projectName').value = state.name || '';
  $('#songTitle').value = state.songTitle || '';
  $('#artistName').value = state.artistName || '';
  $('#format').value = state.format || '16:9';
  updateProjectFormatUi();
  $('#sceneDuration').value = state.sceneDuration || 5;
  $('#sceneDurationOut').value = `${Number(state.sceneDuration || 5).toFixed(1)} s`;
  $('#lyrics').value = state.lyrics || '';
  $('#manualBpm').value = state.audio.confirmedBpm || '';
  $('#manualGenre').value = state.genre || '';
  $('#manualMood').value = state.mood || '';
  $('#conceptTitle').value = state.concept?.title || '';
  $('#conceptStory').value = state.concept?.story || '';
  $('#visualStyle').value = state.concept?.visualStyle || '';
  $('#colorPalette').value = state.concept?.colorPalette || '';
  $('#cameraStyle').value = state.concept?.cameraStyle || '';
  $('#locations').value = state.concept?.locations || '';
  if ($('#step3Genre')) $('#step3Genre').value = state.concept?.genre || state.genre || '';
  if ($('#step3Mood')) $('#step3Mood').value = state.concept?.mood || state.mood || '';
  if ($('#centralSymbol')) $('#centralSymbol').value = state.concept?.centralSymbol || '';
  if ($('#openingHook')) $('#openingHook').value = state.concept?.openingHook || '';
  if ($('#conceptEnding')) $('#conceptEnding').value = state.concept?.ending || '';
  $('#youtubeTitle').value = state.youtube?.title || '';
  $('#youtubeDescription').value = state.youtube?.description || '';
  $('#youtubeHashtags').value = state.youtube?.hashtags || '';
  $('#youtubePinned').value = state.youtube?.pinned || '';
  if ($('#imageMaxSize')) $('#imageMaxSize').value = String(state.settings?.imageMaxSize || 1920);
  if ($('#autoSmartCrop')) $('#autoSmartCrop').checked = state.settings?.autoSmartCrop !== false;
  if ($('#autoPalette')) $('#autoPalette').checked = state.settings?.autoPalette !== false;
  if ($('#renderResolution')) $('#renderResolution').value = String(state.settings?.renderResolution || 1080);
  if ($('#renderFps')) $('#renderFps').value = String(state.settings?.renderFps || 30);
  if ($('#transitionDuration')) $('#transitionDuration').value = String(state.settings?.transitionDuration || 0.7);
  if ($('#renderScope')) $('#renderScope').value = state.settings?.renderScope || 'full';
  if ($('#motionPreset')) $('#motionPreset').value = state.settings?.motionPreset || 'cinematic';
  if ($('#motionStrength')) $('#motionStrength').value = String(state.settings?.motionStrength ?? 55);
  if ($('#motionStrengthOut')) $('#motionStrengthOut').value = `${Number(state.settings?.motionStrength ?? 55)}%`;
  if ($('#burnCaptions')) $('#burnCaptions').checked = state.settings?.burnCaptions !== false;
  if ($('#t2iMode')) $('#t2iMode').value = state.t2i?.mode || 'instantid';
  if ($('#t2iCheckpoint')) $('#t2iCheckpoint').value = state.t2i?.checkpoint || 'sd_xl_base_1.0.safetensors';
  if ($('#t2iInstantIdModel')) $('#t2iInstantIdModel').value = state.t2i?.instantIdModel || 'ip-adapter.bin';
  if ($('#t2iControlNet')) $('#t2iControlNet').value = state.t2i?.controlNet || 'instantid/diffusion_pytorch_model.safetensors';
  if ($('#t2iProvider')) $('#t2iProvider').value = state.t2i?.provider || 'CPU';
  if ($('#t2iSteps')) $('#t2iSteps').value = String(state.t2i?.steps || 30);
  if ($('#t2iCfg')) $('#t2iCfg').value = String(state.t2i?.cfg || 4.5);
  if ($('#autoI2vAfterImage')) $('#autoI2vAfterImage').checked = Boolean(state.t2i?.autoI2vAfterImage);
  if ($('#lockedGirlIdentityView')) $('#lockedGirlIdentityView').value = LOCKED_GIRL_BLOCK;
  if ($('#lockedGirlHash')) $('#lockedGirlHash').textContent = `SHA-256 zaključanog ID-a: ${window.LOCKED_GIRL_IDENTITY_SHA256 || '—'}`;
  if ($('#allowPlaceholderScenes')) $('#allowPlaceholderScenes').checked = Boolean(state.settings?.allowPlaceholderScenes);
  if ($('#captionsEnabled')) $('#captionsEnabled').checked = state.captions?.enabled !== false;
  if ($('#captionSource')) $('#captionSource').value = state.captions?.source || 'lyrics';
  if ($('#captionLanguage')) $('#captionLanguage').value = state.captions?.language || 'sr';
  if ($('#captionDisplayMode')) $('#captionDisplayMode').value = state.captions?.displayMode || 'original';
  if ($('#captionTargetLanguage')) $('#captionTargetLanguage').value = state.captions?.translation?.targetLanguage || 'en';
  if ($('#captionTranslationText')) $('#captionTranslationText').value = state.captions?.translation?.text || state.captions?.translation?.items?.map(item=>item.text).join('\n') || '';
  if ($('#captionProtectedTerms')) $('#captionProtectedTerms').value = state.captions?.translation?.protectedTerms || '';
  if ($('#captionDictionary')) $('#captionDictionary').value = state.captions?.dictionary || '';
  if ($('#captionPosition')) $('#captionPosition').value = state.captions?.style?.position || 'bottom';
  if ($('#captionAlign')) $('#captionAlign').value = state.captions?.style?.align || 'center';
  if ($('#captionFontSize')) $('#captionFontSize').value = String(state.captions?.style?.fontSize || 5.5);
  if ($('#captionFontSizeOut')) $('#captionFontSizeOut').value = `${Number(state.captions?.style?.fontSize || 5.5).toFixed(1)}%`;
  if ($('#captionStyle')) $('#captionStyle').value = state.captions?.style?.mode || 'shadow';
  if ($('#captionPreset')) $('#captionPreset').value = state.captions?.style?.preset || 'custom';
  if ($('#captionWordsPerLine')) $('#captionWordsPerLine').value = String(state.captions?.style?.wordsPerLine || 7);
  if ($('#captionUppercase')) $('#captionUppercase').checked = Boolean(state.captions?.style?.uppercase);
  if ($('#captionAutoFit')) $('#captionAutoFit').checked = state.captions?.style?.autoFit !== false;
  if ($('#captionFontFamily')) $('#captionFontFamily').value = state.captions?.style?.fontFamily || 'Arial';
  if ($('#captionTextColor')) $('#captionTextColor').value = state.captions?.style?.textColor || '#ffffff';
  if ($('#captionHighlightColor')) $('#captionHighlightColor').value = state.captions?.style?.highlightColor || '#ff3b69';
  if ($('#captionStrokeColor')) $('#captionStrokeColor').value = state.captions?.style?.strokeColor || '#000000';
  if ($('#captionStrokeWidth')) $('#captionStrokeWidth').value = String(state.captions?.style?.strokeWidth ?? 8);
  if ($('#captionStrokeWidthOut')) $('#captionStrokeWidthOut').value = String(state.captions?.style?.strokeWidth ?? 8);
  if ($('#captionBoxColor')) $('#captionBoxColor').value = state.captions?.style?.boxColor || '#000000';
  if ($('#captionBoxOpacity')) $('#captionBoxOpacity').value = String(state.captions?.style?.boxOpacity ?? 68);
  if ($('#captionBoxOpacityOut')) $('#captionBoxOpacityOut').value = `${state.captions?.style?.boxOpacity ?? 68}%`;
  if ($('#captionMaxWidth')) $('#captionMaxWidth').value = String(state.captions?.style?.maxWidth ?? 88);
  if ($('#captionMaxWidthOut')) $('#captionMaxWidthOut').value = `${state.captions?.style?.maxWidth ?? 88}%`;
  if ($('#captionLineHeight')) $('#captionLineHeight').value = String(state.captions?.style?.lineHeight ?? 122);
  if ($('#captionLineHeightOut')) $('#captionLineHeightOut').value = `${state.captions?.style?.lineHeight ?? 122}%`;
  if ($('#captionVerticalOffset')) $('#captionVerticalOffset').value = String(state.captions?.style?.verticalOffset ?? 0);
  if ($('#captionVerticalOffsetOut')) $('#captionVerticalOffsetOut').value = `${state.captions?.style?.verticalOffset ?? 0}%`;
  if ($('#captionAnimation')) $('#captionAnimation').value = state.captions?.style?.animation || 'fade';
  if ($('#captionTitleEnabled')) $('#captionTitleEnabled').checked = Boolean(state.captions?.overlays?.titleEnabled);
  if ($('#captionTitleText')) $('#captionTitleText').value = state.captions?.overlays?.titleText || state.songTitle || '';
  if ($('#captionTitleDuration')) $('#captionTitleDuration').value = String(state.captions?.overlays?.titleDuration || 4);
  if ($('#captionCtaEnabled')) $('#captionCtaEnabled').checked = Boolean(state.captions?.overlays?.ctaEnabled);
  if ($('#captionCtaText')) $('#captionCtaText').value = state.captions?.overlays?.ctaText || 'CELA PESMA NA YOUTUBE KANALU';
  if ($('#captionCtaDuration')) $('#captionCtaDuration').value = String(state.captions?.overlays?.ctaDuration || 5);
  if ($('#captionPreviewFormat')) $('#captionPreviewFormat').value = state.captions?.preview?.format || state.format || '16:9';
  if ($('#captionSafeZonePlatform')) $('#captionSafeZonePlatform').value = state.captions?.preview?.safeZonePlatform || 'youtube';
  if ($('#captionShowSafeZones')) $('#captionShowSafeZones').checked = state.captions?.preview?.showSafeZones !== false;
  if ($('#youtubeTrendQuery')) $('#youtubeTrendQuery').value = state.youtubeTrends?.query || `${state.genre || 'tužna ljubavna pesma'} official music video`;
  if ($('#youtubeTrendRegion')) $('#youtubeTrendRegion').value = state.youtubeTrends?.region || 'RS';
  if ($('#youtubeTrendLanguage')) $('#youtubeTrendLanguage').value = state.youtubeTrends?.language || 'sr';
  if ($('#youtubeTrendDays')) $('#youtubeTrendDays').value = String(state.youtubeTrends?.days || 90);
  if ($('#youtubeRetentionVideoId')) $('#youtubeRetentionVideoId').value = state.youtubeTrends?.retentionVideoId || '';
  renderGptActionSetup();
  renderYoutubeTrendReport();
  renderYoutubeRetentionReport();

  if ($('#comfyEndpoint')) $('#comfyEndpoint').value = state.i2v?.endpoint || 'http://127.0.0.1:8188';
  if ($('#i2vFps')) $('#i2vFps').value = String(state.i2v?.fps || 16);
  if ($('#i2vMaxSeconds')) $('#i2vMaxSeconds').value = String(state.i2v?.maxSeconds || 5);
  if ($('#i2vSteps')) $('#i2vSteps').value = String(state.i2v?.steps || 20);
  if ($('#i2vCfg')) $('#i2vCfg').value = String(state.i2v?.cfg || 6);
  if ($('#useGeneratedClips')) $('#useGeneratedClips').checked = state.i2v?.useGeneratedClips !== false;
  if ($('#i2vModel')) $('#i2vModel').value = state.i2v?.model || 'wan2.1_i2v_480p_14B_fp8_scaled.safetensors';
  if ($('#i2vTextEncoder')) $('#i2vTextEncoder').value = state.i2v?.textEncoder || 'umt5_xxl_fp8_e4m3fn_scaled.safetensors';
  if ($('#i2vVae')) $('#i2vVae').value = state.i2v?.vae || 'wan_2.1_vae.safetensors';
  if ($('#i2vClipVision')) $('#i2vClipVision').value = state.i2v?.clipVision || 'clip_vision_h.safetensors';
  if ($('#i2vNegativePrompt')) $('#i2vNegativePrompt').value = state.i2v?.negativePrompt || '';
  if ($('#preferAiClips')) $('#preferAiClips').checked = state.settings?.preferAiClips !== false;
  updateI2vUi();
  $('#audioFileName').textContent = state.audio.fileName || 'Pesma nije dodata';
  updateLyricsStats();
  updateStep1Audit();
  updateAnalysisUI();
  updateStatus();
  renderResearchPanel();
  renderIdeas();
  renderCharacters();
  renderStoryboard();
  renderShorts();
  renderCaptions();
  updateLiveCaptionMonitor();
  renderMediaGallery().catch(error => showToast(`Greška prikaza slika: ${error.message}`));
  renderToolStatus();
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3300);
}

function showPanel(name) {
  persistState(false, true);
  $$('.workspace').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === name));
  $$('#tabs button').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
  if (name === 'project') updateStep1Audit();
  if (name === 'concept') { renderResearchPanel(); renderIdeas(); }
  if (name === 'storyboard') renderStoryboard();
  if (name === 'characters') renderCharacters();
  if (name === 'youtube') renderShorts();
  if (name === 'captions') renderCaptions();
  if (name === 'media') renderMediaGallery().catch(error => showToast(error.message));
  if (name === 'tools') renderToolStatus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function secondsToClock(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  })[character]);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateLyricsStats() {
  const text = $('#lyrics')?.value || '';
  const realLineObjects = parseLyrics(text);
  const cleanedLyrics = realLineObjects.map(item => item.text).join(' ');
  const words = cleanedLyrics.trim() ? cleanedLyrics.trim().split(/\s+/).length : 0;
  const sections = (text.match(/\[[^\]]+\]/g) || []).length;
  const realLines = realLineObjects.length;
  const duration = Number(state.audio?.duration) || 0;
  const sceneDuration = Number($('#sceneDuration')?.value || state.sceneDuration || 5);
  const estimated = duration ? Math.max(1, Math.ceil(duration / Math.max(2.4, sceneDuration))) : 0;
  if ($('#wordCount')) $('#wordCount').textContent = `${words} reči`;
  if ($('#lyricsLineCount')) $('#lyricsLineCount').textContent = `${realLines} stvarnih stihova`;
  if ($('#sectionCount')) $('#sectionCount').textContent = `${sections} oznaka`;
  if ($('#estimatedSceneCount')) $('#estimatedSceneCount').textContent = `${estimated} procenjenih scena`;
}

function validateStep1(options = {}) {
  const autoFillProjectName = options.autoFillProjectName === true;
  const report = { ok: false, errors: [], warnings: [], checks: {}, realLyrics: [] };
  const songTitle = String($('#songTitle')?.value || state.songTitle || '').trim();
  let projectName = String($('#projectName')?.value || state.name || '').trim();
  const artistName = String($('#artistName')?.value || state.artistName || '').trim();
  const format = String($('#format')?.value || state.format || '16:9');
  const lyricsText = String($('#lyrics')?.value || state.lyrics || '');
  const realLyrics = parseLyrics(lyricsText);
  const hasAudioMetadata = Boolean(state.audio?.fileName && state.audio?.size > 0);
  const hasDecodedAudio = Boolean(state.audio?.duration > 0);

  if (!projectName && songTitle && autoFillProjectName) {
    projectName = songTitle;
    if ($('#projectName')) $('#projectName').value = projectName;
    state.name = projectName;
  }

  report.checks.song = { ok: songTitle.length >= 2, detail: songTitle || 'Nedostaje naziv pesme' };
  report.checks.artist = { ok: artistName.length >= 2, detail: artistName || 'Nedostaje izvođač ili kanal' };
  report.checks.audio = {
    ok: hasAudioMetadata,
    detail: hasDecodedAudio
      ? `${state.audio.fileName} • ${secondsToClock(state.audio.duration).slice(0, 5)}`
      : hasAudioMetadata ? `${state.audio.fileName} • spreman za analizu` : 'Audio nije dodat'
  };
  report.checks.lyrics = { ok: realLyrics.length >= 4, detail: `${realLyrics.length} stvarnih stihova` };
  report.checks.format = { ok: ['16:9', '9:16', '1:1'].includes(format), detail: format };
  report.realLyrics = realLyrics;

  if (!songTitle) report.errors.push('Unesi naziv pesme.');
  else if (songTitle.length < 2) report.errors.push('Naziv pesme je prekratak.');
  if (!artistName) report.errors.push('Unesi izvođača ili naziv kanala.');
  if (!hasAudioMetadata) report.errors.push('Dodaj kompletan audio-fajl.');
  else if (!hasDecodedAudio) report.warnings.push('Audio je dodat i biće dekodiran kada potvrdiš Korak 1.');
  if (!realLyrics.length) report.errors.push('Nalepi pravi tekst pesme; same oznake [Intro], [Verse] i [Chorus] nisu stihovi.');
  else if (realLyrics.length < 4) report.errors.push('Tekst ima premalo stvarnih stihova. Dodaj kompletan tekst pesme.');
  if (!projectName) report.warnings.push('Naziv projekta je prazan; pri potvrdi će automatski biti isti kao naziv pesme.');
  if (lyricsText.length > 50000) report.warnings.push('Tekst je veoma dugačak. Proveri da nisi nalepio dodatne promptove ili JSON uz stihove.');
  const normalizedLines = realLyrics.map(item => item.text.toLocaleLowerCase('sr-RS').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const uniqueLineCount = new Set(normalizedLines).size;
  if (normalizedLines.length >= 8 && uniqueLineCount / normalizedLines.length < 0.55) report.warnings.push('Više od 45% stihova se ponavlja. Proveri da li je tekst pravilno nalepljen ili je refren dupliran previše puta.');
  if (state.audio?.size > 250 * 1024 * 1024) report.warnings.push('Audio je veći od 250 MB i može sporije da se učitava na slabijem računaru.');
  if (state.audio?.duration && state.audio.duration < 15) report.warnings.push('Audio traje manje od 15 sekundi. Proveri da li je učitan ceo fajl.');
  if (state.audio?.duration && realLyrics.length) {
    const lyricWords = realLyrics.map(item => item.text).join(' ').trim().split(/\s+/).filter(Boolean).length;
    const wordsPerMinute = lyricWords / (state.audio.duration / 60);
    if (wordsPerMinute < 18) report.warnings.push('Tekst deluje prekratko u odnosu na trajanje zvuka. Proveri da li je nalepljen kompletan tekst.');
    if (wordsPerMinute > 260) report.warnings.push('Tekst deluje predugačko u odnosu na trajanje zvuka. Proveri da li su duplirani stihovi ili dodatni tekst.');
    const estimatedScenes = Math.ceil(state.audio.duration / Math.max(2.4, Number($('#sceneDuration')?.value || state.sceneDuration || 5)));
    if (estimatedScenes > 120) report.warnings.push(`Podešavanje pravi približno ${estimatedScenes} scena. Povećaj ciljnu dužinu scene da program ne bude preopterećen.`);
  }

  report.projectName = projectName;
  report.songTitle = songTitle;
  report.artistName = artistName;
  report.format = format;
  report.ok = report.errors.length === 0;
  return report;
}

function updateStep1Audit(options = {}) {
  const report = validateStep1(options);
  const entries = Object.entries(report.checks);
  let passed = 0;
  entries.forEach(([key, value]) => {
    const card = document.querySelector(`[data-step1-check="${key}"]`);
    if (!card) return;
    card.classList.toggle('ok', Boolean(value.ok));
    card.classList.toggle('error', !value.ok);
    const detail = card.querySelector('span');
    if (detail) detail.textContent = value.detail;
    if (value.ok) passed += 1;
  });
  const badge = $('#step1AuditBadge');
  if (badge) {
    badge.textContent = `${passed}/${entries.length}`;
    badge.classList.toggle('ok', report.ok);
  }
  const lines = [];
  if (report.ok) lines.push('KORAK 1 JE ISPRAVAN. Audio, tekst i osnovni podaci su spremni za analizu.');
  else lines.push('KORAK 1 NIJE SPREMAN:');
  report.errors.forEach(item => lines.push(`✕ ${item}`));
  report.warnings.forEach(item => lines.push(`! ${item}`));
  const reportBox = $('#step1Report');
  if (reportBox) reportBox.textContent = lines.join('\n');
  const audioStatus = $('#audioValidationStatus');
  if (audioStatus) audioStatus.textContent = report.checks.audio.detail;
  return report;
}

function calculateReadiness() {
  const checks = [
    Boolean(state.name && state.songTitle),
    Boolean(state.audio.duration),
    Boolean(state.lyrics.trim()),
    Boolean(state.audio.analyzedAt),
    Boolean(state.genre || state.audio.bpmEstimate),
    Boolean(state.selectedIdeaId || state.concept.title || state.concept.story),
    state.scenes.length > 0,
    state.scenes.length > 0 && state.scenes.every(scene => scene.description),
    state.scenes.length > 0 && state.scenes.every(scene => scene.imagePrompt),
    state.captions?.enabled === false || (state.captions?.items?.length || 0) > 0,
    state.scenes.length > 0 && state.scenes.every(scene => state.imageAssetIds[scene.id])
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

function updateStatus() {
  const imageCount = state.scenes.filter(scene => state.imageAssetIds[scene.id]).length;
  const aiVideoCount = state.scenes.filter(scene => state.videoAssetIds?.[scene.id]).length;
  const imagePercent = state.scenes.length ? Math.round(imageCount / state.scenes.length * 100) : 0;
  $('#statusAudio').textContent = state.audio.duration ? secondsToClock(state.audio.duration).slice(0, 5) : '—';
  $('#statusBpm').textContent = state.audio.confirmedBpm || state.audio.bpmEstimate || '—';
  $('#statusScenes').textContent = state.scenes.length || '—';
  $('#statusImages').textContent = `${imagePercent}%`;
  if ($('#statusCaptions')) $('#statusCaptions').textContent = String(state.captions?.items?.length || 0);
  if ($('#captionsBadge')) $('#captionsBadge').textContent = `${state.captions?.items?.length || 0} titlova`;
  $('#statusQuality').textContent = `${calculateReadiness()}%`;
  $('#saveState').textContent = state.savedByUser && state.savedAt && !state.dirtySinceSave ? `Sačuvano ${new Date(state.savedAt).toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' })}` : state.savedByUser ? 'Izmenjeno posle čuvanja' : 'Nije sačuvano';
  $('#storyboardBadge').textContent = `${state.scenes.length} scena`;
  $('#charactersBadge').textContent = `${state.characters.length} likova`;
  $('#renderBadge').textContent = imagePercent === 100 && state.audio.duration ? `Spremno • ${aiVideoCount} AI klipova` : `${imageCount}/${state.scenes.length || 0} slika • ${aiVideoCount} AI klipova`;
  updateI2vUi();

  if (!state.audio.duration) {
    $('#globalNotice').className = 'notice info';
    $('#globalNotice').textContent = 'Dodaj pesmu i kompletan tekst. Zatim klikni „Pokreni besplatnu izradu“.';
  } else if (!state.scenes.length) {
    $('#globalNotice').className = 'notice warn';
    $('#globalNotice').textContent = state.selectedIdeaId ? 'Ideja je izabrana. Napravi storyboard ili nastavi automatsku izradu.' : 'Audio je dodat. Program treba da napravi 10 ideja iz teksta; izaberi jednu pre storyboarda.';
  } else if (imagePercent < 100) {
    $('#globalNotice').className = 'notice info';
    $('#globalNotice').textContent = `Storyboard je spreman. Nedostaje još ${state.scenes.length - imageCount} slika za kompletan video.`;
  } else {
    $('#globalNotice').className = 'notice success';
    $('#globalNotice').textContent = 'Sve scene imaju slike. Možeš da napraviš kompletan video bez API troška.';
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putAsset(id, blob) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, 'readwrite');
    transaction.objectStore(DB_STORE).put(blob, id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function getAsset(id) {
  const db = await openDatabase();
  const result = await new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function deleteAsset(id) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, 'readwrite');
    transaction.objectStore(DB_STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function clearProjectAssets(projectId) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, 'readwrite');
    const store = transaction.objectStore(DB_STORE);
    const request = store.openCursor();
    request.onsuccess = event => {
      const cursor = event.target.result;
      if (!cursor) return;
      if (String(cursor.key).includes(projectId)) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, body] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

async function hydrateAudioPreview() {
  const assetId = `audio:${state.projectId}`;
  const blob = await getAsset(assetId);
  if (!blob) return null;
  if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
  audioObjectUrl = URL.createObjectURL(blob);
  $('#audioPreview').src = audioObjectUrl;
  $('#audioPreview').style.display = 'block';
  await initializeWaveSurfer(audioObjectUrl);
  return blob;
}

async function decodeAudioBlob(blob) {
  if (!blob) throw new Error('Audio-fajl nije pronađen.');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Ovaj browser nema podršku za lokalno dekodiranje zvuka.');
  const arrayBuffer = await blob.arrayBuffer();
  const context = new AudioContextClass();
  try {
    return await context.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await context.close();
  }
}

async function handleAudioFile(file) {
  collectFormState();
  const extension = file?.name?.split('.').pop()?.toLowerCase() || '';
  const supportedByName = STEP1_SUPPORTED_AUDIO_EXTENSIONS.includes(extension);
  if (!file || (!String(file.type || '').startsWith('audio/') && !supportedByName)) {
    showToast('Izaberi ispravan audio-fajl: MP3, WAV, M4A, AAC, OGG, WEBM ili FLAC.');
    updateStep1Audit();
    return false;
  }
  if (!file.size) {
    showToast('Audio-fajl je prazan. Izaberi drugi fajl.');
    updateStep1Audit();
    return false;
  }
  if (file.size > STEP1_MAX_AUDIO_BYTES) {
    showToast('Audio je veći od 500 MB. Konvertuj ga u MP3 ili WAV manje veličine.');
    updateStep1Audit();
    return false;
  }

  const drop = $('#audioDrop');
  if (drop) { drop.classList.add('busy'); drop.setAttribute('aria-busy', 'true'); }
  if ($('#audioFileName')) $('#audioFileName').textContent = 'Proveravam da li browser može da pročita audio...';

  // Novi fajl se prvo dekodira u memoriji. Stari projekat i stari audio ostaju netaknuti
  // dok ne potvrdimo da je novi fajl stvarno čitljiv.
  let candidateBuffer;
  try {
    candidateBuffer = await decodeAudioBlob(file);
  } catch (error) {
    console.error('Audio nije moguće dekodirati:', error);
    if ($('#audioFile')) $('#audioFile').value = '';
    if ($('#audioFileName')) {
      $('#audioFileName').textContent = state.audio?.fileName
        ? `${state.audio.fileName} • prethodni audio je sačuvan`
        : 'Audio nije dodat — fajl nije mogao da se pročita';
    }
    updateStep1Audit();
    const message = /decode|encoding|format|supported|browser/i.test(String(error?.message || ''))
      ? 'Browser ne može da dekodira ovaj fajl. Konvertuj ga u standardni MP3 ili WAV i pokušaj ponovo. Prethodna pesma nije obrisana.'
      : `Audio nije učitan: ${error.message || 'nepoznata greška'}`;
    showToast(message);
    if (drop) { drop.classList.remove('busy'); drop.removeAttribute('aria-busy'); }
    return false;
  }

  const guessedTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!String($('#songTitle')?.value || '').trim() && guessedTitle) { $('#songTitle').value = guessedTitle; state.songTitle = guessedTitle; }
  if (!String($('#projectName')?.value || '').trim() && guessedTitle) { $('#projectName').value = guessedTitle; state.name = guessedTitle; }

  if ($('#audioFileName')) $('#audioFileName').textContent = 'Audio je ispravan. Menjam pesmu i pokrećem analizu...';
  let replacementStarted = false;
  try {
    // Tek posle uspešnog dekodiranja uklanjamo fajlove i rezultate stare pesme.
    replacementStarted = true;
    if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); audioObjectUrl = ''; }
    waveSurfer?.destroy?.(); waveSurfer = null;
    await clearProjectAssets(state.projectId);
    state.scenes = [];
    state.imageAssetIds = {};
    state.videoAssetIds = {};
    state.lockedGirlReferenceAssetId = '';
    state.creativeIdeas = [];
    state.selectedIdeaId = '';
    state.audio = { ...createInitialState().audio, fileName: file.name, type: file.type || `audio/${extension}`, size: file.size };
    audioBuffer = candidateBuffer;
    await putAsset(`audio:${state.projectId}`, file);
    await hydrateAudioPreview();
    if ($('#audioFileName')) $('#audioFileName').textContent = `${file.name} • ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    persistState(false, false);
    updateStep1Audit();
    showToast('Audio je dodat. Pokrećem lokalnu analizu...');
    await analyzeAudio();
    updateLyricsStats();
    updateStep1Audit();
    return true;
  } catch (error) {
    console.error('Audio nije učitan:', error);
    if (replacementStarted) {
      try { await deleteAsset(`audio:${state.projectId}`); } catch {}
      state.audio = createInitialState().audio;
      audioBuffer = null;
      if ($('#audioPreview')) { $('#audioPreview').removeAttribute('src'); $('#audioPreview').style.display = 'none'; }
      if ($('#audioFile')) $('#audioFile').value = '';
      if ($('#audioFileName')) $('#audioFileName').textContent = 'Audio nije dodat — zamena nije završena';
      persistState(false, false);
      updateStep1Audit();
    }
    showToast(`Audio nije učitan: ${error.message || 'nepoznata greška'}`);
    return false;
  } finally {
    if (drop) { drop.classList.remove('busy'); drop.removeAttribute('aria-busy'); }
  }
}

async function clearStep1Audio() {
  if (!state.audio?.fileName) { showToast('Audio nije dodat.'); return; }
  if (!window.confirm('Ukloniti audio i obrisati postojeće scene, slike i video-klipove ovog projekta?')) return;
  try { await clearProjectAssets(state.projectId); } catch (error) { console.warn(error); }
  if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
  audioObjectUrl = '';
  audioBuffer = null;
  waveSurfer?.destroy?.(); waveSurfer = null;
  state.audio = createInitialState().audio;
  state.scenes = [];
  state.imageAssetIds = {};
  state.videoAssetIds = {};
  state.creativeIdeas = [];
  state.selectedIdeaId = '';
  if ($('#audioPreview')) { $('#audioPreview').removeAttribute('src'); $('#audioPreview').style.display = 'none'; }
  if ($('#audioFile')) $('#audioFile').value = '';
  if ($('#audioFileName')) $('#audioFileName').textContent = 'Pesma nije dodata';
  persistState(false, false);
  updateLyricsStats();
  updateStep1Audit();
  drawWaveform();
  showToast('Audio i rezultati vezani za prethodnu pesmu su uklonjeni.');
}

async function decodeStoredAudio() {
  if (audioBuffer) return audioBuffer;
  const blob = await getAsset(`audio:${state.projectId}`);
  if (!blob) throw new Error('Audio-fajl nije pronađen. Dodaj pesmu ponovo.');
  audioBuffer = await decodeAudioBlob(blob);
  return audioBuffer;
}

function analyzeEnvelope(buffer) {
  const channel = buffer.getChannelData(0);
  const bucketCount = clamp(Math.round(buffer.duration * 10), 180, 1800);
  const bucketSize = Math.max(1, Math.floor(channel.length / bucketCount));
  const values = [];
  let absoluteTotal = 0;

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = bucket * bucketSize;
    const end = Math.min(channel.length, start + bucketSize);
    let sumSquares = 0;
    let count = 0;
    const stride = Math.max(1, Math.floor((end - start) / 160));
    for (let index = start; index < end; index += stride) {
      const sample = channel[index];
      sumSquares += sample * sample;
      count += 1;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, count));
    values.push(rms);
    absoluteTotal += rms;
  }

  const max = Math.max(...values, 0.00001);
  return {
    curve: values.map(value => Math.round(value / max * 1000) / 1000),
    average: absoluteTotal / Math.max(1, values.length),
    secondsPerBucket: buffer.duration / values.length
  };
}

function estimateBpm(curve, secondsPerBucket) {
  if (curve.length < 20) return { bpm: 0, confidence: 0 };
  const mean = curve.reduce((sum, value) => sum + value, 0) / curve.length;
  const variance = curve.reduce((sum, value) => sum + (value - mean) ** 2, 0) / curve.length;
  const standardDeviation = Math.sqrt(variance);
  const threshold = mean + standardDeviation * 0.65;
  const minGap = Math.max(1, Math.round(0.24 / secondsPerBucket));
  const peaks = [];

  for (let index = 1; index < curve.length - 1; index += 1) {
    const isPeak = curve[index] > threshold && curve[index] >= curve[index - 1] && curve[index] >= curve[index + 1];
    if (!isPeak) continue;
    if (!peaks.length || index - peaks.at(-1) >= minGap) {
      peaks.push(index);
    } else if (curve[index] > curve[peaks.at(-1)]) {
      peaks[peaks.length - 1] = index;
    }
  }

  const histogram = new Map();
  for (let left = 0; left < peaks.length; left += 1) {
    for (let right = left + 1; right < Math.min(peaks.length, left + 5); right += 1) {
      let interval = (peaks[right] - peaks[left]) * secondsPerBucket / (right - left);
      if (!interval) continue;
      let bpm = 60 / interval;
      while (bpm < 55) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      const rounded = Math.round(bpm);
      histogram.set(rounded, (histogram.get(rounded) || 0) + 1);
    }
  }

  const ranked = [...histogram.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { bpm: 0, confidence: 0 };
  const [bpm, score] = ranked[0];
  const total = ranked.reduce((sum, entry) => sum + entry[1], 0);
  return { bpm, confidence: clamp(score / Math.max(1, total) * 3.5, 0, 0.95) };
}

async function analyzeAudio() {
  try {
    $('#analysisBadge').textContent = 'Analiza u toku...';
    const buffer = await decodeStoredAudio();
    const envelope = analyzeEnvelope(buffer);
    const bpm = estimateBpm(envelope.curve, envelope.secondsPerBucket);
    state.audio.duration = buffer.duration;
    state.audio.sampleRate = buffer.sampleRate;
    state.audio.channels = buffer.numberOfChannels;
    state.audio.averageEnergy = envelope.average;
    state.audio.energyCurve = envelope.curve;
    state.audio.bpmEstimate = bpm.bpm;
    state.audio.bpmConfidence = bpm.confidence;
    state.audio.analyzedAt = new Date().toISOString();
    if (!state.audio.confirmedBpm && bpm.bpm) state.audio.confirmedBpm = bpm.bpm;
    persistState(false, false);
    updateAnalysisUI();
    updateLyricsStats();
    updateStep1Audit();
    drawWaveform();
    if (window.Meyda) await runMeydaAnalysis(false);
    showToast('Lokalna analiza zvuka je završena.');
  } catch (error) {
    $('#analysisBadge').textContent = 'Greška';
    showToast(error.message);
    throw error;
  }
}

function updateAnalysisUI() {
  const audio = state.audio;
  $('#analysisBadge').textContent = audio.analyzedAt ? 'Analiza završena' : 'Nije pokrenuta';
  $('#metricDuration').textContent = audio.duration ? secondsToClock(audio.duration) : '—';
  $('#metricSampleRate').textContent = audio.sampleRate ? `${Math.round(audio.sampleRate / 1000)} kHz` : '—';
  $('#metricChannels').textContent = audio.channels || '—';
  $('#metricBpm').textContent = audio.bpmEstimate || '—';
  $('#metricConfidence').textContent = audio.bpmEstimate ? `${Math.round(audio.bpmConfidence * 100)}%` : '—';
  $('#metricEnergy').textContent = audio.averageEnergy ? audio.averageEnergy.toFixed(3) : '—';
  $('#metricBeatBpm').textContent = audio.beatDetectorBpm || '—';
  $('#metricBeatOffset').textContent = audio.beatDetectorBpm ? `${Number(audio.beatOffset || 0).toFixed(2)} s` : '—';
  $('#metricCentroid').textContent = audio.features?.spectralCentroid ? Number(audio.features.spectralCentroid).toFixed(1) : '—';
  $('#metricRolloff').textContent = audio.features?.spectralRolloff ? Number(audio.features.spectralRolloff).toFixed(1) : '—';
  $('#metricFlatness').textContent = audio.features?.spectralFlatness ? Number(audio.features.spectralFlatness).toFixed(4) : '—';
  $('#metricZcr').textContent = audio.features?.zcr ? Number(audio.features.zcr).toFixed(2) : '—';
  $('#manualBpm').value = audio.confirmedBpm || '';
  drawWaveform();
}

function drawWaveform() {
  const canvas = $('#waveform');
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  const styles = getComputedStyle(document.documentElement);
  context.fillStyle = styles.getPropertyValue('--input-bg').trim() || '#07111f';
  context.fillRect(0, 0, width, height);
  const curve = state.audio.energyCurve || [];
  if (!curve.length) {
    context.fillStyle = '#6f819d';
    context.font = '28px Segoe UI';
    context.textAlign = 'center';
    context.fillText('Dodaj audio i pokreni analizu', width / 2, height / 2);
    return;
  }
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, styles.getPropertyValue('--primary').trim() || '#d31343');
  gradient.addColorStop(1, styles.getPropertyValue('--text-soft').trim() || '#eee8df');
  context.strokeStyle = gradient;
  context.lineWidth = Math.max(2, width / curve.length * 0.68);
  const center = height / 2;
  curve.forEach((value, index) => {
    const x = index / (curve.length - 1) * width;
    const amplitude = value * (height * 0.43);
    context.beginPath();
    context.moveTo(x, center - amplitude);
    context.lineTo(x, center + amplitude);
    context.stroke();
  });
  context.strokeStyle = '#ffffff22';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, center);
  context.lineTo(width, center);
  context.stroke();
}

function parseLyrics(text) {
  const rows = String(text || '').split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  let currentSection = 'Pesma';
  const lines = [];
  const structural = /^(intro|uvod|strofa(?:\s*\d+)?|verse(?:\s*\d+)?|refren(?:\s*\d+)?|chorus(?:\s*\d+)?|pre-?chorus|predrefren|bridge|most|outro|završetak|instrumental|solo)$/i;
  for (const originalRow of rows) {
    const tags = [...originalRow.matchAll(/\[([^\]]+)\]/g)].map(match => match[1].trim()).filter(Boolean);
    const sectionTag = tags.find(tag => structural.test(tag));
    if (sectionTag) currentSection = sectionTag;
    const cleaned = originalRow.replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    if (structural.test(cleaned)) { currentSection = cleaned; continue; }
    lines.push({ text: cleaned, section: currentSection, tags });
  }
  return lines;
}

function detectEmotion(text) {
  const value = text.toLowerCase();
  const groups = [
    ['usamljenost', ['sam', 'nikome', 'prazno', 'tišina', 'nema kome', 'usamljen']],
    ['gubitak', ['otišla', 'odlazak', 'izgubio', 'kraj', 'nema te', 'bez tebe']],
    ['čežnja', ['nedostaješ', 'tražim', 'čekam', 'vrati', 'sećam', 'mislim na tebe']],
    ['slomljeno srce', ['slom', 'boli', 'suze', 'plačem', 'srce', 'patim']],
    ['nada', ['možda', 'jednom', 'ponovo', 'svetlo', 'verujem', 'vratićeš']],
    ['ljubav', ['volim', 'ljubav', 'zauvek', 'moja', 'tvoja']]
  ];
  let best = { name: state.mood || 'melanholija', score: 0 };
  groups.forEach(([name, words]) => {
    const score = words.reduce((sum, word) => sum + (value.includes(word) ? 1 : 0), 0);
    if (score > best.score) best = { name, score };
  });
  return best.name;
}

function buildSceneBoundaries(duration, target, curve) {
  const minDuration = 2.4;
  const maxDuration = 8;
  const desired = clamp(target, minDuration, maxDuration);
  if (!duration) return [];
  if (duration <= maxDuration) return [0, duration];
  const boundaries = [0];
  const secondsPerBucket = curve.length ? duration / curve.length : 0;
  let current = 0;

  while (duration - current > maxDuration) {
    const ideal = current + desired;
    const searchStart = Math.max(current + minDuration, ideal - 1.2);
    const searchEnd = Math.min(current + maxDuration, ideal + 1.2, duration - minDuration);
    let chosen = ideal;
    let bestScore = -Infinity;

    if (curve.length && searchEnd > searchStart) {
      const firstIndex = Math.max(1, Math.floor(searchStart / secondsPerBucket));
      const lastIndex = Math.min(curve.length - 2, Math.ceil(searchEnd / secondsPerBucket));
      for (let index = firstIndex; index <= lastIndex; index += 1) {
        const delta = Math.abs(curve[index + 1] - curve[index - 1]);
        const energyBonus = curve[index] * 0.18;
        const distancePenalty = Math.abs(index * secondsPerBucket - ideal) / 1.2 * 0.17;
        const score = delta + energyBonus - distancePenalty;
        if (score > bestScore) {
          bestScore = score;
          chosen = index * secondsPerBucket;
        }
      }
    }

    chosen = clamp(chosen, current + minDuration, current + maxDuration);
    boundaries.push(Math.round(chosen * 100) / 100);
    current = chosen;
  }

  if (duration - current < minDuration && boundaries.length > 1) {
    boundaries.pop();
  }
  boundaries.push(Math.round(duration * 100) / 100);
  return boundaries;
}

function buildStoryboard() {
  collectFormState();
  if (!selectedCreativeIdea()) {
    showPanel('concept');
    showToast('Najpre izaberi jednu od 10 ideja. Storyboard se više ne pravi nasumično pre izbora.');
    return false;
  }
  if (!state.audio.duration) {
    showToast('Prvo dodaj i analiziraj audio.');
    return false;
  }
  const boundaries = buildSceneBoundaries(state.audio.duration, state.sceneDuration, state.audio.energyCurve || []);
  const lyrics = parseLyrics(state.lyrics);
  const oldByNumber = new Map(state.scenes.map(scene => [scene.number, scene]));
  const scenes = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const lyricIndex = lyrics.length ? Math.min(lyrics.length - 1, Math.floor(index * lyrics.length / (boundaries.length - 1))) : -1;
    const lyric = lyricIndex >= 0 ? lyrics[lyricIndex] : { text: 'Instrumentalni deo', section: 'Instrumental' };
    const old = oldByNumber.get(index + 1);
    const emotion = old?.emotion || detectEmotion(lyric.text);
    const scene = {
      id: old?.id || uuid(),
      number: index + 1,
      start,
      end,
      duration: Math.round((end - start) * 100) / 100,
      section: old?.section || lyric.section,
      lyric: old?.lyric || lyric.text,
      emotion,
      description: old?.description || defaultSceneDescription(index, lyric.text, emotion),
      shot: old?.shot || ['wide establishing shot', 'medium shot', 'close-up', 'over-the-shoulder shot'][index % 4],
      camera: old?.camera || ['slow push-in', 'subtle handheld drift', 'slow lateral tracking', 'locked frame with gentle breathing movement'][index % 4],
      location: old?.location || chooseLocation(index, lyric.text),
      locationReason: old?.locationReason || locationReasonForLyric(lyric.text, old?.location || chooseLocation(index, lyric.text)),
      sceneTitle: old?.sceneTitle || `Vizuelni trenutak ${index + 1}`, lyricMeaning: old?.lyricMeaning || '', microMovement: old?.microMovement || '',
      timeWeather: old?.timeWeather || '', lighting: old?.lighting || '',
      lens: old?.lens || ['24mm', '35mm', '50mm', '85mm', '100mm macro'][deterministicIndex(index, 'lens', 5)],
      composition: old?.composition || ['rule of thirds with strong negative space', 'centered symmetry broken by one moving detail', 'layered diagonal composition', 'low-angle composition with foreground depth', 'compressed telephoto layers'][deterministicIndex(index, 'composition', 5)],
      foreground: old?.foreground || '', midground: old?.midground || '', background: old?.background || '', atmosphere: old?.atmosphere || '',
      wardrobe: old?.wardrobe || '', continuityNotes: old?.continuityNotes || '', transitionIn: old?.transitionIn || '', transitionOut: old?.transitionOut || '',
      visualSignature: old?.visualSignature || `${chooseLocation(index, lyric.text)}|${index % 5}|${deterministicIndex(index, 'action', 12)}`,
      characterIds: old?.characterIds || [],
      imagePrompt: old?.imagePrompt || '',
      videoPrompt: old?.videoPrompt || '',
      promptSource: old?.promptSource || 'local',
      palette: Array.isArray(old?.palette) ? old.palette : [],
      paletteScore: Number(old?.paletteScore) || 0,
      imageInfo: old?.imageInfo || null,
      smartCrop: old?.smartCrop || null
    };
    enrichLocalScene(scene, index, lyric, emotion, boundaries.length - 1);
    scenes.push(scene);
  }
  state.scenes = scenes;
  generateAllPrompts(false);
  persistState(false, false);
  renderStoryboard();
  renderMediaGallery().catch(error => console.warn('Galerija nije osvežena:', error));
  showToast(`Napravljen je storyboard sa ${scenes.length} scena.`);
  return true;
}

function deterministicIndex(index,salt,length){const source=`${state.projectId}|${state.songTitle}|${salt}|${index}`;let hash=2166136261;for(let i=0;i<source.length;i+=1){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}return Math.abs(hash)%Math.max(1,length);}
const LYRIC_LOCATION_RULES = [
  { words:['dom','kuća','kuca','stan','soba','krevet','jastuk','vrata','prozor','kuhinj','hodnik'], settings:['realističan stan koji pripada priči para','tiha kuhinja sa tragovima svakodnevnog života','spavaća soba u kojoj jedan lični predmet ostaje na pogrešnom mestu','ulazni hodnik doma sa jasnim tragom odlaska'], reason:'stih govori o domu, privatnom prostoru ili predmetu koji nosi zajedničku uspomenu' },
  { words:['telefon','poziv','poruk','broj','javi','glas','ćutim','cutim'], settings:['tiha soba sa telefonom okrenutim ekranom nadole','mala kuhinja posle ponoći dok neodgovoreni poziv ostaje bez ponavljanja','zatvoren kafić u kojem lik briše nacrt poruke bez čitljivog ekrana'], reason:'stih se oslanja na komunikaciju, ćutanje ili neizgovorenu poruku' },
  { words:['odlaz','otiš','otis','put','voz','autobus','stanic','kofer','vrati','povrat'], settings:['železnička stanica neposredno posle odlaska','autobuski terminal sa jednim napuštenim mestom','ulaz u zgradu dok kofer prelazi prag','lokalni put na kojem se pravac menja bez melodramatičnog trčanja'], reason:'stih govori o odlasku, povratku ili promeni pravca' },
  { words:['kiša','kisa','mokar','oluja','kap','pljusak'], settings:['natkriven ulaz zgrade tokom kiše','unutrašnjost autobusa sa realnim kapima na staklu','mala prodavnica pred zatvaranje dok kiša ostaje napolju'], reason:'vremenski motiv kiše postoji u samom tekstu, pa lokacija koristi kišu kao realnu okolnost' },
  { words:['noć','noc','mrak','zvezd','mesec','svitan','jutro','dan'], settings:['stan pred svitanje sa prvim prirodnim svetlom','mirna gradska ulica samo ako stih izričito govori o noći ili hodanju','krov zgrade pred jutro samo kada stih traži pogled u daljinu'], reason:'doba dana je izričito prisutno u stihu i određuje svetlo i ritam scene' },
  { words:['more','talas','obala','brod','luka','pesak'], settings:['realistična morska obala van sezone','mala luka u vreme zatvaranja','unutrašnjost trajekta sa pogledom na obalu'], reason:'stih direktno koristi motiv mora, obale ili putovanja vodom' },
  { words:['slik','fotograf','uspomen','seć','sec','pamt','prošl','prosl'], settings:['porodični sto sa kutijom fotografija bez čitljivih natpisa','mala foto-radnja samo ako je fotografija ključni predmet stiha','ormar u domu sa pažljivo sačuvanim ličnim predmetima'], reason:'stih govori o sećanju ili fizičkom tragu prošlosti' },
  { words:['dete','devojčic','majka','otac','porodic'], settings:['porodični dnevni boravak sa realističnim tragovima života deteta','malo igralište pred zatvaranje','hodnik vrtića nakon odlaska roditelja'], reason:'stih sadrži porodični odnos, pa prostor mora pripadati toj konkretnoj porodičnoj situaciji' },
  { words:['posao','radim','firma','kancelar','fabrik','mašin','radion'], settings:['realistična kancelarija posle radnog vremena','radionica u kojoj se završava konkretan zadatak','proizvodni prostor samo kada tekst zaista govori o radu ili rutini'], reason:'stih je vezan za posao, rutinu ili mehanički proces' },
  { words:['bog','molit','crk','greh','oprosti'], settings:['tiha crkvena klupa bez teatralne ikonografije','mali prostor za molitvu u ranim jutarnjim satima','mirno dvorište crkve nakon službe'], reason:'stih direktno govori o molitvi, veri, oproštaju ili krivici' },
  { words:['ček','cek','kasni','vreme','sat'], settings:['čekaonica koja ima jasan razlog u priči','mali kafić pred zatvaranje sa jednim praznim mestom','ulaz zgrade pored sata bez čitljivih brojki'], reason:'stih govori o čekanju ili protoku vremena, pa prostor omogućava vidljivu posledicu čekanja' },
  { words:['srce','volim','ljubav','poljub','zagrlj'], settings:['poznati zajednički stan u kojem obična radnja pokazuje odnos','mirno dvorište ili terasa vezana za zajedničku uspomenu','mala kuhinja u kojoj dva predmeta više ne čine par'], reason:'intimna emocija se prevodi u prostor koji prirodno pripada odnosu, bez nasumičnog spektakla' }
];

function normalizeLyricText(value){return String(value||'').toLocaleLowerCase('sr-RS').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function lyricStemMatches(textValue, wordValue){
  const text=normalizeLyricText(textValue), word=normalizeLyricText(wordValue);
  const tokens=text.split(/[^a-z0-9]+/i).filter(Boolean);
  if(word==='stan') return tokens.some(token=>['stan','stana','stanu','stanom','stanovi','stanovima'].includes(token));
  if(word==='put') return tokens.some(token=>['put','puta','putem','putu','putevi','putovanje','putovanja'].includes(token));
  if(word.length<=3) return tokens.includes(word);
  return tokens.some(token=>token.startsWith(word));
}
function lyricLocationMatches(lyric){
  return LYRIC_LOCATION_RULES.filter(rule=>rule.words.some(word=>lyricStemMatches(lyric,word)));
}
function scoreCandidateLocation(location, lyric, idea){
  const loc=normalizeLyricText(location); const text=normalizeLyricText(lyric); let score=0;
  const matches=lyricLocationMatches(lyric);
  for(const rule of matches){ for(const setting of rule.settings){ const tokens=normalizeLyricText(setting).split(/\W+/).filter(token=>token.length>3); score+=tokens.filter(token=>loc.includes(token)).length*5; } }
  const lyricTokens=text.split(/\W+/).filter(token=>token.length>4); score+=lyricTokens.filter(token=>loc.includes(token)).length*3;
  const world=normalizeLyricText(`${idea?.visualWorld||''} ${idea?.narrativeArc||''} ${idea?.centralSymbol||''}`);
  score+=world.split(/\W+/).filter(token=>token.length>5&&loc.includes(token)).length;
  return score;
}
function chooseLocation(index, lyricText=''){
  const selected=selectedCreativeIdea();
  const candidateLocations=(selected?.locations?.length?selected.locations:(state.concept.locations||'').split(',')).map(item=>String(item).trim()).filter(Boolean);
  const justifications=Array.isArray(selected?.locationJustification)?selected.locationJustification:[];
  const candidatesAreGrounded=Boolean(candidateLocations.length&&justifications.length>=candidateLocations.length);
  const matches=lyricLocationMatches(lyricText);
  const grounded=matches.flatMap(rule=>rule.settings);
  let list=[];
  if(candidateLocations.length&&candidatesAreGrounded){
    const ranked=candidateLocations.map((location,position)=>({location,position,score:scoreCandidateLocation(location,lyricText,selected)})).sort((a,b)=>b.score-a.score||a.position-b.position);
    const maxScore=ranked[0]?.score||0;
    if(maxScore>0){
      const threshold=Math.max(1,Math.floor(maxScore*0.75));
      list=ranked.filter(item=>item.score>=threshold).map(item=>item.location);
    } else if(!grounded.length) list=ranked.map(item=>item.location);
  }
  if(!list.length&&grounded.length) list=[...new Set(grounded)];
  if(!list.length) list=['realističan privatni prostor ili neposredno okruženje koje prirodno pripada konkretnoj radnji iz ovog stiha'];
  return list[deterministicIndex(index,`lyric-location-${normalizeLyricText(lyricText).slice(0,80)}`,list.length)];
}
function locationReasonForLyric(lyricText, location){
  const matches=lyricLocationMatches(lyricText);
  if(matches.length){
    const loc=normalizeLyricText(location);
    const ranked=matches.map(rule=>({rule,score:rule.settings.reduce((sum,setting)=>sum+normalizeLyricText(setting).split(/[^a-z0-9]+/i).filter(token=>token.length>3&&loc.includes(token)).length,0)})).sort((a,b)=>b.score-a.score);
    return `${ranked[0].rule.reason}; izabrana lokacija „${location}“ omogućava da se smisao stiha pokaže kroz realnu radnju, a ne kroz nasumičan filmski dekor.`;
  }
  const selected=selectedCreativeIdea();
  const locationIndex=(selected?.locations||[]).findIndex(item=>normalizeLyricText(item)===normalizeLyricText(location));
  const ideaReason=locationIndex>=0?String(selected?.locationJustification?.[locationIndex]||'').trim():'';
  if(ideaReason) return `${ideaReason} Za trenutni stih „${compactLyric(lyricText,120)}“ prostor se koristi samo kroz konkretnu radnju i njenu posledicu.`;
  return `Lokacija „${location}“ nije izabrana kao filmski ukras: služi samo kao neposredno funkcionalno okruženje za konkretnu radnju iz stiha „${compactLyric(lyricText,120)}“; kada ta veza nije moguća, scena mora ostati u neutralnom privatnom prostoru.`;
}
function defaultSceneDescription(index,lyric,emotion){const actions=['she carefully returns a personal object to the exact place where it once belonged, then changes her mind halfway','she follows a moving reflection across the room while the real person remains outside the frame','she tries to complete an ordinary task, but one small detail interrupts the action and exposes the emotion','she notices a trace left by someone else and reacts only through a delayed movement of her hand','she enters a space that is still active around her, yet her attention remains fixed on one silent absence','she crosses paths with strangers moving in the opposite direction while protecting one meaningful object','she pauses at a threshold, lets the environment continue moving, and makes one restrained decision','she watches a practical process finish—light switching off, machine stopping, door closing—and understands the lyric through that action','she attempts to erase or clean a physical trace, but leaves one deliberate part untouched','she changes direction after hearing or noticing something that only she recognizes as important','she prepares to leave, removes one item from her bag, and places it behind instead of taking it','she reaches the end of a path and discovers that the expected person or object is no longer there'];const action=actions[deterministicIndex(index,'action',actions.length)];return `${action}; the visible action expresses ${emotion}; the scene interprets the lyric “${lyric}” through concrete behavior rather than showing written text`;}


function interpretLyricMeaning(lyric, emotion) {
  const text = String(lyric || '').toLocaleLowerCase('sr-RS');
  const rules = [
    { words:['vrati','vraća','ponovo'], meaning:'želja za povratkom postoji, ali lik shvata da povratak ne može izbrisati ono što se promenilo' },
    { words:['zaborav','zaboravi','izbrišem'], meaning:'lik pokušava da ukloni uspomenu kroz konkretnu radnju, ali svesno ostavlja jedan dokaz da je postojala' },
    { words:['čekam','čekati','čekaću'], meaning:'vreme prolazi kroz rad prostora i predmeta, dok lik bira da li će nastaviti da čeka' },
    { words:['otišla','odlazi','odlazak'], meaning:'odlazak se prikazuje kroz završetak realnog procesa i prazno mesto koje ostaje iza njega' },
    { words:['nedostaješ','nedostaje'], meaning:'odsustvo se vidi kroz svakodnevnu radnju koja je ranije zahtevala dve osobe, a sada ostaje nedovršena' },
    { words:['volim','ljubav','voleo'], meaning:'ljubav se pokazuje kroz pažljivu odluku i zaštitu drugog, ne kroz teatralan zagrljaj ili napisane reči' },
    { words:['boli','bol','slom'], meaning:'bol se prikazuje kroz kontrolisano fizičko ponašanje, prekid rutine i malu odluku koju lik jedva donosi' },
    { words:['sam','sama','usamljen'], meaning:'usamljenost se prikazuje odnosom jednog lika prema prostoru koji normalno pripada grupi ili paru' },
    { words:['kraj','gotovo','završilo'], meaning:'lik dovršava jedan stvaran postupak i namerno zatvara poslednji korak bez mogućnosti povratka' },
    { words:['možda','jednom','nada'], meaning:'u sceni postoji mali, realan znak mogućnosti, ali lik ga ne pretvara u sigurnu sreću' }
  ];
  const found = rules.find(rule => rule.words.some(word => text.includes(word)));
  return found?.meaning || `emocija „${emotion}“ prevodi se u jednu jasnu fizičku odluku koja proizlazi iz smisla stiha, bez doslovnog ispisivanja teksta`;
}

function sceneObjectForLyric(lyric,index,idea){
  const text=normalizeLyricText(lyric);
  const pick=(label,items)=>items[deterministicIndex(index,`lyric-object-${label}-${text.slice(0,80)}`,items.length)];
  // Redosled je nameran: najkonkretniji motiv stiha ima prednost nad opštim rečima kao „čekam“ ili „vreme“.
  if(/telefon|poziv|poruk|broj|javi|glas/.test(text)) return pick('telefon',[
    'telefon okrenut ekranom nadole, bez čitljivih poruka',
    'telefon sa priključenim slušalicama i ugašenim ekranom',
    'telefon sa utišanim signalom i bez čitljivih detalja na ekranu'
  ]);
  if(/voz|autobus|stanic|kofer|odlaz|vrati|put/.test(text)) return pick('putovanje',[
    'presavijena putna karta bez čitljivih oznaka',
    'mali kofer sa jednim nezatvorenim kaišem',
    'mala putna torba sa otvorenim spoljnim džepom'
  ]);
  if(/slik|fotograf|uspomen|sec|pamt|prosl/.test(text)) return pick('uspomena',[
    'jedna fotografija okrenuta licem nadole',
    'kutija sa jednim ličnim predmetom iz uspomene',
    'dva nekada uparena predmeta od kojih je ostao samo jedan'
  ]);
  if(/kisa|oluja|kap|mokar|pljusak/.test(text)) return pick('kisa',[
    'jedan mokar predmet unet iz kiše',
    'trag kapljica na staklu koji prati pokret ruke',
    'zatvoren kišobran koji ostavlja realan mokar trag'
  ]);
  if(['dom','kuca','stan','soba','krevet','vrata','prozor','kuhinj'].some(word=>lyricStemMatches(lyric,word))) return pick('dom',[
    'dve šolje od kojih je jedna ostala netaknuta',
    'ključ doma na ivici stola',
    'jastuk ili komad garderobe koji jasno pripada odsutnoj osobi'
  ]);
  if(/more|talas|obala|brod|luka|pesak/.test(text)) return pick('more',[
    'mali kamen ili školjka sa obale',
    'karta trajekta bez vidljivog teksta',
    'mokar konopac ili lični predmet sa putovanja'
  ]);
  if(/bog|molit|crk|greh|oprosti/.test(text)) return pick('vera',[
    'jedna neupaljena sveća',
    'diskretan lični predmet molitve',
    'ključ ili prsten položen na drvenu klupu'
  ]);
  if(/dete|devojcic|majka|otac|porodic/.test(text)) return pick('porodica',[
    'tanka dečja narukvica',
    'mali porodični predmet ostavljen na stolu',
    'jedna igračka postavljena prirodno u prostoru'
  ]);
  if(/cek|kasni|vreme|sat/.test(text)) return pick('cekanje',[
    'mat sat bez čitljivih brojki',
    'jedna prazna stolica na mestu čekanja',
    'predmet pripremljen za osobu koja kasni'
  ]);
  if(/srce|volim|ljubav|poljub|zagrlj/.test(text)) return pick('ljubav',[
    'dva svakodnevna predmeta koji više nisu u paru',
    'jedan diskretan zajednički privezak',
    'komad odeće koji je ostao u zajedničkom prostoru'
  ]);
  const fallback=String(idea?.centralSymbol||'').trim();
  return fallback || pick('fallback',[
    'jedan konkretan lični predmet pomenut ili jasno nagovešten stihom',
    'prazno mesto u radnji koja je ranije zahtevala dve osobe',
    'ključ ili običan predmet čija se funkcija menja od početka do kraja'
  ]);
}
function sceneActionForLyric(lyric,object,index,emotion){
  const text=normalizeLyricText(lyric);
  let actions=[];
  if(/telefon|poziv|poruk|broj|javi|glas/.test(text)) actions=[
    `ona uzima centralni predmet — ${object} — otključava ga bez prikazivanja čitljivog sadržaja, započinje poruku ili poziv, zastane pre slanja i odlaže telefon ekranom nadole`,
    `ona čuje kratak signal iz centralnog predmeta — ${object} — podigne telefon, sačeka tišinu i prekine ponovni pokušaj tačno pre nego što bi pritisnula isto dugme`,
    `ona briše samo nacrt neizgovorene poruke bez prikazivanja čitljivog ekrana, ali zadržava telefon (${object}) u ruci dok joj se pogled pomera prema praznom mestu druge osobe`
  ];
  else if(/voz|autobus|stanic|kofer|odlaz|vrati|put/.test(text)) actions=[
    `ona stiže na mesto odlaska i proverava centralni predmet (${object}); kada vidi da očekivana osoba nije došla, mirno menja pravac umesto da trči za vozilom`,
    `ona uzima centralni predmet (${object}) kao da će krenuti, zatim ga vraća na prazno sedište ili klupu i pravi jedan korak dalje od polaska`,
    `ona ostavlja centralni predmet (${object}) na pragu ili uz prazno mesto, dopušta da vozilo ili vrata završe svoj pokret i tek tada donosi odluku`
  ];
  else if(/slik|fotograf|uspomen|sec|pamt|prosl/.test(text)) actions=[
    `ona uzima centralni predmet (${object}), pažljivo čisti samo jedan njegov deo, a zatim ga okreće tako da uspomena ostane prisutna bez doslovnog prikazivanja prošlosti`,
    `ona poređa lične tragove po vremenskom redosledu, izdvaja centralni predmet (${object}) i premešta ga na novo mesto umesto da ga uništi`,
    `ona pokušava da odloži centralni predmet (${object}) u kutiju, zaustavlja poklopac pre zatvaranja i menja odluku kroz jedan mali pokret ruke`
  ];
  else if(/kisa|oluja|kap|mokar|pljusak/.test(text)) actions=[
    `ona unese ${object} iz kiše, obriše vodu sa jedne površine i ostavi jedan mali trag koji fizički odgovara uspomeni iz stiha`,
    `ona prati kapljice do ${object}, zatvara izvor promaje ili vode i reaguje tek kada vidi šta je ostalo netaknuto`,
    `ona odloži ${object} da se suši, zatim izdvoji jedan mokar lični detalj koji pripada odsutnoj osobi`
  ];
  else if(/cek|kasni|vreme|sat/.test(text)) actions=[
    `ona pripremi mesto i ${object} za dolazak, sačeka jasan znak protoka vremena, zatim ukloni samo jedan deo pripreme`,
    `ona pogleda posledicu čekanja na ${object}, ali ne ponavlja nervozan gest; umesto toga menja položaj praznog mesta`,
    `ona dozvoli da praktičan proces čekanja završi, zatim uzima ${object} i odlazi pre sledećeg ciklusa`
  ];
  else if(['dom','kuca','stan','soba','krevet','vrata','prozor','kuhinj'].some(word=>lyricStemMatches(lyric,word))) actions=[
    `ona započinje običnu kućnu radnju sa ${object}, shvati da je bila namenjena za dve osobe i dovrši samo funkcionalni deo`,
    `ona vraća ${object} na mesto odsutne osobe, zastane, zatim ga pomeri nekoliko centimetara u novi raspored`,
    `ona otvara poznat deo doma, pronalazi ${object} i zatvara prostor tek kada odluči šta više ne pripada staroj rutini`
  ];
  else actions=[
    `ona koristi ${object} u jednoj jasnoj praktičnoj radnji koja proizlazi iz stiha, zastane na tački odluke i menja njegov položaj tako da posledica ostane vidljiva`,
    `ona pronalazi ${object} na mestu gde ga stih emocionalno opravdava, proverava ga jednim kontrolisanim pokretom i bira da ga ne ponese`,
    `ona završava svakodnevnu radnju povezanu sa ${object}, ali poslednji korak namerno izvodi drugačije kako bi se emocija „${emotion}“ videla bez teksta`
  ];
  return actions[deterministicIndex(index,`lyric-action-${text.slice(0,80)}`,actions.length)];
}

function enrichLocalScene(scene, index, lyricData, emotion, totalScenes) {
  if (scene.promptSource === 'ai' && scene.imagePrompt && scene.videoPrompt) return scene;
  const idea = selectedCreativeIdea();
  const locationBase = scene.location || chooseLocation(index, lyricData.text);
  const phase = totalScenes <= 1 ? 0 : index / (totalScenes - 1);
  const actions = [
    'ona započinje poznatu svakodnevnu radnju, zastaje na poslednjem koraku i menja odluku tako da predmet ostane na mestu koje menja smisao scene',
    'ona pronalazi predmet koji pripada prethodnom delu priče, proverava ga bez žurbe i bira da ga ne ponese dalje',
    'ona pokušava da popravi mali kvar u prostoru, ali shvata da pravi problem nije tehnički i polako spušta ruke',
    'ona prolazi pored ljudi koji završavaju svoj posao, ali reaguje samo na jedan tihi detalj koji je vezan za stih',
    'ona otvara vrata koja je ranije izbegavala, ostaje na pragu jednu sekundu, zatim ulazi bez osvrtanja',
    'ona pažljivo čisti površinu, ostavlja jednu malu netaknutu zonu i time pokazuje da uspomenu ne želi potpuno da izbriše',
    'ona priprema dva jednaka predmeta, zatim jedan vraća na policu i nastavlja samo sa jednim',
    'ona prati završetak mehaničkog procesa, zaustavlja ga pre automatskog ponavljanja i donosi odluku pre nego što se sistem ponovo pokrene',
    'ona pokušava da vrati predmet na staro mesto, ali ga pomera nekoliko centimetara u novu poziciju koja pokazuje promenu',
    'ona čuje ili primeti poznat signal, reaguje blagim pokretom glave, ali ne trči prema njemu i ne dramatizuje',
    'ona ulazi u prostor posle svih ostalih, proverava jedan trag i zaključava prostor iza sebe tek kada razume njegovu poruku',
    'ona stavlja lični predmet u zajednički prostor, zatim ga uzima nazad jer shvata da druga osoba neće doći',
    'ona stoji u pokretnoj sredini dok sve oko nje nastavlja da radi, a zatim napravi jedan mali korak u suprotnom smeru',
    'ona pronalazi nedovršen predmet, završava samo njegov funkcionalni deo i namerno ostavlja estetski detalj nedovršen',
    'ona pokušava da otvori ormarić ili fioku, shvata da ključ ne pripada tom mestu i prestaje da pokušava silom',
    'ona ugasi jedan izvor svetla, ali ostavi drugi slabiji izvor uključen kao realan znak da još nije završila sa prostorom',
    'ona premešta niz predmeta po praktičnom redosledu, izdvaja jedan koji remeti obrazac i zadržava ga u ruci',
    'ona se priprema da ode, ali pre izlaska vrati jedan predmet osobi ili mestu kojem stvarno pripada',
    'ona zatvara prozor zbog vetra, zatim ga ponovo otvara samo nekoliko centimetara kada čuje promenu spolja',
    'ona prilazi kraju puta ili hodnika, ne nalazi očekivanu osobu i reaguje tihim spuštanjem ramena pre nego što promeni pravac',
    'ona napravi kratak glasovni poziv bez vidljivog ekrana, sačeka tišinu, zatim spusti uređaj bez ponovnog pozivanja',
    'ona otvara pakovanje ili kutiju, uklanja samo jedan lični predmet i ostatak ostavlja netaknut',
    'ona povezuje dva dela predmeta, zatim ih ponovo razdvoji kada shvati da sastavljanje ne vraća prethodno stanje',
    'ona podigne predmet koji je pao, obriše ga, ali ga ne vraća vlasniku jer vlasnika nema u prostoru'
  ];
  const micro = [
    'pogled se zadrži pola sekunde duže, donja usna ostaje mirna, prsti kratko pojačaju stisak pa se opuste, disanje ostaje kontrolisano',
    'jedan spor treptaj, mala promena težine sa jedne noge na drugu, jedva primetno uvlačenje daha i zaustavljen pokret palca',
    'oči prvo prate predmet, zatim se podignu prema praznom delu prostora; ramena se ne tresu i nema teatralnog plača',
    'vrhovi prstiju dodirnu površinu samo jednom, šaka se povuče nekoliko centimetara i telo ostane potpuno stabilno',
    'kosa se prirodno pomeri pod uticajem vazduha, vilica se blago zategne, a pogled ostane usmeren na posledicu radnje',
    'ruka započne pokret prema predmetu, zastane u pola putanje, zatim se spusti uz telo uz jedan tihi izdah'
  ];
  const shots = ['wide environmental establishing shot','medium-wide narrative shot','intimate medium shot','controlled close-up','low-angle architectural shot','high-angle observational shot','over-the-shoulder narrative shot','profile close-up with environ…69105 tokens truncated…st buckets = new Map();
  for (let index = 0; index < pixels.length; index += 32) {
    if (pixels[index + 3] < 180) continue;
    const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]].map(value => Math.round(value / 48) * 48);
    const key = rgb.join(',');
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key]) => rgbToHex(key.split(',').map(Number)));
}

async function extractPalette(blob) {
  const { image, url } = await loadImageFromBlob(blob);
  try {
    const api = window.ColorThief || window.colorthief;
    if (api?.getPaletteSync) {
      const colors = api.getPaletteSync(image, { colorCount: 5, quality: 10 }) || [];
      return colors.map(color => typeof color?.hex === 'function' ? color.hex() : rgbToHex(color)).slice(0, 5);
    }
    if (typeof api === 'function') {
      const instance = new api();
      const colors = instance.getPalette(image, 5, 10) || [];
      return colors.map(rgbToHex).slice(0, 5);
    }
    return fallbackPalette(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function recomputePaletteContinuity() {
  state.scenes.forEach((scene, index) => {
    if (!scene.palette?.length) { scene.paletteScore = 0; return; }
    if (index === 0 || !state.scenes[index - 1].palette?.length) { scene.paletteScore = 100; return; }
    const current = parseHex(scene.palette[0]);
    const previous = parseHex(state.scenes[index - 1].palette[0]);
    const distance = Math.sqrt(current.reduce((sum, value, channel) => sum + (value - previous[channel]) ** 2, 0));
    scene.paletteScore = Math.round(clamp(100 - distance / 441.67 * 100, 0, 100));
  });
}

async function analyzeScenePalette(sceneId, suppliedBlob = null) {
  const scene = state.scenes.find(item => item.id === sceneId);
  if (!scene) return;
  const blob = suppliedBlob || await getAsset(state.imageAssetIds[sceneId]);
  if (!blob) return;
  scene.palette = await extractPalette(blob);
  recomputePaletteContinuity();
  persistState(false, false);
}

async function smartCropAllImages() {
  const button = $('#smartCropAllBtn');
  if (button) button.disabled = true;
  try {
    let count = 0;
    for (const scene of state.scenes) {
      const assetId = state.imageAssetIds[scene.id];
      if (!assetId) continue;
      const blob = await getAsset(assetId);
      if (!blob) continue;
      $('#renderStatus').textContent = `Pametno kadriranje: scena ${scene.number}...`;
      const processed = await processImageForScene(blob, scene);
      await putAsset(assetId, processed.blob);
      scene.imageInfo = processed.info;
      scene.smartCrop = processed.crop;
      if (state.settings.autoPalette) await analyzeScenePalette(scene.id, processed.blob);
      count += 1;
    }
    persistState(false, false);
    await renderMediaGallery();
    $('#renderStatus').textContent = `Pametno kadrirano ${count} slika.`;
    showToast(`Obrađeno je ${count} slika.`);
  } catch (error) {
    showToast(`Obrada slika nije uspela: ${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

async function analyzeAllPalettes() {
  const button = $('#analyzePalettesBtn');
  if (button) button.disabled = true;
  try {
    let count = 0;
    for (const scene of state.scenes) {
      if (!state.imageAssetIds[scene.id]) continue;
      $('#renderStatus').textContent = `Analiza boja: scena ${scene.number}...`;
      await analyzeScenePalette(scene.id);
      count += 1;
    }
    recomputePaletteContinuity();
    persistState(false, false);
    await renderMediaGallery();
    $('#renderStatus').textContent = `Analizirane boje za ${count} slika.`;
    showToast(`Palete su analizirane za ${count} slika.`);
  } catch (error) {
    showToast(`Analiza boja nije uspela: ${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function fileExtensionFromBlob(blob, fallback = 'bin') {
  const map = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'video/webm': 'webm', 'video/mp4': 'mp4', 'image/webp+animated': 'webp' };
  return map[blob?.type] || fallback;
}

async function exportZipProject() {
  if (!window.JSZip) throw new Error('JSZip nije učitan. Proveri internet i osveži stranicu.');
  const zip = new window.JSZip();
  const project = structuredClone(state);
  project.exportedAt = new Date().toISOString();
  project.imageAssetIds = {};
  project.lockedGirlReferenceAssetId = state.lockedGirlReferenceAssetId ? 'included-in-zip' : '';
  project.videoAssetIds = {};
  zip.file('project.json', JSON.stringify(project, null, 2));
  zip.file('storyboard.csv', `\uFEFF${createStoryboardCsv()}`);
  if (state.captions?.items?.length) {
    zip.file('titlovi.srt', `\uFEFF${subtitleFile('srt')}`);
    zip.file('titlovi.vtt', `\uFEFF${subtitleFile('vtt')}`);
  }
  const manifest = { version: '6.0', audio: null, reference: null, images: {}, videos: {} };
  if (state.lockedGirlReferenceAssetId) {
    const referenceBlob = await getAsset(state.lockedGirlReferenceAssetId);
    if (referenceBlob) {
      const referencePath = `reference/locked-girl.${fileExtensionFromBlob(referenceBlob, 'png')}`;
      zip.file(referencePath, referenceBlob);
      manifest.reference = { path: referencePath, type: referenceBlob.type };
    }
  }
  const audio = await getAsset(`audio:${state.projectId}`);
  if (audio) {
    const ext = state.audio.fileName?.split('.').pop()?.toLowerCase() || fileExtensionFromBlob(audio, 'audio');
    const path = `audio/original.${ext}`;
    zip.file(path, audio);
    manifest.audio = { path, type: audio.type, fileName: state.audio.fileName };
  }
  for (const scene of state.scenes) {
    const assetId = state.imageAssetIds[scene.id];
    if (!assetId) continue;
    const blob = await getAsset(assetId);
    if (!blob) continue;
    const path = `images/scena-${String(scene.number).padStart(3, '0')}.${fileExtensionFromBlob(blob, 'img')}`;
    zip.file(path, blob);
    manifest.images[scene.id] = { path, type: blob.type };
  }

  for (const scene of state.scenes) {
    const assetId = state.videoAssetIds?.[scene.id];
    if (!assetId) continue;
    const blob = await getAsset(assetId);
    if (!blob) continue;
    const path = `videos/scena-${String(scene.number).padStart(3, '0')}-AI.${fileExtensionFromBlob(blob, 'webm')}`;
    zip.file(path, blob);
    manifest.videos[scene.id] = { path, type: blob.type };
  }
  zip.file('asset-manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('PROCITAJ-ME.txt', 'Muzički Spot Studio FREE 15.4 LITE\nOvaj ZIP sadrži project.json, storyboard.csv, titlove, originalni audio, slike i AI video-klipove scena. Uvezi ga kroz dugme „Uvezi projekat“ u programu.');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, metadata => {
    $('#globalNotice').className = 'notice info';
    $('#globalNotice').textContent = `Pravljenje ZIP rezervne kopije: ${Math.round(metadata.percent)}%`;
  });
  downloadBlob(blob, `${safeFileName(state.name)}-CEO-PROJEKAT.zip`);
  updateStatus();
}

async function importZipProject(file) {
  if (!window.JSZip) throw new Error('JSZip nije učitan.');
  const zip = await window.JSZip.loadAsync(file);
  const projectEntry = zip.file('project.json');
  if (!projectEntry) throw new Error('ZIP nema project.json.');
  const data = JSON.parse(await projectEntry.async('text'));
  state = normalizeState(data);
  state.imageAssetIds = {};
  state.videoAssetIds = {};
  const manifestEntry = zip.file('asset-manifest.json');
  const manifest = manifestEntry ? JSON.parse(await manifestEntry.async('text')) : { images: {}, videos: {} };
  if (manifest.reference?.path && zip.file(manifest.reference.path)) {
    const blob = await zip.file(manifest.reference.path).async('blob');
    const assetId = `reference:${state.projectId}:locked-girl`;
    await putAsset(assetId, new Blob([blob], { type: manifest.reference.type || blob.type || 'image/png' }));
    state.lockedGirlReferenceAssetId = assetId;
  } else {
    state.lockedGirlReferenceAssetId = '';
  }
  if (manifest.audio?.path && zip.file(manifest.audio.path)) {
    const blob = await zip.file(manifest.audio.path).async('blob');
    await putAsset(`audio:${state.projectId}`, new Blob([blob], { type: manifest.audio.type || blob.type || state.audio.type }));
  }
  for (const [sceneId, info] of Object.entries(manifest.images || {})) {
    const entry = zip.file(info.path);
    if (!entry) continue;
    const blob = await entry.async('blob');
    const assetId = `image:${state.projectId}:${sceneId}`;
    await putAsset(assetId, new Blob([blob], { type: info.type || blob.type }));
    state.imageAssetIds[sceneId] = assetId;
  }

  for (const [sceneId, info] of Object.entries(manifest.videos || {})) {
    const entry = zip.file(info.path);
    if (!entry) continue;
    const blob = await entry.async('blob');
    const assetId = `video:${state.projectId}:${sceneId}`;
    await putAsset(assetId, new Blob([blob], { type: info.type || blob.type || 'video/webm' }));
    state.videoAssetIds[sceneId] = assetId;
    const scene = state.scenes.find(item => item.id === sceneId);
    if (scene) scene.i2v = { ...(scene.i2v || {}), status: 'done', generatedAt: new Date().toISOString(), filename: info.path };
  }
}

async function convertLastRenderToMp4() {
  if (!lastRenderedBlob) return showToast('Najpre napravi završni video.');
  if (lastRenderedBlob.type.includes('mp4')) return showToast('Video je već MP4.');
  const button = $('#convertMp4Btn');
  button.disabled = true;
  $('#ffmpegStatus').textContent = 'Učitavanje FFmpeg.wasm. Prvi put preuzima oko 30 MB...';
  try {
    const [{ FFmpeg }, util] = await Promise.all([
      import('https://esm.sh/@ffmpeg/ffmpeg@0.12.15?bundle'),
      import('https://esm.sh/@ffmpeg/util@0.12.2?bundle')
    ]);
    if (!ffmpegInstance) {
      ffmpegInstance = new FFmpeg();
      ffmpegInstance.on('progress', ({ progress }) => {
        $('#ffmpegStatus').textContent = `MP4 konverzija: ${Math.round(clamp(progress, 0, 1) * 100)}%`;
      });
      const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
      await ffmpegInstance.load({
        coreURL: await util.toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await util.toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
      });
    }
    renderToolStatus();
    await ffmpegInstance.writeFile('input.webm', await util.fetchFile(lastRenderedBlob));
    try {
      await ffmpegInstance.exec(['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', '-movflags', '+faststart', 'output.mp4']);
    } catch {
      await ffmpegInstance.exec(['-i', 'input.webm', '-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'aac', 'output.mp4']);
    }
    const data = await ffmpegInstance.readFile('output.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    if (lastRenderedUrl) URL.revokeObjectURL(lastRenderedUrl);
    lastRenderedBlob = blob;
    lastRenderedUrl = URL.createObjectURL(blob);
    $('#renderPreview').src = lastRenderedUrl;
    $('#downloadVideoLink').href = lastRenderedUrl;
    $('#downloadVideoLink').download = `${lastRenderedFileStem || safeFileName(state.name)}.mp4`;
    $('#downloadVideoLink').textContent = 'Preuzmi završni MP4';
    $('#downloadVideoLink').hidden = false;
    $('#convertMp4Btn').hidden = true;
    $('#ffmpegStatus').textContent = `MP4 je spreman • ${(blob.size / 1024 / 1024).toFixed(1)} MB`;
    await Promise.allSettled([ffmpegInstance.deleteFile('input.webm'), ffmpegInstance.deleteFile('output.mp4')]);
    showToast('WebM je pretvoren u MP4.');
  } catch (error) {
    console.error(error);
    $('#ffmpegStatus').textContent = `Konverzija nije uspela: ${error.message}`;
    showToast('FFmpeg konverzija nije uspela. WebM fajl i dalje možeš da preuzmeš.');
  } finally {
    button.disabled = false;
    renderToolStatus();
  }
}

function toolLoaded(tool) {
  if (tool.id === 'beat') return state.audio.beatDetectorStatus === 'ready';
  if (tool.id === 'ffmpeg') return Boolean(ffmpegInstance);
  if (tool.id === 'comfy-wan') return Boolean(state.i2v?.connected);
  if (tool.id === 'instantid') return Boolean(state.t2i?.connected && state.t2i?.mode === 'instantid');
  if (tool.id === 'transformers') return Boolean(whisperTranscriber || transformersModule);
  if (tool.global) return Boolean(window[tool.global]);
  if (tool.globalAny) return tool.globalAny.some(name => Boolean(window[name]));
  return false;
}

function renderToolStatus() {
  const container = $('#toolStatusGrid');
  if (!container) return;
  container.innerHTML = TOOL_REGISTRY.map((tool, index) => {
    const loaded = toolLoaded(tool);
    const lazy = tool.dynamic && !loaded;
    return `<article class="tool-card ${loaded ? 'ok' : lazy ? 'lazy' : 'missing'}"><div class="tool-number">${index + 1}</div><div><strong>${escapeHtml(tool.name)}</strong><p>${escapeHtml(tool.purpose)}</p><span class="tool-state">${loaded ? '✓ Učitano' : lazy ? 'Učitava se tek kada ga pokreneš' : 'Nije učitano — osnovni program i dalje radi'}</span><a href="${tool.url}" target="_blank" rel="noopener noreferrer">GitHub projekat ↗</a></div></article>`;
  }).join('');
  const loadedCount = TOOL_REGISTRY.filter(toolLoaded).length;
  $('#toolsBadge').textContent = `${loadedCount}/${TOOL_REGISTRY.length} trenutno učitano`;
}


let autoBackupTimer = null;
let backupPromise = null;

async function saveServerBackup(showMessage = false) {
  if (backupPromise) return backupPromise;
  backupPromise = (async () => {
    collectFormState();
    const response = await fetch(apiUrl('/api/maintenance/backup'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Backup nije napravljen.');
    if (showMessage) showToast(`Backup je sačuvan: ${data.backup.fileName}`);
    await loadMaintenanceStatus(false);
    return data.backup;
  })();
  try { return await backupPromise; }
  finally { backupPromise = null; }
}

async function restoreLatestServerBackup() {
  const response = await fetch(apiUrl('/api/maintenance/restore-latest'), { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Backup nije pronađen.');
  if (!window.confirm(`Vrati backup napravljen ${new Date(data.createdAt).toLocaleString('sr-RS')}? Trenutno stanje projekta će biti zamenjeno.`)) return;
  const restored = normalizeState(data.state);
  restored.savedByUser = true;
  restored.dirtySinceSave = false;
  localStorage.setItem(EXPLICIT_SAVE_KEY, JSON.stringify(restored));
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(restored));
  window.location.reload();
}

async function loadMaintenanceStatus(probe = false) {
  const report = $('#maintenanceReport');
  const badge = $('#maintenanceBadge');
  try {
    const response = await fetch(apiUrl(`/api/maintenance/diagnostics${probe ? '?probe=1' : ''}`), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Dijagnostika nije dostupna.');
    const missing = (data.files || []).filter(item => !item.ok).map(item => item.name);
    const lines = [
      `VERZIJA: ${data.version} • NODE: ${data.node} • PORT: ${data.port}`,
      data.system ? `RAČUNAR: ${data.system.platform}/${data.system.arch} • ${data.system.cpuCores || 0} CPU niti • RAM ${data.system.freeMemoryGb || 0}/${data.system.totalMemoryGb || 0} GB slobodno • server ${data.system.processMemoryMb || 0} MB` : '',
      `PROGRAMSKI FAJLOVI: ${missing.length ? `NEDOSTAJU: ${missing.join(', ')}` : 'ISPRAVNI'}`,
      `TAJNI MOST URL: ${data.bridgeTokenValid ? 'ISPRAVAN' : 'GREŠKA'}`,
      `PRIVREMENI MOST: ${data.tunnel?.message || data.tunnel?.stage || 'nema statusa'}`,
      `JAVNA ADRESA: ${data.publicUrl || 'još nije spremna'}`,
      `COMFYUI FOLDER: ${data.comfyUi?.configuredPath || 'nije izabran'}`,
      `COMFYUI STATUS: ${data.comfyUi?.status?.message || 'nije provereno'}`,
      `BACKUP KOPIJE: ${data.backups?.count || 0}${data.backups?.latest ? ` • poslednja ${new Date(data.backups.latest.createdAt).toLocaleString('sr-RS')}` : ''} • DNEVNI ARHIV: ${data.backups?.daily || 0} dana`,
      data.publicProbe ? `JAVNI TEST: ${data.publicProbe.ok ? 'RADI' : data.publicProbe.error || 'NIJE USPEO'}` : ''
    ].filter(Boolean);
    if (report) report.textContent = lines.join('\n');
    const ok = Boolean(data.ok && data.bridgeTokenValid && !missing.length);
    if (badge) { badge.textContent = ok ? 'OSNOVA ISPRAVNA' : 'POTREBNA POPRAVKA'; badge.classList.toggle('success', ok); }
    const folderInput = $('#comfyFolderPath');
    if (folderInput) folderInput.value = data.comfyUi?.configuredPath || '';
    const folderStatus = $('#comfyFolderStatus');
    if (folderStatus) folderStatus.textContent = data.comfyUi?.status?.message || (data.comfyUi?.configuredPath ? 'Folder je sačuvan.' : 'Izaberi ComfyUI_windows_portable folder.');
    return data;
  } catch (error) {
    if (report) report.textContent = `DIJAGNOSTIKA NIJE USPELA\n${error.message}`;
    if (badge) { badge.textContent = 'GREŠKA'; badge.classList.remove('success'); }
    throw error;
  }
}

async function chooseComfyFolder() {
  const button = $('#selectComfyFolderBtn');
  if (button) { button.disabled = true; button.textContent = 'Čekam izbor...'; }
  try {
    const response = await fetch(apiUrl('/api/comfyui/select-folder'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Folder nije sačuvan.');
    $('#comfyFolderPath').value = data.path;
    $('#comfyFolderStatus').textContent = data.message;
    showToast('ComfyUI folder je sačuvan.');
    setTimeout(() => loadMaintenanceStatus(false).catch(() => {}), 2500);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Izaberi folder'; }
  }
}

async function openBackupFolder() {
  const response = await fetch(apiUrl('/api/maintenance/open-backup-folder'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Backup folder nije otvoren.');
  showToast('Backup folder je otvoren u Windows Exploreru.');
}

function startAutomaticBackups() {
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  autoBackupTimer = setInterval(() => {
    if (state.songTitle || state.lyrics || state.scenes?.length) saveServerBackup(false).catch(error => console.warn('Automatski backup nije uspeo:', error));
  }, 5 * 60_000);
}

async function runSelfTests() {
  const button = $('#runSelfTestsBtn');
  button.disabled = true;
  const tests = [];
  const test = async (name, task, required = true) => {
    try {
      const detail = await task();
      tests.push({ name, ok: true, required, detail: detail || 'Radi' });
    } catch (error) {
      tests.push({ name, ok: false, required, detail: error.message || String(error) });
    }
  };
  try {
    await test('Glavni elementi interfejsa', () => {
      ['projectName', 'audioFile', 'lyrics', 'storyboardList', 'captionsList', 'mediaGallery', 'renderVideoBtn'].forEach(id => { if (!document.getElementById(id)) throw new Error(`Nedostaje #${id}`); });
    });
    await test('Svetli i tamni izgled', () => {
      const choices = [...document.querySelectorAll('[data-theme-choice]')];
      if (choices.length !== 3) throw new Error('Nedostaje izbor izgleda.');
      if (!document.documentElement.dataset.theme) throw new Error('Tema nije aktivirana.');
      if (!document.querySelector('link[href^="modern-theme.css"]')) throw new Error('Osnovna moderna tema nije učitana.');
      if (!document.querySelector('link[href^="editorial-theme.css"]')) throw new Error('Editorial tema nije učitana.');
      if (!window.MSS_SKINS?.includes('np-editorial')) throw new Error('Nedostaje NP Editorial skin.');
      return `Aktivan izgled: ${document.documentElement.dataset.theme}; skin: ${document.documentElement.dataset.skin}`;
    });
    await test('LocalStorage čuvanje', () => {
      const skey = `${SESSION_STORAGE_KEY}:test`; sessionStorage.setItem(skey, 'ok'); if (sessionStorage.getItem(skey) !== 'ok') throw new Error('Session upis nije pročitan.'); sessionStorage.removeItem(skey); const lkey = `${EXPLICIT_SAVE_KEY}:test`; localStorage.setItem(lkey, 'ok'); if (localStorage.getItem(lkey) !== 'ok') throw new Error('Sačuvani upis nije pročitan.'); localStorage.removeItem(lkey);
    });
    await test('Korak 1 — polja i validacija 15.4', () => {
      ['projectName','songTitle','artistName','format','sceneDuration','audioFile','audioDrop','clearAudioBtn','lyrics','validateStep1Btn','analyzeNowBtn','step1AuditCard','step1AuditBadge','step1Report'].forEach(id => { if (!document.getElementById(id)) throw new Error(`Nedostaje #${id}`); });
      if (typeof validateStep1 !== 'function' || typeof updateStep1Audit !== 'function' || typeof clearStep1Audio !== 'function') throw new Error('Nedostaju funkcije Koraka 1.');
      const parsed = parseLyrics('[Intro][Pop]\nPrvi pravi stih\nDrugi pravi stih\n[Refren]\nTreći pravi stih\nČetvrti pravi stih');
      if (parsed.length !== 4) throw new Error(`Parser stihova vraća ${parsed.length} umesto 4.`);
      if (STEP1_MAX_AUDIO_BYTES !== 500 * 1024 * 1024) throw new Error('Audio limit nije 500 MB.');
      return 'Polja, parser, audio limit i kontrolna tabla postoje';
    });
    await test('Lokalni server 15.4', async () => {
      const response = await fetch(apiUrl('/health'), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok || data.version !== '15.6') throw new Error(`Server vraća ${data.version || response.status}.`);
      return `Server ${data.version}`;
    });
    await test('Korak 3 kompaktni paketi', () => {
      if (typeof step3PackagePayload !== 'function' || typeof buildPlusBridgePrompt !== 'function' || typeof nextRound2Spec !== 'function') throw new Error('Nedostaju funkcije novog Koraka 3.');
      const payload = step3PackagePayload(state.selectedIdeaId ? nextRound2Spec() : null);
      const prompt = buildPlusBridgePrompt(payload);
      if (prompt.length > 24000) throw new Error(`Sledeći zahtev ima ${prompt.length} karaktera.`);
      return `${payload.phase}: ${(prompt.length / 1024).toFixed(1)} KB`;
    });
    await test('Serverski backup', async () => {
      const backup = await saveServerBackup(false);
      if (!backup?.fileName) throw new Error('Backup fajl nije napravljen.');
      const response = await fetch(apiUrl('/api/maintenance/restore-latest'), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.state?.projectId !== state.projectId) throw new Error('Poslednji backup nije vraćen pravilno.');
      return backup.fileName;
    });
    await test('Serverska dijagnostika', async () => {
      const data = await loadMaintenanceStatus(false);
      if (!data.ok || !data.bridgeTokenValid) throw new Error('Osnovna dijagnostika prijavljuje grešku.');
      return `${data.files.length} ključnih fajlova`;
    });
    await test('SHA-256 integritet paketa', async () => {
      const data = await checkProgramIntegrity(false);
      if (!data.ok) throw new Error(`${data.missing.length} nedostaje, ${data.mismatched.length} izmenjeno.`);
      return `${data.valid}/${data.checked} kontrolisanih fajlova`;
    });
    await test('Production readiness i storyboard QA', () => {
      if (typeof productionReadinessAudit !== 'function' || typeof storyboardQualityAudit !== 'function' || typeof createCmx3600Edl !== 'function') throw new Error('Nedostaju V15.4 QA funkcije.');
      const audit = productionReadinessAudit();
      if (!Number.isFinite(audit.score) || audit.score < 0 || audit.score > 100) throw new Error('Skor spremnosti nije ispravan.');
      return `Skor ${audit.score}/100`;
    });
    await test('GitHub moduli 15.4', async () => {
      if (!window.MSSGitHubModules || window.MSSGitHubModules.version !== '15.6') throw new Error('github-modules.js nije učitan.');
      const response = await fetch(apiUrl('/api/modules/status'), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok || data.version !== '15.6') throw new Error('Serverski modul status nije ispravan.');
      if (!data.hyperframes?.projectExporterReady || !data.sceneDetect?.browserFallback) throw new Error('HyperFrames izvoz ili LITE analiza referenci nisu spremni.');
      return `HyperFrames izvoz + analiza referenci + ${Object.keys(data.providers || {}).length} provider konektora`;
    });
    await test('IndexedDB fajlovi', async () => {
      const id = `selftest:${uuid()}`; await putAsset(id, new Blob(['test'], { type: 'text/plain' })); const blob = await getAsset(id); await deleteAsset(id); if (!blob || await blob.text() !== 'test') throw new Error('Test fajl nije vraćen.');
    });
    await test('Web Audio API', () => { if (!(window.AudioContext || window.webkitAudioContext)) throw new Error('Pregledač nema AudioContext.'); });
    await test('Canvas video tok', () => { const canvas = document.createElement('canvas'); if (typeof canvas.captureStream !== 'function') throw new Error('captureStream nije podržan.'); });
    await test('MediaRecorder', () => { if (!window.MediaRecorder) throw new Error('MediaRecorder nije podržan.'); return selectMimeType() || 'Pregledač bira podrazumevani format'; });
    await test('JSON analiza ChatGPT rezultata', () => { const value = extractJson('```json\n{"test":true}\n```'); if (!value.test) throw new Error('JSON nije izvučen.'); });
    await test('Srpski SRT titlovi', () => { const backup = state.captions.items; state.captions.items = [{ id: uuid(), start: 0, end: 2.5, text: 'Nedostaješ mi' }]; const text = subtitleFile('srt'); state.captions.items = backup; if (!text.includes('Nedostaješ mi') || !text.includes('00:00:02,500')) throw new Error('SRT izvoz nije ispravan.'); });
    await test('Dvojezični SRT', () => { const oldItems=state.captions.items,oldTr=state.captions.translation.items; const id=uuid(); state.captions.items=[{id,start:0,end:2,text:'Nedostaješ mi'}];state.captions.translation.items=[{id,start:0,end:2,text:'I miss you'}];const out=translatedSubtitleFile('srt',true);state.captions.items=oldItems;state.captions.translation.items=oldTr;if(!out.includes('Nedostaješ mi')||!out.includes('I miss you'))throw new Error('Dvojezični izvoz nije ispravan.'); });
    await test('Caption preset sistem', () => { if(Object.keys(CAPTION_PRESETS).length<6)throw new Error('Nedostaju caption preseti.'); return `${Object.keys(CAPTION_PRESETS).length} preseta`; });
    await test('Video preview elementi', () => { ['captionMonitorFrame','captionMonitorVideo','captionOriginalOverlay','captionTranslationOverlay','captionPreviewSeek'].forEach(id=>{if(!document.getElementById(id))throw new Error(`Nedostaje #${id}`);}); });
    await test('Tekst-u-video alati', async () => {
      const controls = ['textToolsImportLrcBtn','textToolsExportLrcBtn','textToolsImportSrtBtn','textToolsQualityBtn','textToolsNormalizeBtn','textToolsSplitBtn','textToolsSafeAreaBtn','textToolsBeatScenesBtn','textToolsBatchPlanBtn','textToolsReport'];
      controls.forEach(id => { if (!document.getElementById(id)) throw new Error(`Nedostaje #${id}`); });
      ['importLrcIntoCaptions','importSrtIntoTextTools','exportLrcFromTextTools','qualityCheckTextTools','normalizeTextToolsCaptions','splitLongTextToolsCaptions','showTextToolsSafeArea','buildTextToolsBeatScenes','buildTextToolsBatchPlan'].forEach(name => { if (typeof window[name] !== 'function') throw new Error(`Nedostaje funkcija ${name}.`); });
      const response = await fetch(apiUrl('/api/text-tools/features'), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok || !Array.isArray(data.features) || data.features.length < 11) throw new Error('Text-u-video rute nisu kompletne.');
      return `${data.features.length} funkcija povezano sa interfejsom`;
    });
    await test('Proračun scena', () => { const bounds = buildSceneBoundaries(30, 5, Array(300).fill(0).map((_, i) => Math.abs(Math.sin(i / 9)))); if (bounds[0] !== 0 || bounds.at(-1) !== 30 || bounds.length < 4) throw new Error('Granice scena nisu ispravne.'); return `${bounds.length - 1} probnih scena`; });
    await test('Oznake pesme nisu stihovi', () => { const parsed = parseLyrics('[Intro][Pop][Ballad][Male]\nPravi prvi stih\n[Refren]\nDrugi stih'); if (parsed.length !== 2 || parsed[0].text !== 'Pravi prvi stih' || parsed[0].section.toLowerCase() !== 'intro') throw new Error('Metapodaci su pogrešno tretirani kao stih.'); return 'Višestruke [oznake] su uklonjene'; });
    await test('Baza jedinstvenih koncepata', () => { if (LOCAL_IDEA_BLUEPRINTS.length < 20) throw new Error('Nema dovoljno različitih vizuelnih svetova.'); const titles = new Set(LOCAL_IDEA_BLUEPRINTS.map(item => item.title)); if (titles.size !== LOCAL_IDEA_BLUEPRINTS.length) throw new Error('Postoje dupli koncepti.'); return `${titles.size} različitih baza za ideje`; });
    await test('Zaključani ID u detaljnom image promptu', () => { const sample={number:1,section:'Refren',lyric:'Nedostaješ mi kada grad utihne',emotion:'čežnja',description:'ona završava konkretnu radnju i donosi vidljivu odluku',microMovement:'prsti zastanu, pogled se spusti, disanje ostane kontrolisano',location:'realističan zatvoren prostor',timeWeather:'noć',lighting:'motivisano hladno svetlo',shot:'medium shot',lens:'50mm',camera:'slow push-in',composition:'rule of thirds',foreground:'realan predmet blizu kamere',midground:'glavna radnja',background:'logičan nastavak lokacije',wardrobe:'moderna i primerena sceni',continuityNotes:'isti identitet',visualSignature:'self-test-unique',imagePrompt:'',videoPrompt:''}; const prompt=makeImagePrompt(sample); if (!prompt.startsWith(LOCKED_GIRL_BLOCK)) throw new Error('Zaključani ID nije na početku.'); if (prompt.length < LOCKED_GIRL_BLOCK.length + 1500) throw new Error('Opis scene nije dovoljno detaljan.'); if (!prompt.includes('GLAVNA VIDLJIVA RADNJA') || !prompt.includes('JEDINSTVENI VIZUELNI POTPIS')) throw new Error('Nedostaju detaljni tehnički podaci scene.'); return `${prompt.length} karaktera`; });
    await test('Detaljan video prompt', () => { const sample={number:1,duration:5,lyric:'Nedostaješ mi',emotion:'čežnja',description:'ona spušta predmet i donosi vidljivu odluku',microMovement:'prsti zastanu i ramena se blago opuste',location:'realističan enterijer',timeWeather:'noć',lighting:'hladno praktično svetlo',camera:'slow push-in',lens:'50mm',foreground:'predmet u prednjem planu',background:'isti prostor',wardrobe:'moderna odeća',continuityNotes:'isto lice i garderoba',transitionIn:'jasna radnja od prvog kadra',transitionOut:'vidljiva posledica',videoPrompt:''}; const prompt=makeVideoPrompt(sample); for (const label of ['START FRAME','PRIMARY ACTION','MICRO-ACTIONS','CAMERA MOVEMENT','ENVIRONMENTAL MOTION','FINAL FRAME','NEGATIVE VIDEO RULES']) if (!prompt.includes(label)) throw new Error(`Nedostaje ${label}`); return `${prompt.length} karaktera`; });
    await test('Tačne dimenzije, kvalitet i 4K render', () => { const vertical=imageOutputSpecification('9:16'),horizontal=imageOutputSpecification('16:9'),square=imageOutputSpecification('1:1'); if(!vertical.master.includes('2160×3840')||!horizontal.master.includes('3840×2160')||!square.master.includes('2048×2048'))throw new Error('Nedostaju tačne finalne dimenzije.'); if(!document.querySelector('#renderResolution option[value="2160"]'))throw new Error('Nedostaje 4K opcija rendera.'); if(!document.querySelector('#imageMaxSize option[value="4096"]'))throw new Error('Nedostaje 4096 px izvorna slika.'); return '9:16 2160×3840, 16:9 3840×2160, 1:1 2048×2048'; });
    await test('Lokacije su vezane za stih', () => { if(!lyricStemMatches('Na stanici čuvam kartu','stanic'))throw new Error('Stanica nije prepoznata.'); if(lyricStemMatches('Na stanici čuvam kartu','stan'))throw new Error('Stanica je pogrešno prepoznata kao stan.'); const phone=lyricLocationMatches('Gledam telefon, poruke nema'); if(!phone.some(rule=>rule.reason.includes('komunikaciju')))throw new Error('Telefon nije povezan sa komunikacijom.'); return 'stanica ≠ stan; telefon → komunikacija'; });
    await test('ChatGPT Plus browser most 15.6', async () => { ['sendStep3ToPlusBtn','testPlusBridgeBtn','plusBridgeStatus','plusPrivateGptUrl','pollPlusResultBtn','step3PreflightBtn','downloadStep3DiagnosticsBtn','cancelPlusBridgeBtn','resetStep3WorkflowBtn'].forEach(id=>{if(!document.getElementById(id))throw new Error(`Nedostaje #${id}`);}); const response=await fetch(apiUrl('/api/plus-bridge/status'),{cache:'no-store'});const data=await response.json();if(!response.ok||data.version!=='15.6')throw new Error('Plus most server ne vraća verziju 15.6.'); if(data.extensionInstalled && !data.extensionCompatible) throw new Error(`Pogrešna verzija dodatka: ${data.extensionVersion}.`); return data.extensionCompatible?'Dodatak 15.6 je kompatibilan':'Most API radi; dodatak 15.6 se instalira samo prvi put'; });
    await test('YouTube javna i privatna analiza', () => { ['runYoutubeTrendScanBtn','analyzeYoutubeRetentionBtn','youtubeChannelSelect'].forEach(id=>{if(!document.getElementById(id))throw new Error(`Nedostaje #${id}`);}); if(typeof runYoutubeTrendScan!=='function'||typeof analyzeYoutubeRetentionVideo!=='function')throw new Error('Nedostaju YouTube analize.'); return 'javni trendovi + retention povezanih kanala'; });
    await test('Automatski ceo pipeline postoji', () => { if (typeof runAutomaticProduction !== 'function' || typeof generateAllImages !== 'function' || typeof generateAllI2V !== 'function' || typeof renderVideo !== 'function') throw new Error('Nedostaje korak automatske izrade.'); return 'ideje → slike → AI klipovi → ceo spot → 3 Shorts'; });
    await test('Statički fajl servera', async () => {
      if (!['http:', 'https:'].includes(location.protocol)) return 'Preskočeno van objavljenog sajta';
      const response = await fetch(new URL('index.html', location.href), { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return `HTTP ${response.status}`;
    });
    TOOL_REGISTRY.filter(tool => !tool.dynamic).forEach(tool => tests.push({ name: tool.name, ok: toolLoaded(tool), required: false, detail: toolLoaded(tool) ? 'Biblioteka je učitana' : 'CDN nije dostupan; postoji rezervna funkcija' }));
  } finally {
    const required = tests.filter(item => item.required);
    const passed = required.filter(item => item.ok).length;
    const optionalLoaded = tests.filter(item => !item.required && item.ok).length;
    $('#selfTestReport').innerHTML = `<div class="test-summary ${passed === required.length ? 'ok' : 'bad'}"><strong>${passed}/${required.length} osnovnih testova prolazi</strong><span>${optionalLoaded} dodatnih biblioteka trenutno dostupno</span></div>${tests.map(item => `<div class="test-line ${item.ok ? 'ok' : item.required ? 'bad' : 'warn'}"><span>${item.ok ? '✓' : item.required ? '✕' : '!'}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.detail)}</small></div>`).join('')}`;
    $('#toolsBadge').textContent = passed === required.length ? 'Osnovni program radi' : `${required.length - passed} osnovnih grešaka`;
    button.disabled = false;
    renderToolStatus();
  }
}

function handleRenderFailure(error) {
  console.error(error);
  $('#renderVideoBtn').disabled = false;
  $('#cancelRenderBtn').disabled = true;
  $('#renderStatus').textContent = `Render nije uspeo: ${error.message}`;
  renderSession = null;
  showToast(`Render nije uspeo: ${error.message}`);
}



// ─────────────────────────────────────────────────────────────────────────────
// V12 — OFFICIAL PRIVATE CUSTOM GPT ACTION BRIDGE + YOUTUBE TREND ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────
let gptBridgePollTimer = null;
let tunnelStatusPollTimer = null;
let tunnelStatusPollDeadline = 0;
let gptBridgeImporting = false;
let gptBridgeContinuing = false;

function ensureV12RuntimeState() {
  const defaults = createInitialState();
  state.chatgptBridge = { ...defaults.chatgptBridge, ...(state.chatgptBridge || {}) };
  state.youtubeTrends = { ...defaults.youtubeTrends, ...(state.youtubeTrends || {}) };
  state.schemaVersion = '15.4';
}

function tunnelStageLabel(stage) {
  const labels = {
    idle: 'Čeka ručno pokretanje',
    initializing: 'Pokretanje privremenog mosta',
    'checking-local-server': 'Provera lokalnog servera',
    'downloading-cloudflared': 'Preuzimanje cloudflared-a',
    'manual-file-bridge-ready': 'Ručni ChatGPT Plus paket je spreman',
    'starting-cloudflare-quick-tunnel': 'Pokretanje Cloudflare Quick Tunnel-a',
    'testing-public-url': 'Provera privremene javne adrese',
    ready: 'Privremena adresa je spremna',
    error: 'Greška privremenog mosta'
  };
  return labels[stage] || stage || 'Nepoznat status';
}

function renderCloudflareTunnelSetup() {
  ensureV12RuntimeState();
  const bridge = state.chatgptBridge || {};
  const settings = bridge.tunnelSettings || {};
  const tunnel = settings.status || bridge.tunnelStatus || {};
  const badge = $('#cloudflareTunnelBadge');
  const status = $('#cloudflareTunnelStatus');
  const help = $('#cloudflareTunnelHelp');
  const updatedAt = $('#tunnelUpdatedAt');
  const diagnostics = $('#tunnelDiagnosticDetails');
  const restartButton = $('#restartCloudflareBtn');

  const publicUrl = settings.publicUrl || tunnel.publicUrl || bridge.publicUrl || '';
  const stage = tunnel.stage || (publicUrl ? 'ready' : 'idle');
  const isWorking = !['idle', 'ready', 'error'].includes(stage);
  const hasError = Boolean(tunnel.error || stage === 'error');
  const time = tunnel.updatedAt || settings.updatedAt || '';

  if (updatedAt) {
    const parsed = time ? new Date(time) : null;
    updatedAt.value = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString('sr-RS') : 'Nema podataka';
  }
  if (restartButton) {
    restartButton.classList.toggle('is-working', isWorking);
    restartButton.textContent = isWorking ? '1. ČEKAM POTVRDU...' : (publicUrl && stage === 'ready' ? '1. MOST JE AKTIVAN ✓' : '1. POKRENI CLOUDFLARE QUICK TUNNEL');
  }
  if (badge) {
    badge.classList.toggle('ok', Boolean(publicUrl && stage === 'ready'));
    badge.textContent = publicUrl && stage === 'ready'
      ? 'PRIVREMENA ADRESA RADI'
      : hasError
        ? 'GREŠKA MOSTA'
        : isWorking
          ? tunnelStageLabel(stage).toUpperCase()
          : 'POKRETANJE...';
  }
  if (status) status.value = publicUrl && stage === 'ready'
    ? publicUrl
    : (tunnel.message || tunnelStageLabel(stage));
  if (help) help.textContent = publicUrl && stage === 'ready'
    ? 'Privremena adresa radi. Sada uradi samo korak 2 i korak 3.'
    : hasError
      ? (tunnel.error || tunnel.message || 'Privremeni most nije pokrenut. Klikni POKRENI CLOUDFLARE QUICK TUNNEL.')
      : `${tunnelStageLabel(stage)}. Status se automatski osvežava; ekran nije blokiran.`;

  if (diagnostics) {
    const lines = [
      `KORAK: ${tunnelStageLabel(stage)}`,
      `PORUKA: ${tunnel.message || bridge.status || 'Nema nove poruke.'}`,
      `JAVNA ADRESA: ${publicUrl || 'još nije dobijena'}`
    ];
    if (tunnel.error) lines.push(`GREŠKA: ${tunnel.error}`);
    if (tunnel.details) lines.push(`DETALJI: ${tunnel.details}`);
    if (tunnel.actionUrl) lines.push(`OTVORI ZA NASTAVAK: ${tunnel.actionUrl}`);
    diagnostics.textContent = lines.join('\n');
    diagnostics.classList.toggle('ok', Boolean(publicUrl && stage === 'ready'));
    diagnostics.classList.toggle('error', hasError);
  }
}

async function loadCloudflareTunnelStatus() {
  try {
    const response = await fetch(apiUrl('/api/tunnel/settings'), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Status javne veze nije dostupan.');
    state.chatgptBridge.tunnelSettings = data;
    state.chatgptBridge.tunnelStatus = data.status || {};
    state.chatgptBridge.tunnelProvider = data.activeProvider || data.status?.provider || 'cloudflare-quick-tunnel';
    state.chatgptBridge.publicUrl = data.publicUrl || data.status?.publicUrl || '';
    renderCloudflareTunnelSetup();
    return data;
  } catch (error) {
    state.chatgptBridge.tunnelSettings = { error: error.message, status: { stage: 'error', error: error.message, message: error.message } };
    state.chatgptBridge.tunnelStatus = state.chatgptBridge.tunnelSettings.status;
    renderCloudflareTunnelSetup();
    return null;
  }
}

function stopTunnelStatusPolling() {
  if (tunnelStatusPollTimer) clearInterval(tunnelStatusPollTimer);
  tunnelStatusPollTimer = null;
  tunnelStatusPollDeadline = 0;
}

function startTunnelStatusPolling(durationMs = 12 * 60_000) {
  stopTunnelStatusPolling();
  tunnelStatusPollDeadline = Date.now() + durationMs;
  const tick = async () => {
    const setup = await loadChatGptActionSetup(false).catch(() => null);
    const stage = state.chatgptBridge?.tunnelSettings?.status?.stage || state.chatgptBridge?.tunnelStatus?.stage || '';
    if (setup?.publicUrl && stage === 'ready') {
      stopTunnelStatusPolling();
      showToast('PRIVREMENA HTTPS VEZA JE SPREMNA.');
      return;
    }
    if (stage === 'error' || Date.now() >= tunnelStatusPollDeadline) stopTunnelStatusPolling();
  };
  tick();
  tunnelStatusPollTimer = setInterval(tick, 2000);
}

async function restartCloudflareTunnel() {
  const button = $('#restartCloudflareBtn');
  if (button) button.disabled = true;
  try {
    state.chatgptBridge.publicUrl = '';
    state.chatgptBridge.schemaUrl = '';
    renderGptActionSetup('Pokrećem privremeni Cloudflare Quick Tunnel...');
    const response = await fetch(apiUrl('/api/tunnel/restart'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Javna veza nije ponovo pokrenuta.');
    showToast(data.message || 'Privremeni most se pokreće.');
    await loadChatGptActionSetup(false);
    startTunnelStatusPolling();
  } catch (error) {
    showToast(`Javna veza nije pokrenuta: ${error.message}`);
    await loadCloudflareTunnelStatus();
  } finally {
    if (button) button.disabled = false;
  }
}

async function testTunnelConnection() {
  const button = $('#testTunnelBtn');
  const diagnostics = $('#tunnelDiagnosticDetails');
  if (button) button.disabled = true;
  try {
    const response = await fetch(apiUrl('/api/tunnel/test'), { method: 'POST', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Javna veza nije dostupna.');
    if (diagnostics) {
      diagnostics.textContent = `VEZA RADI\nJAVNA ADRESA: ${data.publicUrl}\nHTTP: ${data.status || 200}\nPrivatni GPT može da pristupi programu dok je Studio uključen.`;
      diagnostics.classList.add('ok');
      diagnostics.classList.remove('error');
    }
    showToast('Stalna HTTPS veza radi.');
  } catch (error) {
    if (diagnostics) {
      diagnostics.textContent = `TEST JAVNE VEZE NIJE USPEO\n${error.message}`;
      diagnostics.classList.add('error');
      diagnostics.classList.remove('ok');
    }
    showToast(`Javna veza ne radi: ${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}


function updateProjectFormatUi() {
  const format = $('#format')?.value || state.format || '16:9';
  $$('[data-project-format]').forEach(button => button.classList.toggle('active', button.dataset.projectFormat === format));
  const help = $('#projectFormatHelp');
  if (help) help.textContent = format === '16:9'
    ? 'Dugi YouTube spot će biti horizontalan 16:9.'
    : format === '9:16'
      ? 'Ceo spot i Shorts će biti vertikalni 9:16 dok ne izabereš 16:9.'
      : 'Projekat će biti kvadratan 1:1.';
}
function selectProjectFormat(format) {
  if (!['16:9','9:16','1:1'].includes(format)) return;
  const select = $('#format');
  if (select) select.value = format;
  state.format = format;
  if (state.captions?.preview && !state.captions.preview.sceneId) state.captions.preview.format = format;
  persistState(false, false);
  updateProjectFormatUi();
  updateMediaRatio();
  updateLyricsStats();
  updateStep1Audit();
  showToast(format === '16:9' ? 'Izabran je dugi YouTube video 16:9.' : `Izabran je format ${format}.`);
}
function renderGptActionSetup(message = '') {
  ensureV12RuntimeState();
  const bridge = state.chatgptBridge;
  if ($('#gptActionPublicUrl')) $('#gptActionPublicUrl').value = bridge.publicUrl || '';
  if ($('#gptActionSchemaUrl')) $('#gptActionSchemaUrl').value = bridge.schemaUrl || '';
  if ($('#gptActionInstructions')) $('#gptActionInstructions').value = bridge.instructions || '';
  if ($('#privateGptUrl')) $('#privateGptUrl').value = bridge.privateGptUrl || '';
  if ($('#imageGenerationEngine')) $('#imageGenerationEngine').value = bridge.imageEngine || 'manual-chatgpt';
  if ($('#autoContinueAfterGptImages')) $('#autoContinueAfterGptImages').checked = bridge.autoContinue !== false;

  const ready = Boolean(bridge.schemaUrl);
  const fullyConfigured = Boolean(ready);
  const tunnelChanged = Boolean(fullyConfigured && bridge.configuredActionPublicUrl && bridge.publicUrl && bridge.configuredActionPublicUrl !== bridge.publicUrl);
  renderCloudflareTunnelSetup();
  bridge.configured = fullyConfigured && !tunnelChanged;

  const badge = $('#gptActionSetupBadge');
  if (badge) {
    badge.textContent = tunnelChanged
      ? 'ADRESA JE PROMENJENA — OSVEŽI ACTION'
      : fullyConfigured
        ? 'POVEZANO'
        : ready
          ? 'MOST JE SPREMAN — DODAJ GPT LINK'
          : 'JAVNA VEZA NIJE SPREMNA';
    badge.classList.toggle('ok', fullyConfigured && !tunnelChanged);
  }
  const status = $('#gptActionSetupStatus');
  if (status) status.textContent = message || (tunnelChanged
    ? 'Privremena Cloudflare adresa se razlikuje od one sačuvane u GPT-u. Ovo se dešava samo ako je promenjen Cloudflare Quick Tunnel nalog, naziv računara ili tailnet. Ponovo uvezi prikazani OpenAPI URL.'
    : bridge.status) || (fullyConfigured
      ? 'Privatni GPT Action je podešen. Sinhronizuj projekat, otvori svoj GPT i pošalji START.'
      : ready
        ? 'Most radi. Sada klikni korak 2, pa korak 3.'
        : 'Privremena Cloudflare veza se proverava. Tačan status vidiš iznad.');
  updateChatGptBridgeStatus(message);
}

async function loadChatGptActionSetup(showMessage = false) {
  ensureV12RuntimeState();
  try {
    const response = await fetch(apiUrl('/api/bridge/setup'), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Most nije dostupan.');
    const privateGptUrl = state.chatgptBridge.privateGptUrl || '';
    const configuredActionPublicUrl = state.chatgptBridge.configuredActionPublicUrl || '';
    state.chatgptBridge = {
      ...state.chatgptBridge,
      ...data,
      privateGptUrl,
      configuredActionPublicUrl,
      configured: Boolean(data.schemaUrl),
      status: data.schemaUrl
        ? 'Privremeni GPT most je spreman. Nema Action ključa.'
        : (data.warning || 'Privremena Cloudflare veza još nije spremna.')
    };
    await loadCloudflareTunnelStatus();
    persistState(false, false);
    renderGptActionSetup(showMessage ? state.chatgptBridge.status : '');
    return { ...data, tunnelStatus: state.chatgptBridge.tunnelStatus };
  } catch (error) {
    state.chatgptBridge.status = `Most nije spreman: ${error.message}`;
    renderGptActionSetup();
    if (showMessage) showToast(state.chatgptBridge.status);
    return null;
  }
}

function savePrivateGptUrl() {
  ensureV12RuntimeState();
  const value = String($('#privateGptUrl')?.value || '').trim();
  if (value && !/^https:\/\/chatgpt\.com\/(g|gpts)\//i.test(value)) {
    showToast('Nalepi pravi link privatnog GPT-a koji počinje sa https://chatgpt.com/g/...');
    return false;
  }
  state.chatgptBridge.privateGptUrl = value;
  state.chatgptBridge.configuredActionPublicUrl = value ? (state.chatgptBridge.publicUrl || '') : '';
  state.chatgptBridge.configured = Boolean(state.chatgptBridge.schemaUrl);
  persistState(false, false);
  renderGptActionSetup(value ? 'Link privatnog GPT-a je sačuvan.' : 'Link GPT-a je obrisan.');
  return true;
}

function bridgeProjectPayload() {
  collectFormState();
  ensureLockedGirlEverywhere();
  const idea = selectedCreativeIdea();
  return {
    schemaVersion: '15.4', projectId: state.projectId, name: state.name, songTitle: state.songTitle,
    artistName: state.artistName, format: state.format, lyrics: state.lyrics, genre: state.genre, mood: state.mood,
    audio: {
      duration: state.audio.duration, sampleRate: state.audio.sampleRate, channels: state.audio.channels,
      bpmEstimate: state.audio.bpmEstimate, confirmedBpm: state.audio.confirmedBpm,
      averageEnergy: state.audio.averageEnergy, energyCurve: state.audio.energyCurve
    },
    lockedGirlIdentity: LOCKED_GIRL_BLOCK,
    lyricsFingerprint: currentSongFingerprint(), research: state.research || null, ideaResearch: state.ideaResearch || null,
    creativeIdeas: state.creativeIdeas || [], selectedIdeaId: state.selectedIdeaId || '', selectedIdea: idea,
    concept: state.concept,
    scenes: state.scenes.map(scene => ({
      id: scene.id, number: scene.number, start: scene.start, end: scene.end, duration: scene.duration,
      section: scene.section, lyric: scene.lyric, emotion: scene.emotion, sceneTitle: scene.sceneTitle,
      lyricMeaning: scene.lyricMeaning, location: scene.location, locationReason: scene.locationReason,
      imagePrompt: scene.imagePrompt || makeImagePrompt(scene), videoPrompt: scene.videoPrompt || makeVideoPrompt(scene),
      output: imageOutputSpecification(state.format), imageReady: Boolean(state.imageAssetIds[scene.id]),
      failed: scene.t2i?.status === 'error' && scene.t2i?.source === 'chatgpt-plus-action'
    })),
    rules: [
      'Pre generisanja ideja koristi Web search i lokalni research iz projekta; navedi najmanje 3 proverljiva izvora sa URL adresama.',
      'Ne kopiraj pronađene spotove. Koristi samo apstraktne principe i uradi novelty audit protiv svih 10 ideja i istorije projekata.',
      'Analiziraj ceo tekst i njegov redosled, ne samo opštu emociju.',
      'Lokacije moraju imati jasno napisanu vezu sa konkretnim stihom ili narativnim lukom. Bez nasumičnih filmskih prostora.',
      'Svaka ideja i scena moraju biti različite po radnji, lokaciji, objektu, objektivu, kompoziciji i svetlu.',
      'Zaključani ID devojke mora ostati doslovno nepromenjen na početku svakog prompta.',
      'Svaka slika je jedan kadar, bez kolaža, teksta, titlova, logoa i vidljivog watermarka.',
      'Generiši tačno jednu sliku po action zadatku i odmah je vrati uploadSceneImage akcijom.'
    ]
  };
}

async function syncProjectToChatGptBridge(showMessage = true) {
  ensureV12RuntimeState();
  const setup = state.chatgptBridge.schemaUrl ? state.chatgptBridge : await loadChatGptActionSetup(false);
  // NAPOMENA (v15.6.0): ovo je STARIJI, opcioni GPT Actions/Cloudflare tok za sinhronizaciju slika.
  // Glavni ChatGPT tok (Korak 3, koncept/storyboard) ga NE koristi i NE zahteva Cloudflare — vidi
  // browser-extension bridge u v14-features.js / bridge-prompts.js. Cloudflare tunel ostaje samo
  // opcija za ko izričito želi GPT Actions sinhronizaciju slika, ne obavezan korak.
  if (!setup?.schemaUrl && !state.chatgptBridge.schemaUrl) throw new Error('Opcioni GPT Actions most za slike nije povezan. Ovo NIJE potrebno za Korak 3 (koncept/storyboard preko ChatGPT dodatka). Ako želiš baš ovu (opcionu) sinhronizaciju slika preko GPT Actions, otvori odeljak „Poveži privatni GPT — samo 3 koraka“ i klikni 1. POKRENI CLOUDFLARE QUICK TUNNEL.');
  const response = await fetch(apiUrl('/api/bridge/sync'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bridgeProjectPayload())
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Sinhronizacija nije uspela.');
  state.chatgptBridge.lastSync = new Date().toISOString();
  state.chatgptBridge.status = `Projekat je sinhronizovan: ${data.sceneCount} scena, ${data.ready} već ima sliku.`;
  persistState(false, false);
  renderGptActionSetup(state.chatgptBridge.status);
  if (showMessage) showToast(state.chatgptBridge.status);
  return data;
}

async function openPrivateGptAndCopyStart(mode = 'images') {
  ensureV12RuntimeState();
  const targetUrl = state.chatgptBridge.privateGptUrl || 'https://chatgpt.com/gpts';
  const command = mode === 'ideas'
    ? 'START — prvo pozovi getStudioProject. Pregledaj localResearch, zatim OBAVEZNO koristi Web search za najmanje 3 aktuelna izvora, uključujući YouTube kada je dostupan. Ne kopiraj spotove. Uradi novelty audit svih 10 ideja i prethodne istorije, pa pozovi saveTenCreativeIdeas sa kompletnim research objektom.'
    : 'START — preuzimaj scene redom, generiši svaku sliku bez skraćivanja prompta i odmah je vraćaj programu. Nastavi do complete=true.';
  await copyText(command, 'Komanda START je kopirana. Nalepi je u otvoreni privatni GPT.');
  window.open(targetUrl, '_blank', 'noopener');
  if (!state.chatgptBridge.privateGptUrl) renderGptActionSetup('Otvorena je lista tvojih GPT-ova. Izaberi Muzički Spot Studio AI i nalepi START. Link možeš kasnije sačuvati za direktno otvaranje.');
  return true;
}


async function syncAndOpenPrivateGpt() {
  ensureV12RuntimeState();
  if (!savePrivateGptUrl()) return false;
  await syncProjectToChatGptBridge(false);
  await openPrivateGptAndCopyStart(state.selectedIdeaId ? 'images' : 'ideas');
  return true;
}

async function requestTenIdeasFromChatGpt(options = {}) {
  collectFormState();
  const parsed = parseLyrics(state.lyrics);
  if (!parsed.length) {
    showToast('Nalepi pravi tekst pesme. Oznake [Intro][Pop] same nisu tekst.');
    showPanel('project');
    return false;
  }
  if (options.forceResearch || !researchIsCurrent()) await runRealtimeResearch(true);
  if (!researchIsCurrent()) throw new Error('Real-time internet i YouTube analiza nije važeća za ovu pesmu.');
  state.creativeIdeas = [];
  state.selectedIdeaId = '';
  state.scenes = [];
  state.imageAssetIds = {};
  state.videoAssetIds = {};
  state.ideaGenerationSource = 'live-research-gpt';
  state.ideaSourceFingerprint = currentSongFingerprint();
  state.ideaResearch = null;
  state.chatgptBridge.waitingForIdeas = true;
  persistState(false, false);
  renderResearchPanel(); renderIdeas();
  $('#ideasImportStatus').textContent = 'Internet i YouTube analiza je završena. Privatni GPT sada mora da otvori izvore, proveri tekst i vrati tačno 10 novih ideja.';
  await syncProjectToChatGptBridge(false);
  await openPrivateGptAndCopyStart('ideas');
  startGptBridgePolling();
  showToast('Istraživanje je završeno. Privatni GPT je otvoren — nalepi kopiranu START komandu.');
  return true;
}

async function importBridgeImageUpdate(update) {
  if (!update.sceneId || state.imageAssetIds[update.sceneId]) return false;
  const scene = state.scenes.find(item => item.id === update.sceneId);
  if (!scene) return false;
  const response = await fetch(apiUrl(update.imageUrl), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Slika scene ${scene.number} nije preuzeta sa lokalnog mosta.`);
  const blob = await response.blob();
  await saveImportedChatGptBlob(scene, blob);
  scene.t2i = { ...(scene.t2i || {}), status: 'done', progress: 100, error: '', source: 'chatgpt-plus-action', generatedAt: new Date().toISOString(), filename: update.fileName || '' };
  persistState(false, false);
  return true;
}

async function pollChatGptBridgeUpdates(showMessage = false) {
  ensureV12RuntimeState();
  if (gptBridgeImporting) return;
  gptBridgeImporting = true;
  try {
    const query = new URLSearchParams({ after: String(state.chatgptBridge.updateSeq || 0), projectId: state.projectId });
    const response = await fetch(apiUrl(`/api/bridge/updates?${query}`), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Provera mosta nije uspela.');
    for (const update of data.items || []) {
      if (update.type === 'ideas-ready' && Array.isArray(update.ideas) && update.ideas.length === 10) {
        state.creativeIdeas = update.ideas.map((idea, index) => normalizeCreativeIdea(idea, index));
        state.selectedIdeaId = '';
        state.ideaResearch = update.research || null;
        state.ideaGenerationSource = 'live-research-gpt';
        state.ideaSourceFingerprint = currentSongFingerprint();
        state.chatgptBridge.waitingForIdeas = false;
        $('#ideasImportStatus').textContent = 'ChatGPT Plus je vratio 10 ideja. Izaberi jednu; tek tada se pravi storyboard.';
        renderResearchPanel();
        renderIdeas();
        showPanel('concept');
        showToast('ChatGPT Plus je vratio svih 10 ideja u program.');
      } else if (update.type === 'image-ready') {
        const imported = await importBridgeImageUpdate(update);
        if (imported) showToast(`ChatGPT slika scene ${update.sceneNumber} je automatski uvezena.`);
      } else if (update.type === 'image-failed') {
        const scene = state.scenes.find(item => item.id === update.sceneId);
        if (scene) scene.t2i = { ...(scene.t2i || {}), status: 'error', error: update.reason || 'ChatGPT generisanje nije uspelo.', source: 'chatgpt-plus-action' };
      }
    }
    state.chatgptBridge.updateSeq = Number(data.seq || state.chatgptBridge.updateSeq || 0);
    state.chatgptBridge.lastPoll = new Date().toISOString();
    const ready = state.scenes.filter(scene => state.imageAssetIds[scene.id]).length;
    const total = state.scenes.length;
    if ($('#chatGptImageProgress')) $('#chatGptImageProgress').style.width = `${total ? Math.round(ready / total * 100) : 0}%`;
    updateChatGptBridgeStatus(total ? `ChatGPT Plus slike: ${ready}/${total}. Program proverava nove slike automatski.` : state.chatgptBridge.status);
    persistState(false, false);
    if (total && ready === total && state.chatgptBridge.waitingForImages && state.chatgptBridge.autoContinue !== false && !gptBridgeContinuing) {
      state.chatgptBridge.waitingForImages = false;
      persistState(false, false);
      continueAfterGptImages().catch(handleAutomaticProductionFailure);
    }
    if (showMessage && !(data.items || []).length) showToast('Nema novih ChatGPT slika u ovom trenutku.');
  } catch (error) {
    if (showMessage) showToast(`Most nije osvežen: ${error.message}`);
  } finally {
    gptBridgeImporting = false;
  }
}

function startGptBridgePolling() {
  if (gptBridgePollTimer) clearInterval(gptBridgePollTimer);
  pollChatGptBridgeUpdates(false);
  gptBridgePollTimer = setInterval(() => pollChatGptBridgeUpdates(false), 4000);
}

function updateChatGptBridgeStatus(message = '') {
  ensureV12RuntimeState();
  const bridge = state.chatgptBridge;
  const ready = state.scenes.filter(scene => state.imageAssetIds[scene.id]).length;
  const total = state.scenes.length;
  const connected = Boolean(bridge.schemaUrl);
  const badge = $('#chatGptBridgeBadge');
  if (badge) {
    badge.textContent = connected ? `Most radi • ${ready}/${total || 0}` : 'Most nije spreman';
    badge.classList.toggle('ok', connected);
  }
  if ($('#chatGptHostStatus')) $('#chatGptHostStatus').value = connected ? 'Privatni GPT Action most je spreman' : 'Čeka HTTPS tunel';
  if ($('#chatGptBridgeStatus')) $('#chatGptBridgeStatus').textContent = message || bridge.status || (connected
    ? 'Sinhronizuj scene, otvori privatni GPT i nalepi START. Slike se vraćaju automatski.'
    : 'U kartici Koncept i stil završi jednokratno podešavanje privatnog GPT Action-a.');
  if ($('#chatGptImageProgress')) $('#chatGptImageProgress').style.width = `${total ? Math.round(ready / total * 100) : 0}%`;
}

async function renderCompleteVideoPackage() {
  updateAutomaticStatus('Proveravamo Wan image-to-video...', 52);
  if (!(await testComfyConnection(false))) throw new Error('Wan image-to-video modeli nisu spremni. Instaliraj/pokreni ComfyUI i Wan; slike su sačuvane i neće se izgubiti.');
  updateAutomaticStatus('Pravimo AI video-klip za svaku sliku...', 58);
  const videoResult = await generateAllI2V({ skipConfirm: true, retries: 2 });
  if (videoResult.failed.length) throw new Error(`Nisu generisani AI klipovi scena: ${videoResult.failed.map(item => item.scene).join(', ')}. Ponovni klik nastavlja nedostajuće.`);
  const outputs = [];
  const scopes = ['full', 'short-1', 'short-2', 'short-3'];
  for (let index = 0; index < scopes.length; index += 1) {
    const scope = scopes[index];
    state.settings.renderScope = scope;
    if ($('#renderScope')) $('#renderScope').value = scope;
    persistState(false, false);
    updateAutomaticStatus(`Renderujemo ${scope === 'full' ? 'ceo spot' : `Shorts ${index}`} (${index + 1}/4)...`, 72 + index * 6);
    const result = await renderVideo();
    if (!result || result.stopped) throw new Error(`Render ${scope} nije završen.`);
    outputs.push(result);
  }
  updateAutomaticStatus('Pakujemo ceo spot i tri hook Shorts videa...', 97);
  if (window.JSZip) {
    const zip = new window.JSZip();
    outputs.forEach(result => zip.file(result.fileName, result.blob));
    zip.file('SHORTS-PLAN.json', JSON.stringify(state.youtube.shorts, null, 2));
    zip.file('YOUTUBE-PAKET.txt', `NASLOV:\n${state.youtube.title}\n\nOPIS:\n${state.youtube.description}\n\nHASHTAGOVI:\n${state.youtube.hashtags}\n\nPINOVANA PORUKA:\n${state.youtube.pinned}`);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    downloadBlob(blob, `${safeFileName(state.songTitle || state.name)}-CEO-SPOT-I-3-SHORTS.zip`);
  } else outputs.forEach(result => downloadBlob(result.blob, result.fileName));
  state.settings.renderScope = 'full';
  if ($('#renderScope')) $('#renderScope').value = 'full';
  updateAutomaticStatus('ZAVRŠENO: ceo spot i tri hook Shorts videa su napravljeni.', 100);
  showToast('Kompletan video paket je završen.');
}

async function continueAfterGptImages() {
  if (gptBridgeContinuing) return;
  gptBridgeContinuing = true;
  try {
    const missing = state.scenes.filter(scene => !state.imageAssetIds[scene.id]);
    if (missing.length) throw new Error(`Još nedostaje ${missing.length} ChatGPT slika.`);
    await renderCompleteVideoPackage();
  } finally { gptBridgeContinuing = false; }
}

async function runAutomaticProduction() {
  ensureV12RuntimeState();
  collectFormState();
  const engine = $('#imageGenerationEngine')?.value || state.chatgptBridge.imageEngine || 'manual-chatgpt';
  state.chatgptBridge.imageEngine = engine;
  state.chatgptBridge.autoContinue = $('#autoContinueAfterGptImages')?.checked !== false;
  persistState(false, false);
  if (!selectedCreativeIdea()) {
    if (!state.creativeIdeas.length && engine === 'chatgpt-actions') {
      updateAutomaticStatus('Šaljemo pesmu privatnom ChatGPT Plus-u da napravi 10 ideja...', 4);
      await requestTenIdeasFromChatGpt();
      return;
    }
    if (!state.creativeIdeas.length && engine === 'manual-chatgpt') {
      showPanel('concept');
      updateAutomaticStatus('Korak 3 čeka ChatGPT Plus JSON: pokreni istraživanje, preuzmi paket, učitaj ga u privatni GPT i uvezi vraćeni JSON.', 5);
      showToast('Nema dodatnog plaćanja: koristi KORAK 3 paket u svom ChatGPT Plus nalogu.');
      return;
    }
    if (!state.creativeIdeas.length) generateTenIdeasLocally(false);
    showPanel('concept');
    updateAutomaticStatus('Izaberi jednu od 10 ideja, pa ponovo klikni „NASTAVI AUTOMATSKU IZRADU“.', 5);
    showToast('Automatska izrada čeka tvoj izbor jedne ideje.');
    return;
  }
  if (engine === 'manual-chatgpt') {
    if (!state.scenes.length) {
      showPanel('concept');
      updateAutomaticStatus('Izabrana ideja postoji, ali storyboard nije uvezen. Ponovo preuzmi KORAK 3 paket, obradi ga u ChatGPT Plus-u i uvezi JSON.', 12);
      showToast('Uvezi ChatGPT Plus JSON sa storyboardom pre nastavka.');
      return;
    }
    if (state.settings.burnCaptions && !state.captions.items.length) generateCaptionsFromLyrics(false);
    makeSmartShortsPlan(false);
    showPanel('media');
    updateAutomaticStatus('Storyboard je spreman. Napravi slike u ChatGPT Plus-u, dodaj ih scenama u Koraku 8, zatim pokreni proxy ili finalni render.', 35);
    showToast('Sledeće: dodaj ChatGPT slike scenama u Koraku 8.');
    return;
  }
  if (engine !== 'chatgpt-actions') return runAutomaticProductionLocalLegacy();
  const button = $('#continueAutoPipelineBtn');
  if (button) button.disabled = true;
  try {
    updateAutomaticStatus('1/6 Pravimo detaljan storyboard koji prati svaki stih...', 10);
    if (!state.scenes.length) {
      if (!buildStoryboard()) throw new Error('Storyboard nije napravljen.');
    } else {
      state.scenes.forEach((scene, index) => enrichLocalScene(scene, index, { text: scene.lyric, section: scene.section }, scene.emotion, state.scenes.length));
      generateAllPrompts(false);
      renderStoryboard();
    }
    if (state.settings.burnCaptions && !state.captions.items.length) generateCaptionsFromLyrics(false);
    makeSmartShortsPlan(false);
    updateAutomaticStatus('2/6 Sinhronizujemo sve detaljne promptove sa privatnim GPT-om...', 22);
    await syncProjectToChatGptBridge(false);
    const missing = state.scenes.filter(scene => !state.imageAssetIds[scene.id]);
    if (missing.length) {
      state.chatgptBridge.waitingForImages = true;
      state.chatgptBridge.status = `Čeka se ${missing.length} slika iz privatnog GPT-a.`;
      persistState(false, false);
      updateAutomaticStatus(`3/6 Čeka se ${missing.length} ChatGPT Plus slika. GPT ih vraća jednu po jednu, program ih automatski uvozi.`, 30);
      startGptBridgePolling();
      await openPrivateGptAndCopyStart('images');
      showToast('Privatni GPT je otvoren. Nalepi START; program će nastaviti kada sve slike stignu.');
      return;
    }
    await renderCompleteVideoPackage();
  } finally { if (button) button.disabled = false; }
}

async function saveYoutubeDataApiKey() {
  const apiKey = String($('#youtubeDataApiKey')?.value || '').trim();
  if (!apiKey) throw new Error('Unesi YouTube Data API ključ.');
  const response = await fetch(apiUrl('/api/youtube/data-key'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ključ nije sačuvan.');
  state.youtubeTrends.apiKeySaved = true;
  if ($('#youtubeDataApiKey')) $('#youtubeDataApiKey').value = '';
  persistState(false, false);
  showToast('YouTube Data API ključ je DPAPI zaštićen i uklonjen iz polja.');
}

function renderYoutubeTrendReport(data = null) {
  const container = $('#youtubeTrendReport');
  if (!container) return;
  const source = data || { videos: state.youtubeTrends.results || [], recommendations: state.youtubeTrends.recommendations || [], analyzedAt: state.youtubeTrends.analyzedAt };
  const videos = source.videos || [];
  if (!videos.length) { container.innerHTML = 'Javna analiza još nije pokrenuta.'; return; }
  container.innerHTML = `
    <h4>Najbrže rastući javni rezultati za upit „${escapeHtml(source.query || state.youtubeTrends.query || '')}“</h4>
    <div class="trend-video-list">${videos.slice(0, 15).map((video, index) => `<article class="trend-video-item">
      <strong>${index + 1}. ${escapeHtml(video.title)}</strong><span>${escapeHtml(video.channelTitle)}</span>
      <small>${Number(video.views || 0).toLocaleString('sr-RS')} pregleda • ${Number(video.viewsPerDay || 0).toLocaleString('sr-RS')} pregleda/dan • ${Math.round(Number(video.duration || 0))} s • javni engagement ${Number(video.engagementRate || 0).toFixed(2)}%</small>
      <a href="https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}" target="_blank" rel="noopener">Otvori video</a>
    </article>`).join('')}</div>
    <h4>Zaključci koje program može opravdano da koristi</h4>
    <ul>${(source.recommendations || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    <p class="mini-status">Analizirano: ${source.analyzedAt ? new Date(source.analyzedAt).toLocaleString('sr-RS') : '—'}. Tuđi CTR i retention se ne izmišljaju.</p>`;
}

async function runYoutubeTrendScan() {
  const query = String($('#youtubeTrendQuery')?.value || `${state.genre || 'tužna ljubavna pesma'} ${state.mood || ''} official music video`).trim();
  const payload = {
    apiKey: String($('#youtubeDataApiKey')?.value || '').trim(), query,
    region: $('#youtubeTrendRegion')?.value || 'RS', language: $('#youtubeTrendLanguage')?.value || 'sr',
    days: Number($('#youtubeTrendDays')?.value || 90), maxResults: Number($('#youtubeTrendMax')?.value || 25)
  };
  $('#youtubeTrendReport').textContent = 'Program preuzima najnovije dostupne javne podatke sa YouTube-a...';
  const response = await fetch(apiUrl('/api/youtube/trends'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'YouTube javna analiza nije uspela.');
  state.youtubeTrends = { ...state.youtubeTrends, query, region: payload.region, language: payload.language, days: payload.days, results: data.videos || [], recommendations: data.recommendations || [], analyzedAt: data.analyzedAt || new Date().toISOString() };
  persistState(false, false);
  renderYoutubeTrendReport(data);
  if ($('#youtubeTrendBadge')) { $('#youtubeTrendBadge').textContent = `${data.videos?.length || 0} videa`; $('#youtubeTrendBadge').classList.add('ok'); }
  showToast('Analiza sličnih YouTube spotova je završena.');
}

function renderYoutubeRetentionReport(data = null) {
  const container = $('#youtubeRetentionReport');
  if (!container) return;
  const points = data?.points || state.youtubeTrends.retentionPoints || [];
  if (!points.length) { container.textContent = 'Retention još nije analiziran.'; return; }
  const topDrops = data?.biggestDropPoints || [];
  const first = points.find(point => Number(point.elapsedVideoTimeRatio) >= .01) || points[0];
  const at10 = points.find(point => Number(point.elapsedVideoTimeRatio) >= .1) || points[Math.min(9, points.length - 1)];
  const at50 = points.find(point => Number(point.elapsedVideoTimeRatio) >= .5) || points[Math.floor(points.length / 2)];
  container.innerHTML = `<h4>Retention kriva — ${escapeHtml(data?.videoId || state.youtubeTrends.retentionVideoId || '')}</h4>
    <div class="metric-grid"><article><span>Početak</span><strong>${(Number(first?.audienceWatchRatio || 0) * 100).toFixed(1)}%</strong></article><article><span>10% videa</span><strong>${(Number(at10?.audienceWatchRatio || 0) * 100).toFixed(1)}%</strong></article><article><span>50% videa</span><strong>${(Number(at50?.audienceWatchRatio || 0) * 100).toFixed(1)}%</strong></article></div>
    <div class="retention-bars">${points.filter((_, i) => i % 5 === 0).map(point => `<div title="${Math.round(Number(point.elapsedVideoTimeRatio) * 100)}% videa: ${(Number(point.audienceWatchRatio) * 100).toFixed(1)}%" style="height:${Math.max(2, Math.min(100, Number(point.audienceWatchRatio || 0) * 70))}%"></div>`).join('')}</div>
    <h4>Najveće tačke odustajanja</h4><ul>${topDrops.map(point => `<li>Oko ${Math.round(Number(point.ratio) * 100)}% videa — proveri kadar, tekst, promenu scene i muzički prelaz na toj tački.</li>`).join('')}</ul>`;
}

async function analyzeYoutubeRetentionVideo() {
  const channelId = state.activeYoutubeChannelId || $('#youtubeChannelSelect')?.value;
  const videoId = String($('#youtubeRetentionVideoId')?.value || '').trim();
  if (!channelId) throw new Error('Izaberi povezani YouTube kanal.');
  if (!videoId) throw new Error('Unesi Video ID sa svog kanala.');
  $('#youtubeRetentionReport').textContent = 'Preuzimam privatnu retention krivu sa tvog kanala...';
  const response = await fetch(apiUrl('/api/youtube/retention'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId, videoId, days: Number($('#youtubeRetentionDays')?.value || 365) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Retention analiza nije uspela.');
  state.youtubeTrends.retentionVideoId = videoId;
  state.youtubeTrends.retentionPoints = data.points || [];
  persistState(false, false);
  renderYoutubeRetentionReport(data);
  showToast('Retention kriva je analizirana.');
}

function bindEvents() {
  $$('#tabs button').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.tab)));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.go)));
  ['projectName', 'songTitle', 'artistName', 'format', 'manualBpm', 'manualGenre', 'manualMood', 'step3Genre', 'step3Mood', 'centralSymbol', 'openingHook', 'conceptEnding', 'conceptTitle', 'conceptStory', 'visualStyle', 'colorPalette', 'cameraStyle', 'locations', 'youtubeTitle', 'youtubeDescription', 'youtubeHashtags', 'youtubePinned'].forEach(id => {
    $(`#${id}`)?.addEventListener('change', () => { persistState(false); if (['projectName','songTitle','artistName','format'].includes(id)) updateStep1Audit(); });
  });
  ['projectName','songTitle','artistName'].forEach(id => $(`#${id}`)?.addEventListener('input', () => { collectFormState(); persistState(false, false); updateStep1Audit(); }));
  $('#lyrics').addEventListener('input', () => { updateLyricsStats(); state.lyrics = $('#lyrics').value; persistState(false, false); updateStep1Audit(); });
  $('#sceneDuration').addEventListener('input', () => { $('#sceneDurationOut').value = `${Number($('#sceneDuration').value).toFixed(1)} s`; collectFormState(); persistState(false, false); updateLyricsStats(); updateStep1Audit(); });

  const drop = $('#audioDrop');
  drop.addEventListener('click', () => $('#audioFile').click());
  drop.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') $('#audioFile').click(); });
  ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', event => { handleAudioFile(event.dataTransfer.files?.[0]).catch(error => showToast(error.message)); });
  $('#audioFile').addEventListener('change', event => { handleAudioFile(event.target.files?.[0]).catch(error => showToast(error.message)); });
  $('#clearAudioBtn')?.addEventListener('click', () => clearStep1Audio().catch(error => showToast(error.message)));
  $('#validateStep1Btn')?.addEventListener('click', () => { const report = updateStep1Audit({ autoFillProjectName: true }); if (report.ok) showToast('Korak 1 je kompletan i ispravan.'); else showToast(report.errors[0] || 'Korak 1 nije kompletan.'); });

  $('#analyzeNowBtn').addEventListener('click', async () => {
    try {
      collectFormState();
      const report = updateStep1Audit({ autoFillProjectName: true });
      if (!report.ok) { showToast(report.errors[0] || 'Korak 1 nije kompletan.'); return; }
      state.name = report.projectName || report.songTitle;
      persistState(false, false);
      if (!state.audio.analyzedAt) await analyzeAudio();
      showPanel('audio');
      showToast('Korak 1 je potvrđen. Otvorena je detaljna analiza zvuka.');
    } catch (error) {
      showPanel('project');
      updateStep1Audit();
      showToast(error.message || 'Audio analiza nije uspela.');
    }
  });
  $('#reanalyzeBtn').addEventListener('click', () => analyzeAudio().catch(error => showToast(error.message)));
  $('#buildStoryboardBtn').addEventListener('click', () => { buildStoryboard(); showPanel('storyboard'); });
  $('#regenerateStoryboardBtn').addEventListener('click', buildStoryboard);
  $('#generatePromptsBtn').addEventListener('click', () => { generateAllPrompts(); renderStoryboard(); });
  $('#copyAllPromptsBtn').addEventListener('click', () => copyText(state.scenes.map(scene => `SCENA ${scene.number} (${secondsToClock(scene.start)}–${secondsToClock(scene.end)})\n${scene.imagePrompt}`).join('\n\n'), 'Svi promptovi su kopirani.'));

  $('#addCharacterBtn').addEventListener('click', () => openCharacterDialog());
  $('#addDefaultManBtn').addEventListener('click', () => addDefaultCharacter(DEFAULT_MAN));
  $('#characterForm').addEventListener('submit', saveCharacterFromDialog);
  $('#cancelCharacterBtn').addEventListener('click', () => $('#characterDialog').close());

  $('#researchAndIdeasBtn')?.addEventListener('click', startResearchAndIdeas);
  $('#refreshResearchBtn')?.addEventListener('click', () => runRealtimeResearch(true).catch(error => showToast(error.message)));
  $('#generateTenIdeasLocalBtn')?.addEventListener('click', () => generateTenIdeasLocally(true));
  $('#continueAutoPipelineBtn')?.addEventListener('click', () => {
    if (!state.selectedIdeaId) return showToast('Najpre uvezi 10 ideja i izaberi jednu.');
    if (typeof fillStep3FromIdea === 'function') fillStep3FromIdea();
    if (typeof window.startPlusBridgeRound === 'function') {
      window.startPlusBridgeRound({ skipResearch:true }).catch(error => showToast(error.message));
      const status = $('#automaticPipelineStatus');
      if (status) status.textContent = 'KRUG 2 je pripremljen. Otvaram tvoj privatni GPT preko lokalnog ChatGPT Plus mosta.';
      return;
    }
    if (typeof exportStep3Package !== 'function') return showToast('Korak 3 modul nije učitan. Osveži program.');
    exportStep3Package();
  });
  $('#copyChatGptRequest').addEventListener('click', () => copyText(buildChatGptRequest(), 'Zahtev za ChatGPT je kopiran. Nalepi ga u ovaj razgovor.'));
  $('#copyTenIdeasRequestBtn').addEventListener('click', () => copyText(buildTenIdeasRequest(), 'Zahtev za 10 ideja je kopiran. Nalepi ga u ovaj ChatGPT razgovor.'));
  $('#downloadTenIdeasRequestBtn').addEventListener('click', () => downloadBlob(new Blob([buildTenIdeasRequest()], { type: 'text/plain;charset=utf-8' }), `${safeFileName(state.songTitle || state.name)}-10-IDEJA.txt`));
  $('#importTenIdeasBtn').addEventListener('click', importTenIdeas);
  $('#clearTenIdeasBtn').addEventListener('click', async () => { try { await fetch('/api/plus-bridge/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ reason:'Ideje su obrisane' }) }); } catch {} state.creativeIdeas = []; state.selectedIdeaId = ''; state.ideaSourceFingerprint=''; state.ideaGenerationSource=''; state.ideaResearch=null; if (state.advanced?.step3) { state.advanced.step3.completedRound = 0; state.advanced.step3.plusJobId=''; state.advanced.step3.round2=null; } $('#ideasJsonInput').value = ''; persistState(false, false); renderResearchPanel(); renderIdeas(); if (typeof updateStep3Completeness === 'function') updateStep3Completeness(); });
  $('#copyChatGptRequestTop').addEventListener('click', () => copyText(buildChatGptRequest(), 'Zahtev za ChatGPT je kopiran.'));
  $('#downloadChatGptRequest').addEventListener('click', () => downloadBlob(new Blob([buildChatGptRequest()], { type: 'text/plain;charset=utf-8' }), `${safeFileName(state.name)}-ZAHTEV-ZA-CHATGPT.txt`));
  $('#importAiJsonBtn').addEventListener('click', importAiResult);
  $('#clearAiJsonBtn').addEventListener('click', () => { $('#aiJsonInput').value = ''; $('#aiImportStatus').textContent = ''; });

  $('#makeShortsPlanBtn').addEventListener('click', makeBasicShortsPlan);
  $('#copyYoutubePackageBtn').addEventListener('click', () => {
    collectFormState();
    copyText(`NASLOV:\n${state.youtube.title}\n\nOPIS:\n${state.youtube.description}\n\nHASHTAGOVI:\n${state.youtube.hashtags}\n\nPINOVANA PORUKA:\n${state.youtube.pinned}\n\nSHORTS:\n${JSON.stringify(state.youtube.shorts, null, 2)}`, 'YouTube paket je kopiran.');
  });

  ['imageMaxSize', 'autoSmartCrop', 'autoPalette', 'renderResolution', 'renderFps', 'transitionDuration', 'renderScope', 'motionPreset', 'burnCaptions', 'preferAiClips', 'captionsEnabled', 'captionSource', 'captionLanguage', 'captionPosition', 'captionStyle', 'captionWordsPerLine', 'captionUppercase', 'comfyEndpoint', 'i2vFps', 'i2vMaxSeconds', 'i2vSteps', 'i2vCfg', 'useGeneratedClips', 'i2vModel', 'i2vTextEncoder', 'i2vVae', 'i2vClipVision', 'i2vNegativePrompt', 't2iMode', 't2iCheckpoint', 't2iSteps', 't2iCfg', 't2iInstantIdModel', 't2iControlNet', 't2iProvider', 'autoI2vAfterImage', 'allowPlaceholderScenes', 'captionFontFamily', 'captionTextColor', 'captionHighlightColor', 'captionStrokeColor', 'captionBoxColor', 'captionAnimation', 'captionDisplayMode', 'captionTargetLanguage', 'captionAlign', 'captionPreset', 'captionAutoFit', 'captionTitleEnabled', 'captionTitleText', 'captionTitleDuration', 'captionCtaEnabled', 'captionCtaText', 'captionCtaDuration', 'captionPreviewFormat', 'captionSafeZonePlatform', 'captionShowSafeZones'].forEach(id => {
    $(`#${id}`)?.addEventListener('change', () => persistState(false));
  });
  $('#advancedAudioBtn').addEventListener('click', () => runMeydaAnalysis(true));
  $('#preciseBpmBtn').addEventListener('click', () => runPreciseBpmAnalysis(true));
  $('#wavePlayBtn').addEventListener('click', () => waveSurfer?.playPause?.());
  $('#waveZoom').addEventListener('input', event => waveSurfer?.zoom?.(Number(event.target.value)));
  $('#motionStrength').addEventListener('input', event => { $('#motionStrengthOut').value = `${event.target.value}%`; state.settings.motionStrength = Number(event.target.value); persistState(false, false); });
  $('#captionFontSize').addEventListener('input', event => { $('#captionFontSizeOut').value = `${Number(event.target.value).toFixed(1)}%`; state.captions.style.fontSize = Number(event.target.value); persistState(false, false); renderCaptionPreview(); });
  $('#captionStrokeWidth').addEventListener('input', event => { $('#captionStrokeWidthOut').value=event.target.value; state.captions.style.strokeWidth=Number(event.target.value);persistState(false,false);renderCaptionPreview(); });
  $('#captionBoxOpacity').addEventListener('input', event => { $('#captionBoxOpacityOut').value=`${event.target.value}%`; state.captions.style.boxOpacity=Number(event.target.value);persistState(false,false);renderCaptionPreview(); });
  $('#captionMaxWidth').addEventListener('input', event => { $('#captionMaxWidthOut').value=`${event.target.value}%`; state.captions.style.maxWidth=Number(event.target.value);persistState(false,false);renderCaptionPreview(); });
  $('#captionLineHeight').addEventListener('input', event => { $('#captionLineHeightOut').value=`${event.target.value}%`; state.captions.style.lineHeight=Number(event.target.value);persistState(false,false);renderCaptionPreview(); });
  $('#captionVerticalOffset').addEventListener('input', event => { $('#captionVerticalOffsetOut').value=`${event.target.value}%`; state.captions.style.verticalOffset=Number(event.target.value);persistState(false,false);renderCaptionPreview(); });
  ['captionPosition','captionAlign','captionStyle','captionWordsPerLine','captionUppercase','captionAutoFit','captionFontFamily','captionTextColor','captionHighlightColor','captionStrokeColor','captionBoxColor','captionAnimation','captionDisplayMode','captionTargetLanguage','captionPreviewFormat','captionSafeZonePlatform','captionShowSafeZones','captionTitleEnabled','captionTitleText','captionTitleDuration','captionCtaEnabled','captionCtaText','captionCtaDuration'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{collectFormState();persistState(false,false);renderCaptionPreview();}));
  $('#captionPreset')?.addEventListener('change',event=>{if(event.target.value!=='custom')applyCaptionPreset(event.target.value);});
  $('#generateLyricsCaptionsBtn').addEventListener('click', generateCaptionsFromLyrics);
  $('#whisperCaptionsBtn').addEventListener('click', transcribeWithWhisper);
  $('#exportSrtBtn').addEventListener('click', () => exportSubtitles('srt'));
  $('#exportVttBtn').addEventListener('click', () => exportSubtitles('vtt'));
  $('#importSubtitleBtn').addEventListener('click', () => $('#subtitleImportFile').click());
  $('#subtitleImportFile').addEventListener('change', event => importSubtitleFile(event.target.files?.[0]));
  $('#clearCaptionsBtn').addEventListener('click', () => { state.captions.items = []; state.captions.translation.items = []; state.captions.translation.text = ''; state.captions.status = ''; persistState(false, false); renderCaptions(); showToast('Titlovi su obrisani.'); });
  $('#translateCaptionsBtn')?.addEventListener('click', translateCaptionsInBrowser);
  $('#applyTranslationLinesBtn')?.addEventListener('click', applyManualTranslationLines);
  $('#clearTranslationBtn')?.addEventListener('click', clearCaptionTranslation);
  $('#applyCaptionDictionaryBtn')?.addEventListener('click', applyDictionaryToAllCaptions);
  $('#saveCaptionBrandPresetBtn')?.addEventListener('click', saveCaptionBrandPreset);
  $('#applyCaptionBrandPresetBtn')?.addEventListener('click', applyCaptionBrandPreset);
  $('#deleteCaptionBrandPresetBtn')?.addEventListener('click', deleteCaptionBrandPreset);
  $('#exportTranslatedSrtBtn')?.addEventListener('click', () => exportTranslatedSubtitles(false));
  $('#exportBilingualSrtBtn')?.addEventListener('click', () => exportTranslatedSubtitles(true));
  $('#textToolsImportLrcBtn')?.addEventListener('click', () => $('#textToolsLrcFile')?.click());
  $('#textToolsLrcFile')?.addEventListener('change', event => { importLrcIntoCaptions(event.target.files?.[0]); event.target.value = ''; });
  $('#textToolsExportLrcBtn')?.addEventListener('click', exportLrcFromTextTools);
  $('#textToolsImportSrtBtn')?.addEventListener('click', () => $('#textToolsSrtFile')?.click());
  $('#textToolsSrtFile')?.addEventListener('change', event => { importSrtIntoTextTools(event.target.files?.[0]); event.target.value = ''; });
  $('#textToolsQualityBtn')?.addEventListener('click', qualityCheckTextTools);
  $('#textToolsNormalizeBtn')?.addEventListener('click', normalizeTextToolsCaptions);
  $('#textToolsSplitBtn')?.addEventListener('click', splitLongTextToolsCaptions);
  $('#textToolsSafeAreaBtn')?.addEventListener('click', showTextToolsSafeArea);
  $('#textToolsBeatScenesBtn')?.addEventListener('click', buildTextToolsBeatScenes);
  $('#textToolsBatchPlanBtn')?.addEventListener('click', buildTextToolsBatchPlan);
  $('#loadCaptionPreviewVideoBtn')?.addEventListener('click', () => $('#captionPreviewVideoFile').click());
  $('#captionPreviewVideoFile')?.addEventListener('change', event => { loadCaptionPreviewVideoFile(event.target.files?.[0]); event.target.value=''; });
  $('#useLastRenderPreviewBtn')?.addEventListener('click', useLastRenderForCaptionPreview);
  $('#useScenePreviewBtn')?.addEventListener('click', () => useSceneForCaptionPreview().catch(error=>showToast(error.message)));
  $('#useDemoPreviewBtn')?.addEventListener('click', useDemoCaptionPreview);
  $('#captionPreviewPlayBtn')?.addEventListener('click', toggleCaptionPreviewPlayback);
  $('#captionPreviewSeek')?.addEventListener('input', event => seekCaptionPreview(event.target.value));
  $('#captionPreviewScene')?.addEventListener('change', () => {collectFormState();persistState(false,false);useSceneForCaptionPreview().catch(()=>{});});
  $('#captionMonitorVideo')?.addEventListener('timeupdate', updateLiveCaptionMonitor);
  $('#captionMonitorVideo')?.addEventListener('play', updateLiveCaptionMonitor);
  $('#captionMonitorVideo')?.addEventListener('pause', updateLiveCaptionMonitor);
  $('#captionMonitorVideo')?.addEventListener('loadedmetadata', updateLiveCaptionMonitor);

  $('#exportCsvBtn').addEventListener('click', exportStoryboardCsv);
  $('#importCsvBtn').addEventListener('click', () => $('#storyboardCsvFile').click());
  $('#storyboardCsvFile').addEventListener('change', event => importStoryboardCsv(event.target.files?.[0]));
  $('#smartCropAllBtn').addEventListener('click', smartCropAllImages);
  $('#analyzePalettesBtn').addEventListener('click', analyzeAllPalettes);
  $('#convertMp4Btn').addEventListener('click', convertLastRenderToMp4);
  $('#analyzeProductionBtn')?.addEventListener('click', () => renderProductionAudit(true));
  $('#autoFixStoryboardBtn')?.addEventListener('click', autoFixStoryboardQuality);
  $('#exportProductionManifestBtn')?.addEventListener('click', exportProductionManifest);
  $('#exportEdlBtn')?.addEventListener('click', exportCmx3600Edl);
  $('#exportAudioMarkersBtn')?.addEventListener('click', exportAudioMarkersCsv);
  $('#checkIntegrityBtn')?.addEventListener('click', () => checkProgramIntegrity(true).catch(() => {}));
  $('#backupNowBtn')?.addEventListener('click', () => saveServerBackup(true).catch(error => showToast(error.message)));
  $('#restoreLatestBackupBtn')?.addEventListener('click', () => restoreLatestServerBackup().catch(error => showToast(error.message)));
  $('#openBackupFolderBtn')?.addEventListener('click', () => openBackupFolder().catch(error => showToast(error.message)));
  $('#refreshMaintenanceBtn')?.addEventListener('click', () => loadMaintenanceStatus(true).catch(error => showToast(error.message)));
  $('#selectComfyFolderBtn')?.addEventListener('click', () => chooseComfyFolder().catch(error => showToast(error.message)));
  $('#runSelfTestsBtn').addEventListener('click', runSelfTests);
  $('#refreshToolsBtn').addEventListener('click', renderToolStatus);
  $('#copyLockedGirlIdentityBtn')?.addEventListener('click', () => copyText(LOCKED_GIRL_BLOCK, 'Kompletan zaključani ID devojke je kopiran.'));
  $('#verifyLockedGirlIdentityBtn')?.addEventListener('click', () => {
    const allScenes = state.scenes || [];
    const bad = allScenes.filter(scene => !String(scene.imagePrompt || '').startsWith(LOCKED_GIRL_BLOCK) || !String(scene.videoPrompt || '').startsWith(LOCKED_GIRL_BLOCK));
    if (bad.length) {
      ensureLockedGirlEverywhere(); persistState(false, false); renderStoryboard();
      showToast(`Puni ID je vraćen u ${bad.length} scena.`);
    } else showToast(`Puni ID je ispravan u svih ${allScenes.length} scena.`);
  });
  $('#lockedGirlReferenceFile').addEventListener('change', event => handleLockedGirlReference(event.target.files?.[0]));
  $('#generateLockedGirlReferenceBtn').addEventListener('click', generateLockedGirlReference);
  $('#testT2iBtn').addEventListener('click', () => testT2iConnection(true));
  $$('[data-project-format]').forEach(button => button.addEventListener('click', () => selectProjectFormat(button.dataset.projectFormat)));
  $('#format')?.addEventListener('change', () => { state.format = $('#format').value; updateProjectFormatUi(); persistState(false, false); updateMediaRatio(); });
  $('#copySchemaGuideBtn')?.addEventListener('click', () => copyText($('#gptActionSchemaUrl')?.value || state.chatgptBridge?.schemaUrl || '', 'OpenAPI URL je kopiran. U Actions ostavi Authentication: None, klikni Import from URL i nalepi.'));
  $('#copyInstructionsGuideBtn')?.addEventListener('click', async () => {
    const text = $('#gptActionInstructions')?.value || state.chatgptBridge?.instructions || '';
    const copied = await copyText(text, 'Instrukcije su kopirane. U GPT editoru ih nalepi u veliko polje Instructions.');
    if (copied) window.open(state.chatgptBridge?.gptEditorUrl || 'https://chatgpt.com/gpts/editor', '_blank', 'noopener');
  });
  $('#restartCloudflareBtn')?.addEventListener('click', restartCloudflareTunnel);
  $('#testTunnelBtn')?.addEventListener('click', testTunnelConnection);
  $('#savePrivateGptUrlBtn')?.addEventListener('click', savePrivateGptUrl);
  $('#privateGptUrl')?.addEventListener('change', savePrivateGptUrl);
  $('#syncAndOpenGptBtn')?.addEventListener('click', () => syncAndOpenPrivateGpt().catch(error => showToast(`GPT nije otvoren: ${error.message}`)));
  $('#syncImagesToGptBtn')?.addEventListener('click', () => syncProjectToChatGptBridge(true).catch(error => showToast(`Sinhronizacija scena nije uspela: ${error.message}`)));
  $('#openGptImageQueueBtn')?.addEventListener('click', () => { state.chatgptBridge.waitingForImages = true; persistState(false,false); startGptBridgePolling(); openPrivateGptAndCopyStart('images').catch(error => showToast(error.message)); });
  $('#refreshGptImagesBtn')?.addEventListener('click', () => pollChatGptBridgeUpdates(true));
  $('#imageGenerationEngine')?.addEventListener('change', event => { state.chatgptBridge.imageEngine = event.target.value; persistState(false,false); });
  $('#autoContinueAfterGptImages')?.addEventListener('change', event => { state.chatgptBridge.autoContinue = event.target.checked; persistState(false,false); });
  $('#copyChatGptImagePackBtn').addEventListener('click', () => copyText(buildChatGptImagePack(), 'Paket promptova za ChatGPT Images je kopiran.'));
  $('#downloadChatGptImagePackBtn').addEventListener('click', () => downloadBlob(new Blob([buildChatGptImagePack()], { type: 'text/plain;charset=utf-8' }), `${safeFileName(state.songTitle || state.name)}-PROMPTOVI-ZA-CHATGPT-IMAGES.txt`));
  $('#generateAllImagesBtn').addEventListener('click', generateAllImages);
  $('#stopT2iBtn').addEventListener('click', stopT2i);
  $('#saveYoutubeOAuthBtn').addEventListener('click', saveYoutubeOAuthConfig);
  $('#connectYoutubeBtn').addEventListener('click', connectYoutubeChannel);
  $('#refreshYoutubeChannelsBtn').addEventListener('click', refreshYoutubeChannels);
  $('#analyzeYoutubeChannelBtn').addEventListener('click', analyzeYoutubeChannel);
  $('#disconnectYoutubeBtn').addEventListener('click', disconnectYoutubeChannel);
  $('#youtubeChannelSelect').addEventListener('change', event => {state.activeYoutubeChannelId=event.target.value;persistState(false,false);renderYoutubeChannels();const data=state.youtubeAnalysis[state.activeYoutubeChannelId];if(data)renderYoutubeAnalysis(data);});
  $('#importYoutubeCsvBtn').addEventListener('click',()=>$('#youtubeCsvFile').click());
  $('#youtubeCsvFile').addEventListener('change',event=>importYoutubeStudioCsv(event.target.files?.[0]));
  $('#saveYoutubeDataKeyBtn')?.addEventListener('click', () => saveYoutubeDataApiKey().catch(error => showToast(error.message)));
  $('#runYoutubeTrendScanBtn')?.addEventListener('click', () => runYoutubeTrendScan().catch(error => { $('#youtubeTrendReport').textContent = `Greška: ${error.message}`; showToast(error.message); }));
  $('#analyzeYoutubeRetentionBtn')?.addEventListener('click', () => analyzeYoutubeRetentionVideo().catch(error => { $('#youtubeRetentionReport').textContent = `Greška: ${error.message}`; showToast(error.message); }));
  $('#testComfyBtn').addEventListener('click', () => testComfyConnection(true));
  $('#generateAllI2vBtn').addEventListener('click', generateAllI2V);
  $('#stopI2vBtn').addEventListener('click', stopI2V);
  $('#renderVideoBtn').addEventListener('click', () => renderVideo().catch(handleRenderFailure));
  $('#cancelRenderBtn').addEventListener('click', () => renderSession?.stop());
  $('#saveBtn').addEventListener('click', () => { persistState(true); saveServerBackup(false).catch(error => console.warn(error)); showToast('Projekat je izričito sačuvan. Samo ovakav projekat se vraća pri sledećem pokretanju.'); });
  $('#newProjectBtn').addEventListener('click', newProject);
  $('#runPipelineBtn').addEventListener('click', () => runFreePipeline().catch(error => { showPanel('project'); updateStep1Audit(); showToast(error.message || 'Automatska izrada nije pokrenuta.'); }));
  $('#shutdownAppBtn')?.addEventListener('click', async () => {
    if (!window.confirm('Da li želiš potpuno da ugasiš lokalni Studio i njegove pomoćne procese? Privremena Cloudflare adresa ostaje sačuvana za sledeće pokretanje.')) return;
    const button = $('#shutdownAppBtn');
    if (button) { button.disabled = true; button.textContent = 'Zatvaram...'; }
    try {
      await fetch('/api/app/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (_) {}
    document.body.innerHTML = '<main style="max-width:760px;margin:10vh auto;padding:32px;font-family:system-ui;text-align:center"><h1>Program je zatvoren.</h1><p>Za ponovno pokretanje dvaput klikni jedino dugme u glavnom folderu.</p></main>';
  });
  $('#exportLightBtn').addEventListener('click', () => exportProject(false));
  $('#exportFullBtn').addEventListener('click', () => exportProject(true));
  $('#importProjectBtn').addEventListener('click', () => $('#projectImportFile').click());
  $('#projectImportFile').addEventListener('change', event => importProjectFile(event.target.files?.[0]));
}

async function initialize() {
  migrateProjectStorage();
  ensureV12RuntimeState();
  fillForm();
  bindEvents();
  window.addEventListener('beforeunload', event => {
    if (!state.dirtySinceSave) return;
    event.preventDefault();
    event.returnValue = '';
  });
  const restoredAudioBlob = await hydrateAudioPreview();
  if (state.audio?.fileName && !restoredAudioBlob) {
    // LocalStorage može da preživi brisanje IndexedDB-a. Ne prikazuj tada lažno da je audio spreman.
    state.audio = createInitialState().audio;
    audioBuffer = null;
    if ($('#audioFileName')) $('#audioFileName').textContent = 'Audio iz sačuvanog projekta nije pronađen — dodaj fajl ponovo';
    persistState(false, false);
    showToast('Sačuvani projekat nema lokalni audio-fajl. Dodaj pesmu ponovo; ostali podaci projekta su sačuvani.');
  }
  updateStatus();
  updateStep1Audit();
  drawWaveform();
  renderToolStatus();
  ensureLockedGirlEverywhere();
  renderProductionAudit(false);
  renderCharacters();
  renderCaptionPreview();
  renderYoutubeChannels();
  await renderLockedGirlReference().catch(error => console.warn('Referentna slika nije učitana:', error));
  await refreshYoutubeChannels().catch(error => console.warn('YouTube kanali nisu učitani:', error));
  // Stari GPT Actions/tunel sistem se više ne pokreće automatski. Glavni Korak 3 koristi samo lokalni ChatGPT Plus browser most.
  await loadMaintenanceStatus(false).catch(error => console.warn('Dijagnostika nije učitana:', error));
  startAutomaticBackups();
  renderYoutubeTrendReport();
  renderYoutubeRetentionReport();
  if (typeof window.refreshPlusBridgeStatus === 'function') window.refreshPlusBridgeStatus(false).catch(() => {});
}

window.addEventListener('mss:vendor-loaded', event => {
  renderToolStatus();
  if (event.detail?.id === 'wavesurfer' && event.detail.ok) hydrateAudioPreview().catch(() => {});
  if (event.detail?.id === 'sortable' && event.detail.ok) initializeStoryboardSorting();
});

initialize().catch(error => showToast(`Greška pri pokretanju: ${error.message}`));
