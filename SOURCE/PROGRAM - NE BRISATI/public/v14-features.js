'use strict';

/* Muzički Spot Studio 15.4 — LITE alati. Sve funkcije rade lokalno u browseru ili preko lokalnog servera. */

const MSS_VERSION = '15.6';
const DEFAULT_PRIVATE_GPT_URL = 'https://chatgpt.com/g/g-6a62e905ca608191be135254d6f2fbcc-muzicki-spot-studio-privatni';
const DEFAULT_PRIVATE_GPT_ID = 'g-6a62e905ca608191be135254d6f2fbcc';
const DEFAULT_PRIVATE_GPT_EDITOR_URL = `https://chatgpt.com/gpts/editor/${DEFAULT_PRIVATE_GPT_ID}`;
const MAX_PLUS_PROMPT_CHARS = 24000;
const EXPECTED_PLUS_EXTENSION_VERSION = '15.6.0';
const ROUND2_BATCH_SIZE = 8;

const V14 = {
  storyboardUndo: [], storyboardRedo: [], captionsUndo: [], captionsRedo: [],
  lastSnapshotAt: 0, systemProfile: null, lastAudioReport: null, lastArtifactReport: null
};

function v14El(id) { return document.getElementById(id); }
function v14Text(value) { return String(value ?? '').trim(); }
function v14SafeFile(value) {
  return (v14Text(value) || 'muzicki-spot').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'muzicki-spot';
}
function v14Download(content, fileName, type = 'text/plain;charset=utf-8') {
  downloadBlob(content instanceof Blob ? content : new Blob([content], { type }), fileName);
}
function v14Xml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function v14JsonClone(value) { return JSON.parse(JSON.stringify(value)); }
function v14Now() { return new Date().toISOString(); }
function v14Hash(text) {
  let hash = 2166136261;
  for (const char of String(text || '')) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function deterministicSceneSeed(scene) {
  return (v14Hash([state.projectId, state.songTitle, scene.id, scene.number, scene.lyric, scene.description].join('|')) % 2147483646) + 1;
}
window.deterministicSceneSeed = deterministicSceneSeed;

function ensureV14State() {
  state.schemaVersion = '15.4';
  state.concept ||= {};
  for (const [key, value] of Object.entries({ genre: state.genre || '', mood: state.mood || '', centralSymbol: '', openingHook: '', ending: '' })) {
    if (state.concept[key] == null) state.concept[key] = value;
  }
  state.advanced ||= {};
  state.advanced.audio ||= { silenceRegions: [], loudness: null, analyzedAt: '' };
  state.advanced.hardware ||= { profile: null, checkedAt: '' };
  state.advanced.promptVersions ||= [];
  state.advanced.hookAudit ||= null;
  state.advanced.artifactQa ||= null;
  state.advanced.flicker ||= null;
  state.advanced.renderRecovery ||= null;
  state.advanced.step3 ||= { completedRound: 0, lastPackageRound: 0, lastImportAt: '' };
  state.advanced.step3.custom ||= { mode:'ideas', spotPrompt:'', requestedDuration:'', maxScenes:12 };
  if (!['ideas','prompt-to-spot'].includes(state.advanced.step3.custom.mode)) state.advanced.step3.custom.mode = 'ideas';
  state.advanced.step3.custom.maxScenes = Math.max(6, Math.min(24, Number(state.advanced.step3.custom.maxScenes || 12)));
  state.advanced.step3.round2 ||= null;
  state.advanced.step3.plusJobId ||= '';
  state.advanced.step3.activeProjectFingerprint ||= '';
  state.chatgptBridge ||= {};
  state.chatgptBridge.privateGptUrl = DEFAULT_PRIVATE_GPT_URL;
  state.settings ||= {};
  if (state.settings.weakPcMode == null) state.settings.weakPcMode = true;
  if (state.settings.renderRecovery == null) state.settings.renderRecovery = true;
  if (state.settings.proxyRenderActive == null) state.settings.proxyRenderActive = false;
  state.scenes = (state.scenes || []).map((scene, index) => ({
    ...scene,
    number: Number(scene.number || index + 1),
    seed: Number(scene.seed || deterministicSceneSeed(scene)),
    promptVersion: Number(scene.promptVersion || 1),
    promptHistory: Array.isArray(scene.promptHistory) ? scene.promptHistory : []
  }));
}


function step3CustomDefaults() {
  return {
    mode:'ideas', spotPrompt:'', requestedDuration:'', maxScenes:16,
    spotType:'auto', visualTone:'auto', budget:'low', locationPlan:'five',
    averageShotLength:'4.5', shotMix:'balanced', usePromptInIdeas:true,
    requireImagePrompts:true, requireVideoPrompts:true, requireYoutubeSources:true,
    youtubeQuery:'', youtubeSort:'momentum', selectedReferences:[], youtubeResults:[]
  };
}
function ensureStep3CustomBridgeState() {
  ensureV14State();
  state.advanced.step3.custom = { ...step3CustomDefaults(), ...(state.advanced.step3.custom || {}) };
  const custom = state.advanced.step3.custom;
  if (!['ideas','prompt-to-spot'].includes(custom.mode)) custom.mode = 'ideas';
  custom.maxScenes = Math.max(6, Math.min(36, Number(custom.maxScenes || 16)));
  custom.selectedReferences = Array.isArray(custom.selectedReferences) ? custom.selectedReferences.slice(0,4) : [];
  custom.youtubeResults = Array.isArray(custom.youtubeResults) ? custom.youtubeResults.slice(0,30) : [];
  return custom;
}
function currentStep3Fingerprint() {
  const custom = ensureStep3CustomBridgeState();
  const base = currentSongFingerprint();
  if (custom.mode !== 'prompt-to-spot') return base;
  const refs = (custom.selectedReferences || []).map(item => `${item.id || ''}|${item.url || ''}|${item.title || ''}`).join('||');
  return v14Hash(`${base}|${custom.spotPrompt}|${custom.spotType}|${custom.visualTone}|${custom.budget}|${custom.locationPlan}|${custom.maxScenes}|${custom.requestedDuration}|${custom.averageShotLength}|${custom.shotMix}|${refs}`);
}
function effectiveStep3Duration(custom = null) {
  const value = custom || ensureStep3CustomBridgeState();
  const requested = Number(value.requestedDuration || 0);
  const audioDuration = Number(state.audio?.duration || 0);
  return Math.max(15, requested > 0 ? requested : audioDuration > 0 ? audioDuration : 60);
}
function spotTypeAverageSeconds(type) {
  const map = { 'urban-narrative':4.2, 'multi-location':4.0, 'performance-story':3.5, 'symbolic-studio':5.5, 'daylight-city':4.2, 'road-travel':4.5, 'public-event':3.4, 'one-take':8, 'lyric-cinematic':5.5, animated:4.5, 'low-budget':5, 'reference-led':4.0, auto:4.5 };
  return map[type] || 4.5;
}
function estimatedPromptImages(custom = null) {
  const value = custom || ensureStep3CustomBridgeState();
  const maxScenes = Math.max(6, Math.min(36, Number(value.maxScenes || 16)));
  const duration = effectiveStep3Duration(value);
  const manualAverage = Number(value.averageShotLength);
  const average = manualAverage > 0 ? manualAverage : spotTypeAverageSeconds(value.spotType);
  return Math.max(6, Math.min(maxScenes, Math.round(duration / Math.max(2.25, average))));
}
function updateStep3EstimateUi(custom = null) {
  const value = custom || ensureStep3CustomBridgeState();
  const scenes = estimatedPromptImages(value);
  const duration = effectiveStep3Duration(value);
  const imageCount = value.requireImagePrompts ? scenes : 0;
  const videoCount = value.requireVideoPrompts ? scenes : 0;
  if (v14El('step3EstimatedScenes')) v14El('step3EstimatedScenes').textContent = String(scenes);
  if (v14El('step3EstimatedImagePrompts')) v14El('step3EstimatedImagePrompts').textContent = String(imageCount);
  if (v14El('step3EstimatedVideoPrompts')) v14El('step3EstimatedVideoPrompts').textContent = String(videoCount);
  if (v14El('step3EstimatedDuration')) v14El('step3EstimatedDuration').textContent = `${Math.round(duration)} s`;
  return { scenes, duration, imageCount, videoCount };
}
function updateStep3ModeUi(persistChanges = false) {
  const custom = ensureStep3CustomBridgeState();
  const direct = custom.mode === 'prompt-to-spot';
  const badge = v14El('step3ModeBadge');
  const status = v14El('step3CustomPromptStatus');
  const sendBtn = v14El('sendStep3ToPlusBtn');
  if (badge) badge.textContent = direct ? 'REŽIM: PROMPT → SPOT' : 'REŽIM: 10 IDEJA';
  if (sendBtn) sendBtn.textContent = direct ? 'POŠALJI MOJ PROMPT I NAPRAVI SPOT' : 'POKRENI 10 IDEJA I OTVORI CHATGPT';
  const estimate = updateStep3EstimateUi(custom);
  if (status) {
    status.textContent = direct
      ? (custom.spotPrompt.length < 20
        ? 'Upiši detaljan prompt. Tekst pesme i audio su korisni, ali direktni režim može da radi i samo sa promptom i zadatim trajanjem.'
        : `Direktan prompt je spreman: procena ${estimate.scenes} scena/slika za ${Math.round(estimate.duration)} s. GPT mora vratiti priču, YouTube izvore, image i video prompt za svaku scenu.`)
      : (custom.spotPrompt && custom.usePromptInIdeas
        ? 'Standardni režim pravi 10 ideja, ali koristi i tvoj prompt kao obavezno kreativno usmerenje.'
        : 'Standardni režim prvo pravi 10 različitih ideja, zatim biraš jednu za storyboard.');
  }
  renderStep3YoutubeReferences();
  if (persistChanges) persistState(false, false);
  return custom;
}
function boolFromControl(id, fallback) {
  const el = v14El(id); return el ? Boolean(el.checked) : Boolean(fallback);
}
function collectStep3CustomBridgeInputs(persistChanges = false) {
  const custom = ensureStep3CustomBridgeState();
  custom.mode = v14Text(v14El('step3BridgeMode')?.value) === 'prompt-to-spot' ? 'prompt-to-spot' : 'ideas';
  custom.spotPrompt = v14Text(v14El('step3CustomSpotPrompt')?.value);
  custom.requestedDuration = v14Text(v14El('step3PromptDuration')?.value);
  custom.maxScenes = Math.max(6, Math.min(36, Number(v14El('step3PromptMaxScenes')?.value || custom.maxScenes || 16)));
  custom.spotType = v14Text(v14El('step3SpotType')?.value) || 'auto';
  custom.visualTone = v14Text(v14El('step3VisualTone')?.value) || 'auto';
  custom.budget = v14Text(v14El('step3Budget')?.value) || 'low';
  custom.locationPlan = v14Text(v14El('step3LocationPlan')?.value) || 'five';
  custom.averageShotLength = v14Text(v14El('step3AverageShotLength')?.value) || '4.5';
  custom.shotMix = v14Text(v14El('step3ShotMix')?.value) || 'balanced';
  custom.usePromptInIdeas = boolFromControl('step3UsePromptInIdeas', custom.usePromptInIdeas);
  custom.requireImagePrompts = boolFromControl('step3RequireImagePrompts', custom.requireImagePrompts);
  custom.requireVideoPrompts = boolFromControl('step3RequireVideoPrompts', custom.requireVideoPrompts);
  custom.requireYoutubeSources = boolFromControl('step3RequireYoutubeSources', custom.requireYoutubeSources);
  custom.youtubeQuery = v14Text(v14El('step3YoutubeQuery')?.value) || custom.youtubeQuery || '';
  custom.youtubeSort = v14Text(v14El('step3YoutubeSort')?.value) || custom.youtubeSort || 'momentum';
  updateStep3ModeUi(false);
  if (persistChanges) persistState(false, false);
  return custom;
}
function hydrateStep3CustomBridgeInputs() {
  const custom = ensureStep3CustomBridgeState();
  const values = {
    step3BridgeMode:custom.mode, step3CustomSpotPrompt:custom.spotPrompt, step3PromptDuration:custom.requestedDuration,
    step3PromptMaxScenes:String(custom.maxScenes), step3SpotType:custom.spotType, step3VisualTone:custom.visualTone,
    step3Budget:custom.budget, step3LocationPlan:custom.locationPlan, step3AverageShotLength:String(custom.averageShotLength),
    step3ShotMix:custom.shotMix, step3YoutubeQuery:custom.youtubeQuery, step3YoutubeSort:custom.youtubeSort
  };
  for (const [id,value] of Object.entries(values)) if (v14El(id)) v14El(id).value = value || '';
  const checks = { step3UsePromptInIdeas:custom.usePromptInIdeas, step3RequireImagePrompts:custom.requireImagePrompts, step3RequireVideoPrompts:custom.requireVideoPrompts, step3RequireYoutubeSources:custom.requireYoutubeSources };
  for (const [id,value] of Object.entries(checks)) if (v14El(id)) v14El(id).checked = Boolean(value);
  updateStep3ModeUi(false); renderStep3PromptGallery();
}
function isPromptToSpotMode() { return ensureStep3CustomBridgeState().mode === 'prompt-to-spot'; }
function normalizeReferenceVideo(item = {}) {
  const url = v14Text(item.url || item.webpage_url);
  const idMatch = url.match(/[?&]v=([\w-]{6,})|youtu\.be\/([\w-]{6,})/i);
  return {
    id:v14Text(item.id || idMatch?.[1] || idMatch?.[2] || `manual-${v14Hash(url + item.title)}`),
    title:v14Text(item.title || 'YouTube referenca'), url, channel:v14Text(item.channel || item.channelTitle),
    duration:Number(item.duration || 0), viewCount:Number(item.viewCount || item.views || 0),
    uploadDate:v14Text(item.uploadDate || item.publishedAt), publicMomentumScore:Number(item.publicMomentumScore || 0),
    thumbnail:v14Text(item.thumbnail || (idMatch?.[1] || idMatch?.[2] ? `https://i.ytimg.com/vi/${idMatch?.[1] || idMatch?.[2]}/mqdefault.jpg` : '')), selectedAt:v14Text(item.selectedAt || v14Now())
  };
}
function youtubeReferenceKey(item) { return v14Text(item.id || item.url); }
function renderStep3YoutubeReferences() {
  const custom = ensureStep3CustomBridgeState();
  const selected = custom.selectedReferences || [];
  if (v14El('youtubeReferenceBadge')) v14El('youtubeReferenceBadge').textContent = `${selected.length} IZABRANO`;
  const resultsNode = v14El('step3YoutubeResults');
  if (resultsNode) {
    const results = (custom.youtubeResults || []).slice(0,30);
    resultsNode.innerHTML = results.length ? results.map((item,index) => {
      const ref = normalizeReferenceVideo(item); const key = youtubeReferenceKey(ref); const checked = selected.some(x => youtubeReferenceKey(x) === key);
      const views = ref.viewCount ? `${ref.viewCount.toLocaleString('sr-RS')} pregleda` : 'pregledi nisu dostupni';
      const score = ref.publicMomentumScore ? ` · momentum ${ref.publicMomentumScore}/100` : '';
      return `<article class="youtube-reference-item ${checked?'selected':''}">${ref.thumbnail?`<img src="${v14Xml(ref.thumbnail)}" alt="" loading="lazy"/>`:''}<div><label><input type="checkbox" data-youtube-reference-index="${index}" ${checked?'checked':''}/><strong>${v14Xml(ref.title)}</strong></label><p>${v14Xml(ref.channel || 'YouTube')} · ${views}${score}</p></div><div class="reference-actions"><a href="${v14Xml(ref.url)}" target="_blank" rel="noopener">Otvori spot</a></div></article>`;
    }).join('') : '<div class="mini-status">Rezultati će se pojaviti ovde. Ako lokalna YouTube pretraga ne uspe, ručno dodaj link ili dozvoli privatnom GPT-u da sam pretraži web.</div>';
    resultsNode.querySelectorAll('[data-youtube-reference-index]').forEach(input => input.addEventListener('change', () => toggleYoutubeReference(Number(input.dataset.youtubeReferenceIndex), input.checked)));
  }
  const selectedNode = v14El('step3SelectedReferences');
  if (selectedNode) selectedNode.innerHTML = selected.length ? selected.map((item,index)=>`<div class="selected-reference-chip"><span>${index+1}. ${v14Xml(item.title || item.url)}</span><button type="button" data-remove-youtube-reference="${index}">×</button></div>`).join('') : '<div class="mini-status">Nijedan referentni spot nije izabran.</div>';
  selectedNode?.querySelectorAll('[data-remove-youtube-reference]').forEach(btn=>btn.addEventListener('click',()=>removeYoutubeReference(Number(btn.dataset.removeYoutubeReference))));
}
function toggleYoutubeReference(index, checked) {
  const custom = ensureStep3CustomBridgeState(); const item = custom.youtubeResults[index]; if (!item) return;
  const normalized = normalizeReferenceVideo(item); const key = youtubeReferenceKey(normalized);
  custom.selectedReferences = (custom.selectedReferences || []).filter(x=>youtubeReferenceKey(x)!==key);
  if (checked) {
    if (custom.selectedReferences.length >= 4) { showToast('Možeš izabrati najviše 4 referentna spota.'); renderStep3YoutubeReferences(); return; }
    custom.selectedReferences.push(normalized);
  }
  persistState(false,false); renderStep3YoutubeReferences();
}
function removeYoutubeReference(index) { const custom=ensureStep3CustomBridgeState(); custom.selectedReferences.splice(index,1); persistState(false,false); renderStep3YoutubeReferences(); }
function clearYoutubeReferences() { const custom=ensureStep3CustomBridgeState(); custom.selectedReferences=[]; persistState(false,false); renderStep3YoutubeReferences(); showToast('Izbor YouTube referenci je obrisan.'); }
function autoYoutubeQuery() {
  collectFormState(); const custom=ensureStep3CustomBridgeState();
  const base=[state.genre,state.mood,state.songTitle,custom.spotType==='auto'?'':custom.spotType,custom.spotPrompt.slice(0,100)].filter(Boolean).join(' ');
  const query=`${base || 'emotional pop ballad'} official music video cinematic visual storytelling`.replace(/\s+/g,' ').trim();
  custom.youtubeQuery=query.slice(0,220); if(v14El('step3YoutubeQuery')) v14El('step3YoutubeQuery').value=custom.youtubeQuery; persistState(false,false); return custom.youtubeQuery;
}
async function searchStep3Youtube() {
  const custom=collectStep3CustomBridgeInputs(false); const query=v14Text(v14El('step3YoutubeQuery')?.value)||autoYoutubeQuery();
  const maxResults=Math.max(5,Math.min(30,Number(v14El('step3YoutubeMaxResults')?.value||12)));
  const status=v14El('step3YoutubeSearchStatus'); if(status) status.textContent=`Pretražujem YouTube za: ${query}`;
  try {
    const response=await fetch('/api/research/youtube-search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,maxResults,sort:custom.youtubeSort})});
    const data=await response.json(); if(!response.ok) throw new Error(data.error||'YouTube pretraga nije uspela.');
    custom.youtubeResults=(data.videos||[]).map(normalizeReferenceVideo); custom.youtubeQuery=query; persistState(false,false); renderStep3YoutubeReferences();
    if(status) status.textContent=custom.youtubeResults.length?`Pronađeno ${custom.youtubeResults.length} relevantnih spotova. Izaberi do 4 reference.`:`Nisu pronađeni relevantni spotovi. Promeni upit ili ručno dodaj link.`;
  } catch(error) {
    if(status) status.textContent=`Lokalna YouTube pretraga nije uspela: ${error.message}. Privatni GPT će i dalje dobiti nalog da uradi Web/YouTube search.`;
    showToast(error.message);
  }
}
function addManualYoutubeReference() {
  const custom=ensureStep3CustomBridgeState(); const url=v14Text(v14El('step3ManualYoutubeUrl')?.value); const title=v14Text(v14El('step3ManualYoutubeTitle')?.value)||'Ručna YouTube referenca';
  if(!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)){showToast('Unesi ispravan YouTube link.');return;}
  const ref=normalizeReferenceVideo({url,title,channel:'Ručno dodato'}); const key=youtubeReferenceKey(ref);
  if(custom.selectedReferences.some(x=>youtubeReferenceKey(x)===key)){showToast('Ova referenca je već dodata.');return;}
  if(custom.selectedReferences.length>=4){showToast('Možeš izabrati najviše 4 reference.');return;}
  custom.selectedReferences.push(ref); persistState(false,false); renderStep3YoutubeReferences();
  if(v14El('step3ManualYoutubeUrl'))v14El('step3ManualYoutubeUrl').value=''; if(v14El('step3ManualYoutubeTitle'))v14El('step3ManualYoutubeTitle').value=''; showToast('YouTube referenca je dodata.');
}
function previewCurrentStep3Prompt() {
  collectFormState(); collectStep3CustomBridgeInputs(false); const custom=ensureStep3CustomBridgeState();
  const report={mode:custom.mode,spotType:custom.spotType,visualTone:custom.visualTone,budget:custom.budget,locationPlan:custom.locationPlan,duration:effectiveStep3Duration(custom),estimatedScenes:estimatedPromptImages(custom),selectedYoutubeReferences:custom.selectedReferences.map(x=>({title:x.title,url:x.url})),prompt:custom.spotPrompt||'(nije unet)',songTitle:state.songTitle||'(nije unet)',lyricsLines:parseLyrics(state.lyrics).length,requirements:{imagePrompts:custom.requireImagePrompts,videoPrompts:custom.requireVideoPrompts,youtubeSources:custom.requireYoutubeSources}};
  const node=v14El('step3PromptPreview'); if(node){node.hidden=false;node.textContent=JSON.stringify(report,null,2);} return report;
}
function scenePromptsAvailable() { return (state.scenes||[]).filter(scene=>v14Text(scene.imagePrompt)||v14Text(scene.videoPrompt)); }
function renderStep3PromptGallery() {
  const scenes=scenePromptsAvailable(); const node=v14El('step3PromptGallery');
  if(v14El('step3PromptGalleryBadge'))v14El('step3PromptGalleryBadge').textContent=`${scenes.length} SCENA`;
  if(v14El('step3PromptGallerySummary'))v14El('step3PromptGallerySummary').textContent=scenes.length?`${scenes.length} scena ima promptove. Image: ${scenes.filter(x=>v14Text(x.imagePrompt)).length}; video: ${scenes.filter(x=>v14Text(x.videoPrompt)).length}.`:'Storyboard još nema promptove. Pokreni direktan prompt ili završi Krug 2.';
  if(!node)return; node.innerHTML=scenes.length?scenes.map(scene=>`<details class="prompt-scene-card"><summary>Scena ${Number(scene.number)||'?'} — ${v14Xml(scene.sceneTitle||scene.lyric||'bez naziva')}</summary><div class="prompt-field"><strong>IMAGE PROMPT</strong><textarea readonly rows="6">${v14Xml(scene.imagePrompt||'Nije napravljen')}</textarea><button type="button" data-copy-image-scene="${scene.number}">Kopiraj image prompt</button></div><div class="prompt-field"><strong>VIDEO PROMPT</strong><textarea readonly rows="5">${v14Xml(scene.videoPrompt||'Nije napravljen')}</textarea><button type="button" data-copy-video-scene="${scene.number}">Kopiraj video prompt</button></div></details>`).join(''):'<div class="mini-status">Ovde će se pojaviti image i video promptovi po scenama.</div>';
  node.querySelectorAll('[data-copy-image-scene]').forEach(btn=>btn.addEventListener('click',()=>{const scene=state.scenes.find(x=>Number(x.number)===Number(btn.dataset.copyImageScene));copyText(scene?.imagePrompt||'','Image prompt je kopiran.');}));
  node.querySelectorAll('[data-copy-video-scene]').forEach(btn=>btn.addEventListener('click',()=>{const scene=state.scenes.find(x=>Number(x.number)===Number(btn.dataset.copyVideoScene));copyText(scene?.videoPrompt||'','Video prompt je kopiran.');}));
}
function allPromptText(type) { return (state.scenes||[]).map(scene=>`SCENA ${scene.number} — ${scene.sceneTitle||scene.lyric||''}\n${type==='image'?scene.imagePrompt:scene.videoPrompt}`).filter(text=>!text.endsWith('\n')).join('\n\n---\n\n'); }
function copyAllScenePrompts(type) { const text=allPromptText(type); if(!text)return showToast('Nema promptova za kopiranje.'); copyText(text,type==='image'?'Svi image promptovi su kopirani.':'Svi video promptovi su kopirani.'); }
function exportAllScenePrompts() { const scenes=(state.scenes||[]).map(scene=>({number:scene.number,title:scene.sceneTitle,lyric:scene.lyric,imagePrompt:scene.imagePrompt,videoPrompt:scene.videoPrompt,seed:scene.seed,promptVersion:scene.promptVersion})); if(!scenes.some(x=>x.imagePrompt||x.videoPrompt))return showToast('Nema promptova za izvoz.'); v14Download(JSON.stringify({version:MSS_VERSION,songTitle:state.songTitle,generatedAt:v14Now(),scenes},null,2),`${v14SafeFile(state.songTitle)}-IMAGE-VIDEO-PROMPTOVI.json`,'application/json;charset=utf-8'); }

// ---------- KORAK 3 ----------
function step3FieldValues() {
  return [
    ['Žanr', v14El('step3Genre')?.value], ['Raspoloženje', v14El('step3Mood')?.value],
    ['Glavna priča', v14El('conceptStory')?.value], ['Vizuelni stil', v14El('visualStyle')?.value],
    ['Paleta', v14El('colorPalette')?.value], ['Kamera', v14El('cameraStyle')?.value],
    ['Lokacije', v14El('locations')?.value], ['Centralni simbol', v14El('centralSymbol')?.value],
    ['Početni hook', v14El('openingHook')?.value], ['Završetak', v14El('conceptEnding')?.value]
  ].map(([name, value]) => ({ name, value: v14Text(value) }));
}
function updateStep3Completeness() {
  const values = step3FieldValues();
  const complete = values.filter(item => item.value.length >= (['Žanr', 'Raspoloženje', 'Paleta', 'Kamera'].includes(item.name) ? 4 : 18)).length;
  const badge = v14El('step3CompletenessBadge');
  if (badge) { badge.textContent = `${complete}/10`; badge.classList.toggle('ok', complete === 10); }
  const roundBadge = v14El('step3RoundBadge');
  const completedRound = Number(state.advanced?.step3?.completedRound || 0);
  if (roundBadge) {
    const workflow = state.advanced?.step3?.round2;
    const done = workflow?.completedBatches?.length || 0;
    const total = workflow?.totalBatches || 0;
    const directPrompt = state.advanced?.step3?.custom?.mode === 'prompt-to-spot';
    roundBadge.textContent = directPrompt && !state.selectedIdeaId
      ? 'PROMPT → SPOT'
      : completedRound >= 2 ? 'KRUG 2 GOTOV — PROVERI STORYBOARD'
      : state.selectedIdeaId ? (total ? `KRUG 2 — STORYBOARD ${done}/${total}` : 'KRUG 2 — STORYBOARD')
      : state.creativeIdeas?.length ? 'KRUG 1 GOTOV — IZABERI IDEJU'
      : 'KRUG 1 — 10 IDEJA';
  }
  return { complete, values };
}
function auditStep3(showToastMessage = true) {
  collectFormState(); ensureV14State();
  const { complete, values } = updateStep3Completeness();
  const errors = []; const warnings = []; const ok = [];
  for (const item of values) {
    const min = ['Žanr', 'Raspoloženje', 'Paleta', 'Kamera'].includes(item.name) ? 4 : 18;
    if (item.value.length < min) errors.push(`${item.name}: polje je prazno ili previše kratko.`); else ok.push(item.name);
  }
  const story = v14Text(state.concept.story).toLowerCase();
  const hook = v14Text(state.concept.openingHook).toLowerCase();
  const ending = v14Text(state.concept.ending).toLowerCase();
  const locations = v14Text(state.concept.locations).split(/[,;\n]+/).map(v14Text).filter(Boolean);
  if (locations.length < 3) warnings.push('Lokacije: navedi najmanje 3 prostora sa jasnim razlogom u priči.');
  if (!/3|tri|prv|sekund|odmah|otvara|vidimo/.test(hook)) warnings.push('Hook treba da kaže šta se vidi odmah i šta se menja do 3, 5 i 10 sekundi.');
  if (story && ending && story === ending) warnings.push('Završetak ne sme samo da ponovi početnu situaciju. Potrebna je poslednja konkretna radnja.');
  if (!/(želi|pokušava|traži|čeka|odlazi|vraća|gubi|pronalazi|shvata|odlučuje)/.test(story)) warnings.push('Glavna priča nema jasno izraženu radnju ili promenu glavnog lika.');
  if (state.research?.status !== 'ready' && !(state.research?.webResults?.length || state.research?.youtubeResults?.length)) warnings.push('Real-time istraživanje nije završeno. Ideja može biti dobra, ali nije potvrđena izvorima.');
  if (!state.selectedIdeaId) warnings.push('Nijedna od 10 ideja nije izabrana. Storyboard još ne treba praviti.');
  const report = [
    `KORAK 3: ${complete}/10 popunjeno`,
    '',
    ...(errors.length ? ['BLOKIRA:', ...errors.map(x => `✕ ${x}`), ''] : ['✓ Nema praznih obaveznih odluka.', '']),
    ...(warnings.length ? ['PROVERI:', ...warnings.map(x => `! ${x}`), ''] : ['✓ Nema dodatnih upozorenja.', '']),
    `SPREMNO: ${ok.join(', ') || 'nema'}`
  ].join('\n');
  if (v14El('step3AuditReport')) v14El('step3AuditReport').textContent = report;
  if (showToastMessage) showToast(errors.length ? `Korak 3 nije spreman: ${errors.length} polja.` : warnings.length ? `Korak 3 je popunjen, ali ima ${warnings.length} upozorenja.` : 'Korak 3 je kompletan.');
  persistState(false, false);
  return { complete, errors, warnings, report };
}
function fillStep3FromIdea() {
  const idea = selectedCreativeIdea();
  if (!idea) return showToast('Najpre izaberi jednu od 10 ideja.');
  const values = {
    step3Genre: state.genre || state.concept.genre || '', step3Mood: state.mood || state.concept.mood || '',
    conceptTitle: idea.title || '', conceptStory: `${idea.oneSentence || ''}\n\n${idea.narrativeArc || ''}`.trim(),
    visualStyle: `${idea.visualWorld || ''}${idea.costumeLogic ? `\nKostimi: ${idea.costumeLogic}` : ''}`.trim(),
    colorPalette: idea.colorPalette || '', cameraStyle: idea.cameraGrammar || '',
    locations: (idea.locations || []).map((location, i) => `${location}${idea.locationJustification?.[i] ? ` — ${idea.locationJustification[i]}` : ''}`).join('\n'),
    centralSymbol: `${idea.centralSymbol || ''}${idea.recurringMotif ? `\nRazvoj motiva: ${idea.recurringMotif}` : ''}`.trim(),
    openingHook: idea.hookScene || '', conceptEnding: idea.ending || ''
  };
  for (const [id, value] of Object.entries(values)) if (v14El(id)) v14El(id).value = value;
  collectFormState(); persistState(false, false); updateStep3Completeness(); auditStep3(false); showToast('Deset kreativnih odluka je popunjeno iz izabrane ideje.');
}
function clearStep3() {
  for (const id of ['conceptTitle','conceptStory','visualStyle','colorPalette','cameraStyle','locations','centralSymbol','openingHook','conceptEnding']) if (v14El(id)) v14El(id).value = '';
  collectFormState(); persistState(false, false); updateStep3Completeness(); showToast('Kreativna polja su očišćena. Žanr i raspoloženje su sačuvani.');
}

const MANUAL_GPT_INSTRUCTIONS_V14 = `TI SI PRIVATNI KREATIVNI DIREKTOR ZA MUZIČKI SPOT STUDIO 15.4.

OBAVEZNO:
- Uključen Web search. Actions i OpenAI API NISU potrebni.
- Pročitaj kratak zahtev iz poruke i vrati samo validan JSON. Ne traži Actions ni lokalni server.
- U KRUGU 1 vrati tačno 10 stvarno različitih ideja iz najmanje 8 vizuelnih porodica.
- Najviše jedna ideja sme biti vođena mračnim stanom, a najviše dve telefonom ili porukom.
- Najmanje 3 ideje moraju biti svetle/dnevne, a najmanje 4 javne, spoljašnje, putujuće ili događajne.
- Ne kopiraj tuđe spotove. Aktuelne izvore koristi samo za principe hook-a, montaže, kamere, prostora i thumbnail trenutka.
- U KRUGU 2 ne pravi nove ideje. Vrati concept, detaljan scenes storyboard, youtube i qualityAudit.
- Kompletan lockedGirlIdentity blok mora doslovno početi svaki imagePrompt i svaki videoPrompt. Ne skraćuj, ne prepričavaj i ne menjaj nijednu osobinu.
- Vrati bez markdowna i bez bilo kakvog teksta van JSON objekta.`

function compactNumber(value, digits = 3) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : 0;
}
function compactText(value, max = 1200) { return v14Text(value).slice(0, max); }
function downsampleEnergyCurve(values, duration, maxPoints = 32) {
  const curve = Array.isArray(values) ? values.map(Number).filter(Number.isFinite) : [];
  if (!curve.length) return [];
  const count = Math.min(maxPoints, curve.length);
  const bucket = curve.length / count;
  const output = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor(i * bucket);
    const to = Math.max(from + 1, Math.floor((i + 1) * bucket));
    const part = curve.slice(from, to);
    const energy = part.reduce((sum, value) => sum + value, 0) / Math.max(1, part.length);
    output.push({
      time: compactNumber((Number(duration) || 0) * (i / Math.max(1, count - 1)), 2),
      energy: compactNumber(energy, 3)
    });
  }
  return output;
}
function compactSource(item, sourceType = '') {
  return {
    sourceType: sourceType || item?.type || '',
    title: compactText(item?.title, 220),
    url: compactText(item?.url, 1000),
    finding: compactText(item?.finding || item?.snippet || item?.description, 320),
    channel: compactText(item?.channel, 120),
    duration: compactNumber(item?.duration, 1),
    views: Number(item?.viewCount || item?.views || 0),
    publicMomentumScore: Number(item?.publicMomentumScore || 0),
    query: compactText(item?.query, 180)
  };
}
function compactChannelAnalysis(report) {
  return (report?.channels || []).slice(0, 2).map(channel => ({
    title: channel.title,
    handle: channel.handle,
    sourceMode: channel.sourceMode,
    sample: channel.sample,
    medians: channel.medians,
    titleSignals: (channel.titleSignals || []).slice(0, 5).map(item => ({ name: item.name, count: item.count })),
    topPublicMomentum: (channel.topPublicMomentum || []).slice(0, 8).map(item => ({
      title: compactText(item.title, 180),
      url: compactText(item.url, 600),
      format: item.format || '',
      duration: compactNumber(item.duration, 1),
      views: Number(item.views || item.viewCount || 0),
      viewsPerDay: compactNumber(item.viewsPerDay, 1),
      publicMomentumScore: Number(item.publicMomentumScore || 0)
    }))
  }));
}
function compactReferenceAnalysis(item) {
  return {
    name: compactText(item?.name || item?.fileName || item?.title, 180),
    duration: compactNumber(item?.duration, 2),
    detectedScenes: Number(item?.detectedScenes || item?.sceneCount || item?.cuts?.length || 0),
    averageShotDuration: compactNumber(item?.averageShotDuration || item?.averageSceneDuration, 2),
    medianShotDuration: compactNumber(item?.medianShotDuration || item?.medianSceneDuration, 2),
    shortestShot: compactNumber(item?.shortestShot || item?.shortestScene, 2),
    longestShot: compactNumber(item?.longestShot || item?.longestScene, 2),
    editPace: compactText(item?.editPace || item?.tempo || item?.pace, 100),
    brightPct: compactNumber(item?.brightPct || item?.lightScenePct, 1),
    darkPct: compactNumber(item?.darkPct || item?.darkScenePct, 1),
    cutTimes: (item?.cutTimes || item?.cuts || []).slice(0, 40).map(value => compactNumber(typeof value === 'object' ? value.time || value.start : value, 2))
  };
}
const PROMPT_SOURCE_NEGATIVE = /dead by daylight|\bbhvr\b|cosmetic contest|contest rules|community contest|giveaway|gameplay|gaming|video game|killer and survivor|nursery rhymes|kids songs|full movie|movie recap|reaction video|walkthrough|how to play|tournament|patch notes|forum contest|cosplay contest/i;
const PROMPT_SOURCE_POSITIVE = /music video|muzički spot|muzicki spot|official video|lyric video|official music|cinematograph|visual storytelling|video treatment|storyboard|camera movement|editing rhythm|montaž|balad|love song|emotional song|pesm|music production|music filmmaking|music visuals/i;
function relevantPromptSource(item) {
  const text = [item?.title, item?.snippet, item?.description, item?.finding, item?.query, item?.channelTitle].filter(Boolean).join(' ');
  return Boolean(text) && !PROMPT_SOURCE_NEGATIVE.test(text) && PROMPT_SOURCE_POSITIVE.test(text);
}
function compactResearchForPrompt(research) {
  const value = research || {};
  const dna = value.channelDna || {};
  return {
    sourceMode: 'private-gpt-live-web-search',
    targetChannels: ['@nedostajespunooo91', '@nedostajespunoo91pesme'],
    channelAnalysis: compactChannelAnalysis(value.channelAnalysis),
    channelDna: {
      brandDna: dna.brandDna || {},
      visualFamilies: (dna.visualFamilies || []).slice(0, 10),
      referenceVideos: (dna.referenceVideos || []).slice(0, 4)
    },
    referenceVideoAnalyses: (value.referenceVideoAnalyses || []).slice(0, 4).map(compactReferenceAnalysis),
    instruction: 'Uradi sopstveni aktuelni Web search. Ne koristi sirove lokalne Bing/DuckDuckGo rezultate kao dokaz.'
  };
}
function resetRound2Workflow() {
  ensureV14State();
  state.advanced.step3.round2 = null;
}
function ensureRound2Workflow() {
  ensureV14State();
  if (!state.selectedIdeaId) return null;
  if (!state.scenes?.length && typeof buildStoryboard === 'function') buildStoryboard();
  const fingerprint = currentSongFingerprint();
  const sceneCount = state.scenes?.length || 0;
  const totalBatches = Math.max(1, Math.ceil(sceneCount / ROUND2_BATCH_SIZE));
  const current = state.advanced.step3.round2;
  if (!current || current.fingerprint !== fingerprint || current.selectedIdeaId !== state.selectedIdeaId || current.sceneCount !== sceneCount) {
    state.advanced.step3.round2 = {
      fingerprint, selectedIdeaId:state.selectedIdeaId, sceneCount, batchSize:ROUND2_BATCH_SIZE,
      totalBatches, completedBatches:[], finalDone:false, startedAt:v14Now()
    };
  }
  return state.advanced.step3.round2;
}
function nextRound2Spec() {
  const workflow = ensureRound2Workflow();
  if (!workflow) return null;
  const completed = new Set((workflow.completedBatches || []).map(Number));
  for (let index = 0; index < workflow.totalBatches; index += 1) {
    if (completed.has(index)) continue;
    const start = index * workflow.batchSize;
    const scenes = (state.scenes || []).slice(start, start + workflow.batchSize);
    return { phase:'round2-scenes', batchIndex:index, batchTotal:workflow.totalBatches, sceneNumbers:scenes.map(scene => Number(scene.number)), scenes };
  }
  if (!workflow.finalDone) return { phase:'round2-final', batchIndex:workflow.totalBatches, batchTotal:workflow.totalBatches, sceneNumbers:[], scenes:[] };
  return { phase:'complete', batchIndex:workflow.totalBatches, batchTotal:workflow.totalBatches, sceneNumbers:[], scenes:[] };
}
function filterImportedResearchSources(research) {
  if (!research || typeof research !== 'object') return research;
  const negative = PROMPT_SOURCE_NEGATIVE;
  const sources = (Array.isArray(research.sources) ? research.sources : []).filter(item => {
    const url = v14Text(item?.url);
    const text = [item?.title, item?.finding, item?.sourceType].filter(Boolean).join(' ');
    if (!/^https?:\/\//i.test(url)) return false;
    return !negative.test(text);
  }).slice(0, 20);
  return { ...research, sources };
}

function step3OutputSchema(round, phase = '') {
  if (phase === 'prompt-to-spot') return {
    phase: 'prompt-to-spot',
    research: { searchedAt:'', sources:[{ title:'', url:'https://www.youtube.com/watch?v=...', finding:'', sourceType:'youtube' }], summary:'', visualTechniques:[], rejectedPatterns:[] },
    selectedIdeaId: 'prompt-spot-1',
    concept: { title: '', genre: '', mood: '', story: '', visualStyle: '', colorPalette: '', cameraStyle: '', locations: '', centralSymbol: '', openingHook: '', ending: '' },
    storyPlan: { storySummary: '', whyItFitsSong: '', recommendedSceneCount: 12, estimatedImageCount: 12, imagePromptCount: 12, videoPromptCount: 12, averageSceneDuration: 5, rhythmNote: '', hookNote: '', locationPlan:'' },
    scenes: [{ number: 1, start: 0, end: 5, duration: 5, section: '', lyric: '', lyricMeaning: '', emotion: '', sceneTitle: '', description: '', microMovement: '', location: '', locationReason: '', timeWeather: '', lighting: '', shot: '', lens: '', camera: '', composition: '', foreground: '', midground: '', background: '', atmosphere: '', wardrobe: '', continuityNotes: '', transitionIn: '', transitionOut: '', characterNames: [], referenceTechnique: '', imagePrompt: '', videoPrompt: '', seed: 1, promptVersion: 1 }],
    youtube: { title: '', description: '', hashtags: '', pinned: '', chapters: '', shorts: [{ title: '', start: 0, end: 30, hook: '', cta: '' }] },
    qualityAudit: { hook3: '', hook5: '', hook10: '', continuityWarnings: [], repeatedPatterns: [], sourceCheck: [], promptCountCheck:'' }
  };
  if (round === 1) return {
    research: { searchedAt: '', sources: [{ title: '', url: 'https://...', finding: '' }], summary: '', visualTrends: [], avoidPatterns: [] },
    ideas: [{ id: 'idea-1', title: '', visualFamily: '', oneSentence: '', narrativeArc: '', visualWorld: '', centralSymbol: '', hookScene: '', locations: [], timeWeather: '', colorPalette: '', cameraGrammar: '', costumeLogic: '', recurringMotif: '', ending: '', channelFitReason: '', totalScore: 0 }],
    selectedIdeaId: ''
  };
  if (phase === 'round2-scenes') return {
    phase: 'round2-scenes', selectedIdeaId: '', batchIndex: 0, batchTotal: 1,
    scenes: [{ number: 1, start: 0, end: 5, duration: 5, section: '', lyric: '', lyricMeaning: '', emotion: '', sceneTitle: '', description: '', microMovement: '', location: '', locationReason: '', timeWeather: '', lighting: '', shot: '', lens: '', camera: '', composition: '', foreground: '', midground: '', background: '', atmosphere: '', wardrobe: '', continuityNotes: '', transitionIn: '', transitionOut: '', characterNames: [], imagePrompt: '', videoPrompt: '', seed: 1, promptVersion: 1 }]
  };
  return {
    phase: 'round2-final', selectedIdeaId: '',
    concept: { title: '', genre: '', mood: '', story: '', visualStyle: '', colorPalette: '', cameraStyle: '', locations: '', centralSymbol: '', openingHook: '', ending: '' },
    youtube: { title: '', description: '', hashtags: '', pinned: '', chapters: '', shorts: [{ title: '', start: 0, end: 30, hook: '', cta: '' }] },
    qualityAudit: { hook3: '', hook5: '', hook10: '', continuityWarnings: [], repeatedPatterns: [], sourceCheck: [] }
  };
}

function step3HardRules(round, phase = '') {
  const common = [
    'Ne kopiraj tuđe spotove; koristi samo apstraktne principe.',
    'Ne pretpostavljaj mračan stan, kišu, prozor, telefon ili praznu stolicu samo zato što je pesma tužna.',
    'Lokacija mora imati razlog u stihu ili priči.',
    'Bez teksta, logotipa i watermarka u imagePrompt-u.',
    'Vrati samo validan JSON.'
  ];
  if (phase === 'prompt-to-spot') return [...common,
    'Korisnikov prompt je glavni kreativni brief i ne smeš ga ignorisati.',
    'Vrati jednu kompletnu priču, research sa aktuelnim YouTube referencama, storyPlan, detaljne scenes sa imagePrompt i videoPrompt, youtube i qualityAudit.',
    'Broj scena, recommendedSceneCount, estimatedImageCount, imagePromptCount i videoPromptCount moraju biti usklađeni sa stvarnim brojem scena i trajanjem spota.',
    'Svaka scena mora imati jedinstven, detaljan imagePrompt i videoPrompt kada su zahtevani.',
    'Izabrane YouTube reference koristi samo za apstraktne tehnike; ne kopiraj kadar, glumce, garderobu, radnju ili lokaciju.',
    'Ne vraćaj 10 ideja u ovom režimu.'
  ];
  return round === 1 ? [...common,
    'Vrati tačno 10 ideja iz najmanje 8 različitih visualFamily vrednosti.',
    'Najviše jedna ideja sme biti vođena mračnim stanom i najviše dve telefonom ili porukom.',
    'Najmanje 3 ideje moraju biti svetle/dnevne i najmanje 4 javne, spoljašnje, putujuće ili događajne.',
    'Ne pravi storyboard u Krugu 1.'
  ] : [...common,
    'Ne pravi nove ideje; koristi isključivo selectedIdea.',
    'Kompletan lockedGirlIdentity blok mora doslovno počinjati svaki imagePrompt i svaki videoPrompt.',
    'Isti osnovni tip lokacije najviše 25% storyboarda.',
    'Ne ponavljaj uzastopno radnju, kadar, objektiv, kompoziciju, svetlo ili kameru.',
    'Prve 3 scene moraju imati različite hook mehanizme.'
  ];
}
function step3PackagePayload(jobSpec = null) {
  collectFormState();
  ensureV14State();
  collectStep3CustomBridgeInputs(false);
  const customBridge = ensureStep3CustomBridgeState();
  const directPromptMode = customBridge.mode === 'prompt-to-spot' && customBridge.spotPrompt.length >= 10;
  const round = directPromptMode ? 1 : (state.selectedIdeaId ? 2 : 1);
  const audit = auditStep3(false);
  const idea = selectedCreativeIdea();
  const common = {
    projectId: state.projectId,
    projectFingerprint: currentStep3Fingerprint(),
    name: compactText(state.name, 180),
    songTitle: compactText(state.songTitle || parseLyrics(state.lyrics)?.[0]?.text || 'Nova pesma', 220),
    artistName: compactText(state.artistName, 180),
    format: state.format,
    lyrics: String(state.lyrics || '').slice(0, 12000),
    genre: compactText(state.genre, 120),
    mood: compactText(state.mood, 160),
    audio: {
      duration: compactNumber(state.audio?.duration, 2),
      bpmEstimate: compactNumber(state.audio?.bpmEstimate, 1),
      bpmConfidence: compactNumber(state.audio?.bpmConfidence, 3),
      confirmedBpm: compactNumber(state.audio?.confirmedBpm, 1),
      averageEnergy: compactNumber(state.audio?.averageEnergy, 3),
      beatOffset: compactNumber(state.audio?.beatOffset, 3),
      energyProfile: downsampleEnergyCurve(state.audio?.energyCurve, state.audio?.duration, 8)
    },
    targetChannels: [
      { title: 'Nedostaješ PUNOO', handle: '@nedostajespunooo91' },
      { title: 'Nedostaješ PUNOO pesme', handle: '@nedostajespunoo91pesme' }
    ]
  };
  let project;
  let responseMode;
  let task;
  let outputSchema;
  if (directPromptMode) {
    project = {
      ...common,
      research: compactResearchForPrompt(state.research),
      currentCreativePreferences: {
        visualStyle: state.concept?.visualStyle || '',
        colorPalette: state.concept?.colorPalette || '',
        cameraStyle: state.concept?.cameraStyle || ''
      },
      promptToSpot: {
        prompt: compactText(customBridge.spotPrompt, 5000),
        requestedDuration: effectiveStep3Duration(customBridge),
        maxScenes: Number(customBridge.maxScenes || 16),
        estimatedImageCount: estimatedPromptImages(customBridge),
        spotType: customBridge.spotType,
        visualTone: customBridge.visualTone,
        budget: customBridge.budget,
        locationPlan: customBridge.locationPlan,
        averageShotLength: customBridge.averageShotLength,
        shotMix: customBridge.shotMix,
        requireImagePrompts: customBridge.requireImagePrompts,
        requireVideoPrompts: customBridge.requireVideoPrompts,
        requireYoutubeSources: customBridge.requireYoutubeSources,
        selectedReferences: (customBridge.selectedReferences || []).map(item => ({ title:compactText(item.title,180), url:item.url, channel:compactText(item.channel,100), publicMomentumScore:Number(item.publicMomentumScore||0) })).slice(0,4)
      },
      identityRule: 'Ista zaključana glavna devojka mora ostati potpuno ista. Svaki imagePrompt i videoPrompt mora početi doslovno punim lockedGirlIdentity blokom.',
      lockedGirlIdentity: LOCKED_GIRL_BLOCK
    };
    responseMode = 'prompt-to-spot';
    task = 'Na osnovu korisničkog prompta napravi jedan kompletan video spot: aktuelno YouTube istraživanje, priču, storyPlan, tačan broj scena/slika, detaljan storyboard sa image/video promptovima, YouTube paket i qualityAudit.';
    outputSchema = step3OutputSchema(1, 'prompt-to-spot');
  } else if (round === 1) {
    project = {
      ...common,
      research: compactResearchForPrompt(state.research),
      currentCreativePreferences: {
        visualStyle: state.concept?.visualStyle || '',
        colorPalette: state.concept?.colorPalette || '',
        cameraStyle: state.concept?.cameraStyle || ''
      },
      previousIdeaFingerprints: (state.uniquenessHistory || []).slice(-4).map(item => ({ title: compactText(item?.title, 90), fingerprint: compactText(item?.fingerprint, 100) })),
      creativeBrief: {
        optionalPrompt: customBridge.usePromptInIdeas ? compactText(customBridge.spotPrompt, 3000) : '',
        spotType:customBridge.spotType, visualTone:customBridge.visualTone, budget:customBridge.budget,
        locationPlan:customBridge.locationPlan, shotMix:customBridge.shotMix,
        selectedReferences:(customBridge.selectedReferences||[]).map(item=>({title:compactText(item.title,180),url:item.url,channel:compactText(item.channel,100)})).slice(0,4),
        requireYoutubeSources:customBridge.requireYoutubeSources
      },
      identityRule: 'Ista zaključana glavna devojka mora postojati u svakoj ideji. Ne menjaj njenu starost, lice, kosu, oči, beauty mark ni Mini Mouse tetovažu. Crvena haljina nije obavezna — garderoba mora biti moderna i prilagođena sceni.'
    };
    responseMode = 'research-and-ten-ideas';
    task = 'Aktuelno istraživanje i tačno 10 raznovrsnih ideja; bez storyboarda.';
    outputSchema = step3OutputSchema(1);
  } else {
    const spec = jobSpec || nextRound2Spec();
    const phase = spec?.phase || 'round2-scenes';
    const base = {
      ...common,
      selectedIdeaId: state.selectedIdeaId,
      selectedIdea: idea,
      concept: state.concept,
      step3Audit: audit,
      research: compactResearchForPrompt(state.research)
    };
    if (phase === 'round2-scenes') {
      project = {
        ...base,
        lockedGirlIdentity: LOCKED_GIRL_BLOCK,
        characters: (state.characters || []).map(character => ({ name: character.name, role: character.role, locked: character.locked, negative: character.negative })).slice(0, 6),
        timingMap: (spec.scenes || []).map(scene => ({ number: scene.number, start: compactNumber(scene.start, 3), end: compactNumber(scene.end, 3), duration: compactNumber(scene.duration, 3), section: compactText(scene.section, 80), lyric: compactText(scene.lyric, 500) })),
        batchIndex: spec.batchIndex,
        batchTotal: spec.batchTotal
      };
      responseMode = 'selected-idea-storyboard-batch';
      task = `Detaljno obradi samo storyboard scene iz paketa ${Number(spec.batchIndex) + 1}/${spec.batchTotal}.`;
      outputSchema = step3OutputSchema(2, 'round2-scenes');
    } else {
      project = { ...base, youtubeCurrent: state.youtube || {}, storyboardSummary: { sceneCount:state.scenes.length, firstScenes:state.scenes.slice(0,3).map(scene => ({number:scene.number,lyric:scene.lyric,description:scene.description,location:scene.location})), lastScenes:state.scenes.slice(-3).map(scene => ({number:scene.number,lyric:scene.lyric,description:scene.description,location:scene.location})) } };
      responseMode = 'selected-idea-final-package';
      task = 'Završi concept, YouTube paket i završnu kontrolu kvaliteta; ne vraćaj scenes.';
      outputSchema = step3OutputSchema(2, 'round2-final');
    }
    jobSpec = spec;
  }
  return {
    packageVersion: 'MSS-STEP3-15.4-COMPACT',
    createdAt: v14Now(),
    round,
    phase: directPromptMode ? 'prompt-to-spot' : (round === 1 ? 'round1-ideas' : (jobSpec?.phase || 'round2-scenes')), 
    batchIndex: round === 2 ? jobSpec?.batchIndex ?? null : null,
    batchTotal: round === 2 ? jobSpec?.batchTotal ?? null : null,
    batchSceneNumbers: round === 2 ? (jobSpec?.sceneNumbers || []) : [],
    responseMode,
    task,
    hardRules: step3HardRules(round, directPromptMode ? 'prompt-to-spot' : (round === 1 ? 'round1-ideas' : (jobSpec?.phase || 'round2-scenes'))),
    outputSchema,
    project
  };
}

function exportStep3Package() {
  const payload = step3PackagePayload();
  v14Download(JSON.stringify(payload, null, 2), `${v14SafeFile(state.songTitle || state.name)}-KORAK-3-CHATGPT-PLUS.json`, 'application/json;charset=utf-8');
  const round = payload.phase === 'prompt-to-spot' ? 1 : (state.selectedIdeaId ? 2 : 1);
  state.advanced.step3.lastPackageRound = round;
  persistState(false, false);
  v14El('manualBridgeStatus').textContent = payload.phase === 'prompt-to-spot'
    ? 'Prompt → spot paket je preuzet. Privatni GPT treba da vrati priču, storyPlan, procenu broja slika, kompletan storyboard, image/video promptove, YouTube paket i qualityAudit.'
    : round === 1
      ? 'KRUG 1 paket je preuzet. Učitaj ga u privatni GPT; odgovor mora imati research i tačno 10 ideja, bez storyboarda.'
      : 'KRUG 2 paket je preuzet. Učitaj ga u isti privatni GPT; odgovor treba da sadrži završni concept, scenes, youtube i qualityAudit.';
  if (v14El('step3RoundBadge')) v14El('step3RoundBadge').textContent = round === 1 ? 'KRUG 1 — 10 IDEJA' : 'KRUG 2 — STORYBOARD';
  showToast(`Korak 3 — krug ${round} paket je preuzet.`);
}
async function copyManualGptInstructions() {
  await copyText(MANUAL_GPT_INSTRUCTIONS_V14, 'Instrukcije su kopirane. Nalepi ih u polje Instructions u GPT editoru.');
  window.open(DEFAULT_PRIVATE_GPT_EDITOR_URL, '_blank', 'noopener');
}
async function copyStep3StartPrompt() {
  const custom = ensureStep3CustomBridgeState();
  const text = custom.mode === 'prompt-to-spot'
    ? 'Otvori učitani MSS KORAK 3 JSON. Korisnikov prompt je glavni brief. Uradi aktuelni Web search, osmisli JEDAN kompletan video spot i vrati concept, storyPlan sa procenom koliko scena/slika treba, detaljan scenes storyboard sa image/video promptovima, youtube i qualityAudit. Vrati ISKLJUČIVO validan JSON bez markdowna.'
    : state.selectedIdeaId
      ? 'Otvori učitani MSS KORAK 3 JSON. Ovo je KRUG 2. NE pravi novih 10 ideja. Sačuvaj selectedIdeaId, dovrši concept, detaljan scenes storyboard, hook/continuity QA i kompletan youtube paket. Polje ideas izostavi. Vrati ISKLJUČIVO validan JSON bez markdowna.'
      : 'Otvori učitani MSS KORAK 3 JSON. Uradi aktuelni Web search, vrati research dokaz i tačno 10 potpuno različitih ideja. Ne pravi storyboard dok ne izaberem ideju. Vrati ISKLJUČIVO validan JSON po outputSchema, bez markdowna.';
  await copyText(text, 'START komanda je kopirana.');
}

function plusBridgeSetStatus(message, progress = null, badgeText = '') {
  const report = v14El('plusBridgeStatus');
  if (report) report.textContent = message;
  const bar = v14El('plusBridgeProgress');
  if (bar && progress != null) bar.style.width = `${Math.max(0, Math.min(100, Number(progress) || 0))}%`;
  const badge = v14El('plusBridgeBadge');
  if (badge && badgeText) { badge.textContent = badgeText; badge.classList.toggle('ok', /POVEZAN|SPREMAN|VRAĆEN|VRACEN/.test(badgeText)); }
}
function plusPrivateGptUrl() {
  return DEFAULT_PRIVATE_GPT_URL;
}
function savePlusPrivateGptUrl() {
  state.chatgptBridge ||= {};
  state.chatgptBridge.privateGptUrl = DEFAULT_PRIVATE_GPT_URL;
  const input = v14El('plusPrivateGptUrl');
  if (input) { input.value = DEFAULT_PRIVATE_GPT_URL; input.readOnly = true; }
  persistState(false, false);
  plusBridgeSetStatus(`Tvoj privatni GPT je automatski dodat i otvara se bez ručnog unosa:
${DEFAULT_PRIVATE_GPT_URL}`, 5, 'GPT DODAT');
  window.open(DEFAULT_PRIVATE_GPT_URL, '_blank', 'noopener');
}
async function openPlusExtensionSetup() {
  try {
    const response = await fetch('/api/plus-bridge/open-extension-folder', { method:'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Folder dodatka nije otvoren.');
    plusBridgeSetStatus(`Otvoren je folder dodatka:\n${data.path}\n\nChrome: chrome://extensions\nEdge: edge://extensions\nUključi Developer mode → Load unpacked → izaberi otvoreni folder.`, 5, 'INSTALIRAJ JEDNOM');
  } catch (error) { plusBridgeSetStatus(error.message, 0, 'GREŠKA'); showToast(error.message); }
}
async function testPlusBridge() {
  collectFormState(); ensureV14State();
  const gptUrl = plusPrivateGptUrl();
  const status = await refreshPlusBridgeStatus(false);
  if (!status?.extensionInstalled) {
    plusBridgeSetStatus('TEST NIJE POKRENUT. Browser dodatak nije detektovan. Klikni korak 1 i učitaj folder dodatka.', 10, 'DODATAK NIJE POVEZAN');
    return false;
  }
  const response = await fetch('/api/plus-bridge/test-job', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({gptUrl})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Test mosta nije napravljen.');
  V14.plusJobId = data.job.id;
  state.advanced.step3.plusJobId = data.job.id;
  persistState(false, false);
  plusBridgeSetStatus('TEST ZADATAK JE NAPRAVLJEN. Otvaram tvoj privatni GPT. U panelu klikni „1. UBACI I POŠALJI“, sačekaj odgovor, pa klikni „2. VRATI ODGOVOR“.', 60, 'TEST SPREMAN');
  window.open(gptUrl, '_blank', 'noopener');
  beginPlusBridgePolling();
  return true;
}
window.testPlusBridge = testPlusBridge;
async function cancelPlusBridgeJob(showMessage = true) {
  try {
    const response = await fetch('/api/plus-bridge/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ reason:'Korisnik je otkazao zahtev iz programa.' }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Zahtev nije otkazan.');
    clearInterval(plusBridgePollTimer); plusBridgePollTimer = 0;
    V14.plusJobId = '';
    ensureV14State(); state.advanced.step3.plusJobId = '';
    persistState(false, false);
    plusBridgeSetStatus('Aktivan ChatGPT zahtev je otkazan. Novi zahtev neće sadržati podatke prethodne pesme.', 10, 'ZAHTEV OTKAZAN');
    if (showMessage) showToast('Aktivan ChatGPT zahtev je otkazan.');
    return true;
  } catch (error) {
    if (showMessage) showToast(error.message);
    return false;
  }
}
window.cancelPlusBridgeJob = cancelPlusBridgeJob;
async function runStep3Preflight(showToastMessage = true) {
  collectFormState(); ensureV14State(); collectStep3CustomBridgeInputs(false);
  const custom = ensureStep3CustomBridgeState();
  const checks = [];
  const add = (name, ok, detail) => checks.push({name,ok,detail});
  const directMode = custom.mode === 'prompt-to-spot';
  const lyricParts = parseLyrics(state.lyrics).length;
  add('Tekst pesme', directMode ? true : lyricParts > 0, lyricParts ? `${lyricParts} tekstualnih delova` : directMode ? 'opciono u direktnom prompt režimu' : 'nije dodat');
  add('Audio / trajanje', directMode ? effectiveStep3Duration(custom) >= 15 : Number(state.audio?.duration) > 0, state.audio?.duration ? `${state.audio.duration.toFixed(2)} s audio` : `koristi ${Math.round(effectiveStep3Duration(custom))} s iz podešavanja`);
  add('Projekat', Boolean(state.projectId), state.projectId || 'nema ID');
  add('Fingerprint trenutnog Koraka 3', Boolean(currentStep3Fingerprint()), currentStep3Fingerprint());
  const bridge = await refreshPlusBridgeStatus(false);
  add('Browser dodatak', Boolean(bridge?.extensionInstalled), bridge?.extensionVersion || 'nije detektovan');
  add('Verzija dodatka', Boolean(bridge?.extensionCompatible), `potrebna ${bridge?.expectedExtensionVersion || EXPECTED_PLUS_EXTENSION_VERSION}`);
  add('Lokalna stranica', Boolean(bridge?.localPageConnected), bridge?.localPageLastSeen || 'nema signala');
  add('Privatni GPT link', plusPrivateGptUrl() === DEFAULT_PRIVATE_GPT_URL, DEFAULT_PRIVATE_GPT_ID);
  add('Režim Koraka 3', true, custom.mode === 'prompt-to-spot' ? 'Direktan prompt → spot' : 'Standardni 10 ideja / storyboard');
  if (custom.mode === 'prompt-to-spot') {
    add('Prompt za spot', custom.spotPrompt.length >= 20, `${custom.spotPrompt.length} karaktera • procena ${estimatedPromptImages(custom)} scena/slika`);
    add('Vrsta spota', Boolean(custom.spotType), custom.spotType || 'nije izabrana');
    add('YouTube reference', true, custom.selectedReferences.length ? `${custom.selectedReferences.length} ručno izabrano + obavezan GPT search` : 'GPT će sam uraditi Web/YouTube search');
    add('Image/video promptovi', custom.requireImagePrompts || custom.requireVideoPrompts, `image=${custom.requireImagePrompts?'DA':'NE'}, video=${custom.requireVideoPrompts?'DA':'NE'}`);
  }
  let payload=null, prompt='', spec=null, promptError='';
  try {
    if (state.selectedIdeaId) spec = nextRound2Spec();
    payload = step3PackagePayload(spec);
    prompt = buildPlusBridgePrompt(payload);
  } catch (error) { promptError=error.message; }
  add('Veličina sledećeg zahteva', Boolean(prompt) && prompt.length <= MAX_PLUS_PROMPT_CHARS, prompt ? `${prompt.length} karaktera (${(prompt.length/1024).toFixed(1)} KB)` : promptError);
  if (custom.mode === 'prompt-to-spot') {
    add('Direktan prompt režim', true, `max scena/slika ${custom.maxScenes}`);
  } else if (state.selectedIdeaId) {
    const workflow = ensureRound2Workflow();
    add('Izabrana ideja', Boolean(selectedCreativeIdea()), selectedCreativeIdea()?.title || 'nije pronađena');
    add('Storyboard paketi', Boolean(workflow?.sceneCount), workflow ? `${workflow.completedBatches.length}/${workflow.totalBatches} paketa, ${workflow.sceneCount} scena` : 'nije pripremljeno');
  } else add('Režim', true, 'Krug 1 — 10 ideja');
  const errors = checks.filter(item=>!item.ok);
  const report = [`KORAK 3 — POTPUNA PROVERA ${MSS_VERSION}`, `Vreme: ${new Date().toLocaleString('sr-RS')}`, '', ...checks.map(item => `${item.ok ? '✓' : '✕'} ${item.name}: ${item.detail}`), '', errors.length ? `REZULTAT: NIJE SPREMNO — ${errors.length} blokirajućih stavki.` : 'REZULTAT: SPREMNO ZA SLANJE.'].join('\n');
  const node=v14El('step3PreflightReport'); if(node) node.textContent=report;
  if (showToastMessage) showToast(errors.length ? `Korak 3 nije spreman: ${errors.length} problema.` : 'Korak 3 je spreman.');
  return {ok:!errors.length, checks, payload, prompt};
}
window.runStep3Preflight = runStep3Preflight;
async function downloadStep3Diagnostics() {
  const preflight = await runStep3Preflight(false);
  const bridgeResponse = await fetch('/api/plus-bridge/status', { cache:'no-store' });
  const bridge = await bridgeResponse.json().catch(() => ({}));
  const diagnosticsResponse = await fetch('/api/maintenance/diagnostics', { cache:'no-store' });
  const diagnostics = await diagnosticsResponse.json().catch(() => ({}));
  const safeBridge = { ...bridge };
  delete safeBridge.extensionFolder;
  const report = {
    generatedAt: new Date().toISOString(),
    programVersion: MSS_VERSION,
    expectedExtensionVersion: EXPECTED_PLUS_EXTENSION_VERSION,
    privateGptId: DEFAULT_PRIVATE_GPT_ID,
    project: {
      projectId: state.projectId || '',
      songTitle: state.songTitle || '',
      fingerprint: currentStep3Fingerprint(),
      lyricsParts: parseLyrics(state.lyrics).length,
      audioDuration: Number(state.audio?.duration || 0),
      selectedIdeaId: state.selectedIdeaId || '',
      creativeIdeas: Array.isArray(state.creativeIdeas) ? state.creativeIdeas.length : 0,
      scenes: Array.isArray(state.scenes) ? state.scenes.length : 0,
      savedByUser: state.savedByUser === true
    },
    preflight: { ok:preflight.ok, checks:preflight.checks, promptChars:preflight.prompt?.length || 0 },
    bridge: safeBridge,
    server: {
      ok: diagnostics.ok === true,
      version: diagnostics.version || '',
      node: diagnostics.node || '',
      port: diagnostics.port || 0,
      files: diagnostics.files || [],
      bridgeTokenValid: diagnostics.bridgeTokenValid === true
    },
    note: 'Dijagnostika ne sadrži ChatGPT kolačiće, lozinku, OAuth tokene ni sadržaj tajnog bridge ključa.'
  };
  v14Download(JSON.stringify(report, null, 2), `${safeFileName(state.songTitle || state.name || 'projekat')}-KORAK-3-DIJAGNOSTIKA.json`, 'application/json;charset=utf-8');
  showToast('Dijagnostika Koraka 3 je preuzeta.');
  return report;
}
window.downloadStep3Diagnostics = downloadStep3Diagnostics;
async function resetStep3Workflow() {
  const accepted = typeof confirm !== 'function' || confirm('Resetovati Korak 3? Tekst pesme i audio ostaju, ali ideje, izbor ideje, storyboard i YouTube paket biće obrisani.');
  if (!accepted) return false;
  await cancelPlusBridgeJob(false);
  ensureV14State();
  state.creativeIdeas = [];
  state.selectedIdeaId = '';
  state.ideaSourceFingerprint = '';
  state.ideaGenerationSource = '';
  state.ideaResearch = null;
  state.scenes = [];
  state.youtube = { title:'', description:'', hashtags:'', pinned:'', shorts:[] };
  state.concept = {
    ...state.concept,
    title:'', story:'', locations:'', centralSymbol:'', openingHook:'', ending:'',
    genre:state.genre || '', mood:state.mood || ''
  };
  const preservedCustom = { ...ensureStep3CustomBridgeState(), selectedReferences:[...(ensureStep3CustomBridgeState().selectedReferences||[])], youtubeResults:[...(ensureStep3CustomBridgeState().youtubeResults||[])] };
  state.advanced.step3 = { completedRound:0, plusJobId:'', round2:null, custom:preservedCustom };
  for (const id of ['conceptTitle','conceptStory','locations','centralSymbol','openingHook','conceptEnding']) if (v14El(id)) v14El(id).value='';
  if (v14El('ideasJsonInput')) v14El('ideasJsonInput').value='';
  plusBridgeSetStatus('Korak 3 je resetovan. Tekst pesme i audio su sačuvani; novi zahtev neće sadržati staru ideju ili storyboard.', 0, 'KORAK 3 RESETOVAN');
  persistState(false, false);
  renderResearchPanel(); renderIdeas(); renderStoryboard();
  if (v14El('youtubeTitle')) v14El('youtubeTitle').value='';
  if (v14El('youtubeDescription')) v14El('youtubeDescription').value='';
  if (v14El('youtubeHashtags')) v14El('youtubeHashtags').value='';
  if (v14El('youtubePinned')) v14El('youtubePinned').value='';
  updateStep3Completeness();
  showToast('Korak 3 je resetovan.');
  return true;
}
window.resetStep3Workflow = resetStep3Workflow;
async function refreshPlusBridgeStatus(showMessage = false) {
  try {
    const response = await fetch('/api/plus-bridge/status', { cache:'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Status mosta nije dostupan.');
    const installed = Boolean(data.extensionInstalled);
    const compatible = Boolean(data.extensionCompatible);
    const chatgptConnected = Boolean(data.chatgptTabConnected);
    const localConnected = Boolean(data.localPageConnected);
    const job = data.job;
    const batch = job?.phase === 'round2-scenes' && job.batchTotal ? ` · paket ${Number(job.batchIndex) + 1}/${job.batchTotal}` : '';
    const jobLabel = job ? (job.type === 'test' ? `TEST — ${job.status}` : `${job.phase || `KRUG ${job.round}`}${batch} — ${job.status}`) : 'NEMA';
    const lines = [
      `1. Program: POKRENUT — verzija ${data.version || MSS_VERSION}`,
      `2. Browser dodatak: ${installed ? `DETEKTOVAN (${data.extensionVersion || 'nepoznata verzija'})` : 'NIJE DETEKTOVAN'}`,
      `3. Kompatibilnost: ${compatible ? 'ISPRAVNA' : `NEISPRAVNA — potrebna ${data.expectedExtensionVersion || EXPECTED_PLUS_EXTENSION_VERSION}`}`,
      `4. Stranica programa: ${localConnected ? 'POVEZANA' : 'ČEKA SIGNAL'}`,
      `5. ChatGPT tab: ${chatgptConnected ? 'POVEZAN' : 'NIJE POVEZAN — otvori svoj privatni GPT'}`,
      `6. Privatni GPT: ${DEFAULT_PRIVATE_GPT_ID}`,
      `7. Aktivan zadatak: ${jobLabel}`,
      data.resultReady ? '8. Odgovor: SPREMAN ZA UVOZ' : '',
      '',
      !installed ? 'Učitaj browser dodatak iz foldera ove verzije.' : !compatible ? 'Chrome još koristi stari dodatak. Ukloni ga i učitaj folder dodatka iz verzije 15.4.' : chatgptConnected ? 'Lokalni protokol je spreman. Dodatak koristi nalog u kojem si već prijavljen u otvorenom ChatGPT tabu.' : 'Dodatak je ispravan. Otvori privatni GPT da ChatGPT tab pošalje signal.'
    ].filter(Boolean);
    const progress = data.resultReady ? 95 : job ? 65 : chatgptConnected && compatible ? 50 : compatible ? 30 : 5;
    const badge = compatible && chatgptConnected ? 'MOST SPREMAN' : compatible ? 'DODATAK 15.4 POVEZAN' : installed ? 'POGREŠNA VERZIJA DODATKA' : 'DODATAK NIJE POVEZAN';
    plusBridgeSetStatus(lines.join('\n'), progress, badge);
    if (showMessage) showToast(compatible && chatgptConnected ? 'Program, dodatak 15.4 i otvoreni ChatGPT tab su povezani.' : compatible ? 'Dodatak 15.4 radi; sada otvori privatni GPT.' : installed ? 'Učitana je pogrešna verzija dodatka.' : 'Dodatak nije detektovan.');
    return data;
  } catch (error) {
    plusBridgeSetStatus(`Most nije dostupan: ${error.message}`, 0, 'MOST NIJE DOSTUPAN');
    return null;
  }
}
window.refreshPlusBridgeStatus = refreshPlusBridgeStatus;


// v15.6.0 POPRAVKA: pre ove verzije, svaka grana ove funkcije je na kraju dodavala
// 'Vrati samo JSON:' + JSON.stringify(step3OutputSchema(...)) — sirovu JSON šemu koja se
// prikazivala usred ChatGPT razgovora i izazivala "Hmm...something seems to have gone wrong."
// Sada se prompt gradi isključivo preko bridge-prompts.js (jedini kanonski izvor teksta) —
// prirodan, kratak tekst na srpskom, bez JSON-a i bez programerskih šema.
function buildPlusBridgePrompt(payload) {
  const p = payload.project || {};
  const BP = window.MSS_BRIDGE_PROMPTS;
  let prompt;
  if (payload.phase === 'prompt-to-spot') prompt = BP.buildPromptToSpotPrompt(p);
  else if (payload.phase === 'round2-scenes') prompt = BP.buildStoryboardBatchPrompt(p, payload);
  else if (payload.phase === 'round2-final') prompt = BP.buildFinalPackagePrompt(p);
  else prompt = BP.buildRound1Prompt(p);

  if (prompt.length > MAX_PLUS_PROMPT_CHARS) throw new Error(`Zahtev je prevelik (${Math.ceil(prompt.length / 1024)} KB). Program ga neće poslati.`);
  return prompt;
}
function buildPlusBridgeFallbackPrompt(payload) {
  // Kratak ponovni pokušaj (PROMPT 10) — koristi se posle ChatGPT greške, ne ponavlja
  // istraživanje ni ceo tekst pesme. I OVDE, kao i u glavnom prompt-u, više NEMA JSON šeme.
  const p = payload.project || {};
  const BP = window.MSS_BRIDGE_PROMPTS;
  const task = payload.phase === 'prompt-to-spot'
    ? 'Napravi jedan kompletan video spot: koncept, plan priče, scene sa image/video promptovima, YouTube paket i kontrolu kvaliteta. Koristi iste naslove i oznake kao u originalnom zadatku.'
    : 'Uradi istraživanje i napiši tačno 10 kratkih, različitih ideja za spot, bez storyboarda. Koristi iste naslove i oznake kao u originalnom zadatku (MSS ODGOVOR — KRUG 1, IDEJA 1...IDEJA 10).';
  const minimalData = joinPlusBridgeLines([
    `Pesma: ${p.songTitle || 'Nova pesma'}`,
    payload.phase === 'prompt-to-spot' && p.promptToSpot?.prompt ? `Prompt: ${p.promptToSpot.prompt}` : '',
    p.creativeBrief?.optionalPrompt ? `Dodatni prompt: ${p.creativeBrief.optionalPrompt}` : '',
    `Tekst:\n${String(p.lyrics || '').slice(0, 6000)}`
  ]);
  return BP.buildShortRetryPrompt(task, minimalData);
}
function joinPlusBridgeLines(lines) { return lines.filter(Boolean).join('\n'); }


let plusBridgePollTimer = 0;
async function pollPlusBridgeResult(showWaiting = false) {
  const jobId = V14.plusJobId || state.advanced?.step3?.plusJobId || '';
  if (!jobId) { if (showWaiting) showToast('Nema aktivnog ChatGPT Plus zahteva.'); return false; }
  try {
    const response = await fetch(`/api/plus-bridge/result?jobId=${encodeURIComponent(jobId)}`, { cache:'no-store' });
    const data = await response.json();
    if (response.status === 404 || !data.ready) {
      if (showWaiting) plusBridgeSetStatus('ChatGPT odgovor još nije vraćen. Sačekaj da GPT završi, zatim u ChatGPT panelu klikni „VRATI ODGOVOR U PROGRAM“.', 65, 'ČEKA ODGOVOR');
      return false;
    }
    if (!response.ok) throw new Error(data.error || 'Odgovor nije mogao da se preuzme.');
    if (data.result.type === 'test' || Number(data.result.round) === 0) {
      // v15.6.0: test mosta traži i prihvata običnu kratku liniju ("MOST RADI — MSS 15.6.0"),
      // ne JSON — isti razlog kao i za glavni prompt (JSON šema u chat-u izaziva ChatGPT grešku).
      const testResult = window.MSS_BRIDGE_PROMPTS.parseBridgeTestText(data.result.raw || '');
      if (!testResult.ok) throw new Error('ChatGPT nije vratio očekivani test odgovor ("MOST RADI — MSS 15.6.0").');
      await fetch('/api/plus-bridge/consume', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({jobId}) });
      clearInterval(plusBridgePollTimer); plusBridgePollTimer = 0;
      state.advanced.step3.plusJobId = '';
      persistState(false, false);
    plusBridgeSetStatus('MOST RADI. Program, browser dodatak 15.6 i tvoj otvoreni ChatGPT tab uspešno su razmenili test zahtev i odgovor.', 100, 'MOST RADI');
      showToast('ChatGPT most radi.');
      return true;
    }
    if (data.result.projectId !== state.projectId) throw new Error('Odgovor pripada drugom projektu. Nije uvezen.');
    if (data.result.projectFingerprint && data.result.projectFingerprint !== currentStep3Fingerprint()) throw new Error('Odgovor pripada staroj verziji pesme. Nije uvezen.');
    V14.plusImportSource = 'chatgpt-plus-browser-bridge';
    const importResult = applyGptResponse(data.result.raw, data.result);
    V14.plusImportSource = '';
    await fetch('/api/plus-bridge/consume', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({jobId}) });
    clearInterval(plusBridgePollTimer); plusBridgePollTimer = 0;
    state.advanced.step3.plusJobId = '';
    persistState(false, false);
    if (importResult?.phase === 'prompt-to-spot') {
      plusBridgeSetStatus(`Direktan prompt je završen: ${state.scenes.length} scena, image/video promptovi, YouTube reference i paket za objavu su uvezeni.`, 100, 'PROMPT → SPOT GOTOV');
      renderStep3PromptGallery();
    } else if (importResult?.phase === 'round2-scenes') {
      const workflow = state.advanced.step3.round2;
      const done = workflow?.completedBatches?.length || 0;
      const total = workflow?.totalBatches || 0;
      plusBridgeSetStatus(`Storyboard paket ${done}/${total} je vraćen i uvezen. Klikni ponovo „POKRENI KORAK 3“ za sledeći paket. Kada svi paketi budu završeni, program traži samo završni YouTube/QA paket.`, 55 + Math.round((done / Math.max(1,total)) * 35), `PAKET ${done}/${total}`);
    } else if (importResult?.phase === 'round2-final') {
      plusBridgeSetStatus('Korak 3 je kompletno završen: svi storyboard paketi, koncept, YouTube paket i kontrola kvaliteta su uvezeni.', 100, 'KORAK 3 GOTOV');
    } else {
      plusBridgeSetStatus('KRUG 1 je završen. Izaberi jednu od 10 ideja, zatim ponovo pokreni Korak 3 za storyboard pakete.', 100, '10 IDEJA UVEZENO');
    }
    return true;
  } catch (error) {
    V14.plusImportSource = '';
    plusBridgeSetStatus(`Odgovor je pronađen, ali uvoz nije uspeo:\n${error.message}\n\nProgram nije izmenio projekat.`, 90, 'ODGOVOR NEPOTPUN');
    if (showWaiting) showToast(error.message);
    return false;
  }
}

function beginPlusBridgePolling() {
  clearInterval(plusBridgePollTimer);
  plusBridgePollTimer = setInterval(() => pollPlusBridgeResult(false), 2500);
  setTimeout(() => { if (plusBridgePollTimer) { clearInterval(plusBridgePollTimer); plusBridgePollTimer = 0; } }, 20 * 60 * 1000);
}
// Izdvojeno iz startPlusBridgeRound tako da i dugme "UREDI TAČAN TEKST" i stvarno slanje
// koriste ISTU logiku za pravljenje payload-a/prompta — nema rizika da pregled i stvarno
// poslat tekst budu različiti.
async function prepareStep3PlusBridgeRequest() {
  collectFormState(); ensureV14State(); collectStep3CustomBridgeInputs(false);
  const custom = ensureStep3CustomBridgeState();
  const directPromptMode = custom.mode === 'prompt-to-spot';
  if (!directPromptMode && !parseLyrics(state.lyrics).length) { plusBridgeSetStatus('ZADATAK NIJE NAPRAVLJEN. U standardnom režimu u KORAKU 1 nalepi kompletan tekst pesme.', 5, 'NEDOSTAJE TEKST PESME'); showToast('U standardnom režimu nedostaje tekst pesme.'); showPanel('project'); return null; }
  if (directPromptMode && custom.spotPrompt.length < 20) { plusBridgeSetStatus('DIREKTAN PROMPT NIJE NAPRAVLJEN. Upiši detaljan prompt za video spot u Koraku 3.', 8, 'NEDOSTAJE PROMPT'); showToast('Upiši prompt za video spot.'); return null; }
  if (!directPromptMode && state.selectedIdeaId && !selectedCreativeIdea()) { plusBridgeSetStatus('ZADATAK NIJE NAPRAVLJEN. Sačuvan je stari ID ideje koja više ne postoji. Obriši ideje i ponovi KRUG 1.', 5, 'STARA IDEJA'); return null; }
  const round = directPromptMode ? 1 : (state.selectedIdeaId ? 2 : 1);
  let jobSpec = null;
  if (directPromptMode) {
    resetRound2Workflow();
    plusBridgeSetStatus(`Pripremam direktan prompt za spot. GPT treba da vrati priču, storyboard i procenu broja slika (oko ${estimatedPromptImages(custom)}).`, 18, 'PROMPT → SPOT');
  } else if (round === 1) {
    resetRound2Workflow();
    plusBridgeSetStatus('Pripremam kratak zahtev. Privatni GPT radi sopstveni aktuelni Web search bez slanja sirovih lokalnih rezultata.', 18, 'GPT WEB SEARCH');
  } else {
    fillStep3FromIdea();
    const audit = auditStep3(false);
    if (audit.errors.length) { plusBridgeSetStatus(`KRUG 2 NIJE NAPRAVLJEN. Ispravi ${audit.errors.length} blokirajućih grešaka:\n${audit.errors.slice(0,8).map(x => `• ${x}`).join('\n')}`, 10, 'ISPRAVI KORAK 3'); return null; }
    jobSpec = nextRound2Spec();
    if (!jobSpec || jobSpec.phase === 'complete') {
      plusBridgeSetStatus('Korak 3 je već kompletno završen. Za novu obradu izaberi drugu ideju ili obriši ideje i pokreni Krug 1.', 100, 'KORAK 3 GOTOV');
      return { complete: true };
    }
  }
  const status = await refreshPlusBridgeStatus(false);
  if (!status?.extensionInstalled) throw new Error('Browser dodatak nije detektovan. Učitaj dodatak iz foldera verzije 15.6.');
  if (!status?.extensionCompatible) throw new Error(`Chrome koristi dodatak ${status?.extensionVersion || 'nepoznate verzije'}. Potrebna je verzija ${EXPECTED_PLUS_EXTENSION_VERSION}.`);
  const gptUrl = plusPrivateGptUrl();
  const payload = step3PackagePayload(jobSpec);
  const prompt = buildPlusBridgePrompt(payload);
  const phaseLabel = payload.phase === 'prompt-to-spot' ? 'PROMPT → SPOT' : payload.phase === 'round2-scenes' ? `STORYBOARD ${Number(payload.batchIndex)+1}/${payload.batchTotal}` : payload.phase === 'round2-final' ? 'ZAVRŠNI YOUTUBE + QA' : '10 IDEJA';
  return { round, payload, prompt, phaseLabel, gptUrl };
}

let step3FullPromptManualEdit = false;

async function openStep3FullPromptEditor() {
  const btn = v14El('editStep3FullPromptBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'PRIPREMAM…'; }
  try {
    const prepared = await prepareStep3PlusBridgeRequest();
    if (!prepared || prepared.complete) return;
    const editor = v14El('step3FullPromptEditor');
    if (editor) { editor.value = prepared.prompt; editor.hidden = false; }
    if (v14El('step3FullPromptHint')) v14El('step3FullPromptHint').hidden = false;
    if (v14El('resetStep3FullPromptBtn')) v14El('resetStep3FullPromptBtn').hidden = false;
    step3FullPromptManualEdit = false;
  } catch (error) {
    showToast(error.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'PRIKAŽI I UREDI TAČAN TEKST ZA CHATGPT'; }
  }
}

async function startPlusBridgeRound(options = {}) {
  const prepared = await prepareStep3PlusBridgeRequest();
  if (!prepared) return false;
  if (prepared.complete) return true;
  const { round, payload, phaseLabel, gptUrl } = prepared;
  let prompt = prepared.prompt;
  const editor = v14El('step3FullPromptEditor');
  if (editor && !editor.hidden && step3FullPromptManualEdit && editor.value.trim()) prompt = editor.value.trim();
  const promptKb = (prompt.length / 1024).toFixed(1);
  plusBridgeSetStatus(`Pripremam ${phaseLabel}. ${step3FullPromptManualEdit ? 'Koristim ručno izmenjen tekst' : 'Provereni zahtev'}: ${promptKb} KB. Otvaram tvoj privatni GPT…`, 35, phaseLabel);
  const response = await fetch('/api/plus-bridge/job', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ round, phase:payload.phase, batchIndex:payload.batchIndex, batchTotal:payload.batchTotal, batchSceneNumbers:payload.batchSceneNumbers, projectId:state.projectId, projectFingerprint:currentStep3Fingerprint(), songTitle:state.songTitle || payload.project.songTitle, gptUrl, prompt, fallbackPrompt: (round === 1 || payload.phase === 'prompt-to-spot') ? buildPlusBridgeFallbackPrompt(payload) : '', promptChars:prompt.length, payload })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'ChatGPT Plus zahtev nije napravljen.');
  V14.plusJobId = data.job.id;
  state.advanced.step3.plusJobId = data.job.id;
  state.advanced.step3.activeProjectFingerprint = currentStep3Fingerprint();
  state.advanced.step3.lastPackageRound = round;
  persistState(false, false);
  plusBridgeSetStatus(`${phaseLabel} je poslat lokalnom dodatku.\n\nU ChatGPT panelu klikni:\n1. UBACI I POŠALJI U CHATGPT\n2. Kada GPT završi — VRATI ODGOVOR U PROGRAM`, 50, 'OTVARAM CHATGPT');
  window.open(gptUrl, '_blank', 'noopener');
  beginPlusBridgePolling();
  step3FullPromptManualEdit = false;
  return true;
}

window.startPlusBridgeRound = startPlusBridgeRound;

function normalizeV14Scene(input, index, previousEnd) {
  const start = Number.isFinite(Number(input.start)) ? Number(input.start) : previousEnd;
  let duration = Number(input.duration);
  if (!(duration > 0)) duration = Number(input.end) > start ? Number(input.end) - start : Number(state.sceneDuration || 5);
  const end = start + Math.max(0.25, duration);
  const scene = {
    id: v14Text(input.id) || uuid(), number: index + 1, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), duration: Number((end - start).toFixed(3)),
    section: v14Text(input.section), lyric: v14Text(input.lyric), lyricMeaning: v14Text(input.lyricMeaning), emotion: v14Text(input.emotion),
    sceneTitle: v14Text(input.sceneTitle || input.title || `Scena ${index + 1}`), description: v14Text(input.description || input.action), microMovement: v14Text(input.microMovement),
    location: v14Text(input.location), locationReason: v14Text(input.locationReason), timeWeather: v14Text(input.timeWeather), lighting: v14Text(input.lighting),
    shot: v14Text(input.shot), lens: v14Text(input.lens), camera: v14Text(input.camera), composition: v14Text(input.composition),
    foreground: v14Text(input.foreground), midground: v14Text(input.midground), background: v14Text(input.background), atmosphere: v14Text(input.atmosphere),
    wardrobe: v14Text(input.wardrobe), continuityNotes: v14Text(input.continuityNotes), transitionIn: v14Text(input.transitionIn), transitionOut: v14Text(input.transitionOut),
    characterNames: Array.isArray(input.characterNames) ? input.characterNames : [DEFAULT_GIRL.name], visualSignature: v14Text(input.visualSignature),
    imagePrompt: v14Text(input.imagePrompt), videoPrompt: v14Text(input.videoPrompt),
    seed: Number(input.seed || 0), promptVersion: Number(input.promptVersion || 1), promptHistory: Array.isArray(input.promptHistory) ? input.promptHistory : []
  };
  if (!scene.seed) scene.seed = deterministicSceneSeed(scene);
  return scene;
}
function validateTenIdeaDiversity(ideas) {
  if (!Array.isArray(ideas) || ideas.length !== 10) return;
  const normalized = ideas.map((idea, index) => normalizeCreativeIdea(idea, index));
  const families = normalized.map(idea => v14Text(idea.visualFamily).toLocaleLowerCase('sr-RS')).filter(Boolean);
  const uniqueFamilies = new Set(families);
  if (families.length < 10) throw new Error('Svaka ideja mora imati polje visualFamily. GPT odgovor je nepotpun.');
  if (uniqueFamilies.size < 8) throw new Error(`Ideje koriste samo ${uniqueFamilies.size} vizuelnih porodica. Potrebno je najmanje 8 da spotovi ne budu isti.`);
  const darkApartment = normalized.filter(idea => {
    const family = idea.visualFamily.toLocaleLowerCase('sr-RS');
    const locations = (idea.locations || []).join(' ').toLocaleLowerCase('sr-RS');
    const world = idea.visualWorld.toLocaleLowerCase('sr-RS');
    return /dark-apartment|mračan stan|mracan stan/.test(family) || (/(stan|soba|apartman)/.test(locations) && /(mrač|mrac|dark|noć|noc)/.test(world) && (idea.locations || []).length <= 3);
  });
  if (darkApartment.length > 1) throw new Error(`GPT je vratio ${darkApartment.length} ideje vođene mračnim stanom. Dozvoljena je najviše jedna.`);
  const phoneLed = normalized.filter(idea => /telefon|poruk|message|phone/.test(`${idea.centralSymbol} ${idea.hookScene}`.toLocaleLowerCase('sr-RS')));
  if (phoneLed.length > 2) throw new Error(`GPT je vratio ${phoneLed.length} ideje vođene telefonom/porukom. Dozvoljene su najviše dve.`);
  const symbols = normalized.map(idea => idea.centralSymbol.toLocaleLowerCase('sr-RS').replace(/[^a-z0-9čćžšđ]+/gi,' ').trim()).filter(Boolean);
  if (new Set(symbols).size < 8) throw new Error('Centralni simboli se previše ponavljaju. Potrebno je najmanje 8 različitih simbola u 10 ideja.');
  const bright = normalized.filter(idea => /day|dnev|jutr|sun|svetl|bright|belo|white|letnj|obala|polje/.test(`${idea.visualFamily} ${idea.timeWeather} ${idea.visualWorld}`.toLocaleLowerCase('sr-RS')));
  if (bright.length < 3) throw new Error(`Samo ${bright.length} ideje imaju svetao/dnevni svet. Potrebne su najmanje 3.`);
  const activePublic = normalized.filter(idea => /public|javn|ulic|grad|put|road|transit|stanic|festival|park|obala|rural|prirod|event|događ|dogadj|trg|pijac|voz|autobus/.test(`${idea.visualFamily} ${(idea.locations||[]).join(' ')}`.toLocaleLowerCase('sr-RS')));
  if (activePublic.length < 4) throw new Error(`Samo ${activePublic.length} ideje imaju javnu, spoljašnju, putujuću ili događajnu radnju. Potrebne su najmanje 4.`);
}

