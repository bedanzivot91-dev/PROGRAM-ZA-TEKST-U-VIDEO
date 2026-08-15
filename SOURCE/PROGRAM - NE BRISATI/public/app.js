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
  const shots = ['wide environmental establishing shot','medium-wide narrative shot','intimate medium shot','controlled close-up','low-angle architectural shot','high-angle observational shot','over-the-shoulder narrative shot','profile close-up with environmental context','long-lens compressed medium shot','ground-level detail-led wide shot','doorway-framed medium shot','moving side-profile shot'];
  const lenses = ['24mm','28mm','35mm','40mm','50mm','65mm','85mm','100mm macro'];
  const cameras = ['slow forward dolly with a clean stop before the action resolves','measured lateral tracking that keeps the action readable','locked camera with only subtle breathing drift','slow semicircular move of less than twenty degrees','controlled handheld movement with almost no vertical shake','gentle pull-back that reveals the consequence of the action','short rack-focus from the scene-specific object to her eyes','low, slow rise from foreground object to a stable eye-level frame'];
  const compositions = ['asymmetrical rule of thirds with the action on one side and meaningful negative space on the other','layered diagonal composition connecting foreground object, character and destination','centered geometry deliberately broken by one displaced object','deep composition with three readable planes and no unrelated people','compressed telephoto layers that isolate the decision from the active background','doorway or structural frame within the frame without trapping the face','low foreground anchor leading toward the character and a clear exit path','balanced triangular composition formed by character, object and practical light source','horizontal visual rhythm interrupted by one vertical human figure','clean single-subject composition with a secondary story detail near the edge'];
  const foregrounds = ['a sharply defined edge of the central object close to lens','a partially open structural element that creates depth without hiding the face','soft practical reflections from the real surface nearest camera','one moving environmental detail crossing only the lower edge of frame','a blurred functional object belonging to the same location','a thin layer of realistic condensation or dust visible only in backlight'];
  const atmospheres = ['subtle air movement affects only hair tips and light fabric, while practical lights remain stable','realistic distant activity continues quietly without drawing attention from the main action','small particles become visible only inside motivated light, with no fantasy glow','environmental sound is implied by moving machinery or wind, but the image remains visually controlled','surfaces show believable wear, moisture or dust appropriate to the location, never decorative fantasy','the space feels occupied by recent human activity even when no extra people are visible'];
  const wardrobes = [
    'a modern fitted dark blouse with tailored trousers and practical low-profile shoes, selected for the interior action; the right upper thigh remains naturally covered',
    'a tasteful knee-length coat over a feminine fitted top and straight jeans, adapted to cold exterior conditions; no repetitive sweater styling',
    'an elegant midi skirt with a refined blouse and lightweight jacket chosen for the location, with the tattoo visible only if the front upper right thigh is naturally exposed',
    'modern tailored pants with a clean sleeveless top and a scene-appropriate overshirt, feminine and realistic rather than high-fashion',
    'a simple contemporary dress with restrained movement and practical footwear, selected only where weather and action make it believable',
    'dark jeans, a fitted modern top and a short structured jacket, tasteful urban styling with no repeated outfit from the adjacent scene'
  ];
  const object = sceneObjectForLyric(lyricData.text,index,idea);
  const action = sceneActionForLyric(lyricData.text,object,index,emotion);
  scene.sceneTitle = scene.sceneTitle && !scene.sceneTitle.startsWith('Vizuelni trenutak') ? scene.sceneTitle : `SCENA ${scene.number}: ${object.toUpperCase()}`;
  scene.lyricMeaning = scene.lyricMeaning || interpretLyricMeaning(lyricData.text, emotion);
  scene.description = `${action}. Centralni predmet scene je ${object}. Radnja mora jasno da odgovara smislu stiha „${compactLyric(lyricData.text, 130)}“, a ne samo opštoj tuzi.`;
  scene.microMovement = micro[deterministicIndex(index,'micro',micro.length)];
  scene.location = locationBase;
  scene.locationReason = scene.locationReason || locationReasonForLyric(lyricData.text, locationBase);
  scene.timeWeather = scene.timeWeather || `${idea?.timeWeather || 'vreme i uslovi određeni konceptom'}; deo priče ${phase < .33 ? 'početak' : phase < .7 ? 'sredina' : 'završnica'}, sa logičnim kontinuitetom vremena`;
  scene.lighting = scene.lighting || `${idea?.colorPalette || state.concept.colorPalette}; motivated key light from a real source in the location, controlled fill, realistic shadow direction, no decorative fantasy glow`;
  scene.shot = shots[deterministicIndex(index,'shot-detailed',shots.length)];
  scene.lens = lenses[deterministicIndex(index,'lens-detailed',lenses.length)];
  scene.camera = cameras[deterministicIndex(index,'camera-detailed',cameras.length)];
  scene.composition = compositions[deterministicIndex(index,'composition-detailed',compositions.length)];
  scene.foreground = foregrounds[deterministicIndex(index,'foreground-detailed',foregrounds.length)];
  scene.midground = `the locked main woman performs the complete visible action with ${object}; her face, hands and body position remain fully readable`;
  scene.background = `a coherent continuation of ${locationBase}, showing only functional elements and restrained activity that belongs to the same place; no unrelated people, signs or decorative clutter`;
  scene.atmosphere = atmospheres[deterministicIndex(index,'atmosphere-detailed',atmospheres.length)];
  scene.wardrobe = wardrobes[deterministicIndex(index,'wardrobe-detailed',wardrobes.length)];
  scene.continuityNotes = `keep the exact locked female identity, same face geometry, shoulder-length jet-black hair and emerald eyes; preserve ${object} and its condition from the beginning to the end of this scene; the next scene must inherit only story-relevant consequences, not repeat this composition`;
  scene.transitionIn = index === 0 ? 'open immediately on a visually clear action within the first half-second, with no logo, title card or empty establishing delay' : 'enter through a motivated cut on movement, sound implication or matching object direction from the previous scene';
  scene.transitionOut = index === totalScenes - 1 ? `finish on a stable final decision connected to the selected ending: ${idea?.ending || 'the character leaves the completed action behind'}` : 'finish after the action produces a visible consequence that gives the next scene a new starting condition';
  scene.visualSignature = `${idea?.id || 'manual'}|${scene.number}|${locationBase}|${object}|${scene.shot}|${scene.lens}|${scene.composition}`;
  scene.characterIds = [...new Set([LOCKED_GIRL_ID, ...(scene.characterIds || [])])];
  scene.promptSource = 'local';
  scene.imagePrompt = '';
  scene.videoPrompt = '';
  return scene;
}

function characterPrompt(scene) {
  return state.characters
    .filter(character => scene.characterIds.includes(character.id))
    .map(character => `${character.locked}. Avoid for this character: ${character.negative || 'identity changes and anatomy errors'}.`)
    .join(' ');
}

function formatPrompt(format) {
  if (format === '16:9') return 'horizontal 16:9 composition, designed for a YouTube music video';
  if (format === '1:1') return 'square 1:1 composition, centered mobile-friendly framing';
  return 'vertical 9:16 composition, designed for YouTube Shorts, TikTok and Instagram Reels, keep important faces away from interface overlays';
}

function imageOutputSpecification(format) {
  if (format === '16:9') return {
    aspect:'16:9 horizontal',
    generation:'GENERATED IMAGE TARGET: exact 16:9 when supported; otherwise use the highest available landscape canvas, normally 1536×1024, while keeping the full composition inside a centered 1536×864 crop-safe rectangle',
    master:'FINAL VIDEO MASTER AFTER PROGRAM CROP/UPSCALE: EXACT 3840×2160 pixels (4K UHD)',
    safe:'keep all faces, hands, tattoo when visible and story-critical objects at least 8% away from the 16:9 crop boundary',
    crop:'no letterbox; the program may crop the unused top and bottom of a 1536×1024 generation to 1536×864 before scaling to 3840×2160; this crop must not remove any required anatomy or object'
  };
  if (format === '1:1') return {
    aspect:'1:1 square',
    generation:'GENERATED IMAGE TARGET: exact 1024×1024 pixels or the highest available square size',
    master:'FINAL VIDEO MASTER AFTER PROGRAM UPSCALE: EXACT 2048×2048 pixels',
    safe:'keep all faces, hands and story-critical objects at least 10% away from every edge',
    crop:'compose natively for 1:1 with no portrait or landscape letterboxing and no later crop of the subject'
  };
  return {
    aspect:'9:16 vertical portrait',
    generation:'GENERATED IMAGE TARGET: exact 9:16 when supported; otherwise use the highest available portrait canvas, normally 1024×1536, while keeping the complete composition inside a centered 864×1536 crop-safe rectangle',
    master:'FINAL VIDEO MASTER AFTER PROGRAM CROP/UPSCALE: EXACT 2160×3840 pixels (vertical 4K)',
    safe:'YouTube Shorts/TikTok/Instagram safe area inside the 9:16 crop: faces and eyes below the top 12%, above the bottom 22%, and away from the right-side interface by at least 15%',
    crop:'no letterbox; the program may crop the unused left and right sides of a 1024×1536 generation to 864×1536 before scaling to 2160×3840; preserve the full head, hands and required front-right-thigh area when visible'
  };
}

function imageFrameSpecification(format) {
  const spec=imageOutputSpecification(format);
  return `${spec.aspect}; ${spec.generation}; ${spec.master}; ${spec.safe}; ${spec.crop}`;
}

function makeImagePrompt(scene) {
  const concept = state.concept || {};
  const idea = selectedCreativeIdea();
  const otherPeople = (scene.characterIds || []).filter(id => id !== LOCKED_GIRL_ID).map(id => state.characters.find(character => character.id === id)).filter(Boolean);
  const additionalCharacters = otherPeople.map(character => `ADDITIONAL CHARACTER — ${character.name}: ${character.locked}. Character-specific exclusions: ${character.negative || 'no identity drift, no anatomy errors'}.`).join('\n');
  const exactLyric = compactLyric(scene.lyric, 170);
  const emotion = scene.emotion || state.mood || 'melanholija';
  const visualSignature = scene.visualSignature || `${scene.location}|${scene.shot}|${scene.lens}|${scene.composition}|${scene.description}`;
  const negativeScene = [
    'different woman, changed face, changed eye color, changed hairstyle, hair shorter than shoulder level, hair longer than shoulder level',
    'repeated composition from another scene, generic standing pose, meaningless sad staring, random night-city cliché, unrelated rain',
    'extra people, background crowd looking at camera, duplicated character, duplicated limbs, extra arms, extra legs, fused fingers, broken hands, distorted feet',
    'missing Mini Mouse tattoo, tattoo on the wrong leg, tattoo moved away from the right leg above the knee toward the upper thigh, different tattoo design, oversized tattoo',
    'same clothing as adjacent scenes without continuity reason, default oversized sweater, vulgar styling, extreme runway fashion',
    'collage, montage, diptych, triptych, split screen, comic panel, multiple moments in one image, floating symbolic graphics',
    'written lyrics, readable signs used as story explanation, subtitles, title, logo, signature, watermark, interface, frame border',
    'plastic skin, beauty filter, doll face, anime, illustration, painterly look, low resolution, blur on eyes, over-sharpening, fake HDR, inconsistent shadows'
  ].join(', ');
  const body = [
    `SCENA ${scene.number} — ${scene.sceneTitle || `JEDINSTVENI KADAR ${scene.number}`}`,
    '',
    `Stih koji scena tumači: “${exactLyric}”`,
    `Deo pesme: ${scene.section || 'Pesma'}`,
    `Emocionalna funkcija: ${emotion}.`,
    `Značenje stiha u ovoj sceni: ${scene.lyricMeaning || interpretLyricMeaning(scene.lyric, emotion)}.`,
    '',
    `GLAVNA VIDLJIVA RADNJA: ${scene.description}`,
    `MIKRO-POKRET I GLUMA: ${scene.microMovement || 'one controlled blink, subtle breathing, a small shift of fingers and body weight, with no theatrical crying or exaggerated gesture'}.`,
    `POLOŽAJ LIKA: the locked main woman must be placed naturally for the action; her hands, face and body mechanics must be anatomically readable, with a believable center of gravity and no posed fashion stance unless the action requires it.`,
    `POGLED I IZRAZ: her gaze must follow the cause of the action before reacting to its consequence; emotion remains restrained, human and specific to the lyric.`,
    '',
    `LOKACIJA: ${scene.location}.`,
    `ZAŠTO OVA LOKACIJA ODGOVARA STIHU: ${scene.locationReason || locationReasonForLyric(scene.lyric, scene.location)}.`,
    `VREME I USLOVI: ${scene.timeWeather || idea?.timeWeather || 'a specific time of day and realistic environmental condition chosen for this lyric'}.`,
    `SVETLO: ${scene.lighting || idea?.colorPalette || concept.colorPalette || 'motivated cinematic lighting from practical sources with realistic falloff and consistent shadow direction'}.`,
    `ATMOSFERA I MATERIJALI: ${scene.atmosphere || idea?.recurringMotif || 'subtle air movement, believable material texture and restrained environmental activity'}.`,
    '',
    `KAMERA: ${scene.shot || 'cinematic narrative shot'}, ${scene.lens || '50mm'}, ${scene.camera || concept.cameraStyle || 'slow controlled camera language'}.`,
    `VISINA I UGAO: camera height and angle must support the emotional distance of the lyric and preserve natural facial proportions; no arbitrary Dutch angle.`,
    `KOMPOZICIJA: ${scene.composition || 'clear single-moment composition with intentional negative space and one readable focal point'}.`,
    `FOREGROUND: ${scene.foreground || 'one location-specific element creates depth without covering the face or hands'}.`,
    `MIDGROUND: ${scene.midground || 'the woman performs the complete visible action and interacts with the scene-specific object'}.`,
    `BACKGROUND: ${scene.background || 'the same coherent location continues with only relevant functional elements and no unrelated people'}.`,
    '',
    `GARDEROBA: ${scene.wardrobe || idea?.costumeLogic || 'the exact same tasteful modern red dress from the locked identity; preserve its red color and recognizable design in every image'}.`,
    `KONTINUITET: ${scene.continuityNotes || 'preserve the exact locked identity, all story objects, wardrobe details, lighting direction and spatial relationships for this scene'}.`,
    `ULAZ IZ PRETHODNE SCENE: ${scene.transitionIn || 'a motivated visual continuation, not a repeated establishing shot'}.`,
    `IZLAZ KA SLEDEĆOJ SCENI: ${scene.transitionOut || 'the action ends with a visible consequence that creates a new condition for the next scene'}.`,
    '',
    `VIZUELNI SVET SPOTA: ${idea?.visualWorld || concept.visualStyle}.`,
    `CENTRALNI SIMBOL KONCEPTA: ${idea?.centralSymbol || 'a realistic recurring object whose meaning changes through the song'}.`,
    `MOTIV KOJI SE PONAVLJA: ${idea?.recurringMotif || 'one grounded visual motif connected to the lyrics, never used as fantasy decoration'}.`,
    `PALETA: ${idea?.colorPalette || concept.colorPalette}.`,
    `JEDINSTVENI VIZUELNI POTPIS OVE SCENE: ${visualSignature}. This exact combination of location, action, object, lens, camera direction, composition and lighting must not be repeated anywhere else in the same project.`,
    '',
    'OBAVEZNA TEHNIČKA SPECIFIKACIJA IZLAZA:',
    `ODNOS I DIMENZIJE: ${imageFrameSpecification(state.format)}.`,
    'KVALITET: one single final image, premium photorealistic cinematic still, maximum available image-generation quality, clean high-frequency facial detail, natural pores and eyelashes, accurate anatomy, realistic materials, controlled highlight roll-off, stable shadows, subtle organic 35mm film grain, no compression artifacts, no pixelation, no low-resolution upscaling look.',
    'KOLOR I EKSPOZICIJA: intended for Rec.709 music-video grading, neutral skin tones protected from color casts, no clipped highlights on face, no crushed black facial detail, coherent white balance and realistic practical-light color temperature.',
    'FAJL: final image suitable for lossless PNG or high-quality WebP export; no border, no letterbox, no frame, no metadata text, no visible signature.',
    'KONTROLA PRE ISPORUKE: verify exact locked identity, emerald-green eyes, shoulder-length hair, small minimalist Mini Mouse tattoo on the right leg above the knee toward the upper thigh when visible, five fingers on each visible hand, correct limb count, no duplicated person, no readable text, no logo and no visible watermark.',
    '',
    'IMAGE PROMPT:',
    `Scene ${scene.number} — ${scene.description} The image must show one single continuous moment, not before-and-after states. ${imageFrameSpecification(state.format)}. Ultra-realistic cinematic photography, premium contemporary music-video production, physically believable environment, natural skin texture and pores, highly detailed emerald-green eyes, realistic eyelashes, clean but imperfect real-life detail, accurate hands and fingers, accurate legs and body mechanics, realistic fabric weight, controlled highlight rolloff, subtle organic film grain, believable depth of field, coherent color grading, no artificial glossy skin, no fantasy glow unless produced by a real light source. The scene must visually explain the emotional meaning of the lyric through action, object placement, spatial relationship and consequence, without using any written words.`,
    additionalCharacters,
    '',
    `SCENE NEGATIVE PROMPT: ${negativeScene}`
  ].filter(Boolean).join('\n');
  return withLockedGirlIdentity(body);
}

function makeVideoPrompt(scene) {
  const idea = selectedCreativeIdea();
  const emotion = scene.emotion || state.mood || 'melanholija';
  const body = [
    `SCENA ${scene.number} — VIDEO PROMPT`,
    `Trajanje: exactly ${Number(scene.duration || 5).toFixed(1)} seconds. Output framing: ${imageFrameSpecification(state.format)}.`,
    `OUTPUT QUALITY: render at the highest locally supported resolution, then normalize to ${imageOutputSpecification(state.format).master}; ${state.i2v?.fps || 16} fps AI motion source, final delivery at ${state.settings?.renderFps || 30} fps; Rec.709 color, progressive scan, no letterboxing, no visible watermark, no burned text unless the separate subtitle renderer is enabled.`,
    '',
    `START FRAME: use the supplied still image as an exact visual reference. Preserve the same woman, exact facial geometry, emerald-green eyes, straight jet-black hair ending exactly at shoulder level, body proportions, small minimalist Mini Mouse tattoo on the right leg above the knee toward the upper thigh, wardrobe, scene-specific object, location, light direction, shadows, lens perspective and composition. Do not redesign or reinterpret the opening frame.`,
    `INITIAL BODY STATE: her weight distribution, hand position, shoulder angle, head direction and gaze begin exactly as shown in the still. The first movement starts only after a brief natural settling moment of approximately 0.2 seconds.`,
    '',
    `PRIMARY ACTION: ${scene.description}. The action must have a clear beginning, physical cause, readable middle and visible consequence before the clip ends. Do not replace it with generic walking, looking at camera or random sadness.`,
    `MICRO-ACTIONS: ${scene.microMovement || 'one natural blink, subtle breathing in the upper chest, tiny eye adjustment toward the object, realistic finger tension, a small shift of body weight and physically correct fabric response'}. Keep the acting emotionally restrained and appropriate for ${emotion}.`,
    `FACE AND IDENTITY LOCK: no face morphing, no age change, no eye-color shift, no hair growth, no haircut, no skin smoothing, no smile appearing without narrative reason, no lip movement resembling speech unless explicitly required.`,
    `HANDS AND BODY: all fingers remain anatomically correct and attached; wrists, elbows, knees and hips move with realistic joint limits; no duplicated limbs, rubbery movement, body reshaping or tattoo movement.`,
    '',
    `CAMERA MOVEMENT: ${scene.camera || 'slow controlled cinematic move'} with the perspective of ${scene.lens || 'the source-image lens'}. Start gently, maintain a stable horizon, use realistic inertia and settle before the final frame. The camera must not perform a full orbit, sudden zoom, random shake or speed ramp unless specifically described.`,
    `FOCUS BEHAVIOR: begin focused on the primary action or scene-specific object, then perform at most one motivated rack-focus toward her eyes or the consequence of the action. Avoid repeated focus hunting and artificial pulsing blur.`,
    `DEPTH AND PARALLAX: foreground (${scene.foreground || 'the nearest scene-specific element'}) moves slightly faster than the woman; midground remains readable; background (${scene.background || 'the same coherent location'}) shifts minimally according to real camera motion. No background replacement or sliding flat layers.`,
    '',
    `ENVIRONMENTAL MOTION: ${scene.atmosphere || 'subtle air, realistic fabric and hair response, stable practical lights and restrained movement of location-specific materials'}. Weather and movement must match ${scene.timeWeather || scene.location}. No magical particles, unexplained glowing trails or decorative smoke.`,
    `LIGHTING CONTINUITY: practical light intensity may change only if the scene action causes it. Shadow direction, color temperature and reflection positions remain coherent throughout the shot. No flickering exposure or color jumps.`,
    `WARDROBE CONTINUITY: ${scene.wardrobe || idea?.costumeLogic || 'keep the exact tasteful modern red dress from the locked identity and source still'}. Fabric may move naturally but cannot change cut, color, length or material. The Mini Mouse tattoo remains visible only when the right leg area above the knee toward the upper thigh is exposed by the same red dress; otherwise it remains naturally covered.`,
    '',
    `STORY CONTINUITY: ${scene.continuityNotes || 'the object, action consequence and spatial relationship must connect logically to adjacent scenes'}.`,
    `ENTRY TRANSITION: ${scene.transitionIn || 'begin as a motivated continuation from the previous shot without repeating its composition'}.`,
    `EXIT TRANSITION: ${scene.transitionOut || 'end on a stable visual consequence that can cut cleanly into the next scene'}.`,
    `FINAL FRAME: the final frame must be different from the opening frame because the action has produced a visible consequence, but the same people, face, wardrobe, object identity, location and lighting remain stable. Hold the final readable pose for approximately 0.25 seconds.`,
    '',
    `VIDEO STYLE: ${idea?.cameraGrammar || state.concept.cameraStyle}; contemporary photorealistic music-video motion, realistic inertia, restrained performance, physically coherent hair and fabric, stable detail, no artificial slow motion unless requested by the emotional rhythm.`,
    `NEGATIVE VIDEO RULES: no face morphing, identity drift, eye-color change, hairstyle change, body reshaping, Mini Mouse tattoo relocation or redesign, red-dress change, extra person, duplicated woman, extra arms, extra legs, fused fingers, broken anatomy, melting object, teleportation, looping gesture, frozen face, lip-sync, sudden smile, background replacement, frame interpolation artifacts, flicker, jitter, exposure pumping, rolling texture, camera shake, abrupt zoom, collage, split screen, readable text, subtitles, logo, visible watermark.`
  ].join('\n').trim();
  return withLockedGirlIdentity(body);
}

function generateAllPrompts(showMessage = true) {
  state.scenes.forEach(scene => {
    scene.imagePrompt = makeImagePrompt(scene);
    scene.videoPrompt = makeVideoPrompt(scene);
    scene.promptSource = 'local';
  });
  persistState(false, false);
  if (showMessage) showToast('Promptovi za sve scene su napravljeni.');
}