function validateDetailedScene(scene, expectedNumber) {
  const number = Number(scene?.number);
  if (number !== Number(expectedNumber)) throw new Error(`Očekivana je scena ${expectedNumber}, a GPT je vratio ${number || 'bez broja'}.`);
  const required = ['description','location','locationReason','shot','camera','composition','imagePrompt','videoPrompt'];
  const missing = required.filter(key => v14Text(scene?.[key]).length < (key.includes('Prompt') ? 80 : 4));
  if (missing.length) throw new Error(`Scena ${expectedNumber} nije kompletna. Nedostaje: ${missing.join(', ')}.`);
}
function mergeRound2SceneBatch(scenes, meta) {
  const expected = Array.isArray(meta?.batchSceneNumbers) ? meta.batchSceneNumbers.map(Number) : [];
  if (!expected.length) throw new Error('Server nije sačuvao brojeve scena za ovaj paket.');
  if (!Array.isArray(scenes) || scenes.length !== expected.length) throw new Error(`Storyboard paket mora imati tačno ${expected.length} scena.`);
  const byNumber = new Map(scenes.map(scene => [Number(scene.number), scene]));
  for (const number of expected) {
    const input = byNumber.get(number);
    if (!input) throw new Error(`Nedostaje scena ${number} u vraćenom paketu.`);
    validateDetailedScene(input, number);
    const index = (state.scenes || []).findIndex(scene => Number(scene.number) === number);
    if (index < 0) throw new Error(`Osnovna vremenska scena ${number} više ne postoji u projektu.`);
    const base = state.scenes[index];
    const normalized = normalizeV14Scene(input, index, base.start);
    state.scenes[index] = {
      ...base, ...normalized,
      id:base.id, number:base.number, start:base.start, end:base.end, duration:base.duration,
      section:base.section, lyric:base.lyric,
      characterIds:[...new Set([LOCKED_GIRL_ID, ...(base.characterIds || [])])]
    };
  }
  const workflow = ensureRound2Workflow();
  const batchIndex = Number(meta.batchIndex);
  workflow.completedBatches = [...new Set([...(workflow.completedBatches || []).map(Number), batchIndex])].sort((a,b)=>a-b);
  state.advanced.step3.completedRound = 1;
  state.advanced.step3.lastImportAt = v14Now();
  ensureLockedGirlEverywhere();
  persistState(false, false); renderStoryboard(); renderStep3PromptGallery(); updateStep3Completeness();
  showToast(`Uvezen storyboard paket ${batchIndex + 1}/${workflow.totalBatches}.`);
  return { phase:'round2-scenes', batchIndex, batchTotal:workflow.totalBatches };
}

function buildIdeaFromPromptSpot(result) {
  const concept = result.concept || {};
  const storyPlan = result.storyPlan || {};
  const locations = String(concept.locations || '').split(/[\n,;]+/).map(v14Text).filter(Boolean).slice(0, 8);
  return normalizeCreativeIdea({
    id: v14Text(result.selectedIdeaId) || `prompt-spot-${Date.now()}`,
    title: v14Text(concept.title || state.songTitle || 'Prompt spot'),
    visualFamily: 'prompt-to-spot',
    oneSentence: v14Text(storyPlan.storySummary || concept.story || 'Spot je napravljen direktno iz korisničkog prompta.'),
    narrativeArc: v14Text(concept.story || storyPlan.storySummary || ''),
    visualWorld: v14Text(concept.visualStyle || ''),
    centralSymbol: v14Text(concept.centralSymbol || ''),
    hookScene: v14Text(concept.openingHook || storyPlan.hookNote || ''),
    locations,
    timeWeather: '',
    colorPalette: v14Text(concept.colorPalette || ''),
    cameraGrammar: v14Text(concept.cameraStyle || ''),
    costumeLogic: '',
    recurringMotif: v14Text(concept.centralSymbol || ''),
    ending: v14Text(concept.ending || ''),
    channelFitReason: v14Text(storyPlan.whyItFitsSong || '')
  }, 0);
}
function validateDirectPromptResult(result) {
  const custom = ensureStep3CustomBridgeState();
  if (!result.concept || typeof result.concept !== 'object') throw new Error('Direktan prompt nije vratio concept.');
  if (!result.storyPlan || typeof result.storyPlan !== 'object') throw new Error('Direktan prompt nije vratio storyPlan sa procenom broja scena/slika.');
  const scenes = Array.isArray(result.scenes) ? result.scenes : Array.isArray(result.storyboard) ? result.storyboard : [];
  if (scenes.length < 3) throw new Error('Direktan prompt mora vratiti najmanje 3 scene.');
  if (scenes.length > Number(custom.maxScenes || 16)) throw new Error(`GPT je vratio ${scenes.length} scena, a maksimum je ${custom.maxScenes}.`);
  if (custom.requireYoutubeSources) {
    const sources = Array.isArray(result.research?.sources) ? result.research.sources : [];
    const valid = sources.filter(item=>/^https?:\/\//i.test(v14Text(item?.url)));
    const youtube = valid.filter(item=>/youtube\.com|youtu\.be/i.test(v14Text(item?.url)));
    if (valid.length < 3 || youtube.length < 2) throw new Error(`GPT nije dokazao YouTube istraživanje. Potrebna su najmanje 3 izvora, od toga 2 YouTube linka; vraćeno ${valid.length}/${youtube.length}.`);
  }
  scenes.forEach((scene,index)=>{
    if (v14Text(scene.description || scene.action).length < 12) throw new Error(`Scena ${index+1} nema konkretnu radnju.`);
    if (v14Text(scene.location).length < 3) throw new Error(`Scena ${index+1} nema lokaciju.`);
    if (custom.requireImagePrompts && v14Text(scene.imagePrompt).length < 100) throw new Error(`Scena ${index+1} nema dovoljno detaljan imagePrompt (minimum 100 karaktera).`);
    if (custom.requireVideoPrompts && v14Text(scene.videoPrompt).length < 80) throw new Error(`Scena ${index+1} nema dovoljno detaljan videoPrompt (minimum 80 karaktera).`);
  });
  const count = scenes.length;
  for (const key of ['recommendedSceneCount','estimatedImageCount','imagePromptCount','videoPromptCount']) {
    const value = Number(result.storyPlan?.[key]);
    if (Number.isFinite(value) && value !== count) throw new Error(`storyPlan.${key}=${value}, ali storyboard ima ${count} scena. GPT odgovor nije usklađen.`);
  }
  return scenes;
}
function replaceScenesFromPromptSpot(inputScenes) {
  const custom = ensureStep3CustomBridgeState();
  if (!Array.isArray(inputScenes) || !inputScenes.length) throw new Error('Direktan prompt mora vratiti bar jednu scenu.');
  const limit = Math.max(6, Math.min(36, Number(custom.maxScenes || 16)));
  const source = inputScenes.slice(0, limit);
  const targetDuration = effectiveStep3Duration(custom);
  const rawWeights = source.map(scene => Math.max(.5, Number(scene.duration) || (Number(scene.end) - Number(scene.start)) || 1));
  const sumWeights = rawWeights.reduce((sum,value)=>sum+value,0) || source.length;
  let cursor = 0;
  state.scenes = source.map((scene,index)=>{
    const duration = index === source.length - 1 ? Math.max(.25, targetDuration - cursor) : Math.max(.25, targetDuration * rawWeights[index] / sumWeights);
    const base = { ...scene, start:cursor, duration, end:cursor+duration };
    const normalized = normalizeV14Scene(base,index,cursor);
    normalized.start = Number(cursor.toFixed(3));
    normalized.duration = Number(duration.toFixed(3));
    normalized.end = Number((cursor + duration).toFixed(3));
    normalized.characterIds=[...new Set([LOCKED_GIRL_ID, ...(scene.characterIds || [])])];
    normalized.imagePrompt = withLockedGirlIdentity(normalized.imagePrompt || makeImagePrompt(normalized));
    normalized.videoPrompt = withLockedGirlIdentity(normalized.videoPrompt || makeVideoPrompt(normalized));
    normalized.referenceTechnique=v14Text(scene.referenceTechnique);
    cursor += duration;
    return normalized;
  });
  if (state.scenes.length) {
    const last=state.scenes[state.scenes.length-1];
    last.end=Number(targetDuration.toFixed(3)); last.duration=Number((last.end-last.start).toFixed(3));
  }
  ensureLockedGirlEverywhere();
}


// v15.6.0: glavni tok više ne traži JSON od ChatGPT-a — odgovor se parsira po "MSS ODGOVOR —"
// naslovima preko bridge-prompts.js. Stari JSON.parse tok ostaje SAMO kao compatibility
// fallback za odgovore koji (još) nisu u novom formatu (spec: "ne sme se tražiti JSON glavnim
// tokom, ali stari uvoz može ostati kao fallback").
function applyGptResponse(raw, meta = {}) {
  const BP = window.MSS_BRIDGE_PROMPTS;
  let result;
  if (typeof raw === 'string' && BP && BP.isNaturalTextResponse(raw)) {
    const parsedNatural = BP.parseBridgeResponseText(raw, meta);
    if (!parsedNatural.ok) {
      const details = (parsedNatural.missingFields || []).slice(0, 6).join('; ');
      throw new Error(`Odgovor nije kompletan${details ? `: ${details}` : '.'} Koristi dugme za dopunu da tražiš samo nedostajući deo.`);
    }
    result = parsedNatural.result;
  } else {
    const parsed = typeof raw === 'string' ? extractJson(raw) : raw;
    result = parsed.result || parsed.output || parsed;
  }
  if (!result || typeof result !== 'object') throw new Error('GPT odgovor nije validan JSON objekat.');
  ensureV14State();
  const phase = v14Text(meta.phase || result.phase);
  if (phase === 'round2-scenes') return mergeRound2SceneBatch(Array.isArray(result.scenes) ? result.scenes : result.storyboard, meta);
  if (phase === 'prompt-to-spot') {
    const scenesDirect = validateDirectPromptResult(result);
    snapshotStoryboard('Pre direktnog prompt-to-spot uvoza');
    const idea = buildIdeaFromPromptSpot(result);
    state.creativeIdeas = [idea];
    state.selectedIdeaId = idea.id;
    state.ideaGenerationSource = 'chatgpt-plus-prompt-to-spot';
    state.ideaSourceFingerprint = currentStep3Fingerprint();
    state.concept = { ...state.concept, ...result.concept };
    if (result.research && typeof result.research === 'object') {
      const filtered = filterImportedResearchSources(result.research);
      state.ideaResearch = filtered;
      state.research = { ...(state.research || {}), ...filtered, status:'ready', fetchedAt:filtered.searchedAt || v14Now() };
    }
    if (result.storyPlan && typeof result.storyPlan === 'object') state.advanced.step3.promptSpotPlan = { ...result.storyPlan, recommendedSceneCount:scenesDirect.length, estimatedImageCount:scenesDirect.length, imagePromptCount:scenesDirect.length, videoPromptCount:scenesDirect.length };
    replaceScenesFromPromptSpot(scenesDirect);
    if (result.youtube && typeof result.youtube === 'object') state.youtube = { ...state.youtube, ...result.youtube };
    if (result.qualityAudit) state.advanced.gptQualityAudit = result.qualityAudit;
    resetRound2Workflow();
    state.advanced.step3.completedRound = 2;
    state.advanced.step3.lastImportAt = v14Now();
    persistState(false, false); fillForm(); hydrateStep3CustomBridgeInputs(); renderResearchPanel(); renderIdeas(); renderStoryboard(); renderStep3PromptGallery(); updateStep3Completeness(); auditStep3(false);
    const manualStatus = v14El('manualBridgeStatus');
    if (manualStatus) manualStatus.textContent = `Prompt je pretvoren u kompletan spot: ${state.scenes.length} scena • procena slika ${result.storyPlan?.estimatedImageCount || state.scenes.length}.`;
    const promptStatus = v14El('step3CustomPromptStatus');
    if (promptStatus) promptStatus.textContent = `GPT je vratio kompletan spot. Storyboard: ${state.scenes.length} scena. Procena potrebnih slika: ${result.storyPlan?.estimatedImageCount || state.scenes.length}.`;
    showToast('Direktan prompt je uspešno pretvoren u kompletan spot.');
    return { phase:'prompt-to-spot' };
  }

  snapshotStoryboard('Pre GPT uvoza'); snapshotCaptions('Pre GPT uvoza');
  if (result.research && typeof result.research === 'object') {
    const filtered = filterImportedResearchSources(result.research);
    state.ideaResearch = filtered;
    state.research = { ...(state.research || {}), ...filtered, status: 'ready', fetchedAt: filtered.searchedAt || v14Now() };
  }
  if (result.concept && typeof result.concept === 'object') state.concept = { ...state.concept, ...result.concept };
  const scenes = Array.isArray(result.scenes) ? result.scenes : Array.isArray(result.storyboard) ? result.storyboard : null;
  const ideas = Array.isArray(result.ideas) ? result.ideas : Array.isArray(result.creativeIdeas) ? result.creativeIdeas : null;
  const selectedFromResponse = v14Text(result.selectedIdeaId);

  if (phase === 'round2-final') {
    if (scenes?.length) throw new Error('Završni paket ne sme ponovo da vraća storyboard scene.');
    if (!result.youtube || typeof result.youtube !== 'object') throw new Error('Završni paket nema YouTube podatke.');
    if (!result.qualityAudit || typeof result.qualityAudit !== 'object') throw new Error('Završni paket nema qualityAudit.');
    if (result.youtube && typeof result.youtube === 'object') state.youtube = { ...state.youtube, ...result.youtube };
    state.advanced.gptQualityAudit = result.qualityAudit;
    const workflow = ensureRound2Workflow();
    workflow.finalDone = true;
    state.advanced.step3.completedRound = 2;
    state.advanced.step3.lastImportAt = v14Now();
    persistState(false, false); fillForm(); renderStoryboard(); renderStep3PromptGallery(); updateStep3Completeness(); auditStep3(false);
    const manualStatus = v14El('manualBridgeStatus');
    if (manualStatus) manualStatus.textContent = `KRUG 2 je kompletan: ${state.scenes.length} scena, YouTube paket i završni QA.`;
    showToast('Korak 3 je kompletno završen.');
    return { phase:'round2-final' };
  }

  if (ideas) {
    if (ideas.length !== 10) throw new Error(`GPT je vratio ${ideas.length} ideja. U KRUGU 1 potrebno je tačno 10.`);
    validateTenIdeaDiversity(ideas);
    state.creativeIdeas = ideas.map((idea, index) => normalizeCreativeIdea(idea, index));
    state.ideaGenerationSource = V14.plusImportSource || 'chatgpt-plus-browser-bridge';
    state.ideaSourceFingerprint = currentSongFingerprint();
    state.selectedIdeaId = '';
    state.scenes = [];
    resetRound2Workflow();
    state.advanced.step3.completedRound = 1;
    state.advanced.step3.lastImportAt = v14Now();
  }
  if (selectedFromResponse) state.selectedIdeaId = selectedFromResponse;
  if (scenes?.length) throw new Error('Krug 1 ne sme da vraća storyboard scene.');
  if (result.youtube && typeof result.youtube === 'object') state.youtube = { ...state.youtube, ...result.youtube };
  if (result.qualityAudit) state.advanced.gptQualityAudit = result.qualityAudit;
  ensureLockedGirlEverywhere();
  persistState(false, false); fillForm(); renderResearchPanel(); renderIdeas(); renderStoryboard(); updateStep3Completeness(); auditStep3(false);
  const manualStatus = v14El('manualBridgeStatus');
  if (manualStatus) manualStatus.textContent = `KRUG 1 je uvezen: ${state.creativeIdeas.length} ideja. Izaberi jednu i nastavi na storyboard pakete.`;
  if (v14El('step3RoundBadge')) v14El('step3RoundBadge').textContent = 'KRUG 1 GOTOV — IZABERI IDEJU';
  showToast(`Uvezeno je ${state.creativeIdeas.length} ideja.`);
  return { phase:'round1-ideas' };
}

async function importGptResponseFile(file) { if (!file) return; applyGptResponse(await file.text()); }

// ---------- UNDO / REDO ----------
function snapshotStoryboard(reason = '') {
  const now = Date.now(); if (now - V14.lastSnapshotAt < 250) return;
  V14.lastSnapshotAt = now;
  V14.storyboardUndo.push({ at: v14Now(), reason, scenes: v14JsonClone(state.scenes || []) });
  if (V14.storyboardUndo.length > 40) V14.storyboardUndo.shift();
  V14.storyboardRedo = []; updateUndoButtons();
}
function snapshotCaptions(reason = '') {
  V14.captionsUndo.push({ at: v14Now(), reason, captions: v14JsonClone(state.captions || {}) });
  if (V14.captionsUndo.length > 40) V14.captionsUndo.shift();
  V14.captionsRedo = []; updateUndoButtons();
}
function undoStoryboard() {
  const item = V14.storyboardUndo.pop(); if (!item) return showToast('Nema starije storyboard verzije.');
  V14.storyboardRedo.push({ at: v14Now(), scenes: v14JsonClone(state.scenes || []) }); state.scenes = item.scenes;
  persistState(false, false); renderStoryboard(); updateUndoButtons(); showToast(`Storyboard vraćen${item.reason ? `: ${item.reason}` : ''}.`);
}
function redoStoryboard() {
  const item = V14.storyboardRedo.pop(); if (!item) return showToast('Nema novije storyboard verzije.');
  V14.storyboardUndo.push({ at: v14Now(), scenes: v14JsonClone(state.scenes || []) }); state.scenes = item.scenes;
  persistState(false, false); renderStoryboard(); updateUndoButtons(); showToast('Storyboard promena je ponovljena.');
}
function undoCaptions() {
  const item = V14.captionsUndo.pop(); if (!item) return showToast('Nema starije verzije titlova.');
  V14.captionsRedo.push({ at: v14Now(), captions: v14JsonClone(state.captions || {}) }); state.captions = item.captions;
  persistState(false, false); if (typeof renderCaptions === 'function') renderCaptions(); updateUndoButtons(); showToast('Titlovi su vraćeni.');
}
function redoCaptions() {
  const item = V14.captionsRedo.pop(); if (!item) return showToast('Nema novije verzije titlova.');
  V14.captionsUndo.push({ at: v14Now(), captions: v14JsonClone(state.captions || {}) }); state.captions = item.captions;
  persistState(false, false); if (typeof renderCaptions === 'function') renderCaptions(); updateUndoButtons(); showToast('Promena titlova je ponovljena.');
}
function updateUndoButtons() {
  for (const [id, disabled] of [['undoStoryboardBtn', !V14.storyboardUndo.length], ['redoStoryboardBtn', !V14.storyboardRedo.length], ['undoCaptionsBtn', !V14.captionsUndo.length], ['redoCaptionsBtn', !V14.captionsRedo.length]]) if (v14El(id)) v14El(id).disabled = disabled;
}

// ---------- AUDIO: TIŠINA, LUFS I TRUE PEAK ----------
async function v14AudioBuffer() { return getAudioBuffer(); }
function analyzeSilenceFromBuffer(buffer, thresholdDb = -42, minDuration = 0.28) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const frame = Math.max(128, Math.round(buffer.sampleRate * 0.02));
  const silentFrames = []; const curve = [];
  for (let start = 0; start < buffer.length; start += frame) {
    const end = Math.min(buffer.length, start + frame); let sum = 0; let count = 0;
    for (const channel of channels) for (let i = start; i < end; i += 2) { const sample = channel[i]; sum += sample * sample; count += 1; }
    const rms = Math.sqrt(sum / Math.max(1, count)); const db = 20 * Math.log10(Math.max(1e-9, rms));
    const time = start / buffer.sampleRate; curve.push({ time, db }); silentFrames.push({ time, end: end / buffer.sampleRate, silent: db <= thresholdDb, db });
  }
  const regions = []; let active = null;
  for (const item of silentFrames) {
    if (item.silent && !active) active = { start: item.time, end: item.end, minDb: item.db };
    else if (item.silent && active) { active.end = item.end; active.minDb = Math.min(active.minDb, item.db); }
    else if (!item.silent && active) { if (active.end - active.start >= minDuration) regions.push(active); active = null; }
  }
  if (active && active.end - active.start >= minDuration) regions.push(active);
  return { thresholdDb, minDuration, regions, curve: curve.filter((_, i) => i % 5 === 0), totalSilence: regions.reduce((sum, item) => sum + item.end - item.start, 0) };
}
async function estimateLoudness(buffer) {
  const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = offline.createBufferSource(); source.buffer = buffer;
  const highpass = offline.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 38; highpass.Q.value = 0.5;
  const shelf = offline.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 1500; shelf.gain.value = 4;
  source.connect(highpass).connect(shelf).connect(offline.destination); source.start();
  const weighted = await offline.startRendering();
  const blockSamples = Math.max(1, Math.round(weighted.sampleRate * 0.4)); const hop = Math.max(1, Math.round(weighted.sampleRate * 0.1));
  const blocks = [];
  for (let start = 0; start + blockSamples <= weighted.length; start += hop) {
    let energy = 0;
    for (let c = 0; c < weighted.numberOfChannels; c++) {
      const data = weighted.getChannelData(c); let sum = 0;
      for (let i = start; i < start + blockSamples; i += 4) sum += data[i] * data[i];
      energy += sum / Math.ceil(blockSamples / 4);
    }
    const loudness = -0.691 + 10 * Math.log10(Math.max(1e-12, energy));
    if (loudness > -70) blocks.push({ energy, loudness });
  }
  const ungatedEnergy = blocks.reduce((sum, item) => sum + item.energy, 0) / Math.max(1, blocks.length);
  const ungated = -0.691 + 10 * Math.log10(Math.max(1e-12, ungatedEnergy)); const relativeGate = ungated - 10;
  const gated = blocks.filter(item => item.loudness >= relativeGate);
  const integratedEnergy = gated.reduce((sum, item) => sum + item.energy, 0) / Math.max(1, gated.length);
  const integratedLufs = -0.691 + 10 * Math.log10(Math.max(1e-12, integratedEnergy));
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i], b = data[i + 1];
      peak = Math.max(peak, Math.abs(a), Math.abs(a * .75 + b * .25), Math.abs(a * .5 + b * .5), Math.abs(a * .25 + b * .75));
    }
  }
  const truePeakDbtp = 20 * Math.log10(Math.max(1e-9, peak));
  return { integratedLufs: Number(integratedLufs.toFixed(2)), truePeakDbtp: Number(truePeakDbtp.toFixed(2)), ungatedLufs: Number(ungated.toFixed(2)), blocks: blocks.length, method: 'LITE procena: K-weighting približno + 400 ms blokovi + apsolutni/relativni gate + 4× interpolirani peak' };
}
async function runAudioQc() {
  try {
    const buffer = await v14AudioBuffer();
    if (!buffer) throw new Error('Najpre dodaj i analiziraj audio fajl.');
    const threshold = Number(v14El('silenceThreshold')?.value || -42); const minDuration = Number(v14El('silenceMinDuration')?.value || 0.28);
    const silence = analyzeSilenceFromBuffer(buffer, threshold, minDuration); const loudness = await estimateLoudness(buffer);
    state.advanced.audio = { silenceRegions: silence.regions, silence, loudness, analyzedAt: v14Now() };
    V14.lastAudioReport = state.advanced.audio; persistState(false, false); renderAudioQcReport();
    showToast(`Audio QA završen: ${silence.regions.length} tišina, ${loudness.integratedLufs} LUFS.`);
  } catch (error) { showToast(error.message); }
}
function renderAudioQcReport() {
  const report = v14El('audioQcReport'); if (!report) return;
  const data = state.advanced?.audio; if (!data?.analyzedAt) return;
  const regions = data.silenceRegions || [];
  report.textContent = [
    `PROCENA INTEGRISANE GLASNOĆE: ${data.loudness?.integratedLufs ?? '-'} LUFS`,
    `PROCENA TRUE PEAK-A: ${data.loudness?.truePeakDbtp ?? '-'} dBTP`,
    `TIŠINE: ${regions.length} regiona, ukupno ${(data.silence?.totalSilence || 0).toFixed(2)} s`,
    '',
    ...regions.slice(0, 30).map((item, i) => `${i + 1}. ${secondsToClock(item.start)} → ${secondsToClock(item.end)} (${(item.end - item.start).toFixed(2)} s, minimum ${item.minDb.toFixed(1)} dBFS)`),
    '',
    'NAPOMENA: Browser analiza je korisna kontrola, ali nije sertifikovani broadcast merač. Za finalni master potvrdi FFmpeg loudnorm/ebur128 analizom.'
  ].join('\n');
}
function exportSilenceCsv() {
  const data = state.advanced?.audio?.silenceRegions || []; if (!data.length) return showToast('Najpre pokreni Audio QA.');
  const csv = ['index,start_seconds,end_seconds,duration_seconds,min_dbfs', ...data.map((item, i) => [i + 1, item.start.toFixed(3), item.end.toFixed(3), (item.end - item.start).toFixed(3), item.minDb.toFixed(2)].join(','))].join('\r\n');
  v14Download(csv, `${v14SafeFile(state.songTitle)}-TISINE.csv`, 'text/csv;charset=utf-8');
}