function renderStoryboard() {
  const container = $('#storyboardList');
  if (!state.scenes.length) {
    container.innerHTML = '<div class="notice info">Storyboard još nije napravljen. Dodaj audio, pokreni analizu i klikni „Napravi dinamični storyboard“.</div>';
    updateStatus();
    return;
  }
  container.innerHTML = state.scenes.map(scene => {
    const checks = state.characters.map(character => `
      <label><input type="checkbox" data-character-check="${scene.id}" value="${character.id}" ${scene.characterIds.includes(character.id) ? 'checked' : ''}>${escapeHtml(character.name)}</label>
    `).join('');
    return `
      <article class="scene-card" data-scene-id="${scene.id}">
        <div class="scene-top">
          <span class="scene-drag-handle" title="Prevuci scenu">↕</span>
          <strong>Scena ${scene.number} • ${escapeHtml(scene.section)}</strong>
          <span class="scene-time">${secondsToClock(scene.start)} — ${secondsToClock(scene.end)} • ${scene.duration.toFixed(2)} s</span>
        </div>
        <div class="scene-body">
          <div class="scene-grid">
            <label>Stih / instrumental<textarea data-scene-field="lyric" rows="3">${escapeHtml(scene.lyric)}</textarea></label>
            <label>Opis vidljive radnje<textarea data-scene-field="description" rows="3">${escapeHtml(scene.description)}</textarea></label>
            <label>Emocija<input data-scene-field="emotion" value="${escapeHtml(scene.emotion)}"></label>
            <label>Lokacija<input data-scene-field="location" value="${escapeHtml(scene.location)}"></label>
            <label>Veličina kadra<input data-scene-field="shot" value="${escapeHtml(scene.shot)}"></label>
            <label>Pokret kamere<input data-scene-field="camera" value="${escapeHtml(scene.camera)}"></label>
            <label>Naziv scene<input data-scene-field="sceneTitle" value="${escapeHtml(scene.sceneTitle || '')}"></label>
            <label>Značenje stiha<textarea data-scene-field="lyricMeaning" rows="2">${escapeHtml(scene.lyricMeaning || '')}</textarea></label>
            <label>Mikro-pokret<textarea data-scene-field="microMovement" rows="2">${escapeHtml(scene.microMovement || '')}</textarea></label>
            <label>Vreme i vremenski uslovi<input data-scene-field="timeWeather" value="${escapeHtml(scene.timeWeather || '')}"></label>
            <label>Svetlo<input data-scene-field="lighting" value="${escapeHtml(scene.lighting || '')}"></label>
            <label>Objektiv<input data-scene-field="lens" value="${escapeHtml(scene.lens || '')}"></label>
            <label>Kompozicija<textarea data-scene-field="composition" rows="2">${escapeHtml(scene.composition || '')}</textarea></label>
            <label>Foreground<input data-scene-field="foreground" value="${escapeHtml(scene.foreground || '')}"></label>
            <label>Midground<input data-scene-field="midground" value="${escapeHtml(scene.midground || '')}"></label>
            <label>Background<input data-scene-field="background" value="${escapeHtml(scene.background || '')}"></label>
            <label>Atmosfera<input data-scene-field="atmosphere" value="${escapeHtml(scene.atmosphere || '')}"></label>
            <label>Garderoba<textarea data-scene-field="wardrobe" rows="2">${escapeHtml(scene.wardrobe || '')}</textarea></label>
            <label>Kontinuitet<textarea data-scene-field="continuityNotes" rows="2">${escapeHtml(scene.continuityNotes || '')}</textarea></label>
            <label>Ulazna tranzicija<input data-scene-field="transitionIn" value="${escapeHtml(scene.transitionIn || '')}"></label>
            <label>Izlazna tranzicija<input data-scene-field="transitionOut" value="${escapeHtml(scene.transitionOut || '')}"></label>
          </div>
          <div class="character-checks">${checks || '<span class="mini-status">Nema dodatih likova.</span>'}</div>
          <label>Prompt za sliku<textarea data-scene-field="imagePrompt" rows="6">${escapeHtml(scene.imagePrompt)}</textarea></label>
          <label>Prompt za video-animaciju<textarea data-scene-field="videoPrompt" rows="4">${escapeHtml(scene.videoPrompt)}</textarea></label>
          <div class="scene-actions">
            <button data-copy-image="${scene.id}" class="primary">Kopiraj prompt slike</button>
            <button data-copy-video="${scene.id}" class="secondary">Kopiraj video prompt</button>
            <button data-refresh-prompt="${scene.id}" class="ghost">Osveži prompt</button>
            <button data-move-scene="${scene.id}" data-direction="-1" class="ghost" ${scene.number === 1 ? 'disabled' : ''}>↑ Gore</button>
            <button data-move-scene="${scene.id}" data-direction="1" class="ghost" ${scene.number === state.scenes.length ? 'disabled' : ''}>↓ Dole</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  $$('[data-scene-field]', container).forEach(element => {
    element.addEventListener('change', () => {
      const card = element.closest('[data-scene-id]');
      const scene = state.scenes.find(item => item.id === card.dataset.sceneId);
      scene[element.dataset.sceneField] = element.value;
      if (element.dataset.sceneField === 'imagePrompt' || element.dataset.sceneField === 'videoPrompt') scene.promptSource = 'custom';
      persistState(false);
    });
  });
  $$('[data-character-check]', container).forEach(element => {
    element.addEventListener('change', () => {
      const scene = state.scenes.find(item => item.id === element.dataset.characterCheck);
      scene.characterIds = $$(`[data-character-check="${scene.id}"]:checked`, container).map(item => item.value);
      scene.imagePrompt = makeImagePrompt(scene);
      scene.videoPrompt = makeVideoPrompt(scene);
      scene.promptSource = 'local';
      persistState(false);
      renderStoryboard();
    });
  });
  $$('[data-copy-image]', container).forEach(button => button.addEventListener('click', () => {
    const scene = state.scenes.find(item => item.id === button.dataset.copyImage);
    copyText(scene.imagePrompt, `Prompt scene ${scene.number} je kopiran.`);
  }));
  $$('[data-copy-video]', container).forEach(button => button.addEventListener('click', () => {
    const scene = state.scenes.find(item => item.id === button.dataset.copyVideo);
    copyText(scene.videoPrompt, `Video prompt scene ${scene.number} je kopiran.`);
  }));
  $$('[data-refresh-prompt]', container).forEach(button => button.addEventListener('click', () => {
    const scene = state.scenes.find(item => item.id === button.dataset.refreshPrompt);
    scene.imagePrompt = makeImagePrompt(scene);
    scene.videoPrompt = makeVideoPrompt(scene);
    scene.promptSource = 'local';
    persistState(false);
    renderStoryboard();
  }));
  $$('[data-move-scene]', container).forEach(button => button.addEventListener('click', () => moveScene(button.dataset.moveScene, Number(button.dataset.direction))));
  initializeStoryboardSorting();
  updateStatus();
}

function refreshLocalPrompts() {
  state.scenes.forEach(scene => {
    if (!scene.promptSource || scene.promptSource === 'local') {
      scene.imagePrompt = makeImagePrompt(scene);
      scene.videoPrompt = makeVideoPrompt(scene);
      scene.promptSource = 'local';
    }
  });
  persistState(false, false);
}

function renderCharacters() {
  const container = $('#charactersList');
  if (!state.characters.length) {
    container.innerHTML = '<div class="notice info">Dodaj glavne likove. Možeš koristiti gotovu zaključanu devojku i glavnog muškarca.</div>';
    updateStatus();
    return;
  }
  container.innerHTML = state.characters.map(character => {
    const immutable = character.id === LOCKED_GIRL_ID || character.immutable;
    return `
    <article class="character-card ${immutable ? 'locked-character' : ''}">
      <h3>${escapeHtml(character.name)}</h3>
      <span class="badge">${escapeHtml(character.role || 'Lik')}</span> ${immutable ? '<span class="locked-pill">TRAJNO ZAKLJUČAN</span>' : ''}
      <p>${escapeHtml(character.locked)}</p>
      <div class="actions">${immutable ? '<button data-show-locked-girl class="secondary">Prikaži ceo ID</button>' : `<button data-edit-character="${character.id}" class="secondary">Uredi</button><button data-delete-character="${character.id}" class="danger">Obriši</button>`}</div>
    </article>`;
  }).join('');
  $$('[data-show-locked-girl]', container).forEach(button => button.addEventListener('click', () => { $('#lockedGirlIdentityView')?.scrollIntoView({ behavior: 'smooth' }); showPanel('media'); }));
  $$('[data-edit-character]', container).forEach(button => button.addEventListener('click', () => openCharacterDialog(button.dataset.editCharacter)));
  $$('[data-delete-character]', container).forEach(button => button.addEventListener('click', () => {
    if (!confirm('Obrisati ovaj lik iz projekta?')) return;
    const id = button.dataset.deleteCharacter;
    if (id === LOCKED_GIRL_ID) return showToast('Glavna devojka je trajno zaključana i ne može da se obriše.');
    state.characters = state.characters.filter(character => character.id !== id);
    state.scenes.forEach(scene => scene.characterIds = scene.characterIds.filter(characterId => characterId !== id));
    refreshLocalPrompts();
    renderCharacters();
    renderStoryboard();
  }));
  updateStatus();
}

function openCharacterDialog(id = '') {
  const character = state.characters.find(item => item.id === id);
  if (character?.id === LOCKED_GIRL_ID) { showToast('Ovaj ID je trajno zaključan i ne može da se menja.'); return; }
  $('#characterId').value = character?.id || '';
  $('#characterName').value = character?.name || '';
  $('#characterRole').value = character?.role || '';
  $('#characterLocked').value = character?.locked || '';
  $('#characterNegative').value = character?.negative || '';
  $('#characterDialog').showModal();
}

function saveCharacterFromDialog(event) {
  event.preventDefault();
  const id = $('#characterId').value || uuid();
  if (id === LOCKED_GIRL_ID) { showToast('Zaključani ID ne može da se menja.'); return; }
  const character = {
    id,
    name: $('#characterName').value.trim(),
    role: $('#characterRole').value.trim(),
    locked: $('#characterLocked').value.trim(),
    negative: $('#characterNegative').value.trim()
  };
  if (!character.name || !character.locked) {
    showToast('Ime i zaključani opis su obavezni.');
    return;
  }
  const index = state.characters.findIndex(item => item.id === id);
  if (index >= 0) state.characters[index] = character;
  else state.characters.push(character);
  $('#characterDialog').close();
  refreshLocalPrompts();
  renderCharacters();
  renderStoryboard();
  persistState(false, false);
}

function addDefaultCharacter(template) {
  if (template.id === LOCKED_GIRL_ID) { ensureLockedGirlEverywhere(); renderCharacters(); renderStoryboard(); showToast('Zaključana devojka je već obavezna u svim scenama.'); return; }
  const duplicate = state.characters.some(character => character.name === template.name);
  if (duplicate) {
    showToast(`${template.name} već postoji.`);
    return;
  }
  state.characters.push({ ...template, id: uuid() });
  persistState(false, false);
  renderCharacters();
  renderStoryboard();
  showToast(`${template.name} je dodat.`);
}


const IDEA_HISTORY_KEY = 'muzickiSpotStudioCreativeHistoryV1';

function normalizeCreativeIdea(input = {}, index = 0) {
  const idea = input && typeof input === 'object' ? input : {};
  return {
    id: String(idea.id || `idea-${index + 1}-${uuid()}`), number: Number(idea.number) || index + 1,
    title: String(idea.title || `Ideja ${index + 1}`).trim(), oneSentence: String(idea.oneSentence || idea.logline || '').trim(),
    narrativeArc: String(idea.narrativeArc || '').trim(), visualWorld: String(idea.visualWorld || '').trim(),
    centralSymbol: String(idea.centralSymbol || '').trim(), hookScene: String(idea.hookScene || '').trim(),
    locations: Array.isArray(idea.locations) ? idea.locations.map(String).map(x => x.trim()).filter(Boolean) : String(idea.locations || '').split(',').map(x => x.trim()).filter(Boolean),
    locationJustification: Array.isArray(idea.locationJustification) ? idea.locationJustification.map(String).map(x => x.trim()).filter(Boolean) : [],
    timeWeather: String(idea.timeWeather || '').trim(), colorPalette: String(idea.colorPalette || '').trim(),
    cameraGrammar: String(idea.cameraGrammar || idea.cameraStyle || '').trim(), costumeLogic: String(idea.costumeLogic || '').trim(),
    recurringMotif: String(idea.recurringMotif || '').trim(), ending: String(idea.ending || '').trim(),
    uniquenessReason: String(idea.uniquenessReason || idea.whyUnique || '').trim(),
    visualFamily: String(idea.visualFamily || idea.family || '').trim(),
    viralHookMechanism: String(idea.viralHookMechanism || idea.hookMechanism || '').trim(),
    channelFitReason: String(idea.channelFitReason || '').trim(),
    seasonalAngle: String(idea.seasonalAngle || '').trim(),
    lyricFitScore: Number(idea.lyricFitScore) || 0,
    channelFitScore: Number(idea.channelFitScore) || 0,
    viralPotentialScore: Number(idea.viralPotentialScore) || 0,
    diversityScore: Number(idea.diversityScore) || 0,
    feasibilityScore: Number(idea.feasibilityScore) || 0,
    totalScore: Number(idea.totalScore || idea.score) || 0,
    forbiddenRepeats: Array.isArray(idea.forbiddenRepeats) ? idea.forbiddenRepeats.map(String) : [], score: Number(idea.score || idea.totalScore) || 0
  };
}

function loadIdeaHistory() { try { return JSON.parse(localStorage.getItem(IDEA_HISTORY_KEY) || '[]'); } catch { return []; } }
function ideaFingerprint(idea) { return [idea.title, idea.visualWorld, idea.centralSymbol, ...(idea.locations || []), idea.cameraGrammar, idea.recurringMotif, idea.ending].join(' ').toLocaleLowerCase('sr-RS').replace(/[^a-z0-9čćžšđ]+/gi, ' ').trim(); }
function tokenSet(text) { return new Set(String(text || '').split(/\s+/).filter(token => token.length > 3)); }
function jaccardSimilarity(a, b) { const aa=tokenSet(a), bb=tokenSet(b); if(!aa.size||!bb.size)return 0; let intersection=0; aa.forEach(token=>{if(bb.has(token))intersection+=1;}); return intersection/(aa.size+bb.size-intersection); }
function uniquenessScoreForIdea(idea) { const history=loadIdeaHistory().filter(item=>item.projectId!==state.projectId); const fingerprint=ideaFingerprint(idea); const highest=history.reduce((max,item)=>Math.max(max,jaccardSimilarity(fingerprint,item.fingerprint||String(item))),0); return Math.max(0,Math.round((1-highest)*100)); }
function saveIdeaFingerprint(idea) { const history=loadIdeaHistory(); history.push({projectId:state.projectId,songTitle:state.songTitle,title:idea.title,fingerprint:ideaFingerprint(idea),savedAt:new Date().toISOString()}); const compact=history.slice(-30); localStorage.setItem(IDEA_HISTORY_KEY,JSON.stringify(compact)); state.uniquenessHistory=compact; }


function compactLyric(text, max = 105) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

function analyzeSongForIdeas() {
  const parsed = parseLyrics(state.lyrics);
  const joined = parsed.map(item => item.text).join(' ');
  const first = parsed[0]?.text || 'početna emocija pesme';
  const middle = parsed[Math.floor(parsed.length / 2)]?.text || first;
  const last = parsed.at(-1)?.text || middle;
  const emotionScores = ['usamljenost','gubitak','čežnja','slomljeno srce','nada','ljubav'].map(name => ({ name, score: parsed.filter(line => detectEmotion(line.text) === name).length }));
  emotionScores.sort((a,b) => b.score - a.score);
  const dominant = emotionScores[0]?.score ? emotionScores[0].name : (state.mood || 'melanholija');
  const words = joined.toLocaleLowerCase('sr-RS').replace(/[^a-z0-9čćžšđ\s]/gi,' ').split(/\s+/).filter(word => word.length > 4);
  const stop = new Set(['koji','koja','koje','kada','samo','više','nikad','opet','zbog','onda','tvoje','moja','moje','tebe','mene','jednom','sada','danas','uvek','svaki','svaka','srce','ljubav']);
  const counts = {};
  words.filter(word => !stop.has(word)).forEach(word => counts[word] = (counts[word] || 0) + 1);
  const anchors = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,6).map(([word]) => word);
  return { parsed, joined, first, middle, last, dominant, anchors };
}

const LOCAL_IDEA_BLUEPRINTS = [
  {
    title:'POSLEDNJA NOĆNA LINIJA',
    visualWorld:'realističan noćni gradski prevoz viđen kroz prazne stanice, servisne prolaze i poslednje polaske, bez generičnog stajanja na kiši',
    symbol:'neiskorišćena papirna karta sa probušenim samo jednim poljem',
    hook:'devojka u prvom kadru ulazi u skoro prazan autobus, ali umesto da sedne ostavlja kartu na sedištu koje očigledno čuva za nekoga ko neće doći',
    locations:['poslednji gradski autobus','depo gradskog prevoza','podzemni prolaz stanice','prazna okretnica pred zoru','servisni hodnik sa redovima ugašenih displeja'],
    weather:'hladna noć koja polako prelazi u bledo jutro, mokar asfalt samo kao realističan detalj, ne kao glavni kliše',
    palette:'tamno plava, prigušena tirkizna, natrijum-amber i kratki crveni signali kočnica',
    camera:'dugi kontrolisani tracking kadrovi kroz prolaze, precizni inserti predmeta i povremeni stabilni krupni kadrovi bez melodramatičnog plakanja',
    costume:'urbana garderoba koja se menja po vremenu i delu noći; elegantna, praktična i različita po lokacijama',
    motif:'brojevi linija koji nestaju sa displeja i vrata koja se zatvaraju sekund pre odluke',
    ending:'devojka na praznoj okretnici pocepa kartu samo do pola, drugi deo sačuva u džepu i odlazi peške prema jutarnjem svetlu'
  },
  {
    title:'CRVENA SOBA ZA FOTOGRAFIJE',
    visualWorld:'savremena analogna foto-laboratorija, kontaktne kopije, hemijske posude i fotografije koje se pojavljuju postepeno u crvenom sigurnosnom svetlu',
    symbol:'jedan nerazvijen kadar koji ostaje beo dok se sve ostale slike pojavljuju',
    hook:'u crvenoj tami devojka spušta papir u razvijač očekujući lice, ali na papiru ostaje samo prazno mesto pored nje',
    locations:['foto-laboratorija sa crvenim svetlom','mala galerija pre otvaranja','arhivska soba sa negativima','krov zgrade gde se suše velike fotografije','ulična foto-kabina koja radi celu noć'],
    weather:'sparna letnja noć sa kratkom olujom između enterijera i krova',
    palette:'duboka crvena, crna, prljavo bela, srebrno-siva i povremena hladna munja',
    camera:'makro detalji hemije i papira, 50mm intimni kadrovi i spori prelazi iz tamnog u svetlo bez kolaža ili split-screen efekta',
    costume:'minimalistička moderna garderoba prilagođena radu u laboratoriji, galeriji i krovu; bez ponavljanja istog kompleta',
    motif:'slika koja se pojavi tek kada je lik spreman da vidi istinu',
    ending:'poslednji beli papir konačno pokaže samo njen odraz bez druge osobe; ona ga ne baci već ga okači samog na zid'
  },
  {
    title:'STAKLENIK POSLE OLUJE',
    visualWorld:'veliki gradski staklenik i servisni prostori botaničke bašte tokom oluje, sa realnim biljkama, kapljicama i radom na spašavanju polomljenih stabljika',
    symbol:'jedna biljka vezana mekanom trakom koja uprkos lomu nastavlja da stoji',
    hook:'vetar otvara ventilacioni prozor, devojka ga zatvara jednom rukom dok drugom štiti malu polomljenu biljku koja je povezana sa prvim stihom',
    locations:['glavni staklenik','uski servisni most iznad biljaka','prostor za presađivanje','spoljašnji vrt posle pljuska','magacin glinenih saksija'],
    weather:'jaka letnja oluja koja se smiruje kroz pesmu i ostavlja čist vazduh pred kraj',
    palette:'tamno zelena, mokra crna zemlja, mlečno staklo, hladno siva i diskretni topli refleksi radnih lampi',
    camera:'organski steadicam kroz redove biljaka, makro kapljice kao prelazi i široki kadrovi koji pokazuju fizički rad umesto poziranja',
    costume:'moderna elegantno-praktična odeća sa promenama zbog vlage, rada i izlaska napolje; nikada ista bez opravdanja',
    motif:'vezivanje, podupiranje i puštanje novih listova kao konkretna vizuelna paralela emociji',
    ending:'devojka uklanja privremenu potporu tek kada biljka može sama da stoji, a zatim otvara vrata staklenika prema mirnom jutru'
  },
  {
    title:'BIOSKOP POSLE POSLEDNJE PROJEKCIJE',
    visualWorld:'stari ali funkcionalan gradski bioskop posle zatvaranja, projekciona kabina, prazna sala, servisni hodnici i svetlo projektora bez retro kostimiranja',
    symbol:'jedan isečen kadar filmske trake koji nikada ne uđe u projektor',
    hook:'devojka zaustavlja projektor tačno pre slike koja bi otkrila uspomenu, ali svetlosni snop nastavlja da prolazi kroz prašinu iznad praznih sedišta',
    locations:['projekciona kabina','prazna velika sala','hodnik sa ugašenim posterima','mala scena iza platna','krov bioskopa sa ventilacionim uređajima'],
    weather:'mirna vetrovita noć, bez kiše, sa prvim jutarnjim svetlom iznad krova',
    palette:'ugljeno crna, izbledela bordo, toplo projektorsko svetlo, hladno plava sa krova',
    camera:'precizni 35mm i 85mm kadrovi, spore vožnje kroz redove sedišta i fizički prelazi kroz svetlosni snop',
    costume:'savremena urbana elegancija prilagođena radu iza scene i izlasku na krov, bez vintage maskiranja',
    motif:'prekid filma, ponovno spajanje i odluka koji kadar ostaje van priče',
    ending:'ona ubacuje novu praznu rolnu, projektor osvetli belo platno, a zatim napušta kabinu pre nego što se pojavi bilo kakva slika'
  },
  {
    title:'RADIO KOJI VIŠE NE PRIMA POZIVE',
    visualWorld:'lokalna noćna radio-stanica sa živim studiom, tonskom režijom, hodnicima i krovnom antenom, bez prikazivanja pisanih stihova',
    symbol:'jedan ugašen kanal na mikseti čiji indikator povremeno zatreperi bez zvuka',
    hook:'devojka čuje signal dolaznog poziva, podigne slušalice, ali na drugoj strani ostane samo tihi šum koji menja njen pogled',
    locations:['radio studio','tonska režija','hodnik sa akustičnim panelima','stepenište prema krovu','krov pored antene pred svitanje'],
    weather:'suva hladna noć sa jakim vetrom na krovu i potpunom tišinom u studiju',
    palette:'tamno plava, zelena svetla miksete, prigušena narandžasta lampica ON AIR i srebrno jutro',
    camera:'ritmični detalji prekidača i talasnih indikatora, kontrolisani krupni kadrovi i sporo kruženje kamere u studiju',
    costume:'moderna noćna urbana garderoba, slojevita zbog krova, ali bez ponavljanja i bez podrazumevanog džempera',
    motif:'signal koji postoji bez poruke i tišina koja postaje jasnija od reči',
    ending:'devojka sama ugasi lampicu ON AIR, ostavi slušalice uredno na stolu i na krovu prvi put skine ruku sa antene'
  },
  {
    title:'ARHIVA NEPOSLATIH PAKETA',
    visualWorld:'veliki savremeni logistički centar noću, transportne trake, ormarići, skeneri i izdvojeni paket koji nikada nije dobio konačnu adresu',
    symbol:'mali paket bez etikete koji se svaki put vraća na početak trake',
    hook:'među stotinama paketa koji prolaze automatski, devojka zaustavlja samo jedan bez adrese i drži ga uz telo dok traka nastavlja da radi',
    locations:['sortirni centar','red pametnih paketomata','servisni tunel ispod traka','utovarna rampa','tiha kancelarija za izgubljene pošiljke'],
    weather:'hladna suva noć sa maglom samo na spoljnoj rampi',
    palette:'industrijsko plava, neutralno bela, signalno crvena, kartonsko braon i hladna magla',
    camera:'geometrijski široki kadrovi traka, dinamični bočni tracking i intimni detalji ruku koje biraju jedan predmet',
    costume:'elegantna savremena odeća prilagođena industrijskom prostoru, sa zaštitnim elementima samo gde su realno potrebni',
    motif:'predmeti koji znaju gde idu nasuprot jednom predmetu bez odredišta',
    ending:'ona ne pokušava više da pronađe adresu; otvara paket, uzima samo jedan lični predmet i ostatak ostavlja u arhivi'
  },
  {
    title:'BAZEN BEZ VODE',
    visualWorld:'zatvoren gradski bazen tokom renoviranja, prazna školjka bazena, tribine, svlačionice i servisni kanali pre ponovnog punjenja',
    symbol:'jedna mala plava pločica koja nedostaje na dnu i koju devojka nosi kroz ceo spot',
    hook:'devojka hoda po suvom dnu dubokog bazena dok iznad nje radnici zatvaraju poslednja svetla, a ona pronađe pločicu na mestu koje odgovara prvom stihu',
    locations:['suvo dno olimpijskog bazena','prazne tribine','hodnik svlačionica','servisni prostor sa cevima','krov sa pogledom na stakleni plafon'],
    weather:'predzimsko jutro sa bledim suncem koje postepeno ulazi kroz visoke prozore',
    palette:'izbledela akva, beton siva, hladno bela i nekoliko toplih sunčevih linija',
    camera:'vrlo široki arhitektonski kadrovi, niski uglovi sa dna bazena, makro detalji vode koja se pojavljuje tek pred kraj',
    costume:'moderna odeća koja ostaje realistična za hladan zatvoren prostor; promena obuće i slojeva prati radnju',
    motif:'praznina koja ima jasan oblik i polagano vraćanje vode kao promena emocionalnog stanja',
    ending:'voda počinje da ulazi, ona vraća poslednju pločicu na ivicu umesto na staro mesto i penje se pre nego što dno nestane'
  },
  {
    title:'NOĆNA PEKARA PRE OTVARANJA',
    visualWorld:'savremena zanatska pekara tokom noćne smene, testo, para, brašno, rashladna komora i tiha ulica pred jutarnje otvaranje',
    symbol:'jedan hleb koji nikada ne dobije završni rez na površini',
    hook:'devojka pravi dva ista mala hleba, ali pre pečenja jedan skloni sa pleha i ostavi ga u tišini na hladnom stolu',
    locations:['glavna pekara','rashladna komora','mali magacin brašna','zadnji izlaz prema praznoj ulici','prodajni deo neposredno pre otvaranja'],
    weather:'hladna noć napolju i topla para unutra, sa čistim jutarnjim svetlom na kraju',
    palette:'topla boja pečene kore, krem, siva nerđajućeg čelika, hladno plava spolja',
    camera:'taktilni makro kadrovi ruku i materijala, spori bočni pokreti uz radne stolove i mirni portreti bez poziranja',
    costume:'čista moderna radna odeća kombinovana sa elegantnim ličnim detaljima, menja se kada izađe iz radnog prostora',
    motif:'čekanje da nešto naraste, odluka šta ide u vatru i šta ostaje nedovršeno',
    ending:'pred otvaranje ona prvi put napravi samo jedan hleb, zaseče ga svojim znakom i otključa vrata prema jutarnjoj ulici'
  },
  {
    title:'TRAJEKT U GUSTOJ MAGLI',
    visualWorld:'realističan putnički trajekt između dve obale, unutrašnji salon, paluba, mašinski hodnik i terminal bez turističke razglednice',
    symbol:'metalni broj ormarića čiji ključ ne odgovara nijednoj bravi',
    hook:'devojka na palubi pokušava da vidi drugu obalu kroz maglu, zatim u džepu pronađe ključ sa brojem koji nije na planu trajekta',
    locations:['spoljna paluba','unutrašnji putnički salon','hodnik sa kabinama','terminal za ukrcavanje','donji servisni prolaz uz zatvorene cevi'],
    weather:'gusta jutarnja magla koja se razdvaja tek u završnoj trećini pesme',
    palette:'mlečno siva, tamno morsko plava, prigušena žuta signalna svetla i hladan metal',
    camera:'dugi stabilni kadrovi kroz uske prolaze, vetrom pokretani detalji i široki horizonti koji ostaju bez jasne obale',
    costume:'elegantna praktična odeća za hladnu palubu, drugačiji slojevi u salonu i terminalu',
    motif:'kretanje između dve tačke dok pravi cilj ostaje nepoznat',
    ending:'magla se otvori, ali ona ne gleda pristanište; spušta ključ u kutiju za izgubljene predmete i izlazi sa putnicima bez okretanja'
  },
  {
    title:'BIBLIOTEKA POSLE ZATVARANJA',
    visualWorld:'velika savremena biblioteka i podzemna arhiva nakon radnog vremena, automatske police, knjigoveznica i čitaonica pod noćnim svetlom',
    symbol:'jedna knjiga kojoj nedostaje poslednja stranica, ali korice ostaju neoštećene',
    hook:'automatska polica se zatvara, a devojka u poslednjoj sekundi izvlači knjigu koja nema naslov i otvara je tačno na praznom završetku',
    locations:['glavna čitaonica','pokretne arhivske police','knjigoveznica','stakleni lift između spratova','spoljašnji plato biblioteke pred zoru'],
    weather:'mirna suva noć sa slabim vetrom i čistim predjutarnjim svetlom',
    palette:'tamno drvo, maslinasto zelena, prigušeno zlato lampi, plavo-siva iz staklenog lifta',
    camera:'simetrični arhitektonski kadrovi koji se postepeno lome, sporo praćenje između polica i detalji papira bez čitljivog teksta',
    costume:'sofisticirana ali svakodnevna urbana odeća, različita između čitaonice, arhive i spoljnog prostora',
    motif:'traženje završetka koji ne postoji i odluka da se priča ne dopisuje silom',
    ending:'ona vraća knjigu na novu praznu policu, ostavlja prostor pored nje i izlazi dok se svetla gase redom iza nje'
  },
  {
    title:'HOTEL IZGUBLJENIH KLJUČEVA',
    visualWorld:'savremen mali gradski hotel tokom noćne smene, recepcija, servisni lift, hodnici, vešeraj i soba za pronađene predmete bez luksuznog glamura',
    symbol:'jedan mesingani ključ bez broja koji ne pripada nijednoj sobi',
    hook:'devojka na recepciji vraća ključeve u numerisane pregrade, ali jedan bez broja ostaje u njenom dlanu dok se vrata lifta zatvaraju',
    locations:['noćna recepcija','servisni lift','hodnik praznog sprata','hotelski vešeraj','soba izgubljenih predmeta'],
    weather:'tiha noć sa suvim vetrom napolju i prvim sivim svetlom kroz ulazna vrata',
    palette:'tamni petrol, mesing, prigušeno krem svetlo, sivo-plavo jutro',
    camera:'kontrolisani dolly kadrovi kroz hodnike, precizni detalji ključeva i mirni 65mm portreti sa dubinom',
    costume:'moderna uredna garderoba noćne smene, drugačiji slojevi u servisnim prostorima i pri izlasku',
    motif:'vrata koja imaju broj nasuprot jednom ključu bez pripadanja',
    ending:'ona ostavlja ključ u providnoj kutiji bez etikete, završava smenu i izlazi kroz vrata koja se otvaraju bez ključa'
  },
  {
    title:'KROJAČNICA NEDOVRŠENE HALJINE',
    visualWorld:'savremena krojačka radionica posle radnog vremena, stolovi za krojenje, probna kabina, magacin tkanina i mala izložbena sala',
    symbol:'jedan rukav koji je precizno skrojen, ali nikada nije prišiven',
    hook:'devojka podigne nedovršenu haljinu prema svetlu, primeti da nedostaje samo jedan rukav i umesto da ga prišije pažljivo ga odloži',
    locations:['glavni sto za krojenje','probna kabina','magacin tkanina','mala izložbena sala','zadnji prolaz radionice'],
    weather:'kiša se čuje samo kroz krovni prozor, a kraj prelazi u suvo jutro',
    palette:'grafit siva, tamna višnja, boja prirodnog platna, hladna bela radna svetla',
    camera:'taktilni makro kadrovi konca i makaza, bočni 50mm pokreti i široki geometrijski kadrovi stolova',
    costume:'savremena ženstvena praktična odeća prilagođena radu, proba različitih silueta samo kada priča to zahteva',
    motif:'merenje, sečenje i odluka da se nešto ne dovrši po starom kroju',
    ending:'ona od nedovršenog rukava napravi malu traku za kosu, ugasi radno svetlo i haljinu ostavi drugačijom, ali završenom'
  },
  {
    title:'OPSERVATORIJA POSLE IZGUBLJENOG SIGNALA',
    visualWorld:'gradska opservatorija i tehnički prostori tokom noći bez naučno-fantastičnih elemenata, kupola, kontrolna soba, servisne merdevine i plato pred zoru',
    symbol:'jedna tačka na papirnoj zvezdanoj mapi koja više nema odgovarajući signal na monitoru',
    hook:'devojka prati tačku kroz teleskop, signal naglo nestane, a ona umesto ponovnog traženja ručno zatvara otvor kupole',
    locations:['kupola teleskopa','kontrolna soba','servisni prolaz kupole','mračna stepeništa','spoljašnji plato opservatorije'],
    weather:'vedro hladno nebo sa tankim oblacima koji ulaze tek pred jutro',
    palette:'duboka indigo, crna, crvena sigurnosna svetla, hladno srebro zore',
    camera:'spori kružni pokreti ograničeni konstrukcijom kupole, 85mm detalji oka i mehanike, široki kadrovi stvarnog neba',
    costume:'elegantna praktična odeća za hladnu tehničku zgradu, bez futurističkih kostima',
    motif:'traženje tačke koja se ne vraća i prihvatanje praznog koordinatnog mesta',
    ending:'ona skine mapu sa nosača, presavije je bez cepanja i izađe na plato gledajući nebo bez instrumenta'
  },
  {
    title:'AKVARIJUM TOKOM NOĆNOG ODRŽAVANJA',
    visualWorld:'javni akvarijum posle zatvaranja, servisni hodnici iza bazena, laboratorija za vodu i prazna galerija sa realnim morskim svetlom',
    symbol:'mala providna posuda sa vodom iz jednog bazena koju devojka nosi kroz različite prostorije',
    hook:'dok se svetla galerije gase redom, devojka ostaje osvetljena samo talasanjem vode i primećuje da jedna prazna posuda još čuva kretanje',
    locations:['glavna galerija akvarijuma','servisni hodnik iza stakla','laboratorija za vodu','prostor sa pumpama','izlazna rampa pred jutro'],
    weather:'mirna vlažna noć, bez kiše, sa svetlim jutarnjim vazduhom na izlazu',
    palette:'duboka morska plava, akva, crna, laboratorijski bela i diskretna amber signalna svetla',
    camera:'spori paralelni pokreti uz staklo, makro refleksije vode bez dupliranja lica i stabilni široki kadrovi servisnih prostora',
    costume:'moderna odeća prilagođena vlažnom enterijeru i tehničkom radu, sa logičnim promenama obuće i slojeva',
    motif:'voda koja prenosi pokret iako izvor više nije u kadru',
    ending:'ona vrati vodu u novi mali bazen za biljke, ispere praznu posudu i izađe dok se javna svetla ponovo pale'
  },
  {
    title:'MUZEJSKI DEPO BEZ POSTAVKE',
    visualWorld:'savremen muzejski depo, restauratorska radionica, teretni lift i prazna galerija pre nove izložbe, bez prikazivanja poznatih umetničkih dela',
    symbol:'jedan prazan okvir sa tragom prašine koji pokazuje da je nešto dugo bilo unutra',
    hook:'devojka otkriva zaštitno platno očekujući sliku, ali nalazi samo prazan okvir i sopstvenu senku na zadnjoj ploči',
    locations:['muzejski depo','restauratorski sto','teretni lift','prazna galerija','utovarna zona muzeja'],
    weather:'hladno suvo jutro nakon duge noćne smene',
    palette:'neutralno siva, platneno bež, oksidirano zlato, hladna galerijska bela',
    camera:'precizni frontalni kadrovi koji izbegavaju statičnost, spori push-in kroz slojeve zaštitnih materijala i detalji ruku',
    costume:'savremena elegantno-praktična odeća sa zaštitnim rukavicama samo tokom realnog rada',
    motif:'ono što se čuva, ono što se izlaže i prazno mesto koje više ne treba popunjavati',
    ending:'ona postavi prazan okvir na zid kao nameran završni element, ukloni rukavice i prva napusti galeriju'
  },
  {
    title:'ŠTAMPARIJA PRE POSLEDNJEG OTISKA',
    visualWorld:'mala moderna štamparija noću, velike mašine, prostor za sušenje, skladište papira i dostavna zona, bez čitljivih poruka na papiru',
    symbol:'jedan list koji kroz mašinu prolazi potpuno beo dok svi ostali dobijaju boju',
    hook:'devojka pokrene probni otisak, mašina izbacuje savršeno beo list, a ona ga ne vraća u proces već ga zadržava',
    locations:['glavna štamparska mašina','sto za kontrolu boje','prostor za sušenje','skladište rolni papira','dostavna zona pred zoru'],
    weather:'vlažna noć spolja i suva topla unutrašnjost, kraj u bledom jutru',
    palette:'cijan, magenta, prigušena žuta, crna i čista bela papira',
    camera:'ritmični tracking uz mašinu, makro detalji valjaka i boje, mirni portreti između ciklusa bez treperenja',
    costume:'čista moderna radna odeća sa ženstvenim urbanim detaljima, bez modnog poziranja',
    motif:'ponavljanje otiska nasuprot jednom listu koji ostaje prazan',
    ending:'ona ugasi mašinu pre automatskog novog ciklusa, presavije beli list i odnese ga na dnevno svetlo'
  },
  {
    title:'DEPO ZA PRANJE VOZOVA',
    visualWorld:'veliki železnički servisni depo noću, spoljne platforme, tunel za pranje, prazni vagoni i kontrolna kabina bez putničkog romantizovanja',
    symbol:'jedan trag prsta na zamagljenom prozoru koji pranje ne ukloni potpuno',
    hook:'voz prolazi kroz vodene četke, devojka iz praznog vagona prati trag na staklu koji ostaje vidljiv uprkos pranju',
    locations:['prazan putnički vagon','tunel za pranje','servisna platforma','kontrolna kabina','spoljni kolosek pred zoru'],
    weather:'hladna noć sa industrijskom parom i jasnim jutrom na kraju',
    palette:'čelično plava, mokra crna, hladna bela, kratki crveni signali i bledo jutarnje zlato',
    camera:'linearni tracking kroz vagon, krupni detalji vode na staklu i široki kadrovi realne servisne geometrije',
    costume:'moderna praktična urbana odeća sa zaštitnim slojem samo na platformi',
    motif:'čišćenje spoljne površine dok jedan unutrašnji trag ostaje',
    ending:'ona sama obriše poslednji trag, otvori vrata na suvoj strani depoa i izađe pre prvog polaska'
  },
  {
    title:'KERAMIČKA PEĆ POSLE PUCANJA',
    visualWorld:'savremeni keramički studio, prostor za oblikovanje, glaziranje, velika peć i dvorište sa policama za sušenje',
    symbol:'jedna činija sa tankom pukotinom kroz koju svetlo prolazi bez raspadanja predmeta',
    hook:'devojka otvara ohlađenu peć i među savršenim predmetima prvo uzima činiju sa jednom pukotinom',
    locations:['sto za oblikovanje gline','prostor za glaziranje','velika keramička peć','police za sušenje','malo dvorište studija'],
    weather:'suva hladna noć koja prelazi u mekano jutarnje sunce',
    palette:'zemljano braon, mat crna, krem glina, kobalt plava i toplo svetlo peći',
    camera:'taktilni makro kadrovi gline i vode, spori 50mm pokreti oko radnog stola i široki kadrovi peći',
    costume:'moderna ukusna odeća prilagođena radu sa glinom, različita pre i posle izlaska iz studija',
    motif:'pritisak, toplota i pukotina koja ne mora da znači kraj',
    ending:'ona pukotinu ne skriva bojom; postavi činiju na jutarnje svetlo, natoči vodu i proveri da li i dalje može da služi'
  },
  {
    title:'SERVIS KROVNIH REZERVOARA',
    visualWorld:'krovovi stambenih zgrada sa realnim rezervoarima vode, pumpna soba, stepeništa i tehnički prolazi iznad grada',
    symbol:'jedan manometar koji pokazuje pritisak iako je glavni ventil zatvoren',
    hook:'devojka zatvori veliki ventil, ali kazaljka nastavi da se pomera; ona prati cev umesto da panično ponovo otvori sistem',
    locations:['pumpna soba','krov sa rezervoarima','usko tehničko stepenište','prolaz između zgrada','jutarnji krov sa pogledom na grad'],
    weather:'jak suv vetar tokom noći, oblaci se razilaze pred izlazak sunca',
    palette:'beton siva, tamno plava, oksidirano zeleno, signalno crvena i svetlo jutarnje zlato',
    camera:'niskougaoni arhitektonski kadrovi, stabilno praćenje uz cevi i precizni detalji ruku i kazaljke',
    costume:'savremena praktična odeća za vetrovit krov sa sigurnosnim elementima samo gde su realno potrebni',
    motif:'pritisak koji ostaje posle zatvaranja i traženje pravog mesta oslobađanja',
    ending:'ona pronađe mali sigurnosni ventil, polako oslobodi pritisak i ostane na krovu dok sistem postaje tih'
  },
  {
    title:'STAKLENI LIFT IZMEĐU SPRATOVA',
    visualWorld:'velika poslovna zgrada posle radnog vremena, stakleni lift, prazni spratovi, tehnička kontrolna soba i ulazni hol',
    symbol:'jedno dugme sprata koje svetli iako više ne vodi na aktivan nivo',
    hook:'devojka ulazi u stakleni lift, pritisne poznat sprat, ali lift stane između nivoa i otvori pogled na prostor koji nikada ranije nije videla',
    locations:['stakleni lift','prazan kancelarijski sprat','kontrolna soba lifta','stepenište za evakuaciju','ulazni hol pred jutro'],
    weather:'grad je suv i tih, sa maglom samo oko viših spratova',
    palette:'hladno staklo, čelik, prigušena zelena signalna svetla, amber hol i plavo jutro',
    camera:'vertikalni pokreti usklađeni sa liftom, kontrolisani 35mm kadrovi kroz staklo i detalji dugmadi bez čitljivih natpisa',
    costume:'moderna urbana elegancija koja ostaje realistična za praznu poslovnu zgradu i tehničke prolaze',
    motif:'izbor sprata, zastoj između starih i novih odluka i promena pravca bez pada',
    ending:'ona ne čeka servis da je vrati na stari sprat; izlazi na najbliži bezbedan nivo i silazi poslednji deo stepenicama'
  }
];

function groundedSongMaterial(analysis) {
  const locations=[];
  const reasons=[];
  const addLocation=(location,reason)=>{
    const clean=String(location||'').trim();
    if(!clean||locations.includes(clean)) return;
    locations.push(clean);
    reasons.push(`${clean}: ${reason}`);
  };
  for(const line of analysis.parsed){
    const matches=lyricLocationMatches(line.text);
    for(const rule of matches){
      for(const setting of rule.settings.slice(0,2)) addLocation(setting,`${rule.reason}; veza sa stihom „${compactLyric(line.text,80)}“`);
    }
  }
  if(!locations.length){
    addLocation('realističan privatni prostor definisan konkretnom radnjom iz prvog stiha',`tekst ne imenuje mesto, zato prostor proizlazi iz radnje „${compactLyric(analysis.first,80)}“`);
    addLocation('neposredno svakodnevno okruženje u kojem posledica srednjeg stiha može fizički da se vidi',`prostor je podređen smislu stiha „${compactLyric(analysis.middle,80)}“`);
    addLocation('završni prag, izlaz ili miran prostor koji logično završava radnju poslednjeg stiha',`završetak proizlazi iz stiha „${compactLyric(analysis.last,80)}“`);
  }
  const text=normalizeLyricText(analysis.joined);
  const symbols=[];
  const addSymbol=value=>{ if(value&&!symbols.includes(value)) symbols.push(value); };
  if(/telefon|poziv|poruk|broj|javi/.test(text)) addSymbol('telefon sa neposlatom ili neprimljenom porukom, bez čitljivog teksta na ekranu');
  if(/voz|autobus|stanic|put|odlaz|vrati|kofer/.test(text)) addSymbol('karta, ključ ili mali predmet putovanja koji menja vlasnika ili ostaje iza lika');
  if(/slik|fotograf|uspomen|sec|pamt|prosl/.test(text)) addSymbol('jedna fotografija ili lični predmet iz uspomene, bez čitljivih natpisa');
  if(/kisa|oluja|kap|mokar|pljusak/.test(text)) addSymbol('trag vode na realnom predmetu koji se menja kroz pesmu');
  if(/cek|kasni|vreme|sat/.test(text)) addSymbol('sat, prazno mesto ili predmet koji pokazuje posledicu čekanja bez vidljivih brojki');
  if(/dom|kuca|stan|soba|krevet|vrata|prozor/.test(text)) addSymbol('jedan svakodnevni predmet para koji više nema svoju drugu polovinu');
  if(/more|talas|obala|brod|luka|pesak/.test(text)) addSymbol('mali predmet sa obale ili putovanja koji se vraća u kadar u drugačijem značenju');
  if(/bog|molit|crk|greh|oprosti/.test(text)) addSymbol('diskretan predmet lične molitve ili oproštaja, bez teatralne ikonografije');
  if(/dete|devojcic|majka|otac|porodic/.test(text)) addSymbol('mali porodični predmet koji jasno pripada detetu ili zajedničkom domu');
  if(/srce|volim|ljubav|poljub|zagrlj/.test(text)) addSymbol('dva obična predmeta koja su nekada činila par, a kroz spot ostaje samo jedan');
  for(const anchor of analysis.anchors.slice(0,4)) addSymbol(`konkretan fizički predmet ili trag povezan sa motivom „${anchor}“, izveden iz teksta a ne iz nasumične dekoracije`);
  ['ključ koji otvara ili zatvara stvarni prag u priči','prazno mesto u svakodnevnoj radnji koja je ranije zahtevala dve osobe','jedan lični predmet čija se funkcija menja od početka do kraja'].forEach(addSymbol);
  return { locations:locations.slice(0,8), reasons:reasons.slice(0,8), symbols:symbols.slice(0,10) };
}

const LOCAL_NARRATIVE_MODES = [
  { title:'HRONOLOŠKI DAN KOJI MENJA ZNAČENJE', camera:'jasna filmska progresija od širokih situacionih kadrova ka intimnim detaljima, sa promenom svetla koja prati emocionalni luk', hook:'prvi stih se odmah pretvara u konkretnu radnju sa vidljivom posledicom u prvoj sekundi', ending:'poslednji stih završava jednu svakodnevnu radnju drugačije nego na početku' },
  { title:'JEDAN PREDMET KROZ CELU PESMU', camera:'makro detalji predmeta povezani sa stabilnim 35mm i 50mm narativnim kadrovima, bez kolaža', hook:'predmet iz teksta u prvom kadru radi suprotno od očekivanog i odmah otkriva problem', ending:'isti predmet dobija novu funkciju i zaključuje priču bez pisanog objašnjenja' },
  { title:'OD PRVOG PRAGA DO POSLEDNJEG IZLASKA', camera:'kontrolisani tracking kroz pragove, vrata i promene prostora, svaki prelaz ima fizički uzrok', hook:'lik zastane na prvom pragu zbog detalja direktno vezanog za prvi stih', ending:'lik poslednji prag prelazi bez osvrtanja, ali ostavlja jedan tačno određen trag' },
  { title:'RUTINA KOJA SE RASPADA U MALIM DETALJIMA', camera:'realistični srednji kadrovi svakodnevnih radnji, precizni inserti ruku i predmeta, bez generičnog poziranja', hook:'obična radnja odmah zapne zbog odsustva, poruke ili predmeta iz stiha', ending:'lik svesno menja rutinu i dovršava je samostalno' },
  { title:'TRI FAZE ISTE EMOCIJE', camera:'tri jasno različite vizuelne faze sa zasebnim objektivima, paletom i ritmom, ali stabilnim identitetom i pričom', hook:'prva faza pokazuje nadu kroz aktivnu odluku, ne kroz stajanje i gledanje', ending:'treća faza pokazuje prihvatanje kroz konkretnu posledicu poslednjeg stiha' },
  { title:'UZROK I POSLEDICA SVAKOG STIHA', camera:'svaki kadar počinje uzrokom, prati kratku fizičku akciju i završava posledicom koja motiviše sledeći kadar', hook:'prva radnja proizvodi neočekivanu posledicu koja vizuelno objašnjava prvi stih', ending:'lanac posledica završava se jednom mirnom, konačnom odlukom' },
  { title:'SEĆANJE KROZ STVARNE TRAGOVE', camera:'sadašnjost ostaje u realnom prostoru; prošlost se sugeriše predmetima, svetlom i ponašanjem bez flashback kolaža ili split screena', hook:'lik otkriva fizički trag koji ne bi trebalo da bude tu i reaguje kontrolisano', ending:'trag se ne uništava teatralno već dobija novo, mirnije mesto' },
  { title:'PUTANJA SUPROTNA OD OČEKIVANE', camera:'linearni pokreti i promene pravca motivisani stihovima, sa jasnim prostornim kontinuitetom', hook:'lik kreće prema očekivanom cilju iz stiha, ali prvi detalj menja smer', ending:'konačni pravac odgovara poslednjem stihu i zatvara prostornu priču' },
  { title:'TIŠINA IZMEĐU DVE RADNJE', camera:'duži kontrolisani kadrovi sa mikro-pokretima, zvučno i vizuelno aktivnim okruženjem, bez teatralnog plakanja', hook:'okruženje nastavlja da radi dok lik prekida samo jednu malu radnju povezanu sa stihom', ending:'lik ponovo pokrene ili konačno ugasi tu radnju u skladu sa završnim stihom' },
  { title:'SPOT GRAĐEN OKO TRI HOOKA', camera:'tri snažna ali različita vizuelna hooka raspoređena kroz pesmu, između njih mirniji narativni kadrovi održavaju uzrok i posledicu', hook:'prvi hook koristi najsnažniji konkretan motiv iz prvog stiha bez teksta i klišea', ending:'treći hook vraća centralni simbol u potpuno promenjenom značenju' }
];

function generateTenIdeasLocally(showMessage = true) {
  collectFormState();
  const analysis = analyzeSongForIdeas();
  if (!analysis.parsed.length) {
    showToast('Tekst nema prepoznate stihove. Oznake kao [Intro] nisu stihovi — nalepi pravi tekst pesme.');
    showPanel('project');
    return false;
  }
  const material=groundedSongMaterial(analysis);
  const first=compactLyric(analysis.first), middle=compactLyric(analysis.middle), last=compactLyric(analysis.last);
  const historyTitles=new Set(loadIdeaHistory().filter(item=>item.projectId!==state.projectId).map(item=>String(item.title||'').toLocaleLowerCase('sr-RS')));
  state.ideaGenerationNonce=(Number(state.ideaGenerationNonce)||0)+1;
  const rotation=(state.ideaGenerationNonce-1)%LOCAL_NARRATIVE_MODES.length;
  const modes=Array.from({length:10},(_,i)=>LOCAL_NARRATIVE_MODES[(i+rotation)%LOCAL_NARRATIVE_MODES.length]);
  state.creativeIdeas=modes.map((mode,index)=>{
    const symbol=material.symbols[index%material.symbols.length];
    const shiftedLocations=material.locations.map((_,i)=>material.locations[(i+index)%material.locations.length]);
    const title=historyTitles.has(mode.title.toLocaleLowerCase('sr-RS'))?`${mode.title} — NOVA VARIJANTA ${state.ideaGenerationNonce}`:mode.title;
    return normalizeCreativeIdea({
      number:index+1,
      id:`grounded-${state.ideaGenerationNonce}-${index+1}-${state.projectId.slice(0,8)}`,
      title,
      oneSentence:`Spot prati emocionalni luk „${analysis.dominant}“ isključivo kroz motive i fizičke posledice iz teksta pesme; centralni oslonac je ${symbol}.`,
      narrativeArc:`POČETAK: stih „${first}“ postaje ${mode.hook}. SREDINA: stih „${middle}“ menja funkciju centralnog predmeta i vodi u novu odluku, bez nasumične lokacije. ZAVRŠETAK: stih „${last}“ završava priču ovako — ${mode.ending}. Svaka scena mora imati uzrok, vidljivu radnju i posledicu koja priprema sledeću scenu.`,
      visualWorld:`fotorealističan savremeni svet sastavljen samo od prostora opravdanih stihovima: ${shiftedLocations.join(', ')}. Različitost se postiže radnjom, kamerom, vremenom, predmetom i narativnom strukturom — ne ubacivanjem nepovezanih filmskih lokacija.`,
      centralSymbol:symbol,
      hookScene:`${mode.hook}; tačan vizuelni detalj izvodi se iz prvog stiha „${first}“.`,
      locations:shiftedLocations,
      locationJustification:material.reasons,
      timeWeather:'doba dana i vremenski uslovi uzimaju se samo kada su prisutni u stihovima ili kada su nužni za kontinuitet konkretne radnje',
      colorPalette:'paleta se izvodi iz stvarnog doba dana, materijala lokacije i emocionalne promene pesme; koža ostaje prirodna i čitljiva',
      cameraGrammar:mode.camera,
      costumeLogic:'moderna, ženstvena i ukusna odeća menja se samo kada se promene vreme, lokacija, radnja ili faza priče; nema automatskog ponavljanja istog kompleta',
      recurringMotif:symbol,
      ending:mode.ending,
      uniquenessReason:`Ideja koristi poseban narativni mehanizam „${mode.title}“, drugačiji raspored hookova, kameru i posledicu, ali sve lokacije ostaju proverljivo vezane za tekst.`,
      forbiddenRepeats:['tri razdvojene siluete u apstraktnoj praznini','odsjaj drugih likova u oku','svetleća vrpca između likova','nasumična lokacija bez objašnjene veze sa stihom','ista poza, objektiv, radnja i garderoba u susednim scenama','čitljiv tekst, logo ili vidljiv watermark u slici']
    },index);
  });
  state.selectedIdeaId=''; state.scenes=[]; state.imageAssetIds={}; state.videoAssetIds={};
  state.ideaGenerationSource='offline-template'; state.ideaSourceFingerprint=currentSongFingerprint(); state.ideaResearch=null;
  persistState(false,false); renderResearchPanel(); renderIdeas(); renderStoryboard(); renderMediaGallery().catch(()=>{});
  const status=$('#ideasImportStatus'); if(status) status.textContent='OFFLINE REZERVA je napravila 10 šablonskih ideja bez internet analize. Ove ideje služe samo kada nema mreže ili privatni GPT nije povezan.';
  if(showMessage) showToast('Napravljeno je 10 OFFLINE rezervnih ideja bez real-time istraživanja.');
  showPanel('concept'); return true;
}

function researchSourceList(report = state.research) {
  const gptSources = (report?.sources || []).map(item => ({
    ...item,
    type: item.type || item.sourceType || 'web',
    engine: item.engine || 'chatgpt-web-search',
    title: item.title || item.url || 'Izvor',
    snippet: item.snippet || item.finding || ''
  }));
  return [...(report?.youtubeResults || []), ...(report?.webResults || []), ...gptSources]
    .filter(item => item && /^https?:\/\//i.test(String(item.url || '')))
    .filter((item, index, list) => list.findIndex(other => String(other.url || '') === String(item.url || '')) === index);
}
function researchIsCurrent() {
  return state.research?.status === 'ready'
    && state.research?.fingerprint
    && state.research?.songFingerprint === currentSongFingerprint()
    && (researchSourceList().length >= 3 || Number(state.research?.channelAnalysis?.channels?.length || 0) >= 2);
}
function renderResearchPanel() {
  const badge = $('#researchBadge');
  const status = $('#researchStatus');
  const sources = $('#researchSources');
  const queries = $('#researchQueries');
  const channelSummary = $('#channelDnaSummary');
  const viralSummary = $('#viralCandidatesSummary');
  if (!badge || !status || !sources || !queries) return;
  const report = state.research || {};
  const stale = Boolean(report.songFingerprint && report.songFingerprint !== currentSongFingerprint());
  const items = researchSourceList(report);
  if (report.status === 'loading') {
    badge.textContent = 'ISTRAŽIVANJE U TOKU'; badge.classList.remove('ok');
    status.textContent = 'Pretražujem internet i YouTube u realnom vremenu. Prvo pokretanje može potrajati dok se bezbedno preuzme yt-dlp sa GitHub-a.';
  } else if (report.status === 'ready' && !stale) {
    const channelCount = Number(report.channelAnalysis?.channels?.length || 0);
    const fallbackMode = /embedded|fallback|gpt-web-search-needed/i.test(String(report.sourceMode || ''));
    badge.textContent = fallbackMode
      ? `${channelCount} KANALA — UGRAĐENA REZERVA`
      : `${items.length} AKTUELNIH IZVORA + ${channelCount} KANALA`;
    badge.classList.toggle('ok', !fallbackMode);
    status.textContent = fallbackMode
      ? `Lokalna live pretraga nije uspela ili je bila blokirana. Koristim jasno označen ugrađeni snapshot oba kanala; privatni GPT mora da završi aktuelni Web search. Poslednji pokušaj: ${report.fetchedAt ? new Date(report.fetchedAt).toLocaleString('sr-RS') : 'nepoznato'}.`
      : `Live analiza završena ${report.fetchedAt ? new Date(report.fetchedAt).toLocaleString('sr-RS') : ''}. Ideje još nisu generisane dok privatni GPT ne obradi tekst, izvore i proveru različitosti.`;
  } else if (stale) {
    badge.textContent = 'ANALIZA JE ZASTARELA'; badge.classList.remove('ok');
    status.textContent = 'Promenjen je naslov, tekst, žanr ili emocija pesme. Pokreni novu analizu; stari izvori se neće koristiti.';
  } else if (report.status === 'error') {
    badge.textContent = 'ISTRAŽIVANJE NIJE USPELO'; badge.classList.remove('ok');
    status.textContent = report.error || 'Nije pronađen dovoljan broj proverljivih izvora.';
  } else {
    badge.textContent = 'NIJE POKRENUTO'; badge.classList.remove('ok');
    status.textContent = 'Program još nije pretražio internet ni YouTube za ovu pesmu.';
  }
  queries.innerHTML = (report.queries || []).length
    ? `<strong>Korišćeni upiti:</strong><ul>${report.queries.map(q=>`<li>${escapeHtml(q)}</li>`).join('')}</ul>`
    : '';
  sources.innerHTML = items.length
    ? `<div class="research-source-grid">${items.slice(0,16).map(item=>`<a class="research-source" href="${escapeHtml(item.url)}" target="_blank" rel="noopener"><span>${item.type==='youtube'?'YOUTUBE':'WEB'}</span><strong>${escapeHtml(item.title || item.url)}</strong><small>${escapeHtml(item.channel || item.engine || '')}</small></a>`).join('')}</div>${(report.warnings||[]).length?`<div class="notice warn">${escapeHtml(report.warnings.join(' • '))}</div>`:''}`
    : '<div class="mini-status">Izvori će se pojaviti posle real-time analize.</div>';
  if (channelSummary) {
    const channels = report.channelAnalysis?.channels || report.channelDna?.channels || [];
    channelSummary.innerHTML = channels.length ? `<div class="notice info"><strong>Analiza tvoja dva kanala</strong><br/>${channels.map(channel => {
      const sample = channel.sample?.total ? `${channel.sample.total} poslednjih javnih objava` : 'ugrađeni javni pregled';
      const top = (channel.topPublicMomentum || channel.publicOutliers || []).slice(0,4).map(item => escapeHtml(item.title)).join(' • ');
      return `<b>${escapeHtml(channel.title || channel.handle || '')}</b> — ${escapeHtml(sample)}${top ? `<br/><small>Najizraženiji javni signali: ${top}</small>` : ''}`;
    }).join('<br/><br/>')}</div>` : '<div class="mini-status">Analiza kanala još nije dostupna.</div>';
  }
  if (viralSummary) {
    const candidates = report.viralCandidates || [];
    viralSummary.innerHTML = candidates.length ? `<div class="notice success"><strong>Javni viralni kandidati za proveru principa — ne za kopiranje</strong><ol>${candidates.slice(0,8).map(item => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a> — momentum ${Math.round(item.publicMomentumScore || 0)}/100, ${Number(item.viewsPerDay || 0).toLocaleString('sr-RS')} pregleda/dan</li>`).join('')}</ol><small>Momentum je javna heuristika, nije CTR ili retention.</small></div>` : '<div class="mini-status">Nema dovoljno javnih podataka za viralni ranking.</div>';
  }
}
async function runRealtimeResearch(showMessage = true) {
  collectFormState();
  if (!parseLyrics(state.lyrics).length) throw new Error('Nalepi pravi tekst pesme pre internet analize.');
  const fingerprint = currentSongFingerprint();
  state.research = { ...state.research, status:'loading', error:'', songFingerprint:fingerprint, webResults:[], youtubeResults:[], warnings:[] };
  persistState(false,false); renderResearchPanel();
  const button = $('#researchAndIdeasBtn');
  if (button) { button.disabled = true; button.textContent = 'PRETRAŽUJEM INTERNET I YOUTUBE...'; }
  try {
    const response = await fetch(apiUrl('/api/research/run'), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ songTitle:state.songTitle, lyrics:state.lyrics, genre:state.genre, mood:state.mood, language:'sr', region:'RS' })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Real-time istraživanje nije uspelo.');
    const count = Number(data.webResults?.length || 0) + Number(data.youtubeResults?.length || 0);
    const channelCount = Number(data.channelAnalysis?.channels?.length || 0);
    if (count < 3 && channelCount < 2) throw new Error(`Pronađeno je samo ${count} spoljnih izvora i ${channelCount} kanala. Proveri internet vezu i pokušaj ponovo.`);
    state.research = { ...data, status:'ready', songFingerprint:fingerprint, error:'' };
    persistState(false,false); renderResearchPanel();
    if (showMessage) {
      const fallbackMode = /embedded|fallback|gpt-web-search-needed/i.test(String(data.sourceMode || ''));
      showToast(fallbackMode
        ? `Live pretraga nije bila dostupna. Učitana je označena rezerva za ${Number(data.channelAnalysis?.channels?.length || 0)} kanala; privatni GPT završava Web search.`
        : `Live analiza završena: ${count} spoljnih izvora i ${Number(data.channelAnalysis?.channels?.length || 0)} tvoja kanala.`);
    }
    return state.research;
  } catch (error) {
    state.research = { ...state.research, status:'error', error:error.message, songFingerprint:fingerprint };
    persistState(false,false); renderResearchPanel();
    throw error;
  } finally {
    if (button) { button.disabled = false; button.textContent = 'ANALIZIRAJ KANALE + VIRALNE SPOTOVE I POŠALJI U CHATGPT PLUS'; }
  }
}
async function startResearchAndIdeas() {
  collectFormState();
  if (!parseLyrics(state.lyrics).length) {
    showToast('Nalepi pravi tekst pesme pre Koraka 3.');
    showPanel('project');
    return false;
  }
  const pipelineStatus = $('#automaticPipelineStatus');
  if (pipelineStatus) pipelineStatus.textContent = 'KRUG 1: proveravam javne internet i YouTube izvore. Ako neki izvor nije dostupan, privatni GPT će završiti Web search.';
  let localResearchOk = false;
  try {
    await runRealtimeResearch(true);
    localResearchOk = true;
  } catch (error) {
    if (pipelineStatus) pipelineStatus.textContent = `Lokalno istraživanje nije završeno: ${error.message} Paket će ipak biti napravljen, a privatni GPT će uraditi aktuelni Web search.`;
    showToast('Lokalno istraživanje nije uspelo, ali Korak 3 može da se nastavi preko privatnog GPT-a.');
  }
  if (typeof window.startPlusBridgeRound === 'function') {
    if (pipelineStatus) pipelineStatus.textContent = localResearchOk
      ? 'Analiza je spremna. Otvaram tvoj privatni GPT preko lokalnog ChatGPT Plus mosta.'
      : 'Lokalna pretraga nije kompletna. Tvoj privatni GPT će završiti Web search.';
    return window.startPlusBridgeRound({ skipResearch:true });
  }
  if (typeof exportStep3Package !== 'function') throw new Error('Korak 3 modul nije učitan. Osveži program i pokušaj ponovo.');
  exportStep3Package();
  if (pipelineStatus) pipelineStatus.textContent = 'Dodatak nije učitan. Preuzet je ručni rezervni paket.';
  document.querySelector('.manual-gpt-bridge')?.scrollIntoView({ behavior:'smooth', block:'start' });
  return true;
}

function buildTenIdeasRequest() {
  collectFormState();
  const history=loadIdeaHistory().slice(-20).map(item=>({songTitle:item.songTitle,title:item.title,fingerprint:item.fingerprint}));
  const request={
    task:'Pre ideja proveri aktuelne internet i YouTube izvore, zatim predloži TAČNO 10 potpuno različitih ideja za muzički spot. Vrati ISKLJUČIVO ispravan JSON objekat sa poljima research i ideas. Ne piši markdown ni objašnjenje van JSON-a.',
    absoluteRules:[
      'Svaka ideja mora direktno pratiti smisao, redosled i emocionalni razvoj teksta pesme.',
      'Deset ideja moraju biti radikalno različite po radnji, svetu, lokacijama, centralnom simbolu, paleti, kameri, vremenu, atmosferi i završetku.',
      'Ne ponavljaj iste situacije iz prethodnih projekata niti klišee samo zato što je pesma tužna.',
      'Ne koristi scene iz korisnikovih primera: tri siluete u praznom prostoru, odsjaj žene i deteta u muškom oku, svetla vrpca između likova. To su samo primeri nivoa detalja i ne smeju se kopirati.',
      'Ne predlaži deset varijacija istog spota. Svaka ideja mora imati zaseban narativni mehanizam.',
      'Glavna zaključana devojka mora postojati u svakom konceptu, ali njena uloga, aktivnost, okruženje i odnos prema tekstu moraju biti prirodno različiti.',
      'Ne izmišljaj tehničke podatke o pesmi koji nisu dati.',
      'Obavezno navedi najmanje 3 stvarno otvorena izvora sa punim URL adresama, od toga najmanje jedan YouTube izvor kada je dostupan.',
      'Pronađene spotove ne kopiraj. Izdvoji samo apstraktne obrasce: hook, ritam montaže, kretanje kamere, simboliku i organizaciju prostora.',
      'Uradi noveltyAudit i za svaku ideju proveri da nije varijacija prethodne ideje niti ranijih projekata.', `Format spota je ${state.format}.`,
      'Za svaku ideju navedi najmanje 5 različitih lokacija ili jasno opravdan zatvoren vizuelni svet.',
      'Prve tri scene budućeg spota moraju imati tri različita vizuelna hook-a bez ponavljanja kompozicije.'
    ],
    outputSchema:{research:{searchedAt:'ISO datum',queries:['',''],sources:[{title:'',url:'https://...',finding:'',sourceType:'youtube ili web'}],summary:'',visualTrends:[''],avoidPatterns:[''],noveltyAudit:['']},ideas:[{number:1,id:'idea-1',title:'',oneSentence:'',narrativeArc:'',visualWorld:'',centralSymbol:'',hookScene:'',locations:['','','','',''],timeWeather:'',colorPalette:'',cameraGrammar:'',costumeLogic:'',recurringMotif:'',ending:'',uniquenessReason:'',forbiddenRepeats:['','','']}]},
    project:{projectName:state.name,songTitle:state.songTitle,artistName:state.artistName,format:state.format,lyrics:state.lyrics,genre:state.genre,mood:state.mood,audio:{duration:state.audio.duration,bpmEstimate:state.audio.bpmEstimate,confirmedBpm:state.audio.confirmedBpm,energyCurve:state.audio.energyCurve},lockedGirlRule:'Zaključani ID devojke se ne menja i ona mora biti prisutna u svim idejama.',previousVisualFingerprints:history,localRealtimeResearch:state.research,lyricsFingerprint:currentSongFingerprint()}
  };
  return `NAPRAVI 10 JEDINSTVENIH IDEJA I VRATI SAMO JSON:\n\n${JSON.stringify(request,null,2)}`;
}

function importTenIdeas() {
  try { const result=extractJson($('#ideasJsonInput').value); const input=Array.isArray(result)?result:result.ideas; if(!Array.isArray(input)||input.length!==10)throw new Error('JSON mora sadržati tačno 10 ideja.'); state.creativeIdeas=input.map((idea,index)=>normalizeCreativeIdea(idea,index)); state.selectedIdeaId=''; state.ideaGenerationSource='manual-json'; state.ideaSourceFingerprint=currentSongFingerprint(); state.ideaResearch=result.research||null; persistState(false,false); renderIdeas(); $('#ideasImportStatus').textContent='Uvezeno je 10 različitih ideja. Izaberi jednu pre izrade detaljnog storyboarda.'; showToast('Uvezeno je 10 ideja za spot.'); }
  catch(error){ $('#ideasImportStatus').textContent=`Greška: ${error.message}`; showToast(`Ideje nisu uvezene: ${error.message}`); }
}

function selectCreativeIdea(id) {
  if (state.ideaSourceFingerprint && state.ideaSourceFingerprint !== currentSongFingerprint()) { showToast('Ove ideje pripadaju staroj verziji pesme. Pokreni novu real-time analizu.'); return; }
  const idea=state.creativeIdeas.find(item=>item.id===id); if(!idea)return; state.selectedIdeaId=idea.id; idea.score=uniquenessScoreForIdea(idea); if (state.advanced?.step3) { state.advanced.step3.completedRound = 1; state.advanced.step3.round2 = null; state.advanced.step3.plusJobId = ''; }
  state.concept={...state.concept,title:idea.title,story:`${idea.oneSentence}\n\n${idea.narrativeArc}`.trim(),visualStyle:`${idea.visualWorld}. Ponavljajući motiv: ${idea.recurringMotif}. Kostimi: ${idea.costumeLogic}`.trim(),colorPalette:idea.colorPalette,cameraStyle:idea.cameraGrammar,locations:idea.locations.join(', '),genre:state.genre||'',mood:state.mood||'',centralSymbol:idea.centralSymbol||'',openingHook:idea.hookScene||'',ending:idea.ending||''};
  saveIdeaFingerprint(idea);
  state.scenes.forEach(scene => {
    scene.description=''; scene.location=''; scene.sceneTitle=''; scene.lyricMeaning=''; scene.microMovement=''; scene.timeWeather=''; scene.lighting=''; scene.lens=''; scene.composition=''; scene.foreground=''; scene.midground=''; scene.background=''; scene.atmosphere=''; scene.wardrobe=''; scene.continuityNotes=''; scene.transitionIn=''; scene.transitionOut=''; scene.visualSignature=''; scene.imagePrompt=''; scene.videoPrompt=''; scene.promptSource='local';
  });
  if (state.audio.duration) buildStoryboard();
  persistState(false,false); fillForm(); renderIdeas(); syncProjectToChatGptBridge(false).catch(()=>{}); showToast(`Izabrana je ideja: ${idea.title}. Storyboard je prilagođen izabranoj ideji.`);
}

function renderIdeas() {
  const container = $('#ideasGrid');
  const badge = $('#selectedIdeaBadge');
  if (!container || !badge) return;
  const ideas = state.creativeIdeas || [];
  const selected = ideas.find(item => item.id === state.selectedIdeaId);
  const stale = Boolean(ideas.length && state.ideaSourceFingerprint && state.ideaSourceFingerprint !== currentSongFingerprint());
  const sourceLabel = state.ideaGenerationSource === 'live-research-gpt'
    ? 'REAL-TIME INTERNET + YOUTUBE + GPT'
    : state.ideaGenerationSource === 'chatgpt-plus-manual-package'
      ? 'CHATGPT PLUS + WEB ISTRAŽIVANJE'
      : state.ideaGenerationSource === 'manual-json'
        ? 'RUČNO UVEZEN JSON'
        : state.ideaGenerationSource === 'offline-template'
          ? 'OFFLINE ŠABLON — BEZ INTERNETA'
          : 'IZVOR NIJE ZABELEŽEN';
  badge.textContent = selected ? `Izabrano: ${selected.title}` : (ideas.length ? sourceLabel : 'Ideja nije izabrana');
  badge.classList.toggle('ok', ['live-research-gpt','chatgpt-plus-manual-package'].includes(state.ideaGenerationSource) && !stale);
  if (!ideas.length) {
    container.innerHTML = '<div class="notice info">Još nema ideja. Klikni veliko dugme „ISTRAŽI INTERNET I PREUZMI PAKET ZA 10 IDEJA“. Zatim učitaj paket u privatni GPT i uvezi njegov JSON odgovor. Offline šabloni su samo rezerva.</div>';
    return;
  }
  const staleNotice = stale
    ? '<div class="notice danger idea-stale-warning"><strong>OVE IDEJE SU ZA DRUGU ILI STARIJU VERZIJU PESME.</strong> Tekst, naslov, žanr ili emocija su promenjeni. Pokreni novu internet i YouTube analizu pre izbora.</div>'
    : `<div class="idea-source-banner"><strong>Izvor:</strong> ${escapeHtml(sourceLabel)}${state.ideaResearch?.sources?.length ? ` • ${state.ideaResearch.sources.length} dokazanih izvora` : ''}</div>`;
  container.innerHTML = staleNotice + ideas.map((idea,index)=>{
    const score=uniquenessScoreForIdea(idea), selectedClass=idea.id===state.selectedIdeaId?'selected':'';
    const scoreParts = [
      ['Stih', idea.lyricFitScore], ['Kanal', idea.channelFitScore], ['Viralni signal', idea.viralPotentialScore], ['Različitost', idea.diversityScore], ['Izvodljivost', idea.feasibilityScore]
    ].filter(([,value]) => Number(value) > 0).map(([name,value]) => `${name}: ${Math.round(value)}/100`).join(' • ');
    return `<article class="idea-card ${selectedClass} ${stale?'stale':''}"><div class="idea-number">${index+1}</div><h4>${escapeHtml(idea.title)}</h4>${idea.visualFamily?`<div class="idea-source-banner"><strong>Vizuelna porodica:</strong> ${escapeHtml(idea.visualFamily)}${idea.totalScore?` • Ukupno ${Math.round(idea.totalScore)}/100`:''}</div>`:''}<p><strong>Osnova:</strong> ${escapeHtml(idea.oneSentence)}</p><p><strong>Svet:</strong> ${escapeHtml(idea.visualWorld)}</p><p><strong>Simbol:</strong> ${escapeHtml(idea.centralSymbol)}</p><p><strong>Hook:</strong> ${escapeHtml(idea.hookScene)}</p>${idea.viralHookMechanism?`<p><strong>Zašto hook može da zadrži gledaoca:</strong> ${escapeHtml(idea.viralHookMechanism)}</p>`:''}<p><strong>Lokacije:</strong> ${escapeHtml((idea.locations||[]).join(', '))}</p>${idea.locationJustification?.length ? `<p><strong>Veza lokacija sa pesmom:</strong> ${escapeHtml(idea.locationJustification.join(' • '))}</p>` : ''}<p><strong>Kamera:</strong> ${escapeHtml(idea.cameraGrammar)}</p><p><strong>Završetak:</strong> ${escapeHtml(idea.ending)}</p>${idea.channelFitReason?`<p><strong>Veza sa tvoja dva kanala:</strong> ${escapeHtml(idea.channelFitReason)}</p>`:''}${idea.seasonalAngle?`<p><strong>Aktuelni/sezonski ugao:</strong> ${escapeHtml(idea.seasonalAngle)}</p>`:''}${scoreParts?`<div class="idea-score">${escapeHtml(scoreParts)}</div>`:''}<div class="idea-score">Različitost od sačuvanih projekata: <strong>${score}%</strong></div><button data-select-idea="${escapeHtml(idea.id)}" class="${selectedClass?'secondary':'primary'}" ${stale?'disabled':''}>${stale?'POTREBNA NOVA ANALIZA':selectedClass?'Ova ideja je izabrana':'IZABERI OVU IDEJU'}</button></article>`;
  }).join('');
  $$('[data-select-idea]',container).forEach(button=>button.addEventListener('click',()=>selectCreativeIdea(button.dataset.selectIdea)));
}

function selectedCreativeIdea(){return (state.creativeIdeas||[]).find(item=>item.id===state.selectedIdeaId)||null;}

function apiUrl(path) {
  const base = String(window.MSS_API_BASE || '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

function chatGptHost() {
  return window.openai || null;
}

function isChatGptAppHost() {
  return Boolean(chatGptHost()?.sendFollowUpMessage);
}

function selectedChatGptScene() {
  const raw = Number($('#chatGptSceneNumber')?.value || 1);
  const scene = state.scenes.find(item => Number(item.number) === raw) || state.scenes[Math.max(0, raw - 1)];
  if (!scene) throw new Error('Izabrana scena ne postoji. Najpre napravi storyboard.');
  return scene;
}

function buildChatGptSceneRequest(scene, mode = 'single') {
  const formatText = state.format === '16:9' ? 'horizontalna 16:9' : state.format === '1:1' ? 'kvadratna 1:1' : 'vertikalna 9:16';
  const reviewRule = mode === 'review'
    ? 'Najpre kratko proveri da li prompt ima kontradikcije. Zatim odmah generiši sliku; ne prepravljaj zaključani identitet.'
    : 'Odmah generiši sliku. Ne objašnjavaj prompt pre generisanja.';
  return [
    `GENERISI SLIKU ZA MUZICKI SPOT — SCENA ${scene.number}.`,
    reviewRule,
    `Format mora biti ${formatText}. Generiši samo jednu završnu sliku, bez kolaža, bez podeljenog ekrana i bez dodatnog teksta.`,
    'Tačno sačuvaj zaključani identitet devojke koji se nalazi na početku prompta. Ne skraćuj ga, ne prepričavaj ga i ne menjaj nijednu osobinu.',
    'Slika mora precizno pratiti stih, radnju, emociju, lokaciju, kompoziciju, objektiv, osvetljenje, garderobu i kontinuitet ove scene.',
    'Ne dodaj naslov, titlove, logo ni watermark u samu sliku.',
    '',
    scene.imagePrompt || makeImagePrompt(scene),
    '',
    `Kada završiš, napiši samo: "SCENA ${scene.number} JE GENERISANA".`
  ].join('\n');
}

function updateLegacyChatGptAppStatus(message = '') {
  const connected = isChatGptAppHost();
  const badge = $('#chatGptBridgeBadge');
  const input = $('#chatGptHostStatus');
  const status = $('#chatGptBridgeStatus');
  if (badge) {
    badge.textContent = connected ? 'Povezano sa ChatGPT-om' : 'Van ChatGPT aplikacije';
    badge.classList.toggle('ok', connected);
  }
  if (input) input.value = connected ? 'ChatGPT Apps SDK je dostupan' : 'Pokrenuto kao običan sajt';
  if (status) status.textContent = message || (connected
    ? 'Veza je spremna. Izaberi scenu i klikni „Kopiraj prompt za ChatGPT“.'
    : 'Direktno slanje radi samo kada se Studio otvori kao ChatGPT aplikacija. U običnom browseru prompt se kopira kao rezervna opcija.');
}

async function sendSceneToChatGpt(sceneId = '') {
  const scene = sceneId ? state.scenes.find(item => item.id === sceneId) : selectedChatGptScene();
  if (!scene) throw new Error('Scena nije pronađena.');
  const mode = $('#chatGptSendMode')?.value || 'single';
  const prompt = buildChatGptSceneRequest(scene, mode);
  const host = chatGptHost();
  if (!host?.sendFollowUpMessage) {
    await copyText(prompt, `Prompt scene ${scene.number} je kopiran.`);
    updateLegacyChatGptAppStatus(`Studio nije otvoren kao ChatGPT aplikacija. Prompt scene ${scene.number} je kopiran — nalepi ga u ovaj razgovor.`);
    return false;
  }
  await host.sendFollowUpMessage({ prompt, scrollToBottom: true });
  state.chatGptBridge = { ...(state.chatGptBridge || {}), lastSceneId: scene.id, lastSentAt: new Date().toISOString() };
  persistState(false, false);
  updateLegacyChatGptAppStatus(`Zahtev za scenu ${scene.number} je poslat ovom ChatGPT razgovoru. Kada se slika generiše, vrati se na Studio i klikni „Uvezi izabranu ChatGPT sliku u scenu“.`);
  return true;
}

async function saveImportedChatGptBlob(scene, blob) {
  if (!blob?.type?.startsWith('image/')) throw new Error('Izabrani fajl nije slika.');
  const processed = await processImageForScene(blob, scene);
  const assetId = `image:${state.projectId}:${scene.id}`;
  await putAsset(assetId, processed.blob);
  state.imageAssetIds[scene.id] = assetId;
  scene.imageInfo = processed.info;
  scene.smartCrop = processed.crop || null;
  scene.t2i = { ...(scene.t2i || {}), status: 'done', progress: 100, error: '', generatedAt: new Date().toISOString(), source: 'chatgpt-plus' };
  if (state.settings.autoPalette) await analyzeScenePalette(scene.id, processed.blob);
  persistState(false, false);
  await renderMediaGallery();
  updateStatus();
}

async function importChatGptImage(sceneId = '') {
  const scene = sceneId ? state.scenes.find(item => item.id === sceneId) : selectedChatGptScene();
  if (!scene) throw new Error('Scena nije pronađena.');
  const host = chatGptHost();
  if (!host?.selectFiles || !host?.getFileDownloadUrl) {
    updateLegacyChatGptAppStatus('Automatski izbor fajla nije dostupan u ovom prikazu. Preuzmi sliku iz ChatGPT-a i ubaci je preko postojećeg polja za sliku scene.');
    showToast('Izbor ChatGPT fajla nije dostupan. Koristi ručni unos slike u scenu.');
    return false;
  }
  updateLegacyChatGptAppStatus(`Izaberi generisanu sliku za scenu ${scene.number} u ChatGPT biraču fajlova.`);
  const selected = await host.selectFiles();
  const files = Array.isArray(selected) ? selected : selected?.files || [];
  const chosen = files.find(file => String(file?.type || file?.mimeType || '').startsWith('image/')) || files[0];
  if (!chosen) {
    updateLegacyChatGptAppStatus('Nijedna slika nije izabrana.');
    return false;
  }
  const fileId = chosen.fileId || chosen.id;
  if (!fileId) throw new Error('ChatGPT nije vratio ID izabranog fajla.');
  const download = await host.getFileDownloadUrl({ fileId });
  const url = typeof download === 'string' ? download : download?.downloadUrl || download?.url;
  if (!url) throw new Error('ChatGPT nije vratio adresu za preuzimanje slike.');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Slika nije preuzeta (${response.status}).`);
  const blob = await response.blob();
  await saveImportedChatGptBlob(scene, blob);
  updateLegacyChatGptAppStatus(`ChatGPT slika je uvezena u scenu ${scene.number}.`);
  showToast(`Uvezena ChatGPT slika je sačuvana u sceni ${scene.number}.`);
  return true;
}

async function sendFirstMissingSceneToChatGpt() {
  const scene = state.scenes.find(item => !state.imageAssetIds[item.id]);
  if (!scene) {
    showToast('Sve scene već imaju sliku.');
    return;
  }
  if ($('#chatGptSceneNumber')) $('#chatGptSceneNumber').value = String(scene.number);
  await sendSceneToChatGpt(scene.id);
}

function buildChatGptImagePack(){collectFormState();if(!state.scenes.length)return'Nema storyboarda. Najpre napravi scene.';return ['GENERISANJE SLIKA ZA MUZIČKI SPOT — VAŽNA PRAVILA:','1. Generiši jednu sliku po jasno označenoj sceni.','2. Ne menjaj zaključani identitet devojke.','3. Ne dodaj tekst, titlove, logo ni vidljiv watermark u sliku.','4. Svaka scena mora biti vizuelno različita, ali kontinuitet likova ostaje isti.','',...state.scenes.map(scene=>`SCENA ${scene.number} — ${scene.sceneTitle||scene.section}\n${scene.imagePrompt}`)].join('\n\n');}

function buildChatGptRequest() {
  collectFormState(); const chosenIdea=selectedCreativeIdea();
  const request={
    task:'Napravi kompletan, originalan i veoma detaljan storyboard za muzički spot. Vrati ISKLJUČIVO ispravan JSON bez markdown oznaka i bez dodatnog objašnjenja.',
    strictRules:[
      'Spot mora pratiti konkretan smisao svakog stiha i emocionalni razvoj pesme od početka do kraja.',
      'Ne pravi generičan tužan spot. Svaka scena mora imati razlog zašto postoji baš uz taj stih.',
      'Ne ponavljaj istu radnju, lokaciju, veličinu kadra, kompoziciju, rekvizit, svetlo ili pokret kamere u uzastopnim scenama.',
      'Najviše dve scene u celom spotu smeju imati isti osnovni tip lokacije, osim ako izabrani koncept namerno koristi jedan zatvoren svet.',
      'Prve tri scene moraju biti tri potpuno različita hook-a. Ne kopiraj korisnikove primere sa tri siluete, odsjajem u oku ili svetlom vrpcom.',
      'Svaka scena mora imati naziv, značenje stiha, emociju, vidljivu radnju, mikro-pokret, lokaciju, vreme, svetlo, objektiv, kadar, kompoziciju, foreground, midground, background, atmosferu, garderobu, kontinuitet i tranziciju.',
      'Image prompt mora biti izuzetno detaljan, konkretan i spreman za generisanje. Ne koristi prazne prideve; opisuj šta se tačno vidi.',
      'Video prompt je najvažniji: detaljno opiši pokret kamere, pokrete glave, očiju, ruku, tela, odeće, kose, okruženja, tempo pokreta, početno i završno stanje kadra i zabrane deformacija.',
      'Video prompt mora čuvati lice, frizuru, oči, proporcije, garderobu, tetovažu, pozadinu i broj osoba. Bez face morphinga, treperenja, novih ljudi i teleportovanja predmeta.',
      'Zaključani ID glavne devojke NE SMEŠ menjati, skraćivati, preformulisati niti zameniti. Ona mora biti u svakoj sceni.',
      `Svi vizuali moraju biti ${state.format}.`, 'Storyboard mora pokriti tačno trajanje pesme. Ne menjaj start i end postojeće scene osim kod očigledne tehničke greške.',
      'Ne izmišljaj BPM, tonalitet, instrumente, search volume, CTR, retention, konkurenciju ili očekivane preglede.',
      'Piši prirodnim srpskim jezikom u opisnim poljima. Promptovi za sliku i video moraju biti na detaljnom engleskom jeziku.'
    ],
    promptDepthRules:{imagePrompt:'Najmanje 180 reči scene-specific opisa bez ponavljanja zaključanog ID bloka; program ga automatski stavlja na početak.',videoPrompt:'Najmanje 140 reči preciznog image-to-video uputstva: početni kadar, radnja u fazama, mikro-pokreti, kamera, parallax, okruženje, tempo, završni kadar, kontinuitet i negativne zabrane.',antiRepetition:'Svaka scena dobija jedinstven visualSignature.'},
    outputSchema:{concept:{title:'',story:'',visualStyle:'',colorPalette:'',cameraStyle:'',locations:''},genre:'',mood:'',characters:[{name:'',role:'',locked:'',negative:''}],scenes:[{number:1,sceneTitle:'',section:'',lyric:'',lyricMeaning:'',emotion:'',description:'',microMovement:'',location:'',timeWeather:'',lighting:'',shot:'',lens:'',camera:'',composition:'',foreground:'',midground:'',background:'',atmosphere:'',wardrobe:'',continuityNotes:'',transitionIn:'',transitionOut:'',characterNames:[],visualSignature:'',imagePrompt:'',videoPrompt:''}],youtube:{title:'',description:'',hashtags:'',pinned:'',shorts:[{title:'',start:0,end:30,hook:'',cta:''}]}},
    project:{name:state.name,songTitle:state.songTitle,artistName:state.artistName,format:state.format,lyrics:state.lyrics,localAudioAnalysis:{duration:state.audio.duration,sampleRate:state.audio.sampleRate,channels:state.audio.channels,bpmEstimate:state.audio.bpmEstimate,bpmConfidence:state.audio.bpmConfidence,confirmedBpm:state.audio.confirmedBpm,energyCurve:state.audio.energyCurve},selectedCreativeIdea:chosenIdea,activeYoutubeChannel:state.youtubeChannels.find(channel=>channel.id===state.activeYoutubeChannelId)||null,youtubeChannelAnalysis:state.youtubeAnalysis?.[state.activeYoutubeChannelId]||null,lockedGirlIdentityRule:'NE MENJAJ. Glavna devojka mora biti u svakoj sceni i njen zaključani ID blok mora ostati potpuno isti.',lockedGirlIdentityBlock:LOCKED_GIRL_BLOCK,currentConcept:state.concept,currentCharacters:state.characters.map(({id,...character})=>character),previousVisualFingerprints:loadIdeaHistory().slice(-20),scenes:state.scenes.map(scene=>({number:scene.number,start:scene.start,end:scene.end,duration:scene.duration,section:scene.section,lyric:scene.lyric,emotion:scene.emotion,description:scene.description,shot:scene.shot,camera:scene.camera,location:scene.location}))}
  };
  return `ANALIZIRAJ OVAJ PROJEKAT I VRATI SAMO JSON:\n\n${JSON.stringify(request,null,2)}`;
}

function extractJson(text) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('Nije pronađen JSON objekat.');
  return JSON.parse(trimmed.slice(first, last + 1));
}

function importAiResult() {
  try {
    const result = extractJson($('#aiJsonInput').value);
    if (result.concept && typeof result.concept === 'object') state.concept = { ...state.concept, ...result.concept };
    if (typeof result.genre === 'string') state.genre = result.genre;
    if (typeof result.mood === 'string') state.mood = result.mood;

    if (Array.isArray(result.characters)) {
      const existingByName = new Map(state.characters.map(character => [character.name.toLowerCase(), character]));
      result.characters.forEach(input => {
        if (!input?.name || !input?.locked) return;
        if (String(input.name).toLowerCase().includes('glavna devojka') || input.id === LOCKED_GIRL_ID) return;
        const existing = existingByName.get(input.name.toLowerCase());
        const character = {
          id: existing?.id || uuid(),
          name: input.name,
          role: input.role || '',
          locked: input.locked,
          negative: input.negative || ''
        };
        if (existing) state.characters[state.characters.findIndex(item => item.id === existing.id)] = character;
        else state.characters.push(character);
      });
    }

    if (Array.isArray(result.scenes) && state.scenes.length) {
      const characterByName = new Map(state.characters.map(character => [character.name.toLowerCase(), character.id]));
      result.scenes.forEach(input => {
        const scene = state.scenes.find(item => item.number === Number(input.number));
        if (!scene) return;
        ['sceneTitle', 'section', 'lyric', 'lyricMeaning', 'emotion', 'description', 'microMovement', 'location', 'timeWeather', 'lighting', 'shot', 'lens', 'camera', 'composition', 'foreground', 'midground', 'background', 'atmosphere', 'wardrobe', 'continuityNotes', 'transitionIn', 'transitionOut', 'visualSignature', 'imagePrompt', 'videoPrompt'].forEach(field => {
          if (typeof input[field] === 'string' && input[field].trim()) scene[field] = input[field].trim();
        });
        if ((input.imagePrompt && String(input.imagePrompt).trim()) || (input.videoPrompt && String(input.videoPrompt).trim())) scene.promptSource = 'ai';
        if (Array.isArray(input.characterNames)) {
          scene.characterIds = input.characterNames.map(name => characterByName.get(String(name).toLowerCase())).filter(Boolean);
        }
      });
    }

    if (result.youtube && typeof result.youtube === 'object') {
      state.youtube = { ...state.youtube, ...result.youtube, shorts: Array.isArray(result.youtube.shorts) ? result.youtube.shorts : state.youtube.shorts };
    }

    ensureLockedGirlEverywhere();
    persistState(false, false);
    fillForm();
    $('#aiImportStatus').textContent = 'ChatGPT rezultat je uspešno uvezen.';
    $('#aiStatusBadge').textContent = 'ChatGPT analiza uvezena';
    showToast('Analiza, koncept, scene i YouTube paket su uvezeni.');
  } catch (error) {
    $('#aiImportStatus').textContent = `Greška: ${error.message}`;
    showToast(`JSON nije uvezen: ${error.message}`);
  }
}

function averageEnergyForRange(start, end) {
  const curve = state.audio.energyCurve || [];
  const duration = Number(state.audio.duration) || 0;
  if (!curve.length || !duration) return 0;
  const from = Math.max(0, Math.floor(start / duration * curve.length));
  const to = Math.min(curve.length, Math.max(from + 1, Math.ceil(end / duration * curve.length)));
  const values = curve.slice(from, to);
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

function sceneHookScore(scene) {
  const text = `${scene.section || ''} ${scene.lyric || ''}`.toLocaleLowerCase('sr-RS');
  let score = averageEnergyForRange(scene.start, scene.end) * 50;
  if (/refren|chorus|hook/.test(text)) score += 35;
  if (/nedostaje|volim|boli|bez tebe|otišla|vrati|kraj|srce|sam|sama/.test(text)) score += 18;
  if ((scene.lyric || '').split(/\s+/).length >= 5 && (scene.lyric || '').split(/\s+/).length <= 16) score += 10;
  if (scene.number <= 3) score += 7;
  if (scene.emotion && scene.emotion !== 'melanholija') score += 6;
  return score;
}

function makeSmartShortsPlan(showMessage = true) {
  if (!state.audio.duration) {
    if (showMessage) showToast('Najpre dodaj pesmu.');
    return false;
  }
  const duration = state.audio.duration;
  const length = Math.min(32, Math.max(18, duration / 5));
  let candidates = state.scenes.length ? state.scenes.map(scene => ({ scene, score: sceneHookScore(scene), center: (scene.start + scene.end) / 2 })) : [];
  if (!candidates.length) {
    const parsed = parseLyrics(state.lyrics);
    candidates = [0.16, 0.48, 0.76].map((ratio, index) => ({ scene: { lyric: parsed[Math.min(parsed.length - 1, Math.floor(parsed.length * ratio))]?.text || 'Najjači deo pesme', section: index === 1 ? 'Refren' : 'Pesma' }, score: 20 - index, center: duration * ratio }));
  }
  candidates.sort((a,b) => b.score - a.score);
  const chosen = [];
  for (const candidate of candidates) {
    const start = Math.max(0, Math.min(duration - length, candidate.center - length * 0.32));
    const end = Math.min(duration, start + length);
    if (chosen.every(item => Math.abs(item.start - start) > length * 0.7)) chosen.push({ ...candidate, start, end });
    if (chosen.length === 3) break;
  }
  while (chosen.length < 3) {
    const ratio = [0.18,0.5,0.78][chosen.length];
    const start = Math.max(0, Math.min(duration - length, duration * ratio - length * 0.3));
    chosen.push({ start, end: Math.min(duration,start+length), scene: state.scenes.find(scene => scene.start <= start && scene.end >= start) || { lyric:'Najjači emotivni deo pesme', section:'Pesma' }, score:0 });
  }
  const types = [
    { label:'EMOTIVNI HOOK', cta:'Cela pesma je na YouTube kanalu.' },
    { label:'VIZUELNI HOOK', cta:'Pogledaj ceo spot na YouTube-u.' },
    { label:'REFREN I NAJAVA', cta:'Cela pesma uskoro / na kanalu.' }
  ];
  state.youtube.shorts = chosen.map((item,index) => ({
    title:`${state.songTitle || state.name || 'Nova pesma'} — ${types[index].label}`,
    start:Math.round(item.start*100)/100,
    end:Math.round(item.end*100)/100,
    hook:item.scene?.lyric || 'Najjači deo pesme',
    cta:types[index].cta,
    reason:index===0?'izabran zbog emotivno jakog i kratkog stiha':index===1?'izabran zbog energije i mogućnosti snažnog vizuelnog početka':'izabran kao prepoznatljiv refren ili kasniji vrhunac'
  }));
  if (!state.youtube.title) state.youtube.title = `${state.songTitle || state.name || 'Nova pesma'} 💔 | Nedostaješ PUNOO pesme`;
  if (!state.youtube.description) state.youtube.description = `${state.songTitle || state.name || 'Nova pesma'} je emotivna ljubavna pesma o ${state.mood || 'ljubavi, gubitku i sećanjima'}.

Poslušaj celu pesmu, napiši utisak u komentaru i pretplati se na kanal Nedostaješ PUNOO pesme.`;
  if (!state.youtube.hashtags) state.youtube.hashtags = '#NedostaješPUNOO #TužnaPesma #LjubavnaPesma #BalkanMuzika #NovaPesma';
  if (!state.youtube.pinned) state.youtube.pinned = 'Koji stih vas je najviše pogodio? 💔 Napišite u komentaru.';
  persistState(false,false);
  fillForm();
  renderShorts();
  if (showMessage) showToast('Program je izabrao tri različita hook Shorts dela na osnovu stiha, energije i strukture pesme.');
  return true;
}

function updateAutomaticStatus(message, progress = null) {
  const status = $('#automaticPipelineStatus');
  const bar = $('#automaticPipelineProgress');
  if (status) status.textContent = message;
  if (bar && progress !== null) bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  state.automation = { ...(state.automation || {}), message, progress, updatedAt:new Date().toISOString() };
  persistState(false,false);
}

async function runAutomaticProductionLocalLegacy() {
  collectFormState();
  if (!selectedCreativeIdea()) {
    if (!state.creativeIdeas.length) generateTenIdeasLocally(false);
    showPanel('concept');
    updateAutomaticStatus('Izaberi jednu od 10 ideja, pa ponovo klikni „NASTAVI AUTOMATSKU IZRADU“.', 5);
    showToast('Automatska izrada čeka samo tvoj izbor jedne ideje.');
    return;
  }
  const button = $('#continueAutoPipelineBtn');
  if (button) button.disabled = true;
  try {
    updateAutomaticStatus('1/7 Pravimo detaljan storyboard koji prati tekst pesme...', 10);
    if (!state.scenes.length) {
      if (!buildStoryboard()) throw new Error('Storyboard nije napravljen.');
    } else {
      state.scenes.forEach((scene,index) => enrichLocalScene(scene,index,{text:scene.lyric,section:scene.section},scene.emotion,state.scenes.length));
      generateAllPrompts(false);
      renderStoryboard();
    }
    if (state.settings.burnCaptions && !state.captions.items.length) generateCaptionsFromLyrics(false);
    makeSmartShortsPlan(false);

    updateAutomaticStatus('2/7 Proveravamo lokalni generator slika...', 20);
    if (!(await testT2iConnection(false))) throw new Error('ComfyUI/InstantID generator slika nije spreman. Pokreni program jednim glavnim BAT dugmetom i proveri modele.');
    if (state.t2i.mode === 'instantid' && !state.lockedGirlReferenceAssetId) {
      updateAutomaticStatus('2/7 Pravimo početnu referentnu devojku...', 25);
      await generateLockedGirlReference();
      if (!state.lockedGirlReferenceAssetId) throw new Error('Referentna slika devojke nije napravljena.');
    }

    updateAutomaticStatus('3/7 Generišemo sve slike, sa automatskim ponavljanjem neuspelih scena...', 30);
    const imageResult = await generateAllImages({ skipConfirm:true, retries:3 });
    if (imageResult.failed.length) throw new Error(`Nisu generisane slike scena: ${imageResult.failed.map(item=>item.scene).join(', ')}. Projekat je sačuvan; ponovni klik nastavlja samo nedostajuće scene.`);

    updateAutomaticStatus('4/7 Proveravamo Wan image-to-video...', 48);
    if (!(await testComfyConnection(false))) throw new Error('Wan image-to-video modeli nisu spremni.');

    updateAutomaticStatus('5/7 Pravimo AI video-klip za svaku sliku...', 52);
    const videoResult = await generateAllI2V({ skipConfirm:true, retries:2 });
    if (videoResult.failed.length) throw new Error(`Nisu generisani AI klipovi scena: ${videoResult.failed.map(item=>item.scene).join(', ')}. Ponovni klik nastavlja nedostajuće.`);

    updateAutomaticStatus('6/7 Renderujemo ceo spot. Ne zatvaraj karticu...', 72);
    const outputs = [];
    const scopes = ['full','short-1','short-2','short-3'];
    for (let index=0; index<scopes.length; index+=1) {
      const scope = scopes[index];
      state.settings.renderScope = scope;
      if ($('#renderScope')) $('#renderScope').value = scope;
      persistState(false,false);
      updateAutomaticStatus(`${index===0?'6/7':'7/7'} Renderujemo ${scope==='full'?'ceo spot':`Shorts ${index}`} (${index+1}/4)...`, 72 + index*7);
      const result = await renderVideo();
      if (!result || result.stopped) throw new Error(`Render ${scope} nije završen.`);
      outputs.push(result);
    }

    updateAutomaticStatus('7/7 Pakujemo ceo spot i tri Shorts videa...', 96);
    if (window.JSZip) {
      const zip = new window.JSZip();
      outputs.forEach(result => zip.file(result.fileName, result.blob));
      zip.file('SHORTS-PLAN.json', JSON.stringify(state.youtube.shorts,null,2));
      zip.file('YOUTUBE-PAKET.txt', `NASLOV:
${state.youtube.title}

OPIS:
${state.youtube.description}

HASHTAGOVI:
${state.youtube.hashtags}

PINOVANA PORUKA:
${state.youtube.pinned}`);
      const blob = await zip.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{ level:6 } });
      downloadBlob(blob, `${safeFileName(state.songTitle || state.name)}-CEO-SPOT-I-3-SHORTS.zip`);
    } else {
      outputs.forEach(result => downloadBlob(result.blob, result.fileName));
    }
    state.settings.renderScope = 'full';
    if ($('#renderScope')) $('#renderScope').value = 'full';
    updateAutomaticStatus('ZAVRŠENO: ceo spot i tri hook Shorts videa su napravljeni.', 100);
    showToast('Kompletan video paket je završen.');
  } finally {
    if (button) button.disabled = false;
  }
}

function handleAutomaticProductionFailure(error) {
  console.error(error);
  updateAutomaticStatus(`Automatska izrada je zaustavljena na stvarnoj grešci: ${error.message} Projekat je sačuvan; posle popravke ponovni klik nastavlja nedostajuće korake.`, null);
  showToast(`Automatska izrada nije završena: ${error.message}`);
  $('#continueAutoPipelineBtn').disabled = false;
}

function makeBasicShortsPlan() {
  if (!state.audio.duration) {
    showToast('Najpre dodaj pesmu.');
    return;
  }
  const duration = state.audio.duration;
  const length = Math.min(35, Math.max(15, duration / 4));
  const starts = [duration * 0.18, duration * 0.48, duration * 0.72].map(start => Math.min(start, Math.max(0, duration - length)));
  state.youtube.shorts = starts.map((start, index) => {
    const scene = state.scenes.find(item => item.start <= start && item.end >= start) || state.scenes[Math.min(index, state.scenes.length - 1)];
    return {
      title: `${state.songTitle || state.name || 'Nova pesma'} — Shorts ${index + 1}`,
      start: Math.round(start * 100) / 100,
      end: Math.round(Math.min(duration, start + length) * 100) / 100,
      hook: scene?.lyric || 'Najjači emotivni deo pesme',
      cta: 'Cela pesma je na YouTube kanalu.'
    };
  });
  if (!state.youtube.title) state.youtube.title = `${state.songTitle || state.name || 'Nova pesma'} 💔 | Nedostaješ PUNOO pesme`;
  if (!state.youtube.description) state.youtube.description = `${state.songTitle || state.name || 'Nova pesma'} je emotivna ljubavna pesma o ${state.mood || 'ljubavi, gubitku i sećanjima'}.\n\nPoslušaj celu pesmu, napiši utisak u komentaru i pretplati se na kanal Nedostaješ PUNOO pesme.`;
  if (!state.youtube.hashtags) state.youtube.hashtags = '#NedostaješPUNOO #TužnaPesma #LjubavnaPesma #BalkanMuzika #NovaPesma';
  if (!state.youtube.pinned) state.youtube.pinned = 'Koji stih vas je najviše pogodio? 💔 Napišite u komentaru.';
  persistState(false, false);
  fillForm();
  renderShorts();
  showToast('Napravljen je osnovni plan za tri Shorts videa.');
}

function renderShorts() {
  const container = $('#shortsList');
  const shorts = state.youtube?.shorts || [];
  if (!shorts.length) {
    container.innerHTML = '<div class="notice info">Shorts plan još nije napravljen.</div>';
    return;
  }
  container.innerHTML = shorts.map((item, index) => `
    <article class="short-card">
      <strong>Shorts ${index + 1}</strong>
      <div class="scene-time">${secondsToClock(item.start)} — ${secondsToClock(item.end)}</div>
      <p>${escapeHtml(item.title || '')}</p>
      <p class="mini-status">Hook: ${escapeHtml(item.hook || '')}</p>
    </article>
  `).join('');
}

async function copyText(text, successMessage = 'Kopirano.') {
  const value = String(text ?? '');
  if (!value) {
    showToast('Nema sadržaja za kopiranje. Klikni „OSVEŽI ADRESU I STATUS“ i pokušaj ponovo.');
    return false;
  }

  // Clipboard API ne postoji u svakom browseru / lokalnom režimu. Zato prvo
  // proveravamo da funkcija zaista postoji, umesto da poziv izazove tihu grešku.
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value);
      showToast(successMessage);
      return true;
    }
  } catch (error) {
    console.warn('Clipboard API nije dozvoljen, koristi se rezervno kopiranje.', error);
  }

  // Rezervno kopiranje radi i kada je Clipboard API blokiran.
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  area.style.top = '0';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  area.focus({ preventScroll: true });
  area.select();
  area.setSelectionRange(0, area.value.length);

  let copied = false;
  try {
    copied = Boolean(document.execCommand('copy'));
  } catch (error) {
    console.warn('Rezervno kopiranje nije uspelo.', error);
  } finally {
    area.remove();
  }

  if (copied) {
    showToast(successMessage);
    return true;
  }

  showToast('Browser je blokirao kopiranje. Klikni ponovo ili ručno označi tekst iz prikazanog polja.');
  return false;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}


function captionTime(value, separator = ',') {
  const totalMilliseconds = Math.max(0, Math.round((Number(value) || 0) * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(milliseconds).padStart(3, '0')}`;
}

function parseCaptionTime(value) {
  const clean = String(value || '').trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.some(number => !Number.isFinite(number))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function generateCaptionsFromLyrics(switchPanel = true) {
  collectFormState();
  const lyrics = parseLyrics(state.lyrics);
  if (!lyrics.length) {
    showToast('Najpre nalepi kompletan tekst pesme.');
    return;
  }
  const duration = state.audio.duration || state.scenes.at(-1)?.end || 0;
  if (!duration) {
    showToast('Najpre dodaj i analiziraj pesmu.');
    return;
  }
  const items = [];
  if (state.scenes.length) {
    for (const scene of state.scenes) {
      const text = String(scene.lyric || '').trim();
      if (!text || /instrumental/i.test(text)) continue;
      const previous = items.at(-1);
      if (previous && previous.text === text && Math.abs(previous.end - scene.start) < 0.12) previous.end = scene.end;
      else items.push({ id: uuid(), start: scene.start, end: scene.end, text: applyCaptionDictionary(text) });
    }
  } else {
    const slice = duration / lyrics.length;
    lyrics.forEach((line, index) => items.push({ id: uuid(), start: index * slice, end: Math.min(duration, (index + 1) * slice), text: applyCaptionDictionary(line.text) }));
  }
  state.captions.items = items;
  state.captions.source = 'lyrics';
  state.captions.translation.items = [];
  state.captions.translation.text = '';
  state.captions.status = 'Titlovi su napravljeni iz potvrđenog teksta pesme.';
  persistState(false, false);
  if (switchPanel) {
    fillForm();
    showPanel('captions');
    showToast(`Napravljeno je ${items.length} titlova na srpskom.`);
  } else {
    renderCaptions();
    updateStatus();
  }
}

function renderCaptions() {
  const container = $('#captionsList');
  if (!container) return;
  const items = state.captions?.items || [];
  $('#captionsBadge').textContent = `${items.length} titlova`;
  const translatedCount = state.captions?.translation?.items?.length || 0;
  if ($('#captionTranslationBadge')) $('#captionTranslationBadge').textContent = translatedCount ? `${translatedCount} prevedeno` : 'Bez prevoda';
  $('#captionStatus').textContent = state.captions?.status || (items.length ? 'Titlovi su spremni.' : 'Titlovi još nisu napravljeni.');
  populateCaptionPreviewScenes();
  renderCaptionBrandPresetOptions();
  renderCaptionFeatureChecklist();
  if (!items.length) {
    container.innerHTML = '<div class="notice info">Nema titlova. Klikni „Napravi titlove iz teksta pesme“.</div>';
    updateLiveCaptionMonitor();
    return;
  }
  container.innerHTML = items.map((item, index) => {
    const translation = state.captions.translation?.items?.find(entry => entry.id === item.id) || state.captions.translation?.items?.[index];
    return `<article class="caption-card" data-caption-id="${item.id}">
      <div class="scene-top"><strong>${index + 1}. titl</strong><span class="scene-time">${captionTime(item.start, '.')} — ${captionTime(item.end, '.')}</span></div>
      <div class="field-grid three"><label>Početak<input type="number" step="0.01" min="0" data-caption-start="${item.id}" value="${Number(item.start).toFixed(2)}"></label><label>Kraj<input type="number" step="0.01" min="0" data-caption-end="${item.id}" value="${Number(item.end).toFixed(2)}"></label><label>Original<input data-caption-text="${item.id}" value="${escapeHtml(item.text)}"></label></div>
      <label class="caption-translation-input">Prevod<input data-caption-translation="${item.id}" value="${escapeHtml(translation?.text || '')}" placeholder="Prevod ovog stiha"></label>
      <button class="secondary caption-preview-jump" data-preview-caption="${item.id}">▶ Pregledaj ovaj deo</button><button class="danger" data-delete-caption="${item.id}">Obriši</button>
    </article>`;
  }).join('');
  $$('[data-caption-start]', container).forEach(input => input.addEventListener('change', () => updateCaptionItem(input.dataset.captionStart, 'start', input.value)));
  $$('[data-caption-end]', container).forEach(input => input.addEventListener('change', () => updateCaptionItem(input.dataset.captionEnd, 'end', input.value)));
  $$('[data-caption-text]', container).forEach(input => input.addEventListener('change', () => updateCaptionItem(input.dataset.captionText, 'text', input.value)));
  $$('[data-caption-translation]', container).forEach(input => input.addEventListener('change', () => updateCaptionTranslation(input.dataset.captionTranslation, input.value)));
  $$('[data-preview-caption]', container).forEach(button => button.addEventListener('click', () => previewCaptionItem(button.dataset.previewCaption)));
  $$('[data-delete-caption]', container).forEach(button => button.addEventListener('click', () => {
    state.captions.items = state.captions.items.filter(item => item.id !== button.dataset.deleteCaption);
    state.captions.translation.items = (state.captions.translation.items || []).filter(item => item.id !== button.dataset.deleteCaption);
    persistState(false, false); renderCaptions();
  }));
  updateLiveCaptionMonitor();
}


function applyCaptionDictionary(text) {
  let output = String(text || '');
  const rules = String(state.captions?.dictionary || $('#captionDictionary')?.value || '').split(/\r?\n/).map(line => line.trim()).filter(line => line.includes('='));
  for (const rule of rules) {
    const [from, ...rest] = rule.split('='); const to = rest.join('=').trim();
    if (!from.trim()) continue;
    output = output.replace(new RegExp(escapeRegExp(from.trim()), 'gi'), match => preserveCaseReplacement(match, to));
  }
  return output;
}
function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function preserveCaseReplacement(source,replacement){if(source===source.toUpperCase())return replacement.toUpperCase();if(source[0]===source[0]?.toUpperCase())return replacement.charAt(0).toUpperCase()+replacement.slice(1);return replacement;}
function applyDictionaryToAllCaptions(){state.captions.dictionary=$('#captionDictionary')?.value||'';state.captions.items.forEach(item=>item.text=applyCaptionDictionary(item.text));persistState(false,false);renderCaptions();showToast('Rečnik ispravki je primenjen na sve titlove.');}
function getTranslationForCaption(item,index){return state.captions?.translation?.items?.find(entry=>entry.id===item?.id)||state.captions?.translation?.items?.[index]||null;}
function updateCaptionTranslation(id,value){const sourceIndex=state.captions.items.findIndex(item=>item.id===id);if(sourceIndex<0)return;const source=state.captions.items[sourceIndex];let item=state.captions.translation.items.find(entry=>entry.id===id);if(!item){item={id,start:source.start,end:source.end,text:''};state.captions.translation.items[sourceIndex]=item;}item.start=source.start;item.end=source.end;item.text=String(value||'').trim();state.captions.translation.text=state.captions.translation.items.map(entry=>entry?.text||'').join('\n');persistState(false,false);updateLiveCaptionMonitor();}
function applyManualTranslationLines(){const lines=String($('#captionTranslationText')?.value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);if(!state.captions.items.length)return showToast('Najpre napravi originalne titlove.');state.captions.translation.items=state.captions.items.map((item,index)=>({id:item.id,start:item.start,end:item.end,text:lines[index]||''})).filter(item=>item.text);state.captions.translation.text=lines.join('\n');state.captions.translation.status=`Ručni prevod je raspoređen na ${state.captions.translation.items.length} titlova.`;persistState(false,false);renderCaptions();showToast(state.captions.translation.status);}
function clearCaptionTranslation(){state.captions.translation.items=[];state.captions.translation.text='';state.captions.translation.status='';if($('#captionTranslationText'))$('#captionTranslationText').value='';persistState(false,false);renderCaptions();}
function protectedTranslationTerms(){return String(state.captions?.translation?.protectedTerms||$('#captionProtectedTerms')?.value||'').split(',').map(item=>item.trim()).filter(Boolean);}
function protectTermsForTranslation(text){let output=String(text);const map=[];protectedTranslationTerms().forEach((term,index)=>{const token=`__PROTECTED_${index}__`;const re=new RegExp(escapeRegExp(term),'gi');if(re.test(output)){output=output.replace(re,token);map.push([token,term]);}});return{output,map};}
function restoreProtectedTerms(text,map){let output=String(text);map.forEach(([token,term])=>output=output.replaceAll(token,term));return output;}
async function translateCaptionsInBrowser(){collectFormState();if(!state.captions.items.length)return showToast('Najpre napravi titlove iz teksta pesme.');const button=$('#translateCaptionsBtn');button.disabled=true;const status=$('#captionTranslationStatus');try{if(!('Translator' in self))throw new Error('Ovaj Chrome nema ugrađeni Translator API. Ručni prevod i dalje radi.');const requestedSource=state.captions.language==='auto'?'sr':state.captions.language;const source=['sr','bs'].includes(requestedSource)?'hr':requestedSource;const target=state.captions.translation.targetLanguage||'en';const languageNote=source!==requestedSource?'Chrome trenutno nema poseban srpski/bosanski model, zato koristim najbliži hrvatski model. Prevod obavezno proveri. ':'';if(source===target)throw new Error('Izabrani browser model bi imao isti izvorni i ciljni jezik. Izaberi drugi ciljni jezik ili koristi ručni prevod.');const availability=await Translator.availability({sourceLanguage:source,targetLanguage:target});if(availability==='unavailable')throw new Error(`Ugrađeni model ne podržava ${source} → ${target} na ovom računaru.`);status.textContent=languageNote+(availability==='downloadable'?'Preuzimam besplatni model prevoda u Chrome...':'Prevodim red po red u pregledaču...');const translator=await Translator.create({sourceLanguage:source,targetLanguage:target,monitor(monitor){monitor.addEventListener('downloadprogress',event=>{status.textContent=`Preuzimanje modela prevoda: ${Math.round((event.loaded||0)*100)}%`;});}});const translated=[];for(let index=0;index<state.captions.items.length;index+=1){const item=state.captions.items[index];status.textContent=`Prevodim ${index+1}/${state.captions.items.length}: ${item.text}`;const protectedValue=protectTermsForTranslation(item.text);const result=restoreProtectedTerms(await translator.translate(protectedValue.output),protectedValue.map);translated.push({id:item.id,start:item.start,end:item.end,text:String(result).trim()});}translator.destroy?.();state.captions.translation.items=translated;state.captions.translation.text=translated.map(item=>item.text).join('\n');state.captions.translation.status=`Automatski prevedeno ${translated.length} titlova.`;persistState(false,false);fillForm();showToast(state.captions.translation.status);}catch(error){status.textContent=`Automatski prevod nije dostupan: ${error.message} Nalepi ručni prevod u polje i klikni „Rasporedi ručni prevod“.`;showToast(`Prevod nije završen: ${error.message}`);}finally{button.disabled=false;}}
function translatedSubtitleFile(format='srt',bilingual=false){const source=state.captions.items||[];const translated=state.captions.translation.items||[];const items=source.map((item,index)=>{const tr=getTranslationForCaption(item,index);const text=bilingual?[item.text,tr?.text].filter(Boolean).join('\n'):(tr?.text||'');return{...item,text};}).filter(item=>item.text);if(format==='vtt')return`WEBVTT\n\n${items.map((item,index)=>`${index+1}\n${captionTime(item.start,'.')} --> ${captionTime(item.end,'.')}\n${item.text}`).join('\n\n')}\n`;return`${items.map((item,index)=>`${index+1}\n${captionTime(item.start)} --> ${captionTime(item.end)}\n${item.text}`).join('\n\n')}\n`;}
function exportTranslatedSubtitles(bilingual=false){if(!state.captions.translation.items.length)return showToast('Nema prevoda za izvoz.');const suffix=bilingual?'DVOJEZICNI':'PREVOD';downloadBlob(new Blob([translatedSubtitleFile('srt',bilingual)],{type:'application/x-subrip;charset=utf-8'}),`${safeFileName(state.songTitle||state.name)}-${suffix}.srt`);showToast(`${suffix} SRT je preuzet.`);}

const CAPTION_PRESETS={
 clean:{mode:'shadow',fontFamily:'Arial',textColor:'#ffffff',highlightColor:'#46e6b0',strokeColor:'#000000',strokeWidth:5,boxOpacity:0,fontSize:5.2,position:'bottom',animation:'fade',lineHeight:120},
 cinema:{mode:'cinema',fontFamily:'Georgia',textColor:'#f6f1e8',highlightColor:'#e6c46a',strokeColor:'#000000',strokeWidth:3,boxOpacity:0,fontSize:4.8,position:'bottom',animation:'fade',lineHeight:128},
 shorts:{mode:'wordpop',fontFamily:'Impact',textColor:'#ffffff',highlightColor:'#ffe13b',strokeColor:'#111111',strokeWidth:10,boxOpacity:0,fontSize:7.2,position:'center',animation:'word',lineHeight:112,wordsPerLine:4},
 karaoke:{mode:'karaoke',fontFamily:'Montserrat',textColor:'#ffffff',highlightColor:'#ff3b69',strokeColor:'#000000',strokeWidth:8,boxOpacity:25,fontSize:6.2,position:'bottom',animation:'pop',lineHeight:118},
 boxed:{mode:'box',fontFamily:'Verdana',textColor:'#ffffff',highlightColor:'#ffe13b',strokeColor:'#000000',strokeWidth:0,boxColor:'#000000',boxOpacity:78,fontSize:5.3,position:'bottom',animation:'fade',lineHeight:122},
 bilingual:{mode:'shadow',fontFamily:'Montserrat',textColor:'#ffffff',highlightColor:'#62e6b5',strokeColor:'#000000',strokeWidth:7,boxOpacity:15,fontSize:4.8,position:'bottom',animation:'fade',lineHeight:112}
};
function applyCaptionPreset(name){const preset=CAPTION_PRESETS[name];if(!preset)return;state.captions.style={...state.captions.style,...preset,preset:name};if(name==='bilingual')state.captions.displayMode='bilingual';persistState(false,false);fillForm();updateLiveCaptionMonitor();showToast(`Primeni stil: ${name}.`);}
function renderCaptionBrandPresetOptions(){const select=$('#captionBrandPresetSelect');if(!select)return;const current=select.value;select.innerHTML='<option value="">Nijedan</option>'+((state.captions.brandPresets||[]).map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join(''));if((state.captions.brandPresets||[]).some(p=>p.id===current))select.value=current;}
function saveCaptionBrandPreset(){collectFormState();const name=$('#captionBrandPresetName')?.value.trim();if(!name)return showToast('Upiši naziv svog stila.');const existing=state.captions.brandPresets.find(p=>p.name.toLowerCase()===name.toLowerCase());const preset={id:existing?.id||uuid(),name,style:structuredClone(state.captions.style),displayMode:state.captions.displayMode,preview:structuredClone(state.captions.preview)};state.captions.brandPresets=state.captions.brandPresets.filter(p=>p.id!==preset.id);state.captions.brandPresets.push(preset);persistState(false,false);renderCaptionBrandPresetOptions();$('#captionBrandPresetSelect').value=preset.id;showToast('Brend stil je sačuvan.');}
function applyCaptionBrandPreset(){const id=$('#captionBrandPresetSelect')?.value;const preset=state.captions.brandPresets.find(p=>p.id===id);if(!preset)return showToast('Izaberi sačuvani stil.');state.captions.style={...state.captions.style,...structuredClone(preset.style)};state.captions.displayMode=preset.displayMode||state.captions.displayMode;state.captions.preview={...state.captions.preview,...structuredClone(preset.preview)};persistState(false,false);fillForm();updateLiveCaptionMonitor();showToast(`Primeni brend stil „${preset.name}“.`);}
function deleteCaptionBrandPreset(){const id=$('#captionBrandPresetSelect')?.value;if(!id)return;state.captions.brandPresets=state.captions.brandPresets.filter(p=>p.id!==id);persistState(false,false);renderCaptionBrandPresetOptions();showToast('Sačuvani stil je obrisan.');}

function populateCaptionPreviewScenes(){const select=$('#captionPreviewScene');if(!select)return;const current=select.value||state.captions.preview?.sceneId||'';select.innerHTML='<option value="">Automatski prema vremenu</option>'+state.scenes.map(scene=>`<option value="${scene.id}">Scena ${scene.number}: ${escapeHtml(scene.sceneTitle||scene.lyric||'bez naziva')}</option>`).join('');if(state.scenes.some(scene=>scene.id===current))select.value=current;}
function setCaptionPreviewMedia({videoUrl='',imageUrl='',label='Demo pozadina'}={}){const video=$('#captionMonitorVideo'),image=$('#captionMonitorImage'),placeholder=$('#captionMonitorPlaceholder');if(videoUrl){video.src=videoUrl;video.hidden=false;image.hidden=true;placeholder.hidden=true;captionPreviewIsDemo=false;}else if(imageUrl){image.src=imageUrl;image.hidden=false;video.hidden=true;video.removeAttribute('src');video.load();placeholder.hidden=true;captionPreviewIsDemo=false;}else{video.hidden=true;video.removeAttribute('src');video.load();image.hidden=true;image.removeAttribute('src');placeholder.hidden=false;captionPreviewIsDemo=true;}if($('#captionPreviewBadge'))$('#captionPreviewBadge').textContent=label;updateLiveCaptionMonitor();}
function loadCaptionPreviewVideoFile(file){if(!file)return;if(captionPreviewObjectUrl)URL.revokeObjectURL(captionPreviewObjectUrl);captionPreviewObjectUrl=URL.createObjectURL(file);setCaptionPreviewMedia({videoUrl:captionPreviewObjectUrl,label:file.name});$('#captionMonitorVideo').controls=false;}
function useLastRenderForCaptionPreview(){if(!lastRenderedUrl)return showToast('Još nema završnog rendera u ovoj sesiji.');setCaptionPreviewMedia({videoUrl:lastRenderedUrl,label:'Poslednji render'});}
async function useSceneForCaptionPreview(){const selected=$('#captionPreviewScene')?.value;let scene=state.scenes.find(item=>item.id===selected);if(!scene){const t=getCaptionPreviewTime();scene=state.scenes.find(item=>t>=item.start&&t<item.end)||state.scenes[0];}if(!scene)return showToast('Storyboard nema scene.');const videoId=state.videoAssetIds?.[scene.id];const imageId=state.imageAssetIds?.[scene.id];if(videoId){const blob=await getAsset(videoId);if(blob){if(captionPreviewObjectUrl)URL.revokeObjectURL(captionPreviewObjectUrl);captionPreviewObjectUrl=URL.createObjectURL(blob);setCaptionPreviewMedia({videoUrl:captionPreviewObjectUrl,label:`AI video — scena ${scene.number}`});return;}}if(imageId){const blob=await getAsset(imageId);if(blob){if(captionPreviewImageObjectUrl)URL.revokeObjectURL(captionPreviewImageObjectUrl);captionPreviewImageObjectUrl=URL.createObjectURL(blob);setCaptionPreviewMedia({imageUrl:captionPreviewImageObjectUrl,label:`Slika — scena ${scene.number}`});captionPreviewTime=scene.start;$('#captionPreviewSeek').value=state.audio.duration?scene.start/state.audio.duration*100:0;updateLiveCaptionMonitor();return;}}showToast(`Scena ${scene.number} još nema sliku ni AI video.`);}
function useDemoCaptionPreview(){setCaptionPreviewMedia({label:'Demo pozadina'});}
function getCaptionPreviewDuration(){const video=$('#captionMonitorVideo');return !video?.hidden&&Number.isFinite(video.duration)?video.duration:(state.audio.duration||state.scenes.at(-1)?.end||5);}
function getCaptionPreviewTime(){const video=$('#captionMonitorVideo');return !video?.hidden&&Number.isFinite(video.currentTime)?video.currentTime:captionPreviewTime;}
function toggleCaptionPreviewPlayback(){const video=$('#captionMonitorVideo');if(!video||video.hidden){captionPreviewTime=(captionPreviewTime+1)%Math.max(1,getCaptionPreviewDuration());updateLiveCaptionMonitor();return;}if(video.paused){video.play().catch(error=>showToast(`Video nije pušten: ${error.message}`));}else video.pause();}
function seekCaptionPreview(percent){const duration=getCaptionPreviewDuration();const time=clamp(Number(percent)||0,0,100)/100*duration;captionPreviewTime=time;const video=$('#captionMonitorVideo');if(video&&!video.hidden&&Number.isFinite(video.duration))video.currentTime=time;updateLiveCaptionMonitor();}
function previewCaptionItem(id){const item=state.captions.items.find(entry=>entry.id===id);if(!item)return;captionPreviewTime=item.start+.02;const duration=getCaptionPreviewDuration();const video=$('#captionMonitorVideo');if(video&&!video.hidden&&Number.isFinite(video.duration)){video.currentTime=Math.min(video.duration,item.start+.02);video.play().catch(()=>{});}$('#captionPreviewSeek').value=duration?captionPreviewTime/duration*100:0;$$('.caption-card').forEach(card=>card.classList.toggle('active',card.dataset.captionId===id));updateLiveCaptionMonitor();}
function captionItemAt(time){const item=state.captions.items.find(entry=>time>=entry.start&&time<entry.end);if(item)return item;const scene=state.scenes.find(entry=>time>=entry.start&&time<entry.end);const text=String(scene?.lyric||'').trim();return text&&!/^instrumental$/i.test(text)?{id:`scene-${scene.id}`,start:scene.start,end:scene.end,text}:null;}
function captionIndex(item){return item?state.captions.items.findIndex(entry=>entry.id===item.id):-1;}
function styleLiveOverlay(element,{translation=false}={}){if(!element)return;const style=state.captions.style||{};const frame=$('#captionMonitorFrame');const isWide=frame?.classList.contains('format-16-9');const size=(Number(style.fontSize)||5.5)*(isWide?.72:1);element.style.fontFamily=`${style.fontFamily||'Arial'}, sans-serif`;element.style.fontSize=`clamp(14px, ${size}cqw, 46px)`;element.style.fontWeight=style.mode==='cinema'?'700':'900';element.style.color=translation?'#bfe8ff':(style.mode==='yellow'?'#ffd43b':style.textColor||'#fff');element.style.textAlign=style.align||'center';element.style.justifyContent=style.align==='left'?'flex-start':style.align==='right'?'flex-end':'center';element.style.lineHeight=String((Number(style.lineHeight)||122)/100);element.style.webkitTextStroke=`${Math.max(0,(Number(style.strokeWidth)||8)/6)}px ${style.strokeColor||'#000'}`;element.style.textShadow=`0 3px ${Math.max(4,(Number(style.strokeWidth)||8)*1.3)}px #000`;element.style.background=style.mode==='box'?hexToRgba(style.boxColor||'#000',(Number(style.boxOpacity)||68)/100):'transparent';element.style.padding=style.mode==='box'?'.35em .55em':'0';element.style.borderRadius=style.mode==='box'?'.35em':'0';element.style.maxWidth=`${Number(style.maxWidth)||88}%`;const offset=Number(style.verticalOffset)||0;let bottom=10-offset;if(style.position==='top'){element.style.top=`${10+offset}%`;element.style.bottom='auto';}else if(style.position==='center'){element.style.top=`${50+offset}%`;element.style.bottom='auto';element.style.transform='translateY(-50%)';}else{element.style.bottom=`${bottom}%`;element.style.top='auto';}if(translation&&state.captions.displayMode==='bilingual'){if(style.position==='bottom')element.style.bottom=`${Math.max(2,bottom-7)}%`;if(style.position==='top')element.style.top=`${17+offset}%`;if(style.position==='center')element.style.top=`${58+offset}%`;element.style.fontSize=`clamp(12px, ${size*.72}cqw, 34px)`;}}
function hexToRgba(hex,alpha){const rgb=hexToRgb(hex);return`rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;}
function updateLiveCaptionMonitor(){const frame=$('#captionMonitorFrame');if(!frame)return;collectFormState();const format=state.captions.preview.format||'9:16';frame.classList.remove('format-9-16','format-16-9','format-1-1');frame.classList.add(`format-${format.replace(':','-')}`);const zones=$('#captionSafeZonesOverlay');zones.className=`caption-safe-zones platform-${state.captions.preview.showSafeZones?(state.captions.preview.safeZonePlatform||'youtube'):'none'}`;const time=getCaptionPreviewTime();const duration=getCaptionPreviewDuration();const item=captionItemAt(time)||state.captions.items[0]||{id:'demo',start:0,end:5,text:'NEDOSTAJEŠ MI VIŠE NEGO ŠTO SMEM DA KAŽEM'};const index=captionIndex(item);const tr=getTranslationForCaption(item,index);const mode=state.captions.enabled===false?'none':(state.captions.displayMode||'original');const original=$('#captionOriginalOverlay'),translation=$('#captionTranslationOverlay');let originalText=state.captions.style.uppercase?String(item.text||'').toLocaleUpperCase('sr-RS'):String(item.text||'');let translatedText=state.captions.style.uppercase?String(tr?.text||'').toLocaleUpperCase('sr-RS'):String(tr?.text||'');const local=clamp((time-(item.start||0))/Math.max(.05,(item.end||5)-(item.start||0)),0,1);if(state.captions.style.animation==='typewriter')originalText=originalText.slice(0,Math.max(1,Math.ceil(originalText.length*local)));if(['word','wordpop'].includes(state.captions.style.animation)||state.captions.style.mode==='wordpop'){const words=originalText.split(/\s+/);originalText=words.slice(0,Math.max(1,Math.ceil(words.length*local))).join(' ');}original.textContent=originalText;translation.textContent=translatedText;original.hidden=!['original','bilingual'].includes(mode);translation.hidden=!['translation','bilingual'].includes(mode)||!translatedText;styleLiveOverlay(original);styleLiveOverlay(translation,{translation:true});const title=$('#captionTitleOverlay'),cta=$('#captionCtaOverlay'),overlay=state.captions.overlays||{};title.textContent=overlay.titleText||state.songTitle||'';title.hidden=!(overlay.titleEnabled&&time<=Number(overlay.titleDuration||4));cta.textContent=overlay.ctaText||'';cta.hidden=!(overlay.ctaEnabled&&time>=Math.max(0,duration-Number(overlay.ctaDuration||5)));const seek=$('#captionPreviewSeek');if(seek&&!seek.matches(':active'))seek.value=duration?time/duration*100:0;if($('#captionPreviewTime'))$('#captionPreviewTime').textContent=`${secondsToClock(time)} / ${secondsToClock(duration)}`;if($('#captionPreviewPlayBtn'))$('#captionPreviewPlayBtn').textContent=$('#captionMonitorVideo')?.paused===false?'❚❚ Pauza':'▶ Pusti';renderCaptionReadability(item,tr);}
function renderCaptionReadability(item,tr){const box=$('#captionReadabilityReport');if(!box)return;const duration=Math.max(.1,(item?.end||5)-(item?.start||0));const chars=String(item?.text||'').length;const cps=chars/duration;const maxWords=Math.max(...splitCaptionLines(item?.text,state.captions.style.wordsPerLine||7).map(line=>line.split(/\s+/).length),0);const hasTranslation=Boolean(tr?.text);const checks=[{label:'Brzina čitanja',value:`${cps.toFixed(1)} znakova/s`,level:cps<=17?'good':cps<=22?'warn':'bad'},{label:'Najduži red',value:`${maxWords} reči`,level:maxWords<=7?'good':maxWords<=9?'warn':'bad'},{label:'Safe zona',value:state.captions.preview.showSafeZones?'prikazana':'skrivena',level:state.captions.preview.showSafeZones?'good':'warn'},{label:'Prevod',value:hasTranslation?'spreman':'nije unet',level:state.captions.displayMode==='original'?'good':hasTranslation?'good':'bad'}];box.innerHTML=checks.map(check=>`<div class="caption-quality-item ${check.level}"><span>${check.label}</span><strong>${check.value}</strong></div>`).join('');}
function renderCaptionFeatureChecklist(){const box=$('#captionFeatureChecklist');if(!box)return;const list=['Živi video monitor','Original / prevod / dvojezično','Safe zone za 4 platforme','Klikabilni transkript','Rečnik ispravki','Brend preset stilova','Automatsko uklapanje teksta','Animacije reč-po-reč','Naslov i CTA','Više SRT traka','Pregled 9:16 / 16:9 / 1:1','Provera čitljivosti'];box.innerHTML=list.map(item=>`<div><b>✓</b> ${item}</div>`).join('');}

function captionItemsToTextToolCues(items = state.captions?.items || []) {
  return items.map((item, index) => ({
    cueId: item.id || `caption-${String(index + 1).padStart(4, '0')}`,
    startMs: Math.max(0, Math.round(Number(item.start || 0) * 1000)),
    endMs: Math.max(1, Math.round(Number(item.end || 0) * 1000)),
    text: String(item.text || ''), enabled: true, deleted: false
  }));
}

function textToolCuesToCaptionItems(cues = []) {
  return cues.map((cue, index) => ({
    id: cue.cueId || `caption-${String(index + 1).padStart(4, '0')}`,
    start: Number(cue.startMs || 0) / 1000,
    end: Number(cue.endMs || 0) / 1000,
    text: String(cue.text || ''),
    words: Array.isArray(cue.words) ? cue.words : []
  })).filter(item => item.end > item.start && item.text.trim());
}

async function callTextVideoTool(route, payload = {}) {
  const response = await fetch(`/api/text-tools/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Napredni tekst-u-video alat nije uspeo.');
  return data;
}

function setTextToolsReport(message, tone = 'normal') {
  const report = $('#textToolsReport');
  const badge = $('#textToolsStatusBadge');
  if (report) report.textContent = message;
  if (badge) { badge.textContent = tone === 'error' ? 'Greška' : tone === 'good' ? 'Završeno' : 'Spremno'; badge.className = `badge ${tone === 'error' ? 'danger' : tone === 'good' ? 'success' : ''}`; }
}

function applyTextToolCues(cues, message) {
  state.captions.items = textToolCuesToCaptionItems(cues);
  state.captions.status = message;
  state.captions.translation.items = [];
  state.captions.translation.text = '';
  persistState(false, false);
  fillForm();
  renderCaptions();
  renderCaptionPreview();
}

async function importLrcIntoCaptions(file) {
  if (!file) return;
  try {
    const data = await callTextVideoTool('lrc/import', { text: await file.text(), durationMs: Math.round((state.audio.duration || 0) * 1000) || null });
    applyTextToolCues(data.cues || [], `LRC je učitan: ${data.cues?.length || 0} titlova.`);
    setTextToolsReport(`LRC učitan. Metapodaci: ${Object.keys(data.metadata || {}).length}. Titlovi: ${data.cues?.length || 0}.`, 'good');
  } catch (error) { setTextToolsReport(error.message, 'error'); showToast(error.message); }
}

async function importSrtIntoTextTools(file) {
  if (!file) return;
  try {
    const data = await callTextVideoTool('srt/import', { text: await file.text() });
    applyTextToolCues(data.cues || [], `SRT je učitan: ${data.cues?.length || 0} titlova.`);
    setTextToolsReport(`SRT učitan. Titlovi: ${data.cues?.length || 0}.`, 'good');
  } catch (error) { setTextToolsReport(error.message, 'error'); showToast(error.message); }
}

async function exportLrcFromTextTools() {
  try {
    const data = await callTextVideoTool('lrc/export', { cues: captionItemsToTextToolCues(), metadata: { ti: state.songTitle || 'lyrics-video', ar: state.artistName || '' } });
    downloadBlob(new Blob([data.lrc || ''], { type: 'text/plain;charset=utf-8' }), `${safeFileName(state.songTitle || state.name || 'lyrics-video')}.lrc`);
    setTextToolsReport('LRC je uspešno izvezen.', 'good');
  } catch (error) { setTextToolsReport(error.message, 'error'); showToast(error.message); }
}

async function qualityCheckTextTools() {
  try {
    const data = await callTextVideoTool('qc', { track: { cues: captionItemsToTextToolCues() }, options: { durationMs: Math.round((state.audio.duration || 0) * 1000) || null, minimumGapMs: Number($('#textToolsMinGap')?.value || 0) } });
    setTextToolsReport(`KONTROLA TITLOVA\nValidno: ${data.valid ? 'DA' : 'NE'}\nBroj titlova: ${data.cueCount}\nGreške: ${data.errors.length}\nUpozorenja: ${data.warnings.length}\n\n${[...data.errors, ...data.warnings].map(item => `- ${item.message}`).join('\n') || 'Nema pronađenih problema.'}`, data.valid ? 'good' : 'error');
  } catch (error) { setTextToolsReport(error.message, 'error'); showToast(error.message); }
}

async function normalizeTextToolsCaptions() {
  try {
    const data = await callTextVideoTool('normalize', { track: { cues: captionItemsToTextToolCues() }, options: { durationMs: Math.round((state.audio.duration || 0) * 1000) || null } });
    applyTextToolCues(data.cues || [], `Titlovi su sređeni: ${data.cues?.length || 0} titlova.`);
    setTextToolsReport('Titlovi su normalizovani, sortirani i očišćeni od preklapanja.', 'good');
  } catch (error) { setTextToolsReport(error.message, 'error'); showToast(error.message); }
}

async function splitLongTextToolsCaptions() {
  try {
    const maxChars = Number($('#textToolsMaxChars')?.value || 42);
    const result = [];
    for (const cue of captionItemsToTextToolCues()) {
      const data = await callTextVideoTool('split', { cue, options: { maxChars } });
      result.push(...(data.cues || []));
    }
    applyTextToolCues(result, `Dugi titlovi su podeljeni: ${result.length} titlova.`);
    setTextToolsReport(`Podela završena. Maksimum je ${maxChars} karaktera po titlu. Ukupno: ${result.length}.`, 'good');
  } catch (error) { setTextToolsReport(error.message, 'error'); showToast(error.message); }
}

async function showTextToolsSafeArea() {
  try {
    const format = $('#textToolsSafeFormat')?.value || '9:16';
    const response = await fetch(`/api/text-tools/safe-area?format=${encodeURIComponent(format)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Safe zone nije dostupna.');
    const p = data.preset;
    setTextToolsReport(`SAFE ZONA ${p.format}\nDimenzije: ${p.width} × ${p.height}\nLevo: ${p.left * 100}%\nDesno: ${p.right * 100}%\nGore: ${p.top * 100}%\nDole: ${p.bottom * 100}%`, 'good');
  } catch (error) { setTextToolsReport(error.message, 'error'); showToast(error.message); }
}

async function buildTextToolsBeatScenes() {
  try {
    const durationMs = Math.round((state.audio.duration || state.scenes.at(-1)?.end || 0) * 1000);
    const energy = Array.isArray(state.audio.energyCurve) ? state.audio.energyCurve : [];
    if (!durationMs || !energy.length) throw new Error('Najpre dodaj i analiziraj audio da bi se napravili rezovi po beatovima.');
    const fps = energy.length / Math.max(1, durationMs / 1000);
    const markersData = await callTextVideoTool('beat-markers', { energy, options: { fps } });
    const scenesData = await callTextVideoTool('scene-cuts', { durationMs, markers: markersData.markers, options: { minimumSceneMs: Math.max(1000, Number(state.sceneDuration || 5) * 1000 * .6), maximumSceneMs: Math.max(3000, Number(state.sceneDuration || 5) * 1000 * 1.8) } });
    setTextToolsReport(`REZOVI PO BEATOVIMA\nBeat markeri: ${markersData.markers.length}\nPredložene scene: ${scenesData.scenes.length}\nTrajanje: ${(durationMs / 1000).toFixed(2)} s\n\n${scenesData.scenes.map(scene => `${scene.number}. ${scene.startMs}–${scene.endMs} ms (${scene.cutReason})`).join('\n')}`, 'good');
  } catch (error) { setTextToolsReport(error.message, 'error'); showToast(error.message); }
}

async function buildTextToolsBatchPlan() {
  try {
    const data = await callTextVideoTool('batch-export', { baseName: safeFileName(state.songTitle || state.name || 'lyrics-video'), outputDir: 'exports', formats: ['srt', 'vtt', 'lrc', 'ass', 'json'] });
    setTextToolsReport(`PLAN IZVOZA\n${(data.plan || []).map(item => `${item.format.toUpperCase()} → ${item.outputPath}`).join('\n')}`, 'good');
  } catch (error) { setTextToolsReport(error.message, 'error'); showToast(error.message); }
}
function updateCaptionItem(id, field, value) {
  const item = state.captions.items.find(entry => entry.id === id);
  if (!item) return;
  item[field] = field === 'text' ? applyCaptionDictionary(String(value).trim()) : Math.max(0, Number(value) || 0);
  const translated = state.captions.translation.items.find(entry => entry.id === id);
  if (translated && field !== 'text') translated[field] = item[field];
  if (item.end <= item.start) item.end = item.start + 0.5;
  state.captions.items.sort((a, b) => a.start - b.start);
  persistState(false, false);
  renderCaptions();
  updateLiveCaptionMonitor();
}

function subtitleFile(format = 'srt') {
  const items = state.captions?.items || [];
  if (format === 'vtt') return `WEBVTT\n\n${items.map((item, index) => `${index + 1}\n${captionTime(item.start, '.')} --> ${captionTime(item.end, '.')}\n${item.text}`).join('\n\n')}\n`;
  return `${items.map((item, index) => `${index + 1}\n${captionTime(item.start)} --> ${captionTime(item.end)}\n${item.text}`).join('\n\n')}\n`;
}

function exportSubtitles(format) {
  if (!state.captions?.items?.length) return showToast('Nema titlova za izvoz.');
  downloadBlob(new Blob([subtitleFile(format)], { type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' }), `${safeFileName(state.songTitle || state.name)}.${format}`);
  showToast(`${format.toUpperCase()} titlovi su preuzeti.`);
}

async function importSubtitleFile(file) {
  if (!file) return;
  try {
    const text = (await file.text()).replace(/^WEBVTT[^\n]*\n+/i, '');
    const blocks = text.trim().split(/\r?\n\s*\r?\n/);
    const items = [];
    for (const block of blocks) {
      const rows = block.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
      const timeIndex = rows.findIndex(row => row.includes('-->'));
      if (timeIndex < 0) continue;
      const [startText, endTextRaw] = rows[timeIndex].split('-->');
      const endText = endTextRaw.trim().split(/\s+/)[0];
      const start = parseCaptionTime(startText);
      const end = parseCaptionTime(endText);
      const captionText = rows.slice(timeIndex + 1).join(' ').replace(/<[^>]+>/g, '').trim();
      if (captionText && end > start) items.push({ id: uuid(), start, end, text: captionText });
    }
    if (!items.length) throw new Error('Nisu pronađeni ispravni vremenski titlovi.');
    state.captions.items = items.map(item => ({...item, text: applyCaptionDictionary(item.text)}));
    state.captions.translation.items = [];
    state.captions.translation.text = '';
    state.captions.source = 'import';
    state.captions.status = `Uvezeno iz fajla ${file.name}.`;
    persistState(false, false);
    fillForm();
    showToast(`Uvezeno je ${items.length} titlova.`);
  } catch (error) {
    showToast(`Uvoz titlova nije uspeo: ${error.message}`);
  } finally {
    $('#subtitleImportFile').value = '';
  }
}

async function monoAudioAt16k() {
  const buffer = await decodeStoredAudio();
  const length = Math.ceil(buffer.duration * 16000);
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) throw new Error('Pregledač nema OfflineAudioContext.');
  const context = new Offline(1, length, 16000);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return rendered.getChannelData(0).slice();
}

async function transcribeWithWhisper() {
  if (!state.audio.duration) return showToast('Najpre dodaj pesmu.');
  const button = $('#whisperCaptionsBtn');
  button.disabled = true;
  $('#captionProgress').style.width = '2%';
  $('#captionStatus').textContent = 'Pripremam lokalni Whisper. Prvi put se preuzima model; može biti više od 100 MB.';
  try {
    if (!transformersModule) transformersModule = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
    if (!whisperTranscriber) {
      whisperTranscriber = await transformersModule.pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
        device: navigator.gpu ? 'webgpu' : 'wasm',
        dtype: navigator.gpu ? { encoder_model: 'fp16', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: progress => {
          const percent = Number(progress?.progress);
          if (Number.isFinite(percent)) $('#captionProgress').style.width = `${clamp(percent, 2, 70)}%`;
          $('#captionStatus').textContent = progress?.file ? `Preuzimanje modela: ${progress.file}` : 'Učitavanje Whisper modela...';
        }
      });
    }
    renderToolStatus();
    $('#captionProgress').style.width = '75%';
    $('#captionStatus').textContent = 'Analiziram pesmu. Kod pevanja proveri rezultat jer Whisper može pogrešiti.';
    const pcm = await monoAudioAt16k();
    const languageNames = { sr: 'serbian', hr: 'croatian', bs: 'bosnian' };
    const options = { task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
    const language = languageNames[state.captions.language];
    if (language) options.language = language;
    const output = await whisperTranscriber(pcm, options);
    const chunks = Array.isArray(output?.chunks) ? output.chunks : [];
    const items = chunks.map(chunk => ({ id: uuid(), start: Number(chunk.timestamp?.[0]) || 0, end: Number(chunk.timestamp?.[1]) || 0, text: String(chunk.text || '').trim() })).filter(item => item.text && item.end > item.start);
    if (!items.length && output?.text) items.push({ id: uuid(), start: 0, end: state.audio.duration, text: String(output.text).trim() });
    if (!items.length) throw new Error('Whisper nije pronašao tekst u pesmi. Koristi potvrđeni tekst pesme.');
    state.captions.items = items.map(item => ({...item, text: applyCaptionDictionary(item.text)}));
    state.captions.translation.items = [];
    state.captions.translation.text = '';
    state.captions.source = 'whisper';
    state.captions.status = `Whisper je napravio ${items.length} titlova. Obavezno proveri reči.`;
    $('#captionProgress').style.width = '100%';
    persistState(false, false);
    fillForm();
    showToast(`Whisper je napravio ${items.length} srpskih titlova.`);
  } catch (error) {
    console.error(error);
    $('#captionStatus').textContent = `Whisper nije uspeo: ${error.message}. Titlovi iz unetog teksta i dalje rade bez preuzimanja modela.`;
    $('#captionProgress').style.width = '0%';
    showToast(`Whisper nije uspeo: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function splitCaptionLines(text, maxWords) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  for (let index = 0; index < words.length; index += maxWords) lines.push(words.slice(index, index + maxWords).join(' '));
  return lines.slice(0, 3);
}

function drawCaption(context, width, height, projectTime) {
  if (!state.settings.burnCaptions || state.captions?.enabled === false || state.captions?.displayMode === 'none') {
    drawVideoTextOverlays(context,width,height,projectTime); return;
  }
  const item = captionItemAt(projectTime);
  if (!item) { drawVideoTextOverlays(context,width,height,projectTime); return; }
  const index = captionIndex(item); const translation = getTranslationForCaption(item,index);
  const mode = state.captions.displayMode || 'original'; const blocks=[];
  if (['original','bilingual'].includes(mode)) blocks.push({text:item.text,translation:false});
  if (['translation','bilingual'].includes(mode) && translation?.text) blocks.push({text:translation.text,translation:true});
  blocks.forEach((block,blockIndex)=>drawCaptionBlock(context,width,height,projectTime,item,block.text,{translation:block.translation,blockIndex,blockCount:blocks.length}));
  drawVideoTextOverlays(context,width,height,projectTime);
}
function drawCaptionBlock(context,width,height,projectTime,item,text,{translation=false,blockIndex=0,blockCount=1}={}){
  const style=state.captions.style||{};const baseFont=Math.max(20,Math.round(width*(Number(style.fontSize)||5.5)/100));const fontSize=translation&&blockCount>1?Math.round(baseFont*.72):baseFont;
  const local=Math.max(0,Math.min(1,(projectTime-item.start)/Math.max(.05,item.end-item.start)));let displayText=style.uppercase?String(text||'').toLocaleUpperCase('sr-RS'):String(text||'');
  if(style.animation==='typewriter')displayText=displayText.slice(0,Math.max(1,Math.ceil(displayText.length*local)));
  const allWords=displayText.trim().split(/\s+/).filter(Boolean);if(style.animation==='word'||style.mode==='wordpop')displayText=allWords.slice(0,Math.max(1,Math.ceil(allWords.length*local))).join(' ');
  const lines=splitCaptionLines(displayText,Number(style.wordsPerLine)||7);if(!lines.length)return;const lineHeight=fontSize*(Number(style.lineHeight)||122)/100;const padding=fontSize*.46;const totalHeight=lines.length*lineHeight+padding*1.2;const offsetPx=height*(Number(style.verticalOffset)||0)/100;let centerY=height-height*.12-totalHeight/2+offsetPx;
  if(style.position==='top')centerY=height*.12+totalHeight/2+offsetPx;if(style.position==='center')centerY=height/2+offsetPx;if(blockCount>1){const separation=totalHeight*.68;if(style.position==='bottom')centerY+=blockIndex===0?-separation:separation*.55;else if(style.position==='top')centerY+=blockIndex===0?0:separation*1.2;else centerY+=blockIndex===0?-separation*.65:separation*.65;}
  let alpha=1,scale=1,shiftY=0;if(style.animation==='fade')alpha=Math.min(1,local/.14,(1-local)/.12);if(style.animation==='pop')scale=.9+.1*Math.min(1,local/.12);if(style.animation==='bounce')scale=1+Math.sin(Math.min(1,local/.22)*Math.PI)*.12;if(style.animation==='slide')shiftY=(1-Math.min(1,local/.18))*fontSize*1.3;
  context.save();context.globalAlpha=Math.max(0,alpha);context.translate(width/2,centerY+shiftY);context.scale(scale,scale);context.translate(-width/2,-centerY);context.font=`800 ${fontSize}px ${style.fontFamily||'Arial'}, Segoe UI, sans-serif`;context.textBaseline='middle';context.lineJoin='round';context.textAlign=style.align||'center';
  const allowedWidth=width*(Number(style.maxWidth)||88)/100;const maxMeasured=Math.max(...lines.map(line=>context.measureText(line).width),0);const fitScale=style.autoFit!==false&&maxMeasured>allowedWidth?allowedWidth/maxMeasured:1;context.translate(width/2,centerY);context.scale(fitScale,fitScale);context.translate(-width/2,-centerY);const actualWidth=Math.min(maxMeasured,allowedWidth/fitScale);const anchorX=style.align==='left'?(width-actualWidth)/2:style.align==='right'?(width+actualWidth)/2:width/2;
  if(style.mode==='box'||Number(style.boxOpacity)>0&&style.mode==='karaoke'){const rgb=hexToRgb(style.boxColor||'#000');context.fillStyle=`rgba(${rgb.r},${rgb.g},${rgb.b},${(Number(style.boxOpacity)||0)/100})`;context.fillRect((width-actualWidth)/2-padding,centerY-totalHeight/2,actualWidth+padding*2,totalHeight);}
  const stroke=Math.max(0,Number(style.strokeWidth)||0);lines.forEach((line,lineIndex)=>{const y=centerY-(lines.length-1)*lineHeight/2+lineIndex*lineHeight;context.lineWidth=stroke;context.strokeStyle=style.strokeColor||'#000';context.fillStyle=translation?'#bfe8ff':(style.mode==='yellow'?'#ffd43b':style.textColor||'#fff');if(stroke>0)context.strokeText(line,anchorX,y);context.fillText(line,anchorX,y);
    if(style.mode==='karaoke'){const words=line.split(/\s+/);const active=Math.min(words.length-1,Math.floor(local*words.length));const before=words.slice(0,active).join(' ');const activeWord=words[active]||'';const lineWidth=context.measureText(line).width;const lineStart=style.align==='left'?anchorX:style.align==='right'?anchorX-lineWidth:anchorX-lineWidth/2;const x=lineStart+context.measureText(before+(before?' ':'')).width+context.measureText(activeWord).width/2;context.textAlign='center';context.fillStyle=style.highlightColor||'#ff3b69';if(stroke>0)context.strokeText(activeWord,x,y);context.fillText(activeWord,x,y);context.textAlign=style.align||'center';}
  });context.restore();
}
function drawVideoTextOverlays(context,width,height,projectTime){const overlay=state.captions?.overlays||{};context.save();context.textAlign='center';context.textBaseline='middle';context.lineJoin='round';if(overlay.titleEnabled&&projectTime<=Number(overlay.titleDuration||4)){const font=Math.max(28,Math.round(width*.065));context.font=`900 ${font}px Montserrat, Arial`;context.lineWidth=Math.max(5,font*.12);context.strokeStyle='#000';context.fillStyle='#fff';context.strokeText(overlay.titleText||state.songTitle||'',width/2,height*.12);context.fillText(overlay.titleText||state.songTitle||'',width/2,height*.12);}const duration=state.audio.duration||state.scenes.at(-1)?.end||0;if(overlay.ctaEnabled&&projectTime>=Math.max(0,duration-Number(overlay.ctaDuration||5))){const font=Math.max(24,Math.round(width*.052));context.font=`900 ${font}px Montserrat, Arial`;context.lineWidth=Math.max(5,font*.13);context.strokeStyle='#000';context.fillStyle='#ffe36b';context.strokeText(overlay.ctaText||'CELA PESMA NA YOUTUBE KANALU',width/2,height*.88);context.fillText(overlay.ctaText||'CELA PESMA NA YOUTUBE KANALU',width/2,height*.88);}context.restore();}

function hexToRgb(hex) {
  const clean = String(hex || '#000000').replace('#','');
  const value = parseInt(clean.length === 3 ? clean.split('').map(x => x+x).join('') : clean, 16);
  return { r:(value>>16)&255, g:(value>>8)&255, b:value&255 };
}

function renderCaptionPreview() {
  updateLiveCaptionMonitor();
  const canvas=$('#captionPreviewCanvas');if(!canvas)return;const context=canvas.getContext('2d');const gradient=context.createLinearGradient(0,0,canvas.width,canvas.height);gradient.addColorStop(0,'#111a34');gradient.addColorStop(1,'#49245e');context.fillStyle=gradient;context.fillRect(0,0,canvas.width,canvas.height);const backup=state.captions.items;state.captions.items=[{id:'preview',start:0,end:5,text:'NEDOSTAJEŠ MI VIŠE NEGO ŠTO SMEM DA KAŽEM'}];drawCaption(context,canvas.width,canvas.height,1);state.captions.items=backup;
}

function resolveRenderRange() {
  const scope = state.settings.renderScope || 'full';
  if (scope === 'full') return { start: 0, end: state.audio.duration, label: 'ceo-spot', vertical: state.format === '9:16' };
  const index = Number(scope.split('-')[1]) - 1;
  const item = state.youtube?.shorts?.[index];
  if (!item) throw new Error(`Shorts ${index + 1} nije napravljen. Otvori YouTube i klikni „Napravi osnovni Shorts plan“.`);
  return { start: Math.max(0, Number(item.start) || 0), end: Math.min(state.audio.duration, Number(item.end) || state.audio.duration), label: `shorts-${index + 1}`, vertical: true };
}

function safeFileName(name) {
  return (name || 'muzicki-spot-projekat').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'muzicki-spot-projekat';
}

async function exportProject(includeAssets) {
  collectFormState();
  try {
    if (includeAssets) {
      await exportZipProject();
      showToast('Kompletna ZIP rezervna kopija je napravljena.');
      return;
    }
    const output = structuredClone(state);
    output.exportedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${safeFileName(state.name)}-LAKI.json`);
    showToast('Laki JSON bez pesme i slika je izvezen.');
  } catch (error) {
    console.error(error);
    showToast(`Izvoz nije uspeo: ${error.message}`);
  }
}

async function importProjectFile(file) {
  if (!file) return;
  try {
    if (file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')) {
      await importZipProject(file);
    } else {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object') throw new Error('Neispravan projekat.');
      const importedProjectId = data.projectId || uuid();
      state = normalizeState({ ...data, projectId: importedProjectId });
      state.imageAssetIds = data.imageAssetIds || {};
      state.videoAssetIds = data.videoAssetIds || {};
      if (data.assets?.audio) await putAsset(`audio:${state.projectId}`, dataUrlToBlob(data.assets.audio));
      if (data.assets?.images) {
        for (const [sceneId, dataUrl] of Object.entries(data.assets.images)) {
          const assetId = `image:${state.projectId}:${sceneId}`;
          await putAsset(assetId, dataUrlToBlob(dataUrl));
          state.imageAssetIds[sceneId] = assetId;
        }
      }
      delete state.assets;
    }
    audioBuffer = null;
    persistState(true, false);
    fillForm();
    await hydrateAudioPreview();
    renderStoryboard();
    await renderMediaGallery();
    showToast('Projekat je uspešno uvezen.');
  } catch (error) {
    console.error(error);
    showToast(`Uvoz nije uspeo: ${error.message}`);
  } finally {
    $('#projectImportFile').value = '';
  }
}

async function renderMediaGallery() {
  const container = $('#mediaGallery');
  galleryObjectUrls.forEach(url => URL.revokeObjectURL(url));
  galleryObjectUrls.clear();
  i2vObjectUrls.forEach(url => URL.revokeObjectURL(url));
  i2vObjectUrls.clear();
  document.documentElement.style.setProperty('--media-ratio', state.format === '16:9' ? '16/9' : state.format === '1:1' ? '1/1' : '9/16');
  if (!state.scenes.length) {
    container.innerHTML = '<div class="notice info">Najpre napravi storyboard.</div>';
    return;
  }
  const cards = [];
  for (const scene of state.scenes) {
    let imageMarkup = `<div class="media-placeholder">Scena ${scene.number}<br>Nema slike</div>`;
    const assetId = state.imageAssetIds[scene.id];
    let hasAsset = false;
    if (assetId) {
      const blob = await getAsset(assetId);
      if (blob) {
        hasAsset = true;
        const url = URL.createObjectURL(blob);
        galleryObjectUrls.add(url);
        imageMarkup = `<img src="${url}" alt="Scena ${scene.number}">`;
      }
    }
    let videoMarkup = '';
    let hasVideo = false;
    const videoAssetId = state.videoAssetIds?.[scene.id];
    if (videoAssetId) {
      const videoBlob = await getAsset(videoAssetId);
      if (videoBlob) {
        hasVideo = true;
        const videoUrl = URL.createObjectURL(videoBlob);
        i2vObjectUrls.add(videoUrl);
        videoMarkup = `<div class="ai-video-shell"><video src="${videoUrl}" controls muted loop playsinline></video></div>`;
      }
    }
    const info = scene.imageInfo;
    const infoMarkup = info ? `<div class="image-quality"><span class="quality-chip">${info.width}×${info.height}</span><span class="quality-chip">${(Number(info.size || 0) / 1024 / 1024).toFixed(2)} MB</span><span class="quality-chip">${escapeHtml((info.type || '').replace('image/', '').toUpperCase())}</span></div>` : '';
    const paletteMarkup = scene.palette?.length ? `<div class="palette-row" title="Sličnost boja sa prethodnom scenom: ${scene.paletteScore || 0}%">${scene.palette.map(color => `<span style="background:${escapeHtml(color)}" title="${escapeHtml(color)}"></span>`).join('')}<b>${scene.paletteScore || 0}%</b></div>` : '<div class="mini-status">Paleta još nije analizirana.</div>';
    cards.push(`
      <article class="media-card">
        <div class="scene-top"><strong>Scena ${scene.number}</strong><span class="scene-time">${scene.duration.toFixed(2)} s</span></div>
        ${imageMarkup}
        ${infoMarkup}
        ${videoMarkup}
        <div class="t2i-scene-status ${escapeHtml(scene.t2i?.status || 'idle')}">AI slika: ${escapeHtml(hasAsset ? 'spremna' : scene.t2i?.status === 'processing' ? 'generisanje u toku' : scene.t2i?.status === 'error' ? `greška — ${scene.t2i.error || ''}` : 'nije napravljena')}</div>
        <div class="i2v-scene-status ${escapeHtml(scene.i2v?.status || 'idle')}">AI video: ${escapeHtml(scene.i2v?.status === 'done' ? 'spreman' : scene.i2v?.status === 'processing' ? 'generisanje u toku' : scene.i2v?.status === 'error' ? `greška — ${scene.i2v.error || ''}` : 'nije napravljen')}</div>
        ${paletteMarkup}
        <input type="file" accept="image/*" data-image-upload="${scene.id}">
        <div class="actions">
          <button data-chatgpt-generate="${scene.id}" class="primary">Kopiraj za ChatGPT</button><button data-chatgpt-import="${scene.id}" class="secondary">Uvezi ChatGPT sliku</button><button data-generate-image="${scene.id}" class="secondary">${hasAsset ? 'Ponovo generiši lokalno' : 'Generiši lokalno'}</button><button data-copy-media-prompt="${scene.id}" class="ghost">Kopiraj prompt</button>
          ${hasAsset ? `<button data-generate-i2v="${scene.id}" class="secondary">${hasVideo ? 'Ponovo generiši AI video' : 'Napravi AI video'}</button><button data-process-image="${scene.id}" class="secondary">Obradi ponovo</button><button data-palette-image="${scene.id}" class="secondary">Analiziraj boje</button><button data-download-image="${scene.id}" class="secondary">Preuzmi sliku</button><button data-delete-image="${scene.id}" class="danger">Obriši sliku</button>` : ''}
          ${hasVideo ? `<button data-download-i2v="${scene.id}" class="secondary">Preuzmi AI video</button><button data-delete-i2v="${scene.id}" class="danger">Obriši AI video</button>` : ''}
        </div>
        <p class="prompt-preview">${escapeHtml(scene.imagePrompt)}</p>
      </article>
    `);
  }
  container.innerHTML = cards.join('');
  $$('[data-image-upload]', container).forEach(input => input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name))) return;
    const sceneId = input.dataset.imageUpload;
    const scene = state.scenes.find(item => item.id === sceneId);
    input.disabled = true;
    try {
      showToast('Obrada slike: pametan kadar i optimizacija...');
      const processed = await processImageForScene(file, scene);
      const assetId = `image:${state.projectId}:${sceneId}`;
      await putAsset(assetId, processed.blob);
      state.imageAssetIds[sceneId] = assetId;
      scene.imageInfo = processed.info;
      scene.smartCrop = processed.crop || null;
      if (state.settings.autoPalette) await analyzeScenePalette(sceneId, processed.blob);
      persistState(false, false);
      await renderMediaGallery();
      showToast('Slika je optimizovana i sačuvana.');
    } catch (error) {
      console.error(error);
      showToast(`Slika nije obrađena: ${error.message}`);
    }
  }));
  $$('[data-chatgpt-generate]', container).forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await sendSceneToChatGpt(button.dataset.chatgptGenerate); }
    catch (error) { showToast(`ChatGPT zahtev nije poslat: ${error.message}`); }
    finally { if (button.isConnected) button.disabled = false; }
  }));
  $$('[data-chatgpt-import]', container).forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await importChatGptImage(button.dataset.chatgptImport); }
    catch (error) { showToast(`ChatGPT slika nije uvezena: ${error.message}`); }
    finally { if (button.isConnected) button.disabled = false; }
  }));
  $$('[data-generate-image]', container).forEach(button => button.addEventListener('click', async () => { button.disabled = true; try { await generateSceneImage(button.dataset.generateImage); } finally { if (button.isConnected) button.disabled = false; } }));
  $$('[data-copy-media-prompt]', container).forEach(button => button.addEventListener('click', () => {
    const scene = state.scenes.find(item => item.id === button.dataset.copyMediaPrompt);
    copyText(scene.imagePrompt, `Prompt scene ${scene.number} je kopiran.`);
  }));
  $$('[data-process-image]', container).forEach(button => button.addEventListener('click', async () => {
    const scene = state.scenes.find(item => item.id === button.dataset.processImage);
    const assetId = state.imageAssetIds[scene.id];
    const blob = await getAsset(assetId);
    if (!blob) return;
    button.disabled = true;
    try {
      const processed = await processImageForScene(blob, scene);
      await putAsset(assetId, processed.blob);
      scene.imageInfo = processed.info;
      scene.smartCrop = processed.crop;
      if (state.settings.autoPalette) await analyzeScenePalette(scene.id, processed.blob);
      persistState(false, false);
      await renderMediaGallery();
      showToast(`Scena ${scene.number} je ponovo obrađena.`);
    } catch (error) {
      showToast(`Obrada nije uspela: ${error.message}`);
      button.disabled = false;
    }
  }));
  $$('[data-palette-image]', container).forEach(button => button.addEventListener('click', async () => {
    const scene = state.scenes.find(item => item.id === button.dataset.paletteImage);
    button.disabled = true;
    try {
      await analyzeScenePalette(scene.id);
      await renderMediaGallery();
      showToast(`Boje scene ${scene.number} su analizirane.`);
    } catch (error) {
      showToast(`Analiza boja nije uspela: ${error.message}`);
      button.disabled = false;
    }
  }));
  $$('[data-download-image]', container).forEach(button => button.addEventListener('click', async () => {
    const scene = state.scenes.find(item => item.id === button.dataset.downloadImage);
    const blob = await getAsset(state.imageAssetIds[scene.id]);
    if (blob) downloadBlob(blob, `scena-${String(scene.number).padStart(3, '0')}.${fileExtensionFromBlob(blob, 'png')}`);
  }));
  $$('[data-delete-image]', container).forEach(button => button.addEventListener('click', async () => {
    const sceneId = button.dataset.deleteImage;
    await deleteAsset(state.imageAssetIds[sceneId]);
    delete state.imageAssetIds[sceneId];
    const scene = state.scenes.find(item => item.id === sceneId);
    if (scene) { scene.imageInfo = null; scene.smartCrop = null; scene.palette = []; scene.paletteScore = 0; }
    recomputePaletteContinuity();
    persistState(false, false);
    await renderMediaGallery();
  }));
  $$('[data-generate-i2v]', container).forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await generateSceneI2V(button.dataset.generateI2v); }
    finally { if (button.isConnected) button.disabled = false; }
  }));
  $$('[data-download-i2v]', container).forEach(button => button.addEventListener('click', async () => {
    const scene = state.scenes.find(item => item.id === button.dataset.downloadI2v);
    const blob = await getAsset(state.videoAssetIds?.[scene.id]);
    if (blob) downloadBlob(blob, `scena-${String(scene.number).padStart(3, '0')}-AI.${fileExtensionFromBlob(blob, 'webm')}`);
  }));
  $$('[data-delete-i2v]', container).forEach(button => button.addEventListener('click', async () => {
    const sceneId = button.dataset.deleteI2v;
    await deleteAsset(state.videoAssetIds?.[sceneId]);
    delete state.videoAssetIds[sceneId];
    const scene = state.scenes.find(item => item.id === sceneId);
    if (scene) scene.i2v = { status: 'idle', promptId: '', progress: 0, error: '', generatedAt: '', filename: '' };
    persistState(false, false);
    await renderMediaGallery();
  }));
  updateStatus();
}

function coverRect(imageWidth, imageHeight, canvasWidth, canvasHeight, zoom = 1, panX = 0, panY = 0) {
  const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight) * zoom;
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (canvasWidth - width) / 2 + panX * (width - canvasWidth) * 0.5,
    y: (canvasHeight - height) / 2 + panY * (height - canvasHeight) * 0.5,
    width,
    height
  };
}

function drawPlaceholder(context, width, height, scene) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#101b35');
  gradient.addColorStop(1, '#301d50');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#ffffffcc';
  context.textAlign = 'center';
  context.font = `700 ${Math.max(26, width / 28)}px Segoe UI`;
  context.fillText(`SCENA ${scene.number}`, width / 2, height / 2 - 20);
  context.fillStyle = '#ffffff88';
  context.font = `400 ${Math.max(18, width / 44)}px Segoe UI`;
  context.fillText(scene.section || 'Instrumental', width / 2, height / 2 + 35);
}

async function loadRenderImages() {
  const result = new Map();
  for (const scene of state.scenes) {
    const assetId = state.imageAssetIds[scene.id];
    if (!assetId) continue;
    const blob = await getAsset(assetId);
    if (!blob) continue;
    const bitmap = await createImageBitmap(blob);
    result.set(scene.id, bitmap);
  }
  return result;
}


async function loadRenderVideos() {
  const result = new Map();
  if (state.settings?.preferAiClips === false || state.i2v?.useGeneratedClips === false) return result;
  for (const scene of state.scenes) {
    const assetId = state.videoAssetIds?.[scene.id];
    if (!assetId) continue;
    const blob = await getAsset(assetId);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.src = url; video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`AI video scene ${scene.number} se nije učitao.`)), 20000);
      video.onloadeddata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error(`AI video scene ${scene.number} nije ispravan.`)); };
    }).catch(error => { console.warn(error); URL.revokeObjectURL(url); });
    if (video.readyState >= 2) result.set(scene.id, { video, url });
  }
  return result;
}

function syncRenderVideo(item, desiredTime, shouldPlay = true) {
  if (!item?.video || !Number.isFinite(item.video.duration) || item.video.duration <= 0) return null;
  const target = Math.max(0, desiredTime) % item.video.duration;
  if (Math.abs(item.video.currentTime - target) > 0.45) {
    try { item.video.currentTime = target; } catch {}
  }
  if (shouldPlay && item.video.paused) item.video.play().catch(() => {});
  return item.video;
}

function selectMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

async function renderVideo() {
  if (renderSession) return;
  collectFormState();
  if (!state.audio.duration || !state.scenes.length) {
    showToast('Potrebni su audio i storyboard.');
    return;
  }
  if (state.settings.burnCaptions && state.captions.enabled !== false && !state.captions.items.length && state.lyrics.trim()) generateCaptionsFromLyrics(false);
  const range = resolveRenderRange();
  lastRenderedFileStem = `${safeFileName(state.name || state.songTitle)}-${range.label}`;
  const rangeDuration = Math.max(0.1, range.end - range.start);
  const activeScenes = state.scenes.filter(scene => scene.end > range.start && scene.start < range.end);
  const allowAiClips = state.settings?.preferAiClips !== false && state.i2v?.useGeneratedClips !== false;
  const missing = activeScenes.filter(scene => !state.imageAssetIds[scene.id] && !(allowAiClips && state.videoAssetIds?.[scene.id])).length;
  if (missing && !state.settings.allowPlaceholderScenes) { showToast(`${missing} scena nema sliku ili AI video. Render je zaustavljen da se više ne bi napravio prazan spot.`); showPanel('media'); return; }
  if (missing && state.settings.allowPlaceholderScenes && !confirm(`${missing} scena nema sliku. Uključio si rezervne kadrove. Nastaviti?`)) return;

  const audioBlob = await getAsset(`audio:${state.projectId}`);
  if (!audioBlob) {
    showToast('Originalni audio nije pronađen. Dodaj pesmu ponovo.');
    return;
  }

  const proxyMode = state.settings?.proxyRenderActive === true;
  const resolution = proxyMode ? 360 : Number($('#renderResolution').value);
  const fps = proxyMode ? 15 : Number($('#renderFps').value);
  const transition = Number($('#transitionDuration').value);
  const renderFormat = range.vertical ? '9:16' : state.format;
  let width;
  let height;
  if (proxyMode) {
    if (renderFormat === '16:9') [width, height] = [640, 360];
    else if (renderFormat === '1:1') [width, height] = [480, 480];
    else [width, height] = [360, 640];
  } else if (resolution >= 2160) {
    if (renderFormat === '16:9') [width, height] = [3840, 2160];
    else if (renderFormat === '1:1') [width, height] = [2048, 2048];
    else [width, height] = [2160, 3840];
  } else if (resolution >= 1080) {
    if (renderFormat === '16:9') [width, height] = [1920, 1080];
    else if (renderFormat === '1:1') [width, height] = [1080, 1080];
    else [width, height] = [1080, 1920];
  } else {
    if (renderFormat === '16:9') [width, height] = [1280, 720];
    else if (renderFormat === '1:1') [width, height] = [720, 720];
    else [width, height] = [720, 1280];
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  const canvasStream = canvas.captureStream(fps);
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') await audioContext.resume();
  const decoded = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
  const source = audioContext.createBufferSource();
  source.buffer = decoded;
  const destination = audioContext.createMediaStreamDestination();
  source.connect(destination);
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  const mimeType = selectMimeType();
  const videoBitsPerSecond = proxyMode ? 1_800_000 : resolution >= 2160 ? 32_000_000 : resolution >= 1080 ? 12_000_000 : 6_000_000;
  const options = mimeType ? { mimeType, videoBitsPerSecond, audioBitsPerSecond: 192_000 } : undefined;
  const recorder = new MediaRecorder(stream, options);
  const chunks = [];
  const completion = new Promise((resolve, reject) => { renderCompletionResolve = resolve; renderCompletionReject = reject; });
  const images = await loadRenderImages();
  const videos = await loadRenderVideos();
  let stopped = false;
  let frameRequest = 0;

  $('#renderVideoBtn').disabled = true;
  $('#cancelRenderBtn').disabled = false;
  $('#renderBadge').textContent = 'Render u toku';
  $('#renderStatus').textContent = proxyMode ? 'Proxy render 360p/15fps je počeo.' : 'Priprema završena. Video se snima u realnom vremenu.';
  try { localStorage.setItem('mssRenderRecoveryV14', JSON.stringify({projectId:state.projectId, startedAt:new Date().toISOString(), range, proxyMode, progress:0, status:'rendering'})); } catch {}
  $('#renderProgress').style.width = '0%';
  $('#downloadVideoLink').hidden = true;
  $('#renderPreview').style.display = 'none';

  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onerror = event => { const error = event.error || new Error('Nepoznata greška rendera.'); showToast(`Greška rendera: ${error.message || 'nepoznata greška'}`); renderCompletionReject?.(error); renderCompletionResolve = null; renderCompletionReject = null; };
  recorder.onstop = () => {
    cancelAnimationFrame(frameRequest);
    images.forEach(image => image.close?.());
    videos.forEach(item => { item.video.pause(); URL.revokeObjectURL(item.url); });
    audioContext.close();
    stream.getTracks().forEach(track => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
    lastRenderedBlob = blob;
    if (lastRenderedUrl) URL.revokeObjectURL(lastRenderedUrl);
    const url = URL.createObjectURL(blob);
    lastRenderedUrl = url;
    const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
    $('#renderPreview').src = url;
    $('#renderPreview').style.display = 'block';
    $('#downloadVideoLink').href = url;
    $('#downloadVideoLink').download = `${lastRenderedFileStem}.${extension}`;
    $('#downloadVideoLink').textContent = `Preuzmi završni ${extension.toUpperCase()} video`;
    $('#downloadVideoLink').hidden = false;
    $('#convertMp4Btn').hidden = extension === 'mp4' || stopped;
    $('#ffmpegStatus').textContent = extension === 'webm' && !stopped ? 'WebM je spreman. MP4 konverzija je opcionalna i lokalna.' : '';
    $('#renderProgress').style.width = stopped ? '0%' : '100%';
    $('#renderStatus').textContent = stopped ? 'Render je zaustavljen.' : `Video je završen: ${range.label}. Format: ${extension.toUpperCase()}, ${width}×${height}, ${fps} fps.`;
    $('#renderBadge').textContent = stopped ? 'Zaustavljeno' : 'Video završen';
    $('#renderVideoBtn').disabled = false;
    $('#cancelRenderBtn').disabled = true;
    renderSession = null;
    try { localStorage.setItem('mssRenderRecoveryV14', JSON.stringify({projectId:state.projectId, completedAt:new Date().toISOString(), range, proxyMode, progress:stopped?0:100, status:stopped?'stopped':'completed'})); } catch {}
    const result = { blob, extension, fileName: `${lastRenderedFileStem}.${extension}`, range, width, height, fps, stopped };
    renderCompletionResolve?.(result);
    renderCompletionResolve = null;
    renderCompletionReject = null;
  };

  const drawScene = (scene, media, localProgress, alpha = 1) => {
    context.save();
    context.globalAlpha = alpha;
    if (!media) {
      drawPlaceholder(context, width, height, scene);
    } else {
      const direction = scene.number % 4;
      const strength = clamp((Number(state.settings.motionStrength) || 0) / 100, 0, 1);
      const preset = state.settings.motionPreset || 'cinematic';
      let zoom = 1.01;
      let panX = 0;
      let panY = 0;
      if (preset !== 'static') {
        const amplitude = (preset === 'dynamic' ? 0.18 : 0.09) * strength;
        if (preset === 'zoom-in') zoom = 1.01 + localProgress * amplitude;
        else if (preset === 'zoom-out') zoom = 1.01 + (1 - localProgress) * amplitude;
        else if (preset === 'pan') {
          zoom = 1.02 + amplitude * 0.45;
          panX = direction % 2 ? 0.65 - localProgress * 1.3 : -0.65 + localProgress * 1.3;
        } else {
          zoom = 1.01 + localProgress * amplitude;
          panX = direction === 0 ? -0.55 + localProgress * 1.1 : direction === 1 ? 0.55 - localProgress * 1.1 : 0;
          panY = direction === 2 ? -0.4 + localProgress * 0.8 : direction === 3 ? 0.4 - localProgress * 0.8 : 0;
        }
      }
      const mediaWidth = media.videoWidth || media.width;
      const mediaHeight = media.videoHeight || media.height;
      const rect = coverRect(mediaWidth, mediaHeight, width, height, zoom, panX * strength, panY * strength);
      context.drawImage(media, rect.x, rect.y, rect.width, rect.height);
    }
    context.restore();
  };

  const startAt = audioContext.currentTime + 0.12;
  const drawFrame = () => {
    const elapsed = Math.max(0, audioContext.currentTime - startAt);
    const projectTime = range.start + elapsed;
    const percent = clamp(elapsed / rangeDuration * 100, 0, 100);
    $('#renderProgress').style.width = `${percent}%`;
    if (state.settings?.renderRecovery !== false && Math.floor(percent) % 5 === 0) { try { localStorage.setItem('mssRenderRecoveryV14', JSON.stringify({projectId:state.projectId, updatedAt:new Date().toISOString(), range, proxyMode, progress:Math.floor(percent), status:'rendering'})); } catch {} }
    $('#renderStatus').textContent = `Render: ${secondsToClock(elapsed)} / ${secondsToClock(rangeDuration)} • ne zatvaraj ovu karticu`;
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    const foundIndex = state.scenes.findIndex(scene => projectTime >= scene.start && projectTime < scene.end);
    const index = foundIndex >= 0 ? foundIndex : Math.max(0, state.scenes.length - 1);
    const scene = state.scenes[index] || state.scenes.at(-1);
    const local = clamp((projectTime - scene.start) / Math.max(0.01, scene.duration), 0, 1);
    const currentVideo = syncRenderVideo(videos.get(scene.id), Math.max(0, projectTime - scene.start), true);
    drawScene(scene, currentVideo || images.get(scene.id), local, 1);
    videos.forEach((item, sceneId) => { if (sceneId !== scene.id && item.video && !item.video.paused) item.video.pause(); });

    const crossfadeStart = Math.max(0, scene.duration - transition);
    if (local * scene.duration >= crossfadeStart && index < state.scenes.length - 1 && state.scenes[index + 1].start < range.end) {
      const next = state.scenes[index + 1];
      const fade = clamp((local * scene.duration - crossfadeStart) / transition, 0, 1);
      const nextVideo = syncRenderVideo(videos.get(next.id), Math.max(0, projectTime - next.start), true);
      drawScene(next, nextVideo || images.get(next.id), 0, fade);
    }
    drawCaption(context, width, height, projectTime);

    if (elapsed < rangeDuration && !stopped) frameRequest = requestAnimationFrame(drawFrame);
  };

  renderSession = {
    stop() {
      stopped = true;
      try { source.stop(); } catch {}
      if (recorder.state !== 'inactive') recorder.stop();
    }
  };

  recorder.start(1000);
  source.start(startAt, range.start, rangeDuration);
  frameRequest = requestAnimationFrame(drawFrame);
  source.onended = () => {
    if (!stopped && recorder.state !== 'inactive') recorder.stop();
  };
  return completion;
}



function t2iDimensions() {
  if (state.format === '16:9') return { width: 1360, height: 768 };
  if (state.format === '1:1') return { width: 1016, height: 1016 };
  return { width: 768, height: 1360 };
}

function splitLockedPromptForGeneration(scene) {
  const full = String(scene.imagePrompt || makeImagePrompt(scene)).trim();
  const sceneOnly = full.startsWith(LOCKED_GIRL_BLOCK) ? full.slice(LOCKED_GIRL_BLOCK.length).trim() : full;
  return {
    positive: `${LOCKED_GIRL_POSITIVE}. ${sceneOnly}`.replace(/\s+/g,' ').trim(),
    negative: `${LOCKED_GIRL_NEGATIVE}, ${state.i2v?.negativePrompt || 'watermark, logo, text, subtitles, low quality'}`.replace(/\s+/g,' ').trim()
  };
}

function buildBasicT2iWorkflow(scene) {
  const { width, height } = t2iDimensions();
  const prompts = splitLockedPromptForGeneration(scene);
  const seed = Number(scene.seed || deterministicSceneSeed?.(scene) || Math.floor(Math.random() * 2147483647));
  scene.seed = seed; scene.promptVersion = Number(scene.promptVersion || 1);
  return {
    '1': { class_type:'CheckpointLoaderSimple', inputs:{ ckpt_name: state.t2i.checkpoint } },
    '2': { class_type:'CLIPTextEncode', inputs:{ text:prompts.positive, clip:['1',1] } },
    '3': { class_type:'CLIPTextEncode', inputs:{ text:prompts.negative, clip:['1',1] } },
    '4': { class_type:'EmptyLatentImage', inputs:{ width, height, batch_size:1 } },
    '5': { class_type:'KSampler', inputs:{ seed, steps:Number(state.t2i.steps)||30, cfg:Number(state.t2i.cfg)||4.5, sampler_name:'dpmpp_2m', scheduler:'karras', denoise:1, model:['1',0], positive:['2',0], negative:['3',0], latent_image:['4',0] } },
    '6': { class_type:'VAEDecode', inputs:{ samples:['5',0], vae:['1',2] } },
    '7': { class_type:'SaveImage', inputs:{ filename_prefix:`MuzickiSpotStudio/images/scena_${String(scene.number).padStart(3,'0')}`, images:['6',0] } }
  };
}

function buildInstantIdT2iWorkflow(scene, referenceName) {
  const { width, height } = t2iDimensions();
  const prompts = splitLockedPromptForGeneration(scene);
  const seed = Number(scene.seed || deterministicSceneSeed?.(scene) || Math.floor(Math.random() * 2147483647));
  scene.seed = seed; scene.promptVersion = Number(scene.promptVersion || 1);
  return {
    '1': { class_type:'CheckpointLoaderSimple', inputs:{ ckpt_name: state.t2i.checkpoint } },
    '2': { class_type:'InstantIDModelLoader', inputs:{ instantid_file: state.t2i.instantIdModel } },
    '3': { class_type:'InstantIDFaceAnalysis', inputs:{ provider: state.t2i.provider || 'CPU' } },
    '4': { class_type:'ControlNetLoader', inputs:{ control_net_name: state.t2i.controlNet } },
    '5': { class_type:'LoadImage', inputs:{ image: referenceName } },
    '6': { class_type:'CLIPTextEncode', inputs:{ text:prompts.positive, clip:['1',1] } },
    '7': { class_type:'CLIPTextEncode', inputs:{ text:prompts.negative, clip:['1',1] } },
    '8': { class_type:'ApplyInstantID', inputs:{ instantid:['2',0], insightface:['3',0], control_net:['4',0], image:['5',0], model:['1',0], positive:['6',0], negative:['7',0], weight:0.82, start_at:0, end_at:1 } },
    '9': { class_type:'EmptyLatentImage', inputs:{ width, height, batch_size:1 } },
    '10': { class_type:'KSampler', inputs:{ seed, steps:Number(state.t2i.steps)||30, cfg:Number(state.t2i.cfg)||4.5, sampler_name:'dpmpp_2m', scheduler:'karras', denoise:1, model:['8',0], positive:['8',1], negative:['8',2], latent_image:['9',0] } },
    '11': { class_type:'VAEDecode', inputs:{ samples:['10',0], vae:['1',2] } },
    '12': { class_type:'SaveImage', inputs:{ filename_prefix:`MuzickiSpotStudio/images/scena_${String(scene.number).padStart(3,'0')}`, images:['11',0] } }
  };
}

async function uploadBlobToComfy(blob, filename) {
  const form = new FormData();
  form.append('image', blob, filename);
  form.append('type','input'); form.append('overwrite','true');
  let response;
  try { response = await comfyFetch('/upload/image',{method:'POST',body:form}); }
  catch { response = await comfyFetch('/api/upload/image',{method:'POST',body:form}); }
  const data = await response.json();
  return data.subfolder ? `${data.subfolder}/${data.name}` : (data.name || filename);
}

async function testT2iConnection(showMessage=true) {
  collectFormState();
  const status=$('#t2iStatus'), badge=$('#t2iBadge');
  try {
    const response = await comfyFetch('/object_info').catch(()=>comfyFetch('/api/object_info'));
    const info = await response.json();
    const basic=['CheckpointLoaderSimple','CLIPTextEncode','EmptyLatentImage','KSampler','VAEDecode','SaveImage'];
    const instant=['InstantIDModelLoader','InstantIDFaceAnalysis','ControlNetLoader','ApplyInstantID','LoadImage'];
    const required = state.t2i.mode === 'instantid' ? [...basic,...instant] : basic;
    const missing=required.filter(name=>!info[name]);
    if(missing.length) throw new Error(`Nedostaju ComfyUI čvorovi: ${missing.join(', ')}`);
    const choices = (node, input) => {
      const entry = info?.[node]?.input?.required?.[input] || info?.[node]?.input?.optional?.[input];
      return Array.isArray(entry?.[0]) ? entry[0].map(String) : [];
    };
    const modelChecks = [['CheckpointLoaderSimple','ckpt_name',state.t2i.checkpoint]];
    if (state.t2i.mode === 'instantid') modelChecks.push(['InstantIDModelLoader','instantid_file',state.t2i.instantIdModel], ['ControlNetLoader','control_net_name',state.t2i.controlNet]);
    const missingModels = modelChecks.filter(([node,input,expected]) => { const list=choices(node,input); return list.length && !list.includes(expected); }).map(([, , expected]) => expected);
    if (missingModels.length) throw new Error(`Nedostaju model-fajlovi: ${missingModels.join(', ')}`);
    state.t2i.connected=true; state.t2i.lastChecked=new Date().toISOString(); persistState(false,false);
    badge.textContent='Generator slika povezan'; badge.classList.add('success');
    status.textContent=state.t2i.mode==='instantid'?'InstantID je pronađen. Dodaj referentnu sliku i generiši scene.':'Osnovni SDXL generator je pronađen.';
    if(showMessage) showToast('Generator slika je povezan.'); return true;
  } catch(error) {
    state.t2i.connected=false; persistState(false,false); badge.textContent='Nije povezano'; badge.classList.remove('success'); status.textContent=`Generator slika nije spreman: ${error.message}`;
    if(showMessage) showToast(`Generator slika nije spreman: ${error.message}`); return false;
  }
}

async function renderLockedGirlReference() {
  const shell=$('#lockedGirlReferencePreview'); if(!shell) return;
  const blob=state.lockedGirlReferenceAssetId?await getAsset(state.lockedGirlReferenceAssetId):null;
  if(!blob){shell.textContent='Referentna slika nije dodata.';return;}
  const url=URL.createObjectURL(blob); galleryObjectUrls.add(url); shell.innerHTML=`<img src="${url}" alt="Referentna devojka">`;
}

async function handleLockedGirlReference(file) {
  if(!file) return;
  if(!file.type.startsWith('image/')) return showToast('Izaberi sliku lica.');
  const id=`reference:${state.projectId}:locked-girl`;
  await putAsset(id,file); state.lockedGirlReferenceAssetId=id; persistState(false,false); await renderLockedGirlReference(); showToast('Referentna slika devojke je zaključana za ovaj projekat.');
}

async function generateLockedGirlReference() {
  collectFormState();
  const button = $('#generateLockedGirlReferenceBtn');
  if (button) button.disabled = true;
  const pseudoScene = {
    id: 'locked-reference-generator', number: 0, section: 'Identity reference',
    description: 'clear front-facing identity reference portrait, waist-up framing, direct natural gaze toward camera, neutral relaxed expression, simple refined modern black top, uncluttered softly lit neutral background, both eyes and full face clearly visible, no dramatic pose',
    location: 'neutral daylight studio-like interior', emotion: 'calm and natural', shot: 'waist-up portrait', camera: 'eye-level 50mm portrait', characterIds: [LOCKED_GIRL_ID], duration: 1, t2i: { status: 'processing', progress: 2 }
  };
  try {
    const previousMode = state.t2i.mode;
    state.t2i.mode = 'basic';
    const ready = await testT2iConnection(false);
    state.t2i.mode = previousMode;
    if (!ready) throw new Error('Osnovni SDXL generator nije spreman. Proveri ComfyUI i SDXL checkpoint.');
    $('#t2iStatus').textContent = 'Pravim početnu referentnu devojku iz trajno zaključanog ID-a...';
    const workflow = buildBasicT2iWorkflow(pseudoScene);
    const promptId = await queueComfyPrompt(workflow);
    t2iCurrentPromptId = promptId;
    const file = await waitForGenericComfyResult(promptId, pseudoScene, 't2i');
    const raw = await fetchComfyOutput(file);
    if (!raw.size || !String(raw.type || '').startsWith('image/')) throw new Error('ComfyUI nije vratio ispravnu sliku.');
    const assetId = `reference:${state.projectId}:locked-girl`;
    await putAsset(assetId, raw);
    state.lockedGirlReferenceAssetId = assetId;
    state.t2i.mode = 'instantid';
    persistState(false, false);
    fillForm();
    await renderLockedGirlReference();
    $('#t2iStatus').textContent = 'Početni ID devojke je napravljen. Sve sledeće scene koristiće ovu istu referencu preko InstantID-a.';
    showToast('Početni ID devojke je automatski napravljen i zaključan.');
  } catch (error) {
    $('#t2iStatus').textContent = `Početni ID nije napravljen: ${error.message}`;
    showToast(`Početni ID nije napravljen: ${error.message}`);
  } finally {
    t2iCurrentPromptId = '';
    if (button) button.disabled = false;
  }
}

async function generateSceneImage(sceneId, options={}) {
  collectFormState(); ensureLockedGirlEverywhere();
  const scene=state.scenes.find(item=>item.id===sceneId); if(!scene) throw new Error('Scena nije pronađena.');
  if(!state.t2i.connected && !(await testT2iConnection(!options.silent))) throw new Error('ComfyUI generator slika nije povezan.');
  scene.t2i={status:'processing',progress:2,error:''}; persistState(false,false); await renderMediaGallery();
  try {
    let workflow;
    if(state.t2i.mode==='instantid') {
      const ref=state.lockedGirlReferenceAssetId?await getAsset(state.lockedGirlReferenceAssetId):null;
      if(!ref) throw new Error('Nema referentne slike devojke. Dodaj je u delu Automatske slike.');
      const refName=await uploadBlobToComfy(ref,`locked-girl-${state.projectId.slice(0,8)}.${fileExtensionFromBlob(ref,'png')}`);
      workflow=buildInstantIdT2iWorkflow(scene,refName);
    } else workflow=buildBasicT2iWorkflow(scene);
    const promptId=await queueComfyPrompt(workflow); t2iCurrentPromptId=promptId;
    $('#t2iStatus').textContent=`Scena ${scene.number}: slika se generiše...`;
    const file=await waitForGenericComfyResult(promptId,scene,'t2i');
    const raw=await fetchComfyOutput(file); if(!raw.size) throw new Error('ComfyUI je vratio praznu sliku.');
    const processed=await processImageForScene(raw,scene); const assetId=`image:${state.projectId}:${scene.id}`;
    await putAsset(assetId,processed.blob); state.imageAssetIds[scene.id]=assetId; scene.imageInfo=processed.info; scene.smartCrop=processed.crop||null;
    if(state.settings.autoPalette) await analyzeScenePalette(scene.id,processed.blob);
    scene.t2i={status:'done',progress:100,error:'',generatedAt:new Date().toISOString(),filename:file.filename}; persistState(false,false);
    $('#t2iStatus').textContent=`Scena ${scene.number}: slika je automatski napravljena i sačuvana.`; $('#t2iProgress').style.width='100%'; await renderMediaGallery();
    if(state.t2i.autoI2vAfterImage) await generateSceneI2V(scene.id,{silent:true});
    if(!options.silent) showToast(`Slika scene ${scene.number} je generisana.`); return true;
  } catch(error) {
    scene.t2i={status:'error',progress:0,error:error.message}; persistState(false,false); await renderMediaGallery(); $('#t2iStatus').textContent=`Scena ${scene.number}: ${error.message}`;
    if(!options.silent) showToast(`Slika nije generisana: ${error.message}`); throw error;
  } finally { t2iCurrentPromptId=''; }
}

async function waitForGenericComfyResult(promptId,scene,kind='t2i',timeoutMs=60*60*1000) {
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    if((kind==='t2i'&&t2iBatchCancelled)||(kind==='i2v'&&i2vBatchCancelled)) throw new Error('Generisanje je zaustavljeno.');
    const response=await comfyFetch(`/history/${encodeURIComponent(promptId)}`).catch(()=>comfyFetch(`/api/history/${encodeURIComponent(promptId)}`));
    const data=await response.json(); const record=data[promptId]||data; const file=findComfyOutputFile(record); if(file)return file;
    const elapsed=Math.round((Date.now()-started)/1000); const progress=Math.min(95,5+Math.round(elapsed/3));
    if(kind==='t2i'){scene.t2i.progress=progress;$('#t2iProgress').style.width=`${progress}%`;$('#t2iStatus').textContent=`Scena ${scene.number}: generisanje slike traje ${elapsed} s.`;}
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw new Error('Isteklo je vreme čekanja na ComfyUI.');
}

async function generateAllImages(options = {}) {
  if (t2iCurrentPromptId) throw new Error('Generisanje slike je već u toku.');
  collectFormState();
  ensureLockedGirlEverywhere();
  const pending = state.scenes.filter(scene => !state.imageAssetIds[scene.id]);
  if (!pending.length) return { completed: 0, failed: [] };
  if (state.t2i.mode === 'instantid' && !state.lockedGirlReferenceAssetId) throw new Error('Nema referentne slike zaključane devojke.');
  if (!options.skipConfirm && !confirm(`Automatski će se generisati ${pending.length} slika, jedna po jedna. Nastaviti?`)) return { completed: 0, failed: [], cancelled: true };
  const retries = Math.max(1, Number(options.retries) || 3);
  t2iBatchCancelled = false;
  $('#generateAllImagesBtn').disabled = true;
  $('#stopT2iBtn').disabled = false;
  let completed = 0;
  const failed = [];
  for (const scene of pending) {
    if (t2iBatchCancelled) break;
    let success = false;
    let lastError = null;
    for (let attempt = 1; attempt <= retries && !success; attempt += 1) {
      $('#t2iStatus').textContent = `Slika ${scene.number}/${state.scenes.length} • pokušaj ${attempt}/${retries} • završeno ${completed}/${pending.length}`;
      try {
        await generateSceneImage(scene.id, { silent: true });
        success = true;
        completed += 1;
      } catch (error) {
        lastError = error;
        scene.t2i = { ...(scene.t2i || {}), status: attempt < retries ? 'retrying' : 'error', error: error.message, attempt };
        persistState(false, false);
        if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 2500));
      }
    }
    if (!success) failed.push({ scene: scene.number, error: lastError?.message || 'Nepoznata greška' });
    $('#t2iProgress').style.width = `${Math.round((completed + failed.length) / pending.length * 100)}%`;
  }
  $('#generateAllImagesBtn').disabled = false;
  $('#stopT2iBtn').disabled = true;
  t2iBatchCancelled = false;
  $('#t2iStatus').textContent = failed.length ? `Završeno ${completed}/${pending.length}. Neuspešne scene: ${failed.map(item => item.scene).join(', ')}. Projekat je sačuvan i može da nastavi.` : `Sve slike su završene: ${completed}/${pending.length}.`;
  await renderMediaGallery();
  return { completed, failed };
}

async function stopT2i(){t2iBatchCancelled=true;$('#stopT2iBtn').disabled=true;try{await comfyFetch('/interrupt',{method:'POST'}).catch(()=>comfyFetch('/api/interrupt',{method:'POST'}));}catch{}$('#t2iStatus').textContent='Poslat zahtev za zaustavljanje slika.';}

async function saveYoutubeOAuthConfig(){
  const file=$('#youtubeOAuthFile')?.files?.[0]; if(!file)return showToast('Izaberi client_secret.json iz Google Cloud-a.');
  try{const config=JSON.parse(await file.text());const response=await fetch(apiUrl('/api/youtube/oauth-config'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});const data=await response.json();if(!response.ok)throw new Error(data.error||'OAuth podešavanje nije sačuvano.');$('#youtubeConnectStatus').textContent='OAuth podešavanje je sačuvano samo na ovom računaru.';showToast('YouTube OAuth podešavanje je sačuvano.');}catch(error){showToast(`OAuth greška: ${error.message}`);}
}

async function refreshYoutubeChannels(){
  try{const response=await fetch(apiUrl('/api/youtube/channels'),{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Kanali nisu učitani.');state.youtubeChannels=data.channels||[];if(!state.activeYoutubeChannelId&&state.youtubeChannels[0])state.activeYoutubeChannelId=state.youtubeChannels[0].id;persistState(false,false);renderYoutubeChannels();}catch(error){$('#youtubeConnectStatus').textContent=`Lokalni YouTube servis nije dostupan: ${error.message}`;}
}

function renderYoutubeChannels(){
  const select=$('#youtubeChannelSelect'),cards=$('#youtubeChannelCards'),badge=$('#youtubeConnectionBadge');if(!select||!cards)return;
  select.innerHTML='<option value="">Nijedan kanal</option>'+state.youtubeChannels.map(channel=>`<option value="${escapeHtml(channel.id)}">${escapeHtml(channel.title||channel.label||channel.id)}</option>`).join('');select.value=state.activeYoutubeChannelId||'';
  badge.textContent=state.youtubeChannels.length?`${state.youtubeChannels.length} povezanih kanala`:'Nema povezanih kanala';
  const cardsHtml=state.youtubeChannels.map(channel=>`<article class="youtube-channel-card ${channel.id===state.activeYoutubeChannelId?'active':''}"><strong>${escapeHtml(channel.title||channel.label||channel.id)}</strong><div>${escapeHtml(channel.customUrl||channel.id)}</div><small>${Number(channel.subscriberCount||0).toLocaleString('sr-RS')} pretplatnika • ${Number(channel.videoCount||0).toLocaleString('sr-RS')} videa</small></article>`).join('')||'<div class="mini-status">Još nema povezanih kanala.</div>';
  cards.innerHTML=cardsHtml;
  const step1Cards=$('#step1YoutubeChannelCards'),step1Badge=$('#step1YoutubeBadge');
  if(step1Cards)step1Cards.innerHTML=cardsHtml;
  if(step1Badge)step1Badge.textContent=state.youtubeChannels.length?`${state.youtubeChannels.length} povezanih kanala`:'Nema povezanih kanala';
}

async function connectYoutubeChannel(){
  const label=$('#youtubeProfileLabel')?.value.trim()||'YouTube kanal';
  try{const response=await fetch(apiUrl(`/api/youtube/auth-url?label=${encodeURIComponent(label)}`));const data=await response.json();if(!response.ok)throw new Error(data.error||'OAuth nije spreman.');window.open(data.url,'youtube-oauth','width=620,height=780');$('#youtubeConnectStatus').textContent='U novom prozoru izaberi tačan YouTube/Brand kanal i dozvoli samo čitanje analitike.';clearInterval(youtubeAuthPollTimer);youtubeAuthPollTimer=setInterval(refreshYoutubeChannels,2500);setTimeout(()=>clearInterval(youtubeAuthPollTimer),120000);}catch(error){showToast(`Povezivanje nije uspelo: ${error.message}`);}
}

async function analyzeYoutubeChannel(){
  const id=$('#youtubeChannelSelect')?.value;if(!id)return showToast('Izaberi aktivni kanal.');const days=Number($('#youtubeAnalysisDays')?.value)||90;$('#youtubeAnalysisReport').textContent='YouTube analiza je u toku...';
  try{const response=await fetch(apiUrl('/api/youtube/analyze'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channelId:id,days})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Analiza nije uspela.');state.youtubeAnalysis[id]=data;state.activeYoutubeChannelId=id;persistState(false,false);renderYoutubeAnalysis(data);showToast('YouTube kanal je analiziran.');}catch(error){$('#youtubeAnalysisReport').textContent=`Analiza nije uspela: ${error.message}`;}
}

function renderYoutubeAnalysis(data){
  const box=$('#youtubeAnalysisReport');if(!box)return;const recs=data.recommendations||[];box.innerHTML=`<h3>${escapeHtml(data.channel?.title||'Kanal')} — preporuke za spot</h3><p>Analizirano ${data.videoCount||0} videa za poslednjih ${data.days||0} dana. Ovo su obrasci iz tvojih podataka, ne garancija rezultata.</p><ul>${recs.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>${data.topVideos?.length?`<h4>Najuspešniji videi u periodu</h4><ol>${data.topVideos.slice(0,10).map(v=>`<li>${escapeHtml(v.title)} — ${Number(v.views||0).toLocaleString('sr-RS')} pregleda, prosečno gledanje ${Math.round(v.averageViewPercentage||0)}%</li>`).join('')}</ol>`:''}`;
}

async function disconnectYoutubeChannel(){const id=$('#youtubeChannelSelect')?.value;if(!id)return; if(!confirm('Ukloniti lokalnu vezu sa ovim kanalom?'))return;const response=await fetch(apiUrl(`/api/youtube/channels/${encodeURIComponent(id)}`),{method:'DELETE'});if(response.ok){delete state.youtubeAnalysis[id];state.activeYoutubeChannelId='';await refreshYoutubeChannels();}}

async function importYoutubeStudioCsv(file){
  if(!file)return;try{const text=await file.text();const rows=window.Papa?.parse(text,{header:true,skipEmptyLines:true})?.data||[];if(!rows.length)throw new Error('CSV nema podatke.');const mapped=rows.map(row=>{const get=(...names)=>{for(const name of names){const key=Object.keys(row).find(k=>k.trim().toLowerCase()===name.toLowerCase());if(key)return row[key];}return'';};return{title:get('Video title','Naslov videa','Title'),views:Number(String(get('Views','Pregledi')).replace(/[^0-9.-]/g,''))||0,averageViewPercentage:Number(String(get('Average percentage viewed (%)','Prosečan procenat odgledanog (%)')).replace(',','.').replace(/[^0-9.-]/g,''))||0,duration:get('Video duration','Trajanje videa')};}).filter(x=>x.title);mapped.sort((a,b)=>b.views-a.views);const id=`csv-${Date.now()}`;const data={channel:{id,title:file.name.replace(/\.csv$/i,'')},days:0,videoCount:mapped.length,topVideos:mapped.slice(0,20),recommendations:deriveCsvRecommendations(mapped)};state.youtubeChannels.push({id,title:data.channel.title,label:'CSV uvoz',subscriberCount:0,videoCount:mapped.length,source:'csv'});state.activeYoutubeChannelId=id;state.youtubeAnalysis[id]=data;persistState(false,false);renderYoutubeChannels();renderYoutubeAnalysis(data);showToast('YouTube Studio CSV je analiziran.');}catch(error){showToast(`CSV nije analiziran: ${error.message}`);}finally{$('#youtubeCsvFile').value='';}
}

function deriveCsvRecommendations(videos){if(!videos.length)return['Nema dovoljno podataka.'];const top=videos.slice(0,Math.max(3,Math.ceil(videos.length*.2)));const avgRetention=top.reduce((s,v)=>s+(v.averageViewPercentage||0),0)/top.length;const words=top.flatMap(v=>String(v.title).toUpperCase().split(/\s+/)).filter(w=>w.length>3);const freq={};words.forEach(w=>freq[w]=(freq[w]||0)+1);const common=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]);return[`Najuspešnijih 20% videa u proseku ima ${Math.round(avgRetention||0)}% odgledanog videa.`,`Česte reči u najgledanijim naslovima: ${common.join(', ')||'nema jasnog obrasca'}.`,'Za novi spot koristi vizuelni i naslovni obrazac najboljih videa, ali testiraj jednu promenu odjednom.'];}

function normalizeComfyEndpoint(value) {
  const endpoint = String(value || 'http://127.0.0.1:8188').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(endpoint)) throw new Error('ComfyUI adresa mora početi sa http:// ili https://');
  return endpoint;
}

async function comfyFetch(path, options = {}) {
  const endpoint = normalizeComfyEndpoint(state.i2v?.endpoint || $('#comfyEndpoint')?.value);
  const response = await fetch(`${endpoint}${path}`, { cache: 'no-store', ...options });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try { const data = await response.json(); message = data.error?.message || data.error || data.message || message; } catch {}
    throw new Error(message);
  }
  return response;
}

function updateI2vUi() {
  const badge = $('#i2vBadge');
  const status = $('#i2vStatus');
  if (!badge || !status) return;
  const done = state.scenes.filter(scene => state.videoAssetIds?.[scene.id]).length;
  if (state.i2v?.connected) {
    badge.textContent = `Povezano • ${done} klipova`;
    badge.classList.add('success');
    if (!status.textContent || status.textContent.includes('Instaliraj')) status.textContent = `ComfyUI je povezan. Spremno za lokalno Wan image-to-video generisanje. ${done}/${state.scenes.length || 0} scena imaju AI video.`;
  } else {
    badge.textContent = `Nije povezano • ${done} klipova`;
    badge.classList.remove('success');
  }
}

async function testComfyConnection(showMessage = true) {
  collectFormState();
  const status = $('#i2vStatus');
  const badge = $('#i2vBadge');
  if (status) status.textContent = 'Povezivanje sa lokalnim ComfyUI-jem...';
  if (badge) badge.textContent = 'Provera...';
  try {
    let systemResponse;
    try { systemResponse = await comfyFetch('/system_stats'); }
    catch { systemResponse = await comfyFetch('/api/system_stats'); }
    const system = await systemResponse.json();
    let objectInfoResponse;
    try { objectInfoResponse = await comfyFetch('/object_info'); }
    catch { objectInfoResponse = await comfyFetch('/api/object_info'); }
    const objectInfo = await objectInfoResponse.json();
    const requiredNodes = ['UNETLoader','CLIPLoader','VAELoader','CLIPVisionLoader','CLIPVisionEncode','WanImageToVideo','ModelSamplingSD3','KSampler','VAEDecode','SaveWEBM'];
    const missingNodes = requiredNodes.filter(name => !objectInfo[name]);
    if (missingNodes.length) throw new Error(`ComfyUI nema potrebne Wan čvorove: ${missingNodes.join(', ')}. Ažuriraj ComfyUI.`);
    const getChoices = (nodeName, inputName) => {
      const entry = objectInfo?.[nodeName]?.input?.required?.[inputName] || objectInfo?.[nodeName]?.input?.optional?.[inputName];
      const values = Array.isArray(entry?.[0]) ? entry[0] : [];
      return values.map(String);
    };
    const modelChecks = [
      ['UNETLoader', 'unet_name', state.i2v.model],
      ['CLIPLoader', 'clip_name', state.i2v.textEncoder],
      ['VAELoader', 'vae_name', state.i2v.vae],
      ['CLIPVisionLoader', 'clip_name', state.i2v.clipVision]
    ];
    const missingModels = modelChecks.filter(([node, input, expected]) => {
      const choices = getChoices(node, input);
      return choices.length && !choices.includes(expected);
    }).map(([, , expected]) => expected);
    if (missingModels.length) throw new Error(`Nedostaju model-fajlovi: ${missingModels.join(', ')}. Pokreni PREUZMI-WAN-MODELE.ps1 i restartuj ComfyUI.`);
    const devices = system.devices || system.system?.devices || [];
    const deviceText = devices.map(item => item.name || item.type || 'uređaj').join(', ') || 'uređaj nije prijavljen';
    state.i2v.connected = true;
    state.i2v.lastChecked = new Date().toISOString();
    persistState(false, false);
    if (status) status.textContent = `Povezano. Uređaj: ${deviceText}. Wan čvorovi su pronađeni. Modeli će biti dodatno provereni kada pokreneš prvu scenu.`;
    if (badge) badge.textContent = 'ComfyUI povezan';
    if (showMessage) showToast('ComfyUI je povezan i Wan image-to-video je dostupan.');
    return true;
  } catch (error) {
    state.i2v.connected = false;
    persistState(false, false);
    if (status) status.textContent = `Veza nije uspela: ${error.message}. Pokreni ComfyUI iz programa ili dozvoli samo lokalnu adresu Studija kroz --enable-cors-header.`;
    if (badge) badge.textContent = 'Nije povezano';
    if (showMessage) showToast(`ComfyUI nije povezan: ${error.message}`);
    return false;
  }
}

function i2vDimensions() {
  if (state.format === '16:9') return { width: 832, height: 480 };
  if (state.format === '1:1') return { width: 512, height: 512 };
  return { width: 480, height: 832 };
}

function i2vFrameCount(scene) {
  const fps = Number(state.i2v?.fps) || 16;
  const seconds = Math.min(Number(state.i2v?.maxSeconds) || 5, Math.max(1, Number(scene.duration) || 5));
  const raw = Math.round(seconds * fps);
  return Math.max(17, Math.min(129, Math.round((raw - 1) / 4) * 4 + 1));
}

function buildWanI2vWorkflow(scene, uploadedName) {
  const { width, height } = i2vDimensions();
  const seed = Number(scene.seed || deterministicSceneSeed?.(scene) || Math.floor(Math.random() * 2147483647));
  scene.seed = seed; scene.promptVersion = Number(scene.promptVersion || 1);
  const prefix = `MuzickiSpotStudio/scena_${String(scene.number).padStart(3, '0')}`;
  return {
    '37': { class_type: 'UNETLoader', inputs: { unet_name: state.i2v.model, weight_dtype: 'default' } },
    '38': { class_type: 'CLIPLoader', inputs: { clip_name: state.i2v.textEncoder, type: 'wan', device: 'default' } },
    '39': { class_type: 'VAELoader', inputs: { vae_name: state.i2v.vae } },
    '49': { class_type: 'CLIPVisionLoader', inputs: { clip_name: state.i2v.clipVision } },
    '52': { class_type: 'LoadImage', inputs: { image: uploadedName } },
    '51': { class_type: 'CLIPVisionEncode', inputs: { crop: 'none', clip_vision: ['49',0], image: ['52',0] } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: scene.videoPrompt || scene.imagePrompt || scene.description, clip: ['38',0] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: state.i2v.negativePrompt, clip: ['38',0] } },
    '50': { class_type: 'WanImageToVideo', inputs: { width, height, length: i2vFrameCount(scene), batch_size: 1, positive: ['6',0], negative: ['7',0], vae: ['39',0], clip_vision_output: ['51',0], start_image: ['52',0] } },
    '54': { class_type: 'ModelSamplingSD3', inputs: { shift: 8, model: ['37',0] } },
    '3': { class_type: 'KSampler', inputs: { seed, steps: Number(state.i2v.steps) || 20, cfg: Number(state.i2v.cfg) || 6, sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1, model: ['54',0], positive: ['50',0], negative: ['50',1], latent_image: ['50',2] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3',0], vae: ['39',0] } },
    '47': { class_type: 'SaveWEBM', inputs: { filename_prefix: prefix, codec: 'vp9', fps: Number(state.i2v.fps) || 16, crf: 30, images: ['8',0] } }
  };
}

async function uploadImageToComfy(blob, scene) {
  const form = new FormData();
  const extension = fileExtensionFromBlob(blob, 'png');
  const filename = `mss-${state.projectId.slice(0,8)}-scene-${scene.number}.${extension}`;
  form.append('image', blob, filename);
  form.append('type', 'input');
  form.append('overwrite', 'true');
  let response;
  try { response = await comfyFetch('/upload/image', { method: 'POST', body: form }); }
  catch { response = await comfyFetch('/api/upload/image', { method: 'POST', body: form }); }
  const data = await response.json();
  return data.subfolder ? `${data.subfolder}/${data.name}` : (data.name || filename);
}

async function queueComfyPrompt(workflow) {
  const payload = { prompt: workflow, client_id: uuid() };
  let response;
  try { response = await comfyFetch('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  catch { response = await comfyFetch('/api/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  const data = await response.json();
  if (!data.prompt_id) throw new Error(data.error?.message || data.error || 'ComfyUI nije vratio prompt_id. Proveri nazive modela.');
  return data.prompt_id;
}

function findComfyOutputFile(history) {
  const outputs = history?.outputs || {};
  for (const output of Object.values(outputs)) {
    for (const key of ['videos','gifs','images','audio']) {
      const items = output?.[key];
      if (Array.isArray(items) && items.length) {
        const preferred = items.find(item => /\.(webm|mp4|mov|gif|webp)$/i.test(item.filename || '')) || items[0];
        if (preferred?.filename) return preferred;
      }
    }
  }
  return null;
}

async function waitForComfyResult(promptId, scene, timeoutMs = 4 * 60 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (i2vBatchCancelled) throw new Error('Generisanje je zaustavljeno.');
    let response;
    try { response = await comfyFetch(`/history/${encodeURIComponent(promptId)}`); }
    catch { response = await comfyFetch(`/api/history/${encodeURIComponent(promptId)}`); }
    const data = await response.json();
    const record = data[promptId] || data;
    const file = findComfyOutputFile(record);
    if (file) return file;
    const status = record?.status;
    if (status?.status_str === 'error' || status?.completed === false && status?.messages?.some?.(item => item?.[0] === 'execution_error')) {
      throw new Error('ComfyUI je prijavio grešku pri izvršavanju workflow-a. Proveri modele i VRAM.');
    }
    const elapsed = Math.round((Date.now() - started) / 1000);
    scene.i2v.progress = Math.min(95, 5 + Math.round(elapsed / 6));
    $('#i2vProgress').style.width = `${scene.i2v.progress}%`;
    $('#i2vStatus').textContent = `Scena ${scene.number}: AI generisanje traje ${elapsed} s. Veliki modeli mogu raditi više minuta po sceni.`;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Isteklo je maksimalno vreme čekanja na ComfyUI.');
}

async function fetchComfyOutput(file) {
  const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || '', type: file.type || 'output' });
  let response;
  try { response = await comfyFetch(`/view?${query}`); }
  catch { response = await comfyFetch(`/api/view?${query}`); }
  const raw = await response.blob();
  const name = String(file.filename || '').toLowerCase();
  const type = name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.webm') ? 'video/webm' : name.endsWith('.gif') ? 'image/gif' : name.endsWith('.webp') ? 'image/webp' : (raw.type || 'application/octet-stream');
  return new Blob([raw], { type });
}

async function generateSceneI2V(sceneId, options = {}) {
  collectFormState();
  const scene = state.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error('Scena nije pronađena.');
  const imageAssetId = state.imageAssetIds[scene.id];
  const imageBlob = imageAssetId ? await getAsset(imageAssetId) : null;
  if (!imageBlob) throw new Error(`Scena ${scene.number} nema sliku.`);
  if (!state.i2v.connected && !(await testComfyConnection(!options.silent))) throw new Error('ComfyUI nije povezan.');
  scene.i2v = { ...(scene.i2v || {}), status: 'processing', progress: 2, error: '' };
  persistState(false, false);
  await renderMediaGallery();
  try {
    $('#i2vStatus').textContent = `Scena ${scene.number}: šaljem sliku u lokalni ComfyUI...`;
    const uploadedName = await uploadImageToComfy(imageBlob, scene);
    const workflow = buildWanI2vWorkflow(scene, uploadedName);
    const promptId = await queueComfyPrompt(workflow);
    i2vCurrentPromptId = promptId;
    scene.i2v.promptId = promptId;
    scene.i2v.progress = 5;
    const file = await waitForComfyResult(promptId, scene);
    const blob = await fetchComfyOutput(file);
    if (!blob.size) throw new Error('ComfyUI je vratio prazan video-fajl.');
    const assetId = `video:${state.projectId}:${scene.id}`;
    await putAsset(assetId, blob);
    state.videoAssetIds[scene.id] = assetId;
    scene.i2v = { status: 'done', promptId, progress: 100, error: '', generatedAt: new Date().toISOString(), filename: file.filename };
    persistState(false, false);
    $('#i2vProgress').style.width = '100%';
    $('#i2vStatus').textContent = `Scena ${scene.number}: AI video je završen i sačuvan bez dodatog watermarka.`;
    await renderMediaGallery();
    if (!options.silent) showToast(`AI video za scenu ${scene.number} je napravljen.`);
    return true;
  } catch (error) {
    scene.i2v = { ...(scene.i2v || {}), status: 'error', error: error.message, progress: 0 };
    persistState(false, false);
    await renderMediaGallery();
    $('#i2vStatus').textContent = `Scena ${scene.number} nije generisana: ${error.message}`;
    if (!options.silent) showToast(`AI video nije napravljen: ${error.message}`);
    throw error;
  } finally {
    i2vCurrentPromptId = '';
  }
}

async function generateAllI2V(options = {}) {
  if (i2vCurrentPromptId) throw new Error('AI generisanje videa je već u toku.');
  collectFormState();
  const pending = state.scenes.filter(scene => state.imageAssetIds[scene.id] && !state.videoAssetIds?.[scene.id]);
  if (!pending.length) return { completed: 0, failed: [] };
  if (!options.skipConfirm && !confirm(`Biće pokrenuto ${pending.length} AI generisanja jedno po jedno. Ovo može trajati veoma dugo. Nastaviti?`)) return { completed: 0, failed: [], cancelled: true };
  const retries = Math.max(1, Number(options.retries) || 2);
  i2vBatchCancelled = false;
  $('#generateAllI2vBtn').disabled = true;
  $('#stopI2vBtn').disabled = false;
  let completed = 0;
  const failed = [];
  for (const scene of pending) {
    if (i2vBatchCancelled) break;
    let success = false;
    let lastError = null;
    for (let attempt = 1; attempt <= retries && !success; attempt += 1) {
      $('#i2vStatus').textContent = `AI video ${scene.number}/${state.scenes.length} • pokušaj ${attempt}/${retries} • završeno ${completed}/${pending.length}`;
      try {
        await generateSceneI2V(scene.id, { silent: true });
        success = true;
        completed += 1;
      } catch (error) {
        lastError = error;
        scene.i2v = { ...(scene.i2v || {}), status: attempt < retries ? 'retrying' : 'error', error: error.message, attempt };
        persistState(false, false);
        if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 3500));
      }
    }
    if (!success) failed.push({ scene: scene.number, error: lastError?.message || 'Nepoznata greška' });
    $('#i2vProgress').style.width = `${Math.round((completed + failed.length) / pending.length * 100)}%`;
  }
  $('#generateAllI2vBtn').disabled = false;
  $('#stopI2vBtn').disabled = true;
  i2vBatchCancelled = false;
  $('#i2vStatus').textContent = failed.length ? `Završeno ${completed}/${pending.length}. Neuspešne scene: ${failed.map(item => item.scene).join(', ')}. Red može da se nastavi.` : `Svi AI klipovi su završeni: ${completed}/${pending.length}.`;
  await renderMediaGallery();
  return { completed, failed };
}

async function stopI2V() {
  i2vBatchCancelled = true;
  $('#stopI2vBtn').disabled = true;
  try {
    let response;
    try { response = await comfyFetch('/interrupt', { method: 'POST' }); }
    catch { response = await comfyFetch('/api/interrupt', { method: 'POST' }); }
    await response.text();
  } catch {}
  $('#i2vStatus').textContent = 'Poslat je zahtev za zaustavljanje. Trenutni ComfyUI zadatak se prekida.';
}

async function runFreePipeline() {
  collectFormState();
  const step1 = updateStep1Audit({ autoFillProjectName: true });
  if (!step1.ok) {
    showToast(step1.errors[0] || 'Korak 1 nije kompletan.');
    showPanel('project');
    return;
  }
  state.name = step1.projectName || step1.songTitle;
  state.songTitle = step1.songTitle;
  state.artistName = step1.artistName;
  const audio = await getAsset(`audio:${state.projectId}`);
  if (!audio) {
    showToast('Audio je nestao iz lokalne baze. Dodaj fajl ponovo.');
    showPanel('project');
    updateStep1Audit();
    return;
  }
  if (!state.audio.analyzedAt) await analyzeAudio();
  ensureLockedGirlEverywhere();
  if (!state.captions.items.length) generateCaptionsFromLyrics(false);
  makeSmartShortsPlan(false);
  persistState(false, false);
  showPanel('concept');
  ensureV12RuntimeState();
  const preferredEngine = state.chatgptBridge.imageEngine || 'manual-chatgpt';
  if (preferredEngine === 'chatgpt-actions') {
    await requestTenIdeasFromChatGpt();
  } else if (preferredEngine === 'manual-chatgpt') {
    updateAutomaticStatus('Pripremam kompaktan Korak 3 zahtev i otvaram tvoj unapred upisan privatni GPT.', 12);
    if (typeof window.startPlusBridgeRound === 'function') {
      await window.startPlusBridgeRound();
    } else {
      showToast('ChatGPT Plus most još nije učitan. Sačekaj sekund i pokušaj ponovo.');
    }
  } else {
    generateTenIdeasLocally(false);
    showToast('Analiza je završena i program je napravio 10 rezervnih lokalnih ideja. Izaberi jednu.');
  }
}

async function newProject() {
  if (!confirm('Napraviti potpuno prazan projekat? Nesacuvane izmene će biti odbačene. Poslednji izričito sačuvan projekat ostaje sačuvan.')) return;
  try { await fetch('/api/plus-bridge/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ reason:'Novi projekat' }) }); } catch {}
  await clearProjectAssets(state.projectId);
  if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
  const bridgeSettings = { ...(state.chatgptBridge || {}) };
  const trendSettings = { ...(state.youtubeTrends || {}) };
  state = createInitialState();
  state.chatgptBridge = { ...state.chatgptBridge, ...bridgeSettings, waitingForIdeas:false, waitingForImages:false, updateSeq:0 };
  state.youtubeTrends = { ...state.youtubeTrends, apiKeySaved:trendSettings.apiKeySaved, region:trendSettings.region, language:trendSettings.language, days:trendSettings.days };
  audioBuffer = null;
  audioObjectUrl = '';
  waveSurfer?.destroy?.();
  waveSurfer = null;
  lastRenderedBlob = null;
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
  $('#audioPreview').removeAttribute('src');
  $('#audioPreview').style.display = 'none';
  if ($('#audioFile')) $('#audioFile').value = '';
  fillForm();
  updateStep1Audit();
  showPanel('project');
  showToast('Napravljen je potpuno prazan projekat. Stara nesacuvana pesma nije preneta.');
}

async function initializeWaveSurfer(url) {
  const shell = $('#waveSurfer');
  if (!shell) return;
  waveSurfer?.destroy?.();
  waveSurfer = null;
  if (!window.WaveSurfer || !url) {
    shell.classList.remove('ready');
    shell.innerHTML = '<div class="mini-status">WaveSurfer nije učitan. Rezervni waveform ispod i dalje radi.</div>';
    return;
  }
  try {
    shell.innerHTML = '';
    waveSurfer = window.WaveSurfer.create({
      container: shell,
      url,
      height: 120,
      waveColor: '#7357d8',
      progressColor: '#2bc48a',
      cursorColor: '#ffffff',
      normalize: true,
      minPxPerSec: Number($('#waveZoom')?.value) || 40,
      dragToSeek: true
    });
    waveSurfer.on('ready', duration => {
      shell.classList.add('ready');
      $('#waveTime').textContent = `00:00 / ${secondsToClock(duration)}`;
    });
    waveSurfer.on('timeupdate', time => {
      $('#waveTime').textContent = `${secondsToClock(time)} / ${secondsToClock(waveSurfer.getDuration() || state.audio.duration)}`;
    });
    waveSurfer.on('error', error => {
      console.warn('WaveSurfer greška:', error);
      shell.classList.remove('ready');
      shell.innerHTML = '<div class="mini-status">Interaktivni waveform nije dostupan. Rezervni graf ispod radi.</div>';
    });
  } catch (error) {
    console.warn('WaveSurfer nije pokrenut:', error);
    shell.classList.remove('ready');
    shell.innerHTML = '<div class="mini-status">Interaktivni waveform nije dostupan. Rezervni graf ispod radi.</div>';
  }
}

function averageFinite(values) {
  const filtered = values.filter(Number.isFinite);
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : 0;
}

async function runMeydaAnalysis(showMessage = true) {
  if (!window.Meyda) {
    if (showMessage) showToast('Meyda nije učitana. Proveri internet vezu i osveži stranicu.');
    return false;
  }
  try {
    const buffer = await decodeStoredAudio();
    const source = buffer.getChannelData(0);
    const frameSize = 2048;
    const maxFrames = 320;
    const usable = Math.max(1, source.length - frameSize);
    const step = Math.max(frameSize, Math.floor(usable / maxFrames));
    const results = { rms: [], spectralCentroid: [], spectralRolloff: [], spectralFlatness: [], zcr: [] };
    window.Meyda.sampleRate = buffer.sampleRate;
    window.Meyda.bufferSize = frameSize;
    for (let offset = 0; offset + frameSize <= source.length; offset += step) {
      const frame = source.slice(offset, offset + frameSize);
      const features = window.Meyda.extract(Object.keys(results), frame);
      if (!features) continue;
      Object.keys(results).forEach(key => results[key].push(Number(features[key])));
    }
    state.audio.features = {
      rms: averageFinite(results.rms),
      spectralCentroid: averageFinite(results.spectralCentroid),
      spectralRolloff: averageFinite(results.spectralRolloff),
      spectralFlatness: averageFinite(results.spectralFlatness),
      zcr: averageFinite(results.zcr)
    };
    persistState(false, false);
    updateAnalysisUI();
    renderToolStatus();
    if (showMessage) showToast('Meyda napredna audio analiza je završena.');
    return true;
  } catch (error) {
    console.error(error);
    if (showMessage) showToast(`Meyda analiza nije uspela: ${error.message}`);
    return false;
  }
}

// v15.6.0 POPRAVKA: pre ove verzije, "Precizniji BPM" je pokušavao runtime dinamički import sa
// https://esm.sh/web-audio-beat-detector — u instaliranom programu (offline ili iza CSP-a) to
// je uvek padalo sa "Failed to fetch dynamically imported module". Biblioteka je sada lokalno
// vendorovana (public/vendor/web-audio-beat-detector.min.js, učitana preko vendor-loader.js,
// isti obrazac kao WaveSurfer/Meyda) — program više ne zavisi od interneta za BPM analizu.
async function runPreciseBpmAnalysis(showMessage = true) {
  const button = $('#preciseBpmBtn');
  if (!window.WebAudioBeatDetector) {
    if (showMessage) showToast('Precizni BPM detektor još nije učitan. Sačekaj par sekundi posle pokretanja programa i pokušaj ponovo.');
    return false;
  }
  if (button) button.disabled = true;
  state.audio.beatDetectorStatus = 'loading';
  renderToolStatus();
  try {
    const buffer = await decodeStoredAudio();
    const result = await window.WebAudioBeatDetector.guess(buffer, { minTempo: 40, maxTempo: 220 });
    const bpm = Number(result?.bpm ?? result?.tempo ?? result);
    if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('Detektor nije vratio ispravan BPM.');
    state.audio.beatDetectorBpm = Math.round(bpm * 10) / 10;
    state.audio.beatOffset = Number(result?.offset || 0);
    state.audio.beatDetectorStatus = 'ready';
    if (!state.audio.confirmedBpm) state.audio.confirmedBpm = Math.round(bpm);
    persistState(false, false);
    updateAnalysisUI();
    renderToolStatus();
    if (showMessage) showToast(`Precizniji BPM: ${state.audio.beatDetectorBpm}.`);
    return true;
  } catch (error) {
    console.error(error);
    state.audio.beatDetectorStatus = 'error';
    renderToolStatus();
    if (showMessage) showToast(`Precizniji BPM nije dostupan: ${error.message}`);
    return false;
  } finally {
    if (button) button.disabled = false;
  }
}

function moveScene(sceneId, direction) {
  const index = state.scenes.findIndex(scene => scene.id === sceneId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= state.scenes.length) return;
  [state.scenes[index], state.scenes[next]] = [state.scenes[next], state.scenes[index]];
  recalculateSceneTimes();
  persistState(false, false);
  renderStoryboard();
  renderMediaGallery().catch(console.error);
  showToast('Scena je pomerena, a vremena su ponovo izračunata.');
}

function recalculateSceneTimes() {
  if (!state.scenes.length) return;
  const total = state.audio.duration || state.scenes.reduce((sum, scene) => sum + Math.max(0.1, Number(scene.duration) || 0), 0);
  const rawTotal = state.scenes.reduce((sum, scene) => sum + Math.max(0.1, Number(scene.duration) || 0), 0) || total;
  const factor = total / rawTotal;
  let cursor = 0;
  state.scenes.forEach((scene, index) => {
    const duration = index === state.scenes.length - 1 ? Math.max(0.1, total - cursor) : Math.max(0.1, (Number(scene.duration) || state.sceneDuration) * factor);
    scene.number = index + 1;
    scene.start = Math.round(cursor * 100) / 100;
    cursor = Math.min(total, cursor + duration);
    scene.end = index === state.scenes.length - 1 ? Math.round(total * 100) / 100 : Math.round(cursor * 100) / 100;
    scene.duration = Math.round((scene.end - scene.start) * 100) / 100;
    if (!scene.promptSource || scene.promptSource === 'local') {
      scene.imagePrompt = makeImagePrompt(scene);
      scene.videoPrompt = makeVideoPrompt(scene);
    }
  });
}

function initializeStoryboardSorting() {
  const container = $('#storyboardList');
  sortableInstance?.destroy?.();
  sortableInstance = null;
  if (!container || !window.Sortable || state.scenes.length < 2) return;
  sortableInstance = new window.Sortable(container, {
    animation: 180,
    handle: '.scene-drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd() {
      const order = $$('[data-scene-id]', container).map(card => card.dataset.sceneId);
      const byId = new Map(state.scenes.map(scene => [scene.id, scene]));
      state.scenes = order.map(id => byId.get(id)).filter(Boolean);
      recalculateSceneTimes();
      persistState(false, false);
      renderStoryboard();
      renderMediaGallery().catch(console.error);
      showToast('Redosled scena je promenjen, a vremena su ponovo izračunata.');
    }
  });
}

function storyboardRows() {
  return state.scenes.map(scene => ({
    number: scene.number,
    start: scene.start,
    end: scene.end,
    duration: scene.duration,
    section: scene.section,
    lyric: scene.lyric,
    emotion: scene.emotion,
    description: scene.description,
    shot: scene.shot,
    camera: scene.camera,
    location: scene.location,
    imagePrompt: scene.imagePrompt,
    videoPrompt: scene.videoPrompt
  }));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function createStoryboardCsv() {
  const rows = storyboardRows();
  if (window.Papa) return window.Papa.unparse(rows);
  const headers = Object.keys(rows[0] || { number: '', start: '', end: '', duration: '', section: '', lyric: '', emotion: '', description: '', shot: '', camera: '', location: '', imagePrompt: '', videoPrompt: '' });
  return [headers.join(','), ...rows.map(row => headers.map(header => csvEscape(row[header])).join(','))].join('\n');
}

function exportStoryboardCsv() {
  if (!state.scenes.length) return showToast('Nema scena za CSV izvoz.');
  const csv = `\uFEFF${createStoryboardCsv()}`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safeFileName(state.name)}-storyboard.csv`);
  showToast('Storyboard CSV je izvezen.');
}

async function importStoryboardCsv(file) {
  if (!file) return;
  try {
    if (!window.Papa) throw new Error('Papa Parse nije učitan. Proveri internet i osveži stranicu.');
    const parsed = window.Papa.parse(await file.text(), { header: true, skipEmptyLines: true, transformHeader: header => header.trim() });
    if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
    const existing = new Map(state.scenes.map(scene => [Number(scene.number), scene]));
    const imported = parsed.data.map((row, index) => {
      const number = Number(row.number) || index + 1;
      const old = existing.get(number) || {};
      const start = Number(row.start);
      const end = Number(row.end);
      return {
        ...old,
        id: old.id || uuid(),
        number,
        start: Number.isFinite(start) ? start : 0,
        end: Number.isFinite(end) ? end : 0,
        duration: Number(row.duration) || Math.max(0, end - start) || state.sceneDuration,
        section: row.section || old.section || 'Pesma',
        lyric: row.lyric || '', emotion: row.emotion || '', description: row.description || '',
        shot: row.shot || '', camera: row.camera || '', location: row.location || '',
        characterIds: old.characterIds || [], imagePrompt: row.imagePrompt || '', videoPrompt: row.videoPrompt || '',
        promptSource: 'custom', palette: old.palette || [], paletteScore: old.paletteScore || 0,
        imageInfo: old.imageInfo || null, smartCrop: old.smartCrop || null
      };
    });
    if (!imported.length) throw new Error('CSV nema scene.');
    state.scenes = imported;
    recalculateSceneTimes();
    persistState(false, false);
    renderStoryboard();
    await renderMediaGallery();
    showToast(`Uvezeno je ${state.scenes.length} scena iz CSV-a.`);
  } catch (error) {
    showToast(`CSV uvoz nije uspeo: ${error.message}`);
  } finally {
    $('#storyboardCsvFile').value = '';
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// V15.4 — PRODUCTION READINESS, STORYBOARD QA AND EDITOR EXPORTS
// Inspired by the transparent audit/export approach used by Auto-Editor,
// PySceneDetect and other open-source video pipelines. No paid service required.
// ─────────────────────────────────────────────────────────────────────────────
function auditWords(value) {
  return new Set(String(value || '').toLocaleLowerCase('sr-RS').normalize('NFKD')
    .replace(/[^a-z0-9čćžšđ\s]/gi, ' ').split(/\s+/).filter(word => word.length > 2));
}

function textSimilarity(left, right) {
  const a = auditWords(left); const b = auditWords(right);
  if (!a.size || !b.size) return 0;
  let common = 0; a.forEach(word => { if (b.has(word)) common += 1; });
  return common / Math.max(1, new Set([...a, ...b]).size);
}

function storyboardQualityAudit() {
  const issues = [];
  const warnings = [];
  const scenes = Array.isArray(state.scenes) ? state.scenes : [];
  if (!scenes.length) return { ok: false, issues: ['Storyboard nema nijednu scenu.'], warnings, stats: { scenes: 0 } };
  const tolerance = 0.06;
  let previousEnd = 0;
  let missingImagePrompts = 0;
  let missingVideoPrompts = 0;
  let missingLockedIdentity = 0;
  let invalidDurations = 0;
  let timingProblems = 0;
  let duplicatePairs = 0;
  let repeatedAdjacent = 0;

  scenes.forEach((scene, index) => {
    const number = index + 1;
    const start = Number(scene.start); const end = Number(scene.end); const duration = Number(scene.duration);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(duration) || duration <= 0 || end <= start) {
      invalidDurations += 1;
      issues.push(`Scena ${number}: neispravno vreme ili trajanje.`);
    }
    if (index > 0 && Number.isFinite(start)) {
      const delta = start - previousEnd;
      if (Math.abs(delta) > tolerance) {
        timingProblems += 1;
        issues.push(`Scena ${number}: ${delta > 0 ? 'praznina' : 'preklapanje'} od ${Math.abs(delta).toFixed(2)} s.`);
      }
    }
    if (Number.isFinite(end)) previousEnd = end;
    if (!String(scene.imagePrompt || '').trim()) { missingImagePrompts += 1; issues.push(`Scena ${number}: nedostaje image prompt.`); }
    if (!String(scene.videoPrompt || '').trim()) { missingVideoPrompts += 1; issues.push(`Scena ${number}: nedostaje video prompt.`); }
    const hasId = (scene.characterIds || []).includes(LOCKED_GIRL_ID) && String(scene.imagePrompt || '').startsWith(LOCKED_GIRL_BLOCK) && String(scene.videoPrompt || '').startsWith(LOCKED_GIRL_BLOCK);
    if (!hasId) { missingLockedIdentity += 1; issues.push(`Scena ${number}: zaključani identitet devojke nije potpuno primenjen.`); }
    if (index > 0) {
      const previous = scenes[index - 1];
      const sameFields = ['shot', 'camera', 'location'].filter(field => String(scene[field] || '').trim() && String(scene[field] || '').trim() === String(previous[field] || '').trim());
      if (sameFields.length >= 2) {
        repeatedAdjacent += 1;
        warnings.push(`Scene ${number - 1} i ${number}: ponavljaju ${sameFields.join(', ')}.`);
      }
      const similarity = textSimilarity(`${previous.description || ''} ${previous.imagePrompt || ''}`, `${scene.description || ''} ${scene.imagePrompt || ''}`);
      if (similarity >= 0.82) {
        duplicatePairs += 1;
        warnings.push(`Scene ${number - 1} i ${number}: veoma sličan vizuelni opis (${Math.round(similarity * 100)}%).`);
      }
    }
  });

  const targetDuration = Number(state.audio?.duration || 0);
  const finalEnd = Number(scenes.at(-1)?.end || 0);
  if (targetDuration && Math.abs(finalEnd - targetDuration) > 0.25) {
    timingProblems += 1;
    issues.push(`Storyboard traje ${finalEnd.toFixed(2)} s, a audio ${targetDuration.toFixed(2)} s.`);
  }
  return {
    ok: !issues.length,
    issues,
    warnings,
    stats: { scenes: scenes.length, invalidDurations, timingProblems, missingImagePrompts, missingVideoPrompts, missingLockedIdentity, duplicatePairs, repeatedAdjacent }
  };
}

function productionReadinessAudit() {
  collectFormState();
  const storyboard = storyboardQualityAudit();
  const lyricsCount = parseLyrics(state.lyrics || '').length;
  const imageCount = state.scenes.filter(scene => Boolean(state.imageAssetIds?.[scene.id])).length;
  const clipCount = state.scenes.filter(scene => Boolean(state.videoAssetIds?.[scene.id])).length;
  const checks = [
    { label: 'Naziv projekta i pesme', weight: 5, ok: Boolean(state.name && state.songTitle), blocking: true, detail: state.name && state.songTitle ? 'popunjeno' : 'nedostaje naziv projekta ili pesme' },
    { label: 'Audio fajl', weight: 10, ok: Boolean(state.audio?.fileName && state.audio?.duration), blocking: true, detail: state.audio?.fileName || 'nije dodat' },
    { label: 'Audio analiza', weight: 5, ok: Boolean(state.audio?.analyzedAt && state.audio?.energyCurve?.length), blocking: false, detail: state.audio?.analyzedAt ? 'završena' : 'nije završena' },
    { label: 'Tekst pesme', weight: 10, ok: lyricsCount > 0, blocking: true, detail: `${lyricsCount} stvarnih redova` },
    { label: 'Deset kreativnih ideja', weight: 10, ok: state.creativeIdeas.length >= 10, blocking: false, detail: `${state.creativeIdeas.length}/10` },
    { label: 'Izabrana ideja', weight: 5, ok: Boolean(selectedCreativeIdea()), blocking: true, detail: selectedCreativeIdea()?.title || 'nije izabrana' },
    { label: 'Storyboard i tajming', weight: 15, ok: storyboard.ok, blocking: true, detail: storyboard.ok ? `${state.scenes.length} scena bez blokirajućih grešaka` : `${storyboard.issues.length} grešaka` },
    { label: 'Kontinuitet i promptovi', weight: 10, ok: storyboard.stats.missingLockedIdentity === 0 && storyboard.stats.missingImagePrompts === 0 && storyboard.stats.missingVideoPrompts === 0, blocking: true, detail: `${storyboard.stats.missingLockedIdentity} ID grešaka, ${storyboard.stats.missingImagePrompts + storyboard.stats.missingVideoPrompts} promptova nedostaje` },
    { label: 'Slike scena', weight: 10, ok: state.scenes.length > 0 && imageCount === state.scenes.length, blocking: true, detail: `${imageCount}/${state.scenes.length}` },
    { label: 'AI video-klipovi', weight: 5, ok: state.scenes.length > 0 && clipCount === state.scenes.length, blocking: false, detail: `${clipCount}/${state.scenes.length}` },
    { label: 'Titlovi', weight: 5, ok: !state.captions?.enabled || Boolean(state.captions?.items?.length), blocking: false, detail: state.captions?.enabled ? `${state.captions.items.length} titlova` : 'isključeni' },
    { label: 'YouTube paket', weight: 5, ok: Boolean(state.youtube?.title && state.youtube?.description && state.youtube?.hashtags && state.youtube?.pinned), blocking: false, detail: state.youtube?.title ? 'spreman' : 'nije kompletan' },
    { label: 'Lokalni backup', weight: 5, ok: Boolean(state.savedAt), blocking: false, detail: state.savedAt ? new Date(state.savedAt).toLocaleString('sr-RS') : 'projekat još nije ručno sačuvan' }
  ];
  const score = Math.round(checks.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0));
  const blockers = checks.filter(item => item.blocking && !item.ok);
  const warnings = checks.filter(item => !item.blocking && !item.ok);
  return { generatedAt: new Date().toISOString(), score, ready: blockers.length === 0, blockers, warnings, checks, storyboard, assets: { images: imageCount, clips: clipCount, scenes: state.scenes.length } };
}

function productionAuditText(audit) {
  const lines = [
    `SPREMNOST PROJEKTA: ${audit.score}/100 • ${audit.ready ? 'NEMA BLOKIRAJUĆIH GREŠAKA' : `${audit.blockers.length} BLOKIRAJUĆIH GREŠAKA`}`,
    `PROVERENO: ${new Date(audit.generatedAt).toLocaleString('sr-RS')}`,
    '',
    ...audit.checks.map(item => `${item.ok ? '✓' : item.blocking ? '✕' : '!'} ${item.label} [${item.weight} poena] — ${item.detail}`),
    '',
    `STORYBOARD: ${audit.storyboard.stats.scenes} scena • ${audit.storyboard.issues.length} grešaka • ${audit.storyboard.warnings.length} upozorenja`
  ];
  if (audit.storyboard.issues.length) lines.push('', 'GREŠKE:', ...audit.storyboard.issues.map(item => `- ${item}`));
  if (audit.storyboard.warnings.length) lines.push('', 'UPOZORENJA:', ...audit.storyboard.warnings.map(item => `- ${item}`));
  if (!audit.blockers.length) lines.push('', 'Projekat može da pređe u završnu izradu. Upozorenja nisu blokada, ali ih pregledaj pre rendera.');
  else lines.push('', 'Prvo ispravi stavke označene znakom ✕. Program neće menjati kreativne odluke bez tvoje kontrole.');
  return lines.join('\n');
}

function renderProductionAudit(showMessage = false) {
  const audit = productionReadinessAudit();
  const report = $('#productionAuditReport');
  const badge = $('#productionReadinessBadge');
  if (report) report.textContent = productionAuditText(audit);
  if (badge) {
    badge.textContent = `${audit.score}/100 ${audit.ready ? 'SPREMNO' : 'NIJE SPREMNO'}`;
    badge.classList.toggle('ok', audit.ready);
  }
  if (showMessage) showToast(audit.ready ? `Projekat je spreman: ${audit.score}/100.` : `Pronađeno je ${audit.blockers.length} blokirajućih problema.`);
  return audit;
}

function autoFixStoryboardQuality() {
  collectFormState();
  if (!state.scenes.length) return showToast('Nema storyboarda za popravku.');
  state.scenes = [...state.scenes].sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
  state.scenes.forEach(scene => {
    scene.duration = Number(scene.duration) > 0 ? Number(scene.duration) : Math.max(0.5, Number(state.sceneDuration) || 5);
    scene.characterIds = [...new Set([LOCKED_GIRL_ID, ...(scene.characterIds || [])])];
    if (!String(scene.imagePrompt || '').trim() || scene.promptSource === 'local') scene.imagePrompt = makeImagePrompt(scene);
    else scene.imagePrompt = withLockedGirlIdentity(scene.imagePrompt);
    if (!String(scene.videoPrompt || '').trim() || scene.promptSource === 'local') scene.videoPrompt = makeVideoPrompt(scene);
    else scene.videoPrompt = withLockedGirlIdentity(scene.videoPrompt);
  });
  recalculateSceneTimes();
  ensureLockedGirlEverywhere();
  persistState(false, false);
  renderStoryboard();
  renderMediaGallery().catch(console.error);
  renderProductionAudit(false);
  showToast('Tajming, redosled, zaključani ID i nedostajući promptovi su automatski sređeni. Kreativne ponavljajuće scene su samo označene za ručnu odluku.');
}

function editorTimecode(seconds, fps) {
  const rate = Math.max(1, Math.round(Number(fps) || 25));
  const totalFrames = Math.max(0, Math.round(Number(seconds || 0) * rate));
  const frames = totalFrames % rate;
  const totalSeconds = Math.floor(totalFrames / rate);
  const s = totalSeconds % 60; const m = Math.floor(totalSeconds / 60) % 60; const h = Math.floor(totalSeconds / 3600);
  return [h, m, s, frames].map(value => String(value).padStart(2, '0')).join(':');
}

function createCmx3600Edl() {
  if (!state.scenes.length) throw new Error('Nema scena za EDL izvoz.');
  const fps = Math.round(Number(state.settings?.renderFps) || 25);
  const lines = [`TITLE: ${String(state.songTitle || state.name || 'MUZICKI_SPOT').toUpperCase()}`, 'FCM: NON-DROP FRAME', `* FRAME RATE: ${fps}`, ''];
  state.scenes.forEach((scene, index) => {
    const sourceIn = editorTimecode(0, fps);
    const sourceOut = editorTimecode(scene.duration, fps);
    const recordIn = editorTimecode(scene.start, fps);
    const recordOut = editorTimecode(scene.end, fps);
    lines.push(`${String(index + 1).padStart(3, '0')}  AX       V     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`);
    lines.push(`* FROM CLIP NAME: SCENA_${String(scene.number).padStart(3, '0')}`);
    lines.push(`* COMMENT: ${String(scene.lyric || scene.sceneTitle || scene.section || '').replace(/[\r\n]+/g, ' ').slice(0, 160)}`);
    lines.push('');
  });
  return lines.join('\n');
}

function exportCmx3600Edl() {
  try {
    const text = createCmx3600Edl();
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${safeFileName(state.songTitle || state.name)}-timeline.edl`);
    showToast('CMX3600 EDL timeline je izvezena za montažni program.');
  } catch (error) { showToast(error.message); }
}

function createAudioMarkersCsv() {
  const rows = [['type', 'time_seconds', 'timecode', 'value', 'label']];
  const duration = Number(state.audio?.duration || 0);
  const curve = Array.isArray(state.audio?.energyCurve) ? state.audio.energyCurve : [];
  const fps = Number(state.settings?.renderFps || 25);
  if (curve.length && duration) {
    curve.forEach((value, index) => {
      const time = curve.length === 1 ? 0 : index / (curve.length - 1) * duration;
      const level = value >= 0.72 ? 'visoka energija' : value >= 0.38 ? 'srednja energija' : 'niska energija';
      rows.push(['energy', time.toFixed(3), editorTimecode(time, fps), Number(value).toFixed(4), level]);
    });
  }
  const bpm = Number(state.audio?.confirmedBpm || state.audio?.beatDetectorBpm || state.audio?.bpmEstimate || 0);
  const offset = Math.max(0, Number(state.audio?.beatOffset || 0));
  if (bpm > 0 && duration > 0) {
    const interval = 60 / bpm;
    for (let time = offset, beat = 1; time <= duration + 0.001; time += interval, beat += 1) {
      rows.push(['beat', time.toFixed(3), editorTimecode(time, fps), bpm.toFixed(2), `udar ${beat}`]);
    }
  }
  state.scenes.forEach(scene => rows.push(['scene', Number(scene.start || 0).toFixed(3), editorTimecode(scene.start, fps), scene.number, String(scene.lyric || scene.sceneTitle || scene.section || '').replace(/[\r\n]+/g, ' ')]));
  return `\uFEFF${rows.map(row => row.map(csvEscape).join(',')).join('\n')}`;
}

function exportAudioMarkersCsv() {
  if (!state.audio?.duration && !state.scenes.length) return showToast('Najpre analiziraj audio ili napravi storyboard.');
  downloadBlob(new Blob([createAudioMarkersCsv()], { type: 'text/csv;charset=utf-8' }), `${safeFileName(state.songTitle || state.name)}-audio-markeri.csv`);
  showToast('Izvezeni su markeri energije, BPM udari i početak svake scene.');
}

function buildProductionManifest() {
  const audit = productionReadinessAudit();
  return {
    format: 'Muzički Spot Studio Production Manifest', version: state.schemaVersion || '15.4', exportedAt: new Date().toISOString(),
    project: { projectId: state.projectId, name: state.name, songTitle: state.songTitle, artistName: state.artistName, format: state.format, duration: state.audio?.duration || 0, genre: state.genre, mood: state.mood },
    readiness: audit,
    render: { ...state.settings },
    concept: { ...state.concept },
    selectedIdea: selectedCreativeIdea(),
    scenes: state.scenes.map(scene => ({
      id: scene.id, number: scene.number, start: scene.start, end: scene.end, duration: scene.duration, section: scene.section, lyric: scene.lyric,
      emotion: scene.emotion, description: scene.description, shot: scene.shot, camera: scene.camera, lens: scene.lens, location: scene.location,
      hasImage: Boolean(state.imageAssetIds?.[scene.id]), hasVideo: Boolean(state.videoAssetIds?.[scene.id]), imagePrompt: scene.imagePrompt, videoPrompt: scene.videoPrompt
    })),
    captions: { enabled: state.captions?.enabled !== false, count: state.captions?.items?.length || 0, language: state.captions?.language || 'sr' },
    youtube: { ...state.youtube }
  };
}

function exportProductionManifest() {
  const manifest = buildProductionManifest();
  downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json;charset=utf-8' }), `${safeFileName(state.songTitle || state.name)}-production-manifest.json`);
  showToast('Production manifest je izvezen sa scenama, statusom resursa i listom problema.');
}

async function checkProgramIntegrity(showMessage = true) {
  const report = $('#integrityReport');
  try {
    const response = await fetch(apiUrl('/api/maintenance/integrity'), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Provera integriteta nije dostupna.');
    const lines = [
      `INTEGRITET: ${data.ok ? 'SVI KONTROLISANI FAJLOVI SU ORIGINALNI' : 'PRONAĐENA JE RAZLIKA'}`,
      `PROVERENO: ${data.checked} • ISPRAVNO: ${data.valid} • NEDOSTAJE: ${data.missing.length} • IZMENJENO: ${data.mismatched.length}`,
      ...(data.missing.length ? ['', 'NEDOSTAJU:', ...data.missing.map(item => `- ${item}`)] : []),
      ...(data.mismatched.length ? ['', 'IZMENJENI ILI OŠTEĆENI:', ...data.mismatched.map(item => `- ${item.path}`)] : [])
    ];
    if (report) report.textContent = lines.join('\n');
    if (showMessage) showToast(data.ok ? 'Integritet programskih fajlova je ispravan.' : 'Neki programski fajlovi nedostaju ili su izmenjeni.');
    return data;
  } catch (error) {
    if (report) report.textContent = `PROVERA INTEGRITETA NIJE USPELA\n${error.message}`;
    if (showMessage) showToast(error.message);
    throw error;
  }
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Slika ne može da se otvori.')); };
    image.src = url;
  });
}

function targetDimensions(format, maxSize) {
  const size = clamp(Number(maxSize) || 1920, 720, 3840);
  if (format === '16:9') return { width: size, height: Math.round(size * 9 / 16) };
  if (format === '1:1') return { width: size, height: size };
  return { width: Math.round(size * 9 / 16), height: size };
}

function centerCrop(sourceWidth, sourceHeight, targetRatio) {
  const sourceRatio = sourceWidth / sourceHeight;
  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / targetRatio;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

function canvasBlob(canvas, type = 'image/webp', quality = 0.92) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Pregledač nije napravio obrađenu sliku.')), type, quality));
}

function enforceCropRatio(crop, sourceWidth, sourceHeight, targetRatio) {
  const safe = {
    x: clamp(Number(crop?.x) || 0, 0, sourceWidth - 1),
    y: clamp(Number(crop?.y) || 0, 0, sourceHeight - 1),
    width: clamp(Number(crop?.width) || sourceWidth, 1, sourceWidth),
    height: clamp(Number(crop?.height) || sourceHeight, 1, sourceHeight)
  };
  safe.width = Math.min(safe.width, sourceWidth - safe.x);
  safe.height = Math.min(safe.height, sourceHeight - safe.y);
  const ratio = safe.width / safe.height;
  if (Math.abs(ratio - targetRatio) < 0.002) return safe;
  if (ratio > targetRatio) {
    const width = safe.height * targetRatio;
    safe.x += (safe.width - width) / 2;
    safe.width = width;
  } else {
    const height = safe.width / targetRatio;
    safe.y += (safe.height - height) / 2;
    safe.height = height;
  }
  return safe;
}

async function calculateSmartCrop(image, width, height) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const targetRatio = width / height;
  const fallback = centerCrop(sourceWidth, sourceHeight, targetRatio);
  const cropper = window.smartcrop || window.SmartCrop;
  if (!state.settings.autoSmartCrop || !cropper?.crop) return fallback;
  try {
    const result = await cropper.crop(image, { width, height, ruleOfThirds: true });
    return enforceCropRatio(result?.topCrop || fallback, sourceWidth, sourceHeight, targetRatio);
  } catch (error) {
    console.warn('Smartcrop fallback:', error);
    return fallback;
  }
}

async function processImageForScene(file, scene) {
  if (!file || !scene) throw new Error('Nedostaje slika ili scena.');
  const { image, url } = await loadImageFromBlob(file);
  try {
    const requested = targetDimensions(state.format, state.settings.imageMaxSize);
    const crop = await calculateSmartCrop(image, requested.width, requested.height);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = Math.max(1, Math.round(crop.width));
    sourceCanvas.height = Math.max(1, Math.round(crop.height));
    sourceCanvas.getContext('2d').drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, sourceCanvas.width, sourceCanvas.height);

    const scale = Math.min(1, requested.width / sourceCanvas.width, requested.height / sourceCanvas.height);
    const outputWidth = Math.max(2, Math.round(sourceCanvas.width * scale));
    const outputHeight = Math.max(2, Math.round(sourceCanvas.height * scale));
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    if (window.pica) {
      await window.pica().resize(sourceCanvas, outputCanvas, { quality: 3, alpha: true });
    } else {
      outputCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
    }
    let blob;
    try { blob = await canvasBlob(outputCanvas, 'image/webp', 0.92); }
    catch { blob = await canvasBlob(outputCanvas, 'image/jpeg', 0.94); }
    return {
      blob,
      crop: { x: Math.round(crop.x), y: Math.round(crop.y), width: Math.round(crop.width), height: Math.round(crop.height) },
      info: {
        originalWidth: image.naturalWidth || image.width,
        originalHeight: image.naturalHeight || image.height,
        width: outputWidth,
        height: outputHeight,
        size: blob.size,
        type: blob.type,
        processedAt: new Date().toISOString()
      }
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rgbToHex(rgb) {
  const values = Array.isArray(rgb) ? rgb : [rgb?.r, rgb?.g, rgb?.b];
  return `#${values.slice(0, 3).map(value => clamp(Math.round(Number(value) || 0), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex) {
  const normalized = String(hex).replace('#', '').padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map(index => parseInt(normalized.slice(index, index + 2), 16) || 0);
}

async function fallbackPalette(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 64, 64);
  const pixels = context.getImageData(0, 0, 64, 64).data;
  const buckets = new Map();
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
      if (!response.ok || !data.ok || data.version !== '15.4') throw new Error(`Server vraća ${data.version || response.status}.`);
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
      if (!window.MSSGitHubModules || window.MSSGitHubModules.version !== '15.4') throw new Error('github-modules.js nije učitan.');
      const response = await fetch(apiUrl('/api/modules/status'), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok || data.version !== '15.4') throw new Error('Serverski modul status nije ispravan.');
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
    await test('Proračun scena', () => { const bounds = buildSceneBoundaries(30, 5, Array(300).fill(0).map((_, i) => Math.abs(Math.sin(i / 9)))); if (bounds[0] !== 0 || bounds.at(-1) !== 30 || bounds.length < 4) throw new Error('Granice scena nisu ispravne.'); return `${bounds.length - 1} probnih scena`; });
    await test('Oznake pesme nisu stihovi', () => { const parsed = parseLyrics('[Intro][Pop][Ballad][Male]\nPravi prvi stih\n[Refren]\nDrugi stih'); if (parsed.length !== 2 || parsed[0].text !== 'Pravi prvi stih' || parsed[0].section.toLowerCase() !== 'intro') throw new Error('Metapodaci su pogrešno tretirani kao stih.'); return 'Višestruke [oznake] su uklonjene'; });
    await test('Baza jedinstvenih koncepata', () => { if (LOCAL_IDEA_BLUEPRINTS.length < 20) throw new Error('Nema dovoljno različitih vizuelnih svetova.'); const titles = new Set(LOCAL_IDEA_BLUEPRINTS.map(item => item.title)); if (titles.size !== LOCAL_IDEA_BLUEPRINTS.length) throw new Error('Postoje dupli koncepti.'); return `${titles.size} različitih baza za ideje`; });
    await test('Zaključani ID u detaljnom image promptu', () => { const sample={number:1,section:'Refren',lyric:'Nedostaješ mi kada grad utihne',emotion:'čežnja',description:'ona završava konkretnu radnju i donosi vidljivu odluku',microMovement:'prsti zastanu, pogled se spusti, disanje ostane kontrolisano',location:'realističan zatvoren prostor',timeWeather:'noć',lighting:'motivisano hladno svetlo',shot:'medium shot',lens:'50mm',camera:'slow push-in',composition:'rule of thirds',foreground:'realan predmet blizu kamere',midground:'glavna radnja',background:'logičan nastavak lokacije',wardrobe:'moderna i primerena sceni',continuityNotes:'isti identitet',visualSignature:'self-test-unique',imagePrompt:'',videoPrompt:''}; const prompt=makeImagePrompt(sample); if (!prompt.startsWith(LOCKED_GIRL_BLOCK)) throw new Error('Zaključani ID nije na početku.'); if (prompt.length < LOCKED_GIRL_BLOCK.length + 1500) throw new Error('Opis scene nije dovoljno detaljan.'); if (!prompt.includes('GLAVNA VIDLJIVA RADNJA') || !prompt.includes('JEDINSTVENI VIZUELNI POTPIS')) throw new Error('Nedostaju detaljni tehnički podaci scene.'); return `${prompt.length} karaktera`; });
    await test('Detaljan video prompt', () => { const sample={number:1,duration:5,lyric:'Nedostaješ mi',emotion:'čežnja',description:'ona spušta predmet i donosi vidljivu odluku',microMovement:'prsti zastanu i ramena se blago opuste',location:'realističan enterijer',timeWeather:'noć',lighting:'hladno praktično svetlo',camera:'slow push-in',lens:'50mm',foreground:'predmet u prednjem planu',background:'isti prostor',wardrobe:'moderna odeća',continuityNotes:'isto lice i garderoba',transitionIn:'jasna radnja od prvog kadra',transitionOut:'vidljiva posledica',videoPrompt:''}; const prompt=makeVideoPrompt(sample); for (const label of ['START FRAME','PRIMARY ACTION','MICRO-ACTIONS','CAMERA MOVEMENT','ENVIRONMENTAL MOTION','FINAL FRAME','NEGATIVE VIDEO RULES']) if (!prompt.includes(label)) throw new Error(`Nedostaje ${label}`); return `${prompt.length} karaktera`; });
    await test('Tačne dimenzije, kvalitet i 4K render', () => { const vertical=imageOutputSpecification('9:16'),horizontal=imageOutputSpecification('16:9'),square=imageOutputSpecification('1:1'); if(!vertical.master.includes('2160×3840')||!horizontal.master.includes('3840×2160')||!square.master.includes('2048×2048'))throw new Error('Nedostaju tačne finalne dimenzije.'); if(!document.querySelector('#renderResolution option[value="2160"]'))throw new Error('Nedostaje 4K opcija rendera.'); if(!document.querySelector('#imageMaxSize option[value="4096"]'))throw new Error('Nedostaje 4096 px izvorna slika.'); return '9:16 2160×3840, 16:9 3840×2160, 1:1 2048×2048'; });
    await test('Lokacije su vezane za stih', () => { if(!lyricStemMatches('Na stanici čuvam kartu','stanic'))throw new Error('Stanica nije prepoznata.'); if(lyricStemMatches('Na stanici čuvam kartu','stan'))throw new Error('Stanica je pogrešno prepoznata kao stan.'); const phone=lyricLocationMatches('Gledam telefon, poruke nema'); if(!phone.some(rule=>rule.reason.includes('komunikaciju')))throw new Error('Telefon nije povezan sa komunikacijom.'); return 'stanica ≠ stan; telefon → komunikacija'; });
    await test('ChatGPT Plus browser most 15.4', async () => { ['sendStep3ToPlusBtn','testPlusBridgeBtn','plusBridgeStatus','plusPrivateGptUrl','pollPlusResultBtn','step3PreflightBtn','downloadStep3DiagnosticsBtn','cancelPlusBridgeBtn','resetStep3WorkflowBtn'].forEach(id=>{if(!document.getElementById(id))throw new Error(`Nedostaje #${id}`);}); const response=await fetch(apiUrl('/api/plus-bridge/status'),{cache:'no-store'});const data=await response.json();if(!response.ok||data.version!=='15.4')throw new Error('Plus most server ne vraća verziju 15.4.'); if(data.extensionInstalled && !data.extensionCompatible) throw new Error(`Pogrešna verzija dodatka: ${data.extensionVersion}.`); return data.extensionCompatible?'Dodatak 15.4 je kompatibilan':'Most API radi; dodatak 15.4 se instalira samo prvi put'; });
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