// ---------- TIMELINE EXPORT ----------
function fpsValue() { return Math.max(1, Number(state.settings?.renderFps || 30)); }
function frameNumber(seconds, fps = fpsValue()) { return Math.max(0, Math.round(Number(seconds || 0) * fps)); }
function frameTime(frames, fps = fpsValue()) { return `${frames}/${fps}s`; }
function exportOtio() {
  collectFormState(); const fps = fpsValue();
  const clips = state.scenes.map((scene, index) => ({
    OTIO_SCHEMA: 'Clip.2', name: scene.sceneTitle || `Scena ${index + 1}`,
    metadata: { lyric: scene.lyric || '', description: scene.description || '', seed: scene.seed || deterministicSceneSeed(scene), promptVersion: scene.promptVersion || 1 },
    source_range: { OTIO_SCHEMA: 'TimeRange.1', start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: fps }, duration: { OTIO_SCHEMA: 'RationalTime.1', value: frameNumber(scene.duration, fps), rate: fps } },
    media_reference: { OTIO_SCHEMA: 'ExternalReference.1', target_url: `file:///SCENE-${String(index + 1).padStart(3, '0')}.png`, available_range: null, metadata: {} },
    effects: [], markers: [], enabled: true
  }));
  const otio = { OTIO_SCHEMA: 'Timeline.1', name: state.name || state.songTitle || 'Muzički spot', global_start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: fps }, metadata: { generator: 'Muzički Spot Studio 15.4' }, tracks: { OTIO_SCHEMA: 'Stack.1', name: 'tracks', metadata: {}, effects: [], markers: [], children: [{ OTIO_SCHEMA: 'Track.1', name: 'VIDEO 1', kind: 'Video', metadata: {}, effects: [], markers: [], children: clips }] } };
  v14Download(JSON.stringify(otio, null, 2), `${v14SafeFile(state.songTitle)}.otio`, 'application/json;charset=utf-8');
}
function exportFcpxml(resolveMode = false) {
  collectFormState(); const fps = fpsValue(); const durationFrames = frameNumber(state.audio.duration || state.scenes.at(-1)?.end || 1, fps);
  const resources = state.scenes.map((scene, i) => `<asset id="r${i + 2}" name="SCENE-${String(i + 1).padStart(3, '0')}" start="0s" duration="${frameTime(frameNumber(scene.duration, fps), fps)}" hasVideo="1" format="r1"><media-rep kind="original-media" src="file:///SCENE-${String(i + 1).padStart(3, '0')}.png"/></asset>`).join('');
  const clips = state.scenes.map((scene, i) => `<asset-clip ref="r${i + 2}" name="${v14Xml(scene.sceneTitle || `Scena ${i + 1}`)}" offset="${frameTime(frameNumber(scene.start, fps), fps)}" start="0s" duration="${frameTime(frameNumber(scene.duration, fps), fps)}"><note>${v14Xml([scene.lyric, scene.description, `seed=${scene.seed || deterministicSceneSeed(scene)}`, `promptVersion=${scene.promptVersion || 1}`].filter(Boolean).join(' | '))}</note></asset-clip>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10"><resources><format id="r1" name="FFVideoFormat1080p${fps}" frameDuration="1/${fps}s" width="1920" height="1080"/>${resources}</resources><library><event name="MSS 15.4"><project name="${v14Xml(state.name || state.songTitle)}"><sequence format="r1" duration="${frameTime(durationFrames, fps)}" tcStart="0s" tcFormat="NDF"><spine>${clips}</spine></sequence></project></event></library></fcpxml>`;
  v14Download(xml, `${v14SafeFile(state.songTitle)}-${resolveMode ? 'DAVINCI-RESOLVE' : 'FCPXML'}.fcpxml`, 'application/xml;charset=utf-8');
}
function tc(seconds, fps = fpsValue()) {
  const frames = frameNumber(seconds, fps); const ff = frames % fps; const totalSeconds = Math.floor(frames / fps);
  const ss = totalSeconds % 60; const mm = Math.floor(totalSeconds / 60) % 60; const hh = Math.floor(totalSeconds / 3600);
  return [hh, mm, ss, ff].map(value => String(value).padStart(2, '0')).join(':');
}
function exportResolveEdl() {
  const fps = fpsValue(); const lines = [`TITLE: ${state.songTitle || state.name || 'MUZICKI SPOT'}`, 'FCM: NON-DROP FRAME', ''];
  state.scenes.forEach((scene, index) => {
    const n = String(index + 1).padStart(3, '0'); lines.push(`${n}  SC${n}    V     C        ${tc(0, fps)} ${tc(scene.duration, fps)} ${tc(scene.start, fps)} ${tc(scene.end, fps)}`); lines.push(`* FROM CLIP NAME: SCENE-${n}.png`); lines.push(`* COMMENT: ${(scene.lyric || scene.description || '').replace(/[\r\n]+/g, ' ').slice(0, 180)}`); lines.push('');
  });
  v14Download(lines.join('\r\n'), `${v14SafeFile(state.songTitle)}-DAVINCI-RESOLVE.edl`, 'text/plain;charset=utf-8');
}

// ---------- HOOK, CHAPTERS, YOUTUBE PAKET ----------
function chapterText() {
  const scenes = state.scenes || []; if (!scenes.length) return '';
  const used = new Set(); const items = [];
  scenes.forEach((scene, index) => {
    const section = v14Text(scene.section || scene.sceneTitle || `Scena ${index + 1}`);
    const key = section.toLowerCase();
    if (index === 0 || !used.has(key)) { used.add(key); items.push(`${secondsToClock(index === 0 ? 0 : scene.start)} ${section || `Scena ${index + 1}`}`); }
  });
  if (!items[0]?.startsWith('00:00')) items.unshift('00:00 Početak');
  return items.join('\n');
}
function exportChapters() { const text = chapterText(); if (!text) return showToast('Nema storyboarda.'); v14Download(text, `${v14SafeFile(state.songTitle)}-YOUTUBE-CHAPTERS.txt`); }
function hookAudit() {
  collectFormState();
  const windows = [3, 5, 10].map(seconds => {
    const scenes = state.scenes.filter(scene => scene.start < seconds && scene.end > 0);
    const text = scenes.map(scene => `${scene.description} ${scene.microMovement} ${scene.shot} ${scene.camera} ${scene.location} ${scene.lyric}`).join(' ').toLowerCase();
    const uniqueLocations = new Set(scenes.map(scene => v14Text(scene.location).toLowerCase()).filter(Boolean)).size;
    const uniqueShots = new Set(scenes.map(scene => v14Text(scene.shot).toLowerCase()).filter(Boolean)).size;
    const action = /(otvara|pada|odlazi|ulazi|okreće|briše|lomi|uzima|spušta|zatvara|trči|zastaje|vidi|otkriva|nestaje)/.test(text);
    const question = /(nepoznat|skriven|zašto|ko|poruka|fotograf|vrata|trag|prazn|nedostaje)/.test(text);
    const closeOrDetail = /(close|krup|detalj|macro|insert)/.test(text);
    let score = 20 + Math.min(25, scenes.length * 8) + Math.min(15, uniqueLocations * 5) + Math.min(15, uniqueShots * 5) + (action ? 15 : 0) + (question ? 7 : 0) + (closeOrDetail ? 3 : 0);
    score = Math.min(100, score);
    const warnings = [];
    if (!action) warnings.push('nema jasne radnje'); if (!question) warnings.push('nema otvorenog pitanja/iznenađenja'); if (uniqueShots < Math.min(2, scenes.length)) warnings.push('premalo promene kadra');
    return { seconds, score, sceneCount: scenes.length, uniqueLocations, uniqueShots, warnings };
  });
  const audit = { createdAt: v14Now(), windows, openingHook: state.concept.openingHook || '' }; state.advanced.hookAudit = audit; persistState(false, false);
  const report = windows.map(item => `${item.seconds} s: ${item.score}/100 • ${item.sceneCount} scena • ${item.uniqueShots} tipova kadra${item.warnings.length ? ` • PROVERI: ${item.warnings.join(', ')}` : ' • DOBRO'}`).join('\n');
  if (v14El('hookAuditReport')) v14El('hookAuditReport').textContent = report; showToast(`Hook audit: 3s ${windows[0].score}, 5s ${windows[1].score}, 10s ${windows[2].score}.`); return audit;
}
async function exportYoutubePackage() {
  collectFormState(); const audit = hookAudit(); const chapters = chapterText();
  const metadata = { version: '15.4', generatedAt: v14Now(), project: { name: state.name, songTitle: state.songTitle, artistName: state.artistName, format: state.format }, youtube: { ...state.youtube, chapters }, hookAudit: audit, audioQc: state.advanced?.audio || null, storyboardSceneCount: state.scenes.length };
  if (window.JSZip) {
    const zip = new JSZip(); zip.file('01-NASLOV.txt', state.youtube.title || state.songTitle || ''); zip.file('02-OPIS.txt', `${state.youtube.description || ''}\n\n${chapters}`.trim()); zip.file('03-HASHTAGOVI.txt', state.youtube.hashtags || ''); zip.file('04-PINOVANI-KOMENTAR.txt', state.youtube.pinned || ''); zip.file('05-CHAPTERS.txt', chapters); zip.file('06-METADATA.json', JSON.stringify(metadata, null, 2));
    zip.file('07-STORYBOARD.json', JSON.stringify(state.scenes, null, 2));
    if (state.captions?.items?.length && typeof subtitleFile === 'function') zip.file('08-TITLOVI-SR.srt', subtitleFile('srt'));
    zip.file('PROCITAJ-ME.txt', 'Ovaj paket sadrži naslov, opis, hashtagove, pinovani komentar, chapters, metadata, storyboard i SRT. Video fajl se dodaje ručno posle finalnog rendera.');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }); downloadBlob(blob, `${v14SafeFile(state.songTitle)}-YOUTUBE-UPLOAD-PAKET.zip`);
  } else v14Download(JSON.stringify(metadata, null, 2), `${v14SafeFile(state.songTitle)}-YOUTUBE-UPLOAD-PAKET.json`, 'application/json;charset=utf-8');
  showToast('YouTube upload paket je napravljen.');
}

// ---------- SEED I VERZIJE PROMPTOVA ----------
function versionAllPrompts() {
  snapshotStoryboard('Pre verzionisanja promptova'); ensureV14State();
  const batch = { id: uuid(), createdAt: v14Now(), projectId: state.projectId, scenes: [] };
  state.scenes = state.scenes.map(scene => {
    const history = Array.isArray(scene.promptHistory) ? scene.promptHistory : [];
    if (scene.imagePrompt || scene.videoPrompt) history.push({ version: Number(scene.promptVersion || 1), savedAt: v14Now(), imagePrompt: scene.imagePrompt || '', videoPrompt: scene.videoPrompt || '', seed: Number(scene.seed || deterministicSceneSeed(scene)) });
    const updated = { ...scene, seed: Number(scene.seed || deterministicSceneSeed(scene)), promptVersion: Number(scene.promptVersion || 1) + 1, promptHistory: history.slice(-20) };
    batch.scenes.push({ id: updated.id, number: updated.number, seed: updated.seed, promptVersion: updated.promptVersion }); return updated;
  });
  state.advanced.promptVersions.push(batch); state.advanced.promptVersions = state.advanced.promptVersions.slice(-50); persistState(false, false); renderStoryboard(); showToast('Seed je zaključan, a promptovi su dobili novu verziju.');
}
function exportPromptVersions() {
  const payload = { projectId: state.projectId, songTitle: state.songTitle, exportedAt: v14Now(), batches: state.advanced.promptVersions || [], scenes: state.scenes.map(scene => ({ id: scene.id, number: scene.number, seed: scene.seed, promptVersion: scene.promptVersion, promptHistory: scene.promptHistory })) };
  v14Download(JSON.stringify(payload, null, 2), `${v14SafeFile(state.songTitle)}-SEED-I-PROMPT-VERZIJE.json`, 'application/json;charset=utf-8');
}

// ---------- SLIKE / VIDEO QA ----------
async function imageMetrics(blob) {
  const bitmap = await createImageBitmap(blob); const originalWidth = bitmap.width; const originalHeight = bitmap.height; const size = 96; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0, size, size); bitmap.close?.();
  const data = ctx.getImageData(0, 0, size, size).data; let sum = 0; let sum2 = 0; let clippedDark = 0; let clippedLight = 0; let edgeContrast = 0; let lapSum = 0; let lapSum2 = 0; let lapCount = 0; const gray = new Float32Array(size * size);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) { const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; gray[p] = y; sum += y; sum2 += y * y; if (y < 4) clippedDark++; if (y > 251) clippedLight++; }
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) { const p = y * size + x; const lap = 4 * gray[p] - gray[p - 1] - gray[p + 1] - gray[p - size] - gray[p + size]; lapSum += lap; lapSum2 += lap * lap; lapCount++; if (x < 12 || x > size - 13 || y < 12 || y > size - 13) edgeContrast += Math.abs(gray[p] - gray[p - 1]); }
  const mean = sum / gray.length; const contrast = Math.sqrt(Math.max(0, sum2 / gray.length - mean * mean)); const lapMean = lapSum / Math.max(1, lapCount); const sharpness = lapSum2 / Math.max(1, lapCount) - lapMean * lapMean;
  return { width: originalWidth || 0, height: originalHeight || 0, mean: Number(mean.toFixed(1)), contrast: Number(contrast.toFixed(1)), sharpness: Number(sharpness.toFixed(1)), clippedDarkPct: Number((clippedDark / gray.length * 100).toFixed(2)), clippedLightPct: Number((clippedLight / gray.length * 100).toFixed(2)), edgeContrast: Number((edgeContrast / 1000).toFixed(1)) };
}
async function runArtifactQa() {
  const rows = [];
  for (const scene of state.scenes) {
    const assetId = state.imageAssetIds?.[scene.id]; if (!assetId) { rows.push({ scene: scene.number, status: 'NEMA SLIKE', warnings: ['Nedostaje slika.'] }); continue; }
    const blob = await getAsset(assetId); if (!blob) { rows.push({ scene: scene.number, status: 'NEMA FAJLA', warnings: ['ID postoji, ali blob nije pronađen.'] }); continue; }
    try {
      const metrics = await imageMetrics(blob); const warnings = [];
      const expected = state.format === '16:9' ? 16 / 9 : state.format === '1:1' ? 1 : 9 / 16; const ratio = metrics.width / Math.max(1, metrics.height);
      if (Math.abs(ratio - expected) > 0.08) warnings.push(`Pogrešan odnos stranica ${metrics.width}×${metrics.height}.`);
      if (metrics.sharpness < 35) warnings.push('Slika je verovatno mutna ili previše mekana.');
      if (metrics.clippedDarkPct > 20) warnings.push('Veliki deo slike je potpuno crn.');
      if (metrics.clippedLightPct > 12) warnings.push('Veliki deo slike je pregoreo/bel.');
      if (metrics.edgeContrast > 500) warnings.push('Jak kontrast uz ivice: ručno proveri tekst, logo ili watermark.');
      rows.push({ scene: scene.number, status: warnings.length ? 'PROVERI' : 'LITE OK', warnings, metrics });
    } catch (error) { rows.push({ scene: scene.number, status: 'GREŠKA', warnings: [error.message] }); }
  }
  state.advanced.artifactQa = { createdAt: v14Now(), rows, limitation: 'LITE heuristike ne mogu garantovati anatomsku ispravnost. Face/hand deformacije moraju se vizuelno potvrditi; opcioni MediaPipe/Tesseract alati su preskupi za automatsko pokretanje na GTX 750 Ti.' };
  persistState(false, false); V14.lastArtifactReport = state.advanced.artifactQa;
  if (v14El('artifactQaReport')) v14El('artifactQaReport').textContent = [
    ...rows.map(row => `Scena ${row.scene}: ${row.status}${row.warnings.length ? ` — ${row.warnings.join(' | ')}` : ''}`),
    '', 'VAŽNO: Program automatski hvata pogrešan format, mutnoću, ekstremnu ekspoziciju i sumnjive ivice. Deformisano lice/šake nisu pouzdano dokazivi samo jednostavnom heuristikom — završna vizuelna kontrola ostaje obavezna.'
  ].join('\n');
  showToast(`LITE kontrola slika završena: ${rows.filter(x => x.warnings.length).length} scena za proveru.`);
}
async function sampleVideoFlicker(blob) {
  const url = URL.createObjectURL(blob); const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.src = url;
  await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Video nije učitan.')); });
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 54; const ctx = canvas.getContext('2d', { willReadFrequently: true }); const values = [];
  const step = Math.max(0.2, Math.min(0.5, video.duration / 30));
  for (let t = 0; t < video.duration; t += step) {
    video.currentTime = Math.min(t, Math.max(0, video.duration - 0.02)); await new Promise(resolve => { video.onseeked = resolve; }); ctx.drawImage(video, 0, 0, canvas.width, canvas.height); const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let sum = 0; for (let i = 0; i < data.length; i += 16) sum += .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]; values.push(sum / Math.ceil(data.length / 16));
  }
  URL.revokeObjectURL(url); const jumps = values.slice(1).map((value, i) => Math.abs(value - values[i])); return { samples: values.length, averageJump: jumps.reduce((a, b) => a + b, 0) / Math.max(1, jumps.length), maxJump: Math.max(0, ...jumps), suspiciousFrames: jumps.filter(value => value > 20).length };
}
async function runFlickerQa() {
  const rows = [];
  for (const scene of state.scenes) {
    const assetId = state.videoAssetIds?.[scene.id]; if (!assetId) continue;
    const blob = await getAsset(assetId); if (!blob) continue;
    try { const metrics = await sampleVideoFlicker(blob); rows.push({ scene: scene.number, ...metrics, status: metrics.suspiciousFrames > 2 || metrics.maxJump > 35 ? 'PROVERI' : 'OK' }); }
    catch (error) { rows.push({ scene: scene.number, status: 'GREŠKA', error: error.message }); }
  }
  state.advanced.flicker = { createdAt: v14Now(), rows }; persistState(false, false);
  if (v14El('flickerQaReport')) v14El('flickerQaReport').textContent = rows.length ? rows.map(row => `Scena ${row.scene}: ${row.status} • uzorci ${row.samples || 0} • prosek skoka ${(row.averageJump || 0).toFixed(1)} • maksimum ${(row.maxJump || 0).toFixed(1)} • sumnjivo ${row.suspiciousFrames || 0}`).join('\n') : 'Nema AI video-klipova za temporalnu flicker analizu.';
  showToast(rows.length ? 'Flicker analiza je završena.' : 'Nema AI video-klipova.');
}

// ---------- FASTER-WHISPER IMPORT ----------
function importWhisperWords(data) {
  const parsed = typeof data === 'string' ? extractJson(data) : data; const words = parsed.words || parsed.word_timestamps || [];
  if (!Array.isArray(words) || !words.length) throw new Error('JSON nema words niz sa start/end/word poljima.');
  snapshotCaptions('Pre faster-whisper uvoza');
  const maxWords = Number(state.captions?.style?.wordsPerLine || 7); const items = []; let group = [];
  const flush = () => { if (!group.length) return; items.push({ id: uuid(), start: Number(group[0].start || 0), end: Number(group.at(-1).end || group[0].start + .4), text: group.map(item => v14Text(item.word || item.text)).join(' ').replace(/\s+([,.!?;:])/g, '$1') }); group = []; };
  for (const word of words) { group.push(word); if (group.length >= maxWords || /[.!?]$/.test(v14Text(word.word || word.text))) flush(); } flush();
  state.captions.items = items; state.captions.source = 'faster-whisper-word-timestamps'; state.captions.status = `Uvezeno ${words.length} reči u ${items.length} titlova.`;
  persistState(false, false); if (typeof renderCaptions === 'function') renderCaptions(); showToast(state.captions.status);
}

// ---------- HARDVER / DPAPI / MODELI / ISTORIJA ----------
async function loadSystemProfile(applyDefaults = true) {
  try {
    const response = await fetch('/api/system/profile', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Profil nije učitan.');
    V14.systemProfile = data; state.advanced.hardware = { profile: data, checkedAt: data.checkedAt };
    if (applyDefaults) {
      state.settings.weakPcMode = data.profileClass === 'LITE'; state.settings.renderResolution = data.recommended?.renderResolution || 1080; state.settings.renderFps = data.recommended?.renderFps || 24;
      if (v14El('renderResolution')) v14El('renderResolution').value = String(state.settings.renderResolution);
      if (v14El('renderFps')) v14El('renderFps').value = String(state.settings.renderFps);
      const option4k = v14El('renderResolution')?.querySelector('option[value="2160"]'); if (option4k) { option4k.disabled = Boolean(data.recommended?.disable4k); option4k.textContent = data.recommended?.disable4k ? '4K — BLOKIRANO ZA OVAJ PC' : '4K'; }
    }
    persistState(false, false); renderSystemProfile(); return data;
  } catch (error) { if (v14El('hardwareProfileReport')) v14El('hardwareProfileReport').textContent = `Greška: ${error.message}`; return null; }
}
function renderSystemProfile() {
  const box = v14El('hardwareProfileReport'); const p = V14.systemProfile || state.advanced?.hardware?.profile; if (!box || !p) return;
  box.textContent = [
    `REŽIM: ${p.profileClass}`, `CPU: ${p.cpu?.name || '-'} • ${p.cpu?.cores || '?'} jezgra / ${p.cpu?.logicalProcessors || '?'} niti`, `RAM: ${p.ramGb} GB`,
    `GPU: ${(p.gpus || []).map(g => `${g.name} (${g.vramGb} GB VRAM)`).join(', ') || 'nije očitan'}`, `NAJVIŠE SLOBODNOG PROSTORA: ${p.maxFreeDiskGb} GB`, '',
    'DOZVOLJENO / PREPORUČENO:',
    `✓ ChatGPT Plus fajl-most: DA`, `✓ Proxy: 360p / 15 fps`, `✓ Finalni render: ${p.capabilities?.final1080p ? '1080p, 24 fps' : '720p'}`,
    `${p.capabilities?.fasterWhisperTinyCpu ? '✓' : '✕'} faster-whisper tiny CPU int8`, `${p.capabilities?.realEsrganNcnnTiled ? '!' : '✕'} Real-ESRGAN NCNN tiled — veoma sporo`, `${p.capabilities?.rifeNcnnLowResolution ? '!' : '✕'} RIFE NCNN 360p/720p — veoma sporo`,
    `${p.capabilities?.sdxlInstantId ? '✓' : '✕'} SDXL/InstantID lokalno`, `${p.capabilities?.wan14b ? '✓' : '✕'} Wan 14B lokalno`, `${p.capabilities?.final4k ? '✓' : '✕'} finalni 4K`, '',
    ...(p.warnings || []).map(item => `! ${item}`)
  ].join('\n');
}
async function loadSecurityStatus() {
  try { const response = await fetch('/api/security/status', { cache: 'no-store' }); const data = await response.json(); if (v14El('dpapiReport')) v14El('dpapiReport').textContent = [`PROVIDER: ${data.expectedProvider}`, `OPSEG: ${data.scope}`, ...data.files.map(item => `${item.protected ? '✓' : item.exists ? '✕' : '○'} ${item.name}: ${item.exists ? item.provider : 'još nema sačuvanih podataka'}`)].join('\n'); } catch (error) { if (v14El('dpapiReport')) v14El('dpapiReport').textContent = error.message; }
}
async function verifyModels() {
  const root = v14Text(v14El('modelRootPath')?.value); if (!root) return showToast('Unesi putanju do ComfyUI ili model foldera, na primer C:\\ComfyUI_windows_portable\\ComfyUI\\models');
  const response = await fetch('/api/models/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roots: [root], fullHash: Boolean(v14El('fullModelHash')?.checked) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Provera nije uspela.');
  if (v14El('modelVerifyReport')) v14El('modelVerifyReport').textContent = data.results.length ? data.results.map(item => `${item.ok ? '✓' : '✕'} ${item.kind}: ${item.name} • ${item.sizeGb} GB${item.sha256 ? ` • SHA256 ${item.sha256.slice(0, 16)}…` : ''}${item.hashMatches === false ? ' • HASH SE NE POKLAPA' : ''}${item.metadata ? ` • ${item.metadata.tensorCount} tensora` : ''}${item.error ? ` • ${item.error}` : ''}`).join('\n') : 'Nijedan model nije pronađen u navedenom folderu.';
}
async function addPerformanceRecord() {
  const record = {
    projectId: state.projectId, songTitle: state.songTitle, title: v14El('historyTitle')?.value || state.youtube.title || state.songTitle,
    type: v14El('historyType')?.value || 'video', platform: v14El('historyPlatform')?.value || 'YouTube',
    views: Number(v14El('historyViews')?.value || 0), likes: Number(v14El('historyLikes')?.value || 0), comments: Number(v14El('historyComments')?.value || 0),
    averageViewPercentage: Number(v14El('historyRetention')?.value || 0), watchHours: Number(v14El('historyWatchHours')?.value || 0), subscribersGained: Number(v14El('historySubscribers')?.value || 0),
    hook3Score: state.advanced?.hookAudit?.windows?.[0]?.score || 0, hook5Score: state.advanced?.hookAudit?.windows?.[1]?.score || 0, hook10Score: state.advanced?.hookAudit?.windows?.[2]?.score || 0,
    notes: v14El('historyNotes')?.value || ''
  };
  const response = await fetch('/api/history/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Rezultat nije sačuvan.'); renderHistory(data.summary); showToast('Rezultat objave je sačuvan u lokalnoj bazi.');
}
async function loadHistory() {
  try { const response = await fetch('/api/history/list', { cache: 'no-store' }); const data = await response.json(); renderHistory(data.summary); } catch (error) { if (v14El('historyReport')) v14El('historyReport').textContent = error.message; }
}
function renderHistory(summary) {
  if (!v14El('historyReport') || !summary) return;
  v14El('historyReport').textContent = [`BROJ OBJAVA: ${summary.count}`, `PREGLEDI: ${summary.totals.views}`, `SATI GLEDANJA: ${Number(summary.totals.watchHours).toFixed(1)}`, `NOVI PRETPLATNICI: ${summary.totals.subscribersGained}`, '', 'NAJBOLJE PO PREGLEDIMA:', ...(summary.topByViews || []).slice(0, 15).map((item, i) => `${i + 1}. ${item.title || item.songTitle} — ${item.views} pregleda • retention ${item.averageViewPercentage || 0}%`)].join('\n');
}

// ---------- PROXY / RECOVERY ----------
async function runProxyRender() {
  if (renderSession) return showToast('Render je već u toku.');
  state.settings.proxyRenderActive = true; persistState(false, false);
  try { await renderVideo(); } finally { state.settings.proxyRenderActive = false; persistState(false, false); }
}
function renderRecoveryStatus() {
  const box = v14El('renderRecoveryReport'); if (!box) return;
  try {
    const recovery = JSON.parse(localStorage.getItem('mssRenderRecoveryV14') || 'null');
    if (!recovery) { box.textContent = 'Nema započetog ili prekinutog rendera.'; return; }
    box.textContent = recovery.status === 'rendering' ? `Pronađen je prekinut render: ${recovery.progress || 0}% • ${recovery.proxyMode ? 'proxy' : 'final'} • ${recovery.updatedAt || recovery.startedAt}. Browser ne može da sačuva nedovršene MediaRecorder fragmente posle rušenja, zato oporavak ponovo pokreće isti raspon od početka.` : `Poslednji render: ${recovery.status} • ${recovery.progress || 0}% • ${recovery.completedAt || recovery.updatedAt || ''}`;
  } catch { box.textContent = 'Recovery zapis je oštećen.'; }
}
function retryRecoveredRender() { renderRecoveryStatus(); renderVideo(); }

// ---------- UI ----------
function addButton(container, id, label, className = 'secondary') {
  if (!container || v14El(id)) return null; const button = document.createElement('button'); button.id = id; button.type = 'button'; button.className = className; button.textContent = label; container.appendChild(button); return button;
}
function injectV14Ui() {
  const storyboardActions = v14El('regenerateStoryboardBtn')?.closest('.actions');
  addButton(storyboardActions, 'undoStoryboardBtn', '↶ UNDO'); addButton(storyboardActions, 'redoStoryboardBtn', '↷ REDO'); addButton(storyboardActions, 'versionPromptsBtn', 'Zaključaj seed + nova verzija prompta'); addButton(storyboardActions, 'exportPromptVersionsBtn', 'Izvezi seed/verzije');
  addButton(storyboardActions, 'exportOtioBtn', 'Izvezi OTIO'); addButton(storyboardActions, 'exportFcpxmlBtn', 'Izvezi FCPXML'); addButton(storyboardActions, 'exportResolveBtn', 'Izvezi DaVinci'); addButton(storyboardActions, 'exportChaptersBtn', 'YouTube chapters'); addButton(storyboardActions, 'hookAuditBtn', 'Hook 3/5/10 s');
  if (storyboardActions && !v14El('hookAuditReport')) { const pre = document.createElement('pre'); pre.id = 'hookAuditReport'; pre.className = 'test-report'; pre.textContent = 'Hook kontrola još nije pokrenuta.'; storyboardActions.parentElement.appendChild(pre); }

  const captionPanel = document.querySelector('[data-panel="captions"]'); const captionActions = captionPanel?.querySelector('.actions');
  addButton(captionActions, 'undoCaptionsBtn', '↶ UNDO TITLOVI'); addButton(captionActions, 'redoCaptionsBtn', '↷ REDO TITLOVI'); addButton(captionActions, 'importWhisperWordsBtn', 'Uvezi faster-whisper reči');
  if (captionPanel && !v14El('whisperWordsFile')) { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true; input.id = 'whisperWordsFile'; captionPanel.appendChild(input); }

  const audioPanel = document.querySelector('[data-panel="analysis"]');
  if (audioPanel && !v14El('audioQcCard')) audioPanel.insertAdjacentHTML('beforeend', `<div class="card" id="audioQcCard"><div class="section-heading inner-heading"><div><span class="step-label">AUDIO QA 15.4</span><h3>Tišina, LUFS i true peak</h3></div><span class="badge">LOKALNO</span></div><div class="field-grid"><label>Prag tišine dBFS<input id="silenceThreshold" type="number" value="-42" min="-80" max="-20" step="1"/></label><label>Minimalna tišina u sekundama<input id="silenceMinDuration" type="number" value="0.28" min="0.1" max="5" step="0.01"/></label></div><div class="actions"><button class="primary" id="runAudioQcBtn">ANALIZIRAJ TIŠINU + LUFS + TRUE PEAK</button><button class="secondary" id="exportSilenceCsvBtn">Izvezi tišine CSV</button></div><pre class="test-report" id="audioQcReport">Audio QA još nije pokrenut.</pre></div>`);

  const renderActions = v14El('renderVideoBtn')?.closest('.actions'); addButton(renderActions, 'proxyRenderBtn', 'BRZI PROXY 360p / 15fps', 'primary');
  const renderCard = v14El('renderVideoBtn')?.closest('.card');
  if (renderCard && !v14El('renderRecoveryReport')) renderCard.insertAdjacentHTML('beforeend', `<div class="card compact"><h3>Recovery posle rušenja</h3><pre class="test-report" id="renderRecoveryReport">Provera...</pre><div class="actions"><button class="secondary" id="retryRecoveryRenderBtn">Ponovo pokreni isti render</button></div></div>`);

  const mediaPanel = document.querySelector('[data-panel="media"]');
  if (mediaPanel && !v14El('visualQaCard')) mediaPanel.insertAdjacentHTML('beforeend', `<div class="card" id="visualQaCard"><div class="section-heading inner-heading"><div><span class="step-label">LITE VIZUELNI QA</span><h3>Mutnoća, ekspozicija, format, sumnjive ivice i flicker</h3></div><span class="badge">SLAB PC</span></div><div class="notice warn">Automatika pomaže da pronađe sumnjive scene, ali ne može garantovati ispravne šake i lice. Završna kontrola očima je obavezna.</div><div class="actions"><button class="primary" id="artifactQaBtn">PROVERI SVE SLIKE</button><button class="secondary" id="flickerQaBtn">IZMERI FLICKER AI KLIPOVA</button></div><pre class="test-report" id="artifactQaReport">Kontrola slika nije pokrenuta.</pre><pre class="test-report" id="flickerQaReport">Flicker analiza nije pokrenuta.</pre></div>`);

  const youtubePanel = document.querySelector('[data-panel="youtube"]'); const ytActions = youtubePanel?.querySelector('.actions');
  addButton(ytActions, 'youtubePackageBtn', 'NAPRAVI KOMPLETAN UPLOAD PAKET', 'primary'); addButton(ytActions, 'youtubeChaptersBtn', 'Izvezi chapters');
  if (youtubePanel && !v14El('historyCard')) youtubePanel.insertAdjacentHTML('beforeend', `<div class="card" id="historyCard"><div class="section-heading inner-heading"><div><span class="step-label">LOKALNA BAZA REZULTATA</span><h3>Ranije pesme i Shorts objave</h3></div><span class="badge">DO 2000 ZAPISA</span></div><div class="field-grid"><label>Naslov<input id="historyTitle"/></label><label>Tip<select id="historyType"><option value="video">Dugi video/pesma</option><option value="shorts">Shorts</option></select></label><label>Platforma<select id="historyPlatform"><option>YouTube</option><option>TikTok</option><option>Instagram</option><option>Facebook</option></select></label><label>Pregledi<input id="historyViews" type="number" min="0"/></label><label>Lajkovi<input id="historyLikes" type="number" min="0"/></label><label>Komentari<input id="historyComments" type="number" min="0"/></label><label>Prosečan retention %<input id="historyRetention" type="number" min="0" max="100" step="0.1"/></label><label>Sati gledanja<input id="historyWatchHours" type="number" min="0" step="0.1"/></label><label>Novi pretplatnici<input id="historySubscribers" type="number" step="1"/></label></div><label>Napomena<textarea id="historyNotes" rows="3"></textarea></label><div class="actions"><button class="primary" id="saveHistoryBtn">SAČUVAJ REZULTAT</button><button class="secondary" id="refreshHistoryBtn">OSVEŽI BAZU</button><a class="download-link" href="/api/history/export" target="_blank">Izvezi celu bazu JSON</a></div><pre class="test-report" id="historyReport">Baza se učitava...</pre></div>`);

  const toolsPanel = document.querySelector('[data-panel="tools"]');
  if (toolsPanel && !v14El('hardwareV14Card')) toolsPanel.insertAdjacentHTML('afterbegin', `<div class="card"><div class="section-heading inner-heading"><div><span class="step-label">OPCIONI LITE ALATI</span><h3>faster-whisper, Real-ESRGAN, RIFE i lokalni potpis</h3></div><span class="badge">JEDAN FOLDER</span></div><div class="notice warn">Instalacije nisu automatski pokrenute. Na GTX 750 Ti koristi faster-whisper tiny CPU, Real-ESRGAN tile 128 i RIFE samo za 360p/720p. Wan i SDXL/InstantID su blokirani.</div><div class="actions"><button class="primary" id="openToolsFolderBtn">OTVORI FOLDER SA LITE ALATIMA</button></div><pre class="test-report">Redosled:
1. INSTALIRAJ-FASTER-WHISPER-LITE.ps1 → TRANSKRIBUJ-AUDIO-LITE.ps1
2. INSTALIRAJ-FFMPEG-LITE.ps1 → PROVERI-LUFS-FFMPEG.ps1
3. INSTALIRAJ-REAL-ESRGAN-LITE.ps1 → UPSCALE-SLIKE-LITE.ps1
4. INSTALIRAJ-RIFE-LITE.ps1 → INTERPOLIRAJ-VIDEO-LITE.ps1
5. POTPISI-PROGRAM-LOKALNO.ps1 — lokalno poverenje, nije globalna SmartScreen reputacija.</pre></div><div class="card" id="hardwareV14Card"><div class="section-heading inner-heading"><div><span class="step-label">PC LITE PROFIL</span><h3>Automatska provera GPU-a, VRAM-a, RAM-a i diska</h3></div><span class="badge">ZA GTX 750 Ti</span></div><div class="actions"><button class="primary" id="checkHardwareBtn">PROVERI OVAJ PC I PRIMENI BEZBEDNA PODEŠAVANJA</button></div><pre class="test-report" id="hardwareProfileReport">Provera...</pre></div><div class="card"><div class="section-heading inner-heading"><div><span class="step-label">WINDOWS DPAPI</span><h3>Zaštita YouTube tokena i API ključa</h3></div><span class="badge">CURRENT USER</span></div><pre class="test-report" id="dpapiReport">Provera...</pre></div><div class="card"><div class="section-heading inner-heading"><div><span class="step-label">MODELI</span><h3>SHA-256 i safetensors metadata provera</h3></div></div><label>Putanja do model foldera<input id="modelRootPath" placeholder="C:\\ComfyUI_windows_portable\\ComfyUI\\models"/></label><label><input id="fullModelHash" type="checkbox"/> Izračunaj pun SHA-256 svih modela — veoma sporo za velike fajlove</label><div class="actions"><button class="primary" id="verifyModelsBtn">PROVERI MODELE</button></div><pre class="test-report" id="modelVerifyReport">Nije pokrenuto.</pre></div>`);
}

function bindV14Events() {
  const on = (id, event, fn) => v14El(id)?.addEventListener(event, fn);
  for (const id of ['step3Genre','step3Mood','conceptStory','visualStyle','colorPalette','cameraStyle','locations','centralSymbol','openingHook','conceptEnding']) on(id, 'input', updateStep3Completeness);
  const step3TextControls = ['step3CustomSpotPrompt','step3PromptDuration','step3PromptMaxScenes','step3AverageShotLength','step3YoutubeQuery'];
  const step3SelectControls = ['step3BridgeMode','step3SpotType','step3VisualTone','step3Budget','step3LocationPlan','step3ShotMix','step3YoutubeMaxResults','step3YoutubeSort'];
  const step3CheckControls = ['step3UsePromptInIdeas','step3RequireImagePrompts','step3RequireVideoPrompts','step3RequireYoutubeSources'];
  for (const id of step3TextControls) on(id, 'input', () => collectStep3CustomBridgeInputs(true));
  for (const id of step3SelectControls) on(id, 'change', () => collectStep3CustomBridgeInputs(true));
  for (const id of step3CheckControls) on(id, 'change', () => collectStep3CustomBridgeInputs(true));
  on('previewStep3PromptBtn', 'click', previewCurrentStep3Prompt);
  on('clearStep3PromptBtn', 'click', () => { const field=v14El('step3CustomSpotPrompt'); if(field) field.value=''; collectStep3CustomBridgeInputs(true); previewCurrentStep3Prompt(); });
  on('editStep3FullPromptBtn', 'click', () => openStep3FullPromptEditor());
  on('resetStep3FullPromptBtn', 'click', () => openStep3FullPromptEditor());
  v14El('step3FullPromptEditor')?.addEventListener('input', () => { step3FullPromptManualEdit = true; });
  on('searchStep3YoutubeBtn', 'click', () => searchStep3Youtube().catch(error => showToast(error.message)));
  on('fillYoutubeQueryBtn', 'click', () => { const field=v14El('step3YoutubeQuery'); if(field) field.value=autoYoutubeQuery(); collectStep3CustomBridgeInputs(true); });
  on('clearYoutubeReferencesBtn', 'click', clearYoutubeReferences);
  on('addManualYoutubeReferenceBtn', 'click', addManualYoutubeReference);
  on('copyAllImagePromptsBtn', 'click', () => copyAllScenePrompts('image'));
  on('copyAllVideoPromptsBtn', 'click', () => copyAllScenePrompts('video'));
  on('exportAllPromptsBtn', 'click', exportAllScenePrompts);
  on('fillStep3FromIdeaBtn', 'click', fillStep3FromIdea); on('auditStep3Btn', 'click', () => auditStep3(true)); on('clearStep3Btn', 'click', clearStep3);
  on('copyManualGptInstructionsBtn', 'click', copyManualGptInstructions); on('exportStep3PackageBtn', 'click', exportStep3Package); on('copyStep3PromptBtn', 'click', copyStep3StartPrompt);
  on('openPlusExtensionSetupBtn', 'click', openPlusExtensionSetup); on('savePlusPrivateGptUrlBtn', 'click', savePlusPrivateGptUrl); on('testPlusBridgeBtn', 'click', () => testPlusBridge().catch(error => { plusBridgeSetStatus(error.message, 0, 'TEST GREŠKA'); showToast(error.message); })); on('step3PreflightBtn', 'click', () => runStep3Preflight(true).catch(error => showToast(error.message))); on('downloadStep3DiagnosticsBtn', 'click', () => downloadStep3Diagnostics().catch(error => showToast(error.message))); on('cancelPlusBridgeBtn', 'click', () => cancelPlusBridgeJob(true)); on('resetStep3WorkflowBtn', 'click', () => resetStep3Workflow().catch(error => showToast(error.message)));
  on('sendStep3ToPlusBtn', 'click', () => startPlusBridgeRound().catch(error => { plusBridgeSetStatus(error.message, 0, 'GREŠKA'); showToast(error.message); }));
  on('pollPlusResultBtn', 'click', () => pollPlusBridgeResult(true));
  on('chooseGptResponseFileBtn', 'click', () => v14El('gptResponseFile')?.click()); on('gptResponseFile', 'change', event => importGptResponseFile(event.target.files?.[0]).catch(error => showToast(error.message)));
  on('importGptResponseTextBtn', 'click', () => { try { applyGptResponse(v14El('gptResponseJson')?.value || ''); } catch (error) { showToast(error.message); } });
  on('undoStoryboardBtn', 'click', undoStoryboard); on('redoStoryboardBtn', 'click', redoStoryboard); on('undoCaptionsBtn', 'click', undoCaptions); on('redoCaptionsBtn', 'click', redoCaptions);
  on('versionPromptsBtn', 'click', versionAllPrompts); on('exportPromptVersionsBtn', 'click', exportPromptVersions);
  on('exportOtioBtn', 'click', exportOtio); on('exportFcpxmlBtn', 'click', () => exportFcpxml(false)); on('exportResolveBtn', 'click', () => { exportFcpxml(true); exportResolveEdl(); }); on('exportChaptersBtn', 'click', exportChapters); on('hookAuditBtn', 'click', hookAudit);
  on('runAudioQcBtn', 'click', runAudioQc); on('exportSilenceCsvBtn', 'click', exportSilenceCsv);
  on('proxyRenderBtn', 'click', runProxyRender); on('retryRecoveryRenderBtn', 'click', retryRecoveredRender);
  on('artifactQaBtn', 'click', () => runArtifactQa().catch(error => showToast(error.message))); on('flickerQaBtn', 'click', () => runFlickerQa().catch(error => showToast(error.message)));
  on('importWhisperWordsBtn', 'click', () => v14El('whisperWordsFile')?.click()); on('whisperWordsFile', 'change', async event => { try { importWhisperWords(await event.target.files?.[0]?.text()); } catch (error) { showToast(error.message); } event.target.value = ''; });
  on('youtubePackageBtn', 'click', () => exportYoutubePackage().catch(error => showToast(error.message))); on('youtubeChaptersBtn', 'click', exportChapters);
  on('openToolsFolderBtn', 'click', async () => { try { const response = await fetch('/api/maintenance/open-tools-folder', { method: 'POST' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Folder nije otvoren.'); } catch (error) { showToast(error.message); } });
  on('checkHardwareBtn', 'click', () => loadSystemProfile(true)); on('verifyModelsBtn', 'click', () => verifyModels().catch(error => showToast(error.message)));
  on('saveHistoryBtn', 'click', () => addPerformanceRecord().catch(error => showToast(error.message))); on('refreshHistoryBtn', 'click', loadHistory);

  document.addEventListener('pointerdown', event => {
    const storyboard = event.target.closest?.('#storyboardList, [data-panel="storyboard"]'); const captions = event.target.closest?.('[data-panel="captions"]');
    if (storyboard && /BUTTON|INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) snapshotStoryboard('Pre ručne izmene');
    if (captions && /BUTTON|INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) snapshotCaptions('Pre ručne izmene');
  }, true);
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey)) return; const target = event.target; const typing = target && /INPUT|TEXTAREA/.test(target.tagName);
    if (typing) return;
    if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redoStoryboard() : undoStoryboard(); }
    if (event.key.toLowerCase() === 'y') { event.preventDefault(); redoStoryboard(); }
  });
}

function initV14() {
  try {
    ensureV14State(); injectV14Ui(); bindV14Events(); fillForm(); hydrateStep3CustomBridgeInputs(); renderStep3YoutubeReferences(); renderStep3PromptGallery(); updateStep3Completeness(); renderAudioQcReport(); renderRecoveryStatus(); updateUndoButtons();
    state.chatgptBridge ||= {};
    state.chatgptBridge.privateGptUrl = DEFAULT_PRIVATE_GPT_URL;
    if (v14El('plusPrivateGptUrl')) { v14El('plusPrivateGptUrl').value = DEFAULT_PRIVATE_GPT_URL; v14El('plusPrivateGptUrl').readOnly = true; }
    window.addEventListener('mss-plus-bridge-extension', event => { if (event.detail?.ok) refreshPlusBridgeStatus(false); });
    refreshPlusBridgeStatus(false);
    if (state.advanced?.step3?.plusJobId) { V14.plusJobId = state.advanced.step3.plusJobId; beginPlusBridgePolling(); }
    loadSystemProfile(true); loadSecurityStatus(); loadHistory();
    const oldRecovery = JSON.parse(localStorage.getItem('mssRenderRecoveryV14') || 'null');
    if (oldRecovery?.status === 'rendering') showToast(`Pronađen je prekinut render na ${oldRecovery.progress || 0}%. Otvori Korak 8 za recovery.`);
  } catch (error) { console.error('V14 inicijalizacija:', error); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initV14, { once: true }); else initV14();
