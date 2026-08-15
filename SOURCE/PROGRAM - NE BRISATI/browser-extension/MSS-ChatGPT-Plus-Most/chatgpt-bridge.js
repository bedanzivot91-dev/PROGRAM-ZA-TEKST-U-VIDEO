'use strict';

const PANEL_ID = 'mss-chatgpt-plus-bridge-panel';
const BRIDGE_VERSION = '15.6';
const TARGET_GPT_ID = 'g-6a62e905ca608191be135254d6f2fbcc';
const TARGET_GPT_URL = 'https://chatgpt.com/g/g-6a62e905ca608191be135254d6f2fbcc-muzicki-spot-studio-privatni';
const MAX_PROMPT_CHARS = 24000;
let currentJob = null;
let lastJobId = '';
let refreshBusy = false;
let lastAssistantTextBeforeSend = '';
let fallbackAttemptedForJob = '';
let autoRecoveryBusy = false;
let autoModeEnabled = true;
let autoBusy = false;
let autoSentForJob = '';
let autoReturnedForJob = '';
let autoNavigatedForJob = '';
const AUTO_MODE_KEY = 'mssAutoModeEnabled';

function send(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, response => resolve(response || { ok:false, error:'Dodatak nije odgovorio.' })));
}
function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  if (text) node.textContent = text;
  return node;
}
function panelNode(selector) { return document.querySelector(`#${PANEL_ID} ${selector}`); }
function setStatus(text, kind = '') {
  const status = panelNode('[data-mss-status]');
  if (!status) return;
  status.textContent = text;
  status.dataset.kind = kind;
}
function setButtons(enabled) {
  const sendButton = panelNode('[data-mss-send]');
  const returnButton = panelNode('[data-mss-return]');
  if (sendButton) sendButton.disabled = !enabled;
  if (returnButton) returnButton.disabled = !enabled;
}
function isTargetGptPage() {
  return location.hostname === 'chatgpt.com' && location.pathname.includes(`/g/${TARGET_GPT_ID}`);
}
function openTargetGpt() { location.href = TARGET_GPT_URL; }
function hasConversationMessages() { return Boolean(document.querySelector('[data-message-author-role="user"], [data-message-author-role="assistant"]')); }
function promptSizeLabel(job) {
  const chars = Number(job?.promptChars || String(job?.prompt || '').length || 0);
  return `${Math.max(1, Math.round(chars / 1024))} KB`;
}
function findComposer() {
  const selectors = [
    '#prompt-textarea', '[data-testid="prompt-textarea"]',
    'textarea[placeholder*="Message"]', 'textarea[placeholder*="Poruka"]',
    'div.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"][data-virtualkeyboard="true"]',
    'div[contenteditable="true"][role="textbox"]'
  ];
  for (const selector of selectors) {
    const nodes = [...document.querySelectorAll(selector)].filter(node => node.offsetParent !== null && !node.closest(`#${PANEL_ID}`));
    if (nodes.length) return nodes.at(-1);
  }
  return null;
}
function insertText(target, text) {
  target.focus();
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set;
    if (setter) setter.call(target, text); else target.value = text;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  target.replaceChildren();
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  target.appendChild(paragraph);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}
function findSendButton() {
  const selectors = [
    '[data-testid="send-button"]', 'button[aria-label*="Send"]',
    'button[aria-label*="Pošalji"]', 'button[aria-label*="Submit"]'
  ];
  for (const selector of selectors) {
    const nodes = [...document.querySelectorAll(selector)].filter(node => node.offsetParent !== null && !node.disabled && !node.closest(`#${PANEL_ID}`));
    if (nodes.length) return nodes.at(-1);
  }
  return null;
}
function isGenerating() {
  const selectors = [
    '[data-testid="stop-button"]', 'button[aria-label*="Stop generating"]',
    'button[aria-label*="Zaustavi"]', 'button[aria-label*="Stop streaming"]'
  ];
  return selectors.some(selector => [...document.querySelectorAll(selector)].some(node => node.offsetParent !== null));
}
function visibleChatGptError() {
  const text = [...document.querySelectorAll('[role="alert"], .text-red-500, .text-red-400, button')]
    .filter(node => node.offsetParent !== null && !node.closest(`#${PANEL_ID}`))
    .map(node => String(node.innerText || node.textContent || '').trim())
    .filter(Boolean).join(' | ');
  const match = text.match(/something seems to have gone wrong|network error|error in message stream|problem pri generisanju|došlo je do greške|try again|retry/i);
  return match ? match[0] : '';
}
function latestAssistantText() {
  const nodes = [...document.querySelectorAll('[data-message-author-role="assistant"]')]
    .filter(node => node.offsetParent !== null && !node.closest(`#${PANEL_ID}`));
  for (const node of nodes.reverse()) {
    const codeBlocks = [...node.querySelectorAll('pre code')].map(item => item.innerText.trim()).filter(Boolean);
    if (codeBlocks.length) return codeBlocks.at(-1);
    const text = node.innerText?.trim();
    if (text && text.length > 10) return text;
  }
  return '';
}
function extractJsonObject(raw) {
  const text = String(raw || '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return { raw: text, value: JSON.parse(text) }; } catch {}
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const candidate = text.slice(first, last + 1);
    try { return { raw: candidate, value: JSON.parse(candidate) }; } catch {}
  }
  return null;
}
function lockedIdentityForJob(job) {
  return String(job?.payload?.project?.lockedGirlIdentity || '').trim();
}
function removePossibleIdentityPrefix(prompt, identity) {
  const text=String(prompt || '').trim();
  if (!text) return '';
  if (identity && text.startsWith(identity)) return text.slice(identity.length).trim();
  if (/^the same woman,\s*same identity,\s*same person in every image/i.test(text)) {
    const markers=['SCENA ','Scene ','IMAGE PROMPT:','VIDEO PROMPT:'];
    const indexes=markers.map(marker=>text.indexOf(marker)).filter(index=>index>0);
    if(indexes.length) return text.slice(Math.min(...indexes)).trim();
  }
  return text;
}
function enforceLockedIdentityInAnswer(parsed, job) {
  const identity=lockedIdentityForJob(job);
  if (!identity || !parsed?.value || typeof parsed.value!=='object') return parsed;
  const scenes=Array.isArray(parsed.value.scenes) ? parsed.value.scenes : Array.isArray(parsed.value.storyboard) ? parsed.value.storyboard : [];
  for (const scene of scenes) {
    if (scene.imagePrompt) scene.imagePrompt=`${identity}

${removePossibleIdentityPrefix(scene.imagePrompt,identity)}`.trim();
    if (scene.videoPrompt) scene.videoPrompt=`${identity}

${removePossibleIdentityPrefix(scene.videoPrompt,identity)}`.trim();
  }
  parsed.raw=JSON.stringify(parsed.value);
  return parsed;
}

function promptRequirements(job) {
  const direct = job?.payload?.project?.promptToSpot || {};
  return {
    youtube: direct.requireYoutubeSources !== false,
    image: direct.requireImagePrompts !== false,
    video: direct.requireVideoPrompts !== false,
    maxScenes: Math.max(3, Number(direct.maxScenes || 36))
  };
}
function validResearchSources(value) {
  const sources = Array.isArray(value?.research?.sources) ? value.research.sources : [];
  const valid = sources.filter(item => /^https?:\/\//i.test(String(item?.url || '')));
  const youtube = valid.filter(item => /youtube\.com|youtu\.be/i.test(String(item?.url || '')));
  return { valid, youtube };
}
function validatePromptScenes(scenes, requirements) {
  for (let index=0; index<scenes.length; index++) {
    const scene=scenes[index] || {};
    if (String(scene.description || scene.action || '').trim().length < 12) return `Scena ${index+1} nema konkretnu radnju.`;
    if (String(scene.location || '').trim().length < 3) return `Scena ${index+1} nema lokaciju.`;
    if (requirements.image && String(scene.imagePrompt || '').trim().length < 100) return `Scena ${index+1} nema detaljan imagePrompt.`;
    if (requirements.video && String(scene.videoPrompt || '').trim().length < 80) return `Scena ${index+1} nema detaljan videoPrompt.`;
  }
  return '';
}
function validateAnswerForJob(parsed, job) {
  const value = parsed?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Odgovor nije jedan JSON objekat.';
  if (job?.type === 'test') return value.bridgeTest === true ? '' : 'Testni odgovor nema bridgeTest: true.';
  if (job?.phase === 'prompt-to-spot') {
    if (!value.concept || typeof value.concept !== 'object') return 'Direktan prompt nema concept objekat.';
    if (!value.storyPlan || typeof value.storyPlan !== 'object') return 'Direktan prompt nema storyPlan objekat.';
    if (!Array.isArray(value.scenes) || value.scenes.length < 3) return 'Direktan prompt mora da vrati najmanje 3 storyboard scene.';
    const req=promptRequirements(job);
    if (value.scenes.length > req.maxScenes) return `Vraćeno je ${value.scenes.length} scena, maksimum je ${req.maxScenes}.`;
    if (req.youtube) {
      const refs=validResearchSources(value);
      if (refs.valid.length < 3 || refs.youtube.length < 2) return `Nedostaje dokaz YouTube istraživanja: potrebno 3 izvora, od toga 2 YouTube linka.`;
    }
    const sceneError=validatePromptScenes(value.scenes,req); if(sceneError) return sceneError;
    const count=value.scenes.length;
    for (const key of ['recommendedSceneCount','estimatedImageCount','imagePromptCount','videoPromptCount']) {
      const n=Number(value.storyPlan?.[key]); if(Number.isFinite(n) && n!==count) return `storyPlan.${key} nije usklađen sa ${count} scena.`;
    }
    return '';
  }
  if (Number(job?.round) === 1) {
    if (!Array.isArray(value.ideas) || value.ideas.length !== 10) return 'Krug 1 mora da sadrži tačno 10 ideja.';
    if (job?.payload?.project?.creativeBrief?.requireYoutubeSources !== false) {
      const refs=validResearchSources(value); if(refs.valid.length < 3 || refs.youtube.length < 2) return 'Krug 1 nema najmanje 3 aktuelna izvora i 2 YouTube linka.';
    }
  }
  if (Number(job?.round) === 2 && job?.phase === 'round2-scenes') {
    const expected = Array.isArray(job.batchSceneNumbers) ? job.batchSceneNumbers.map(Number) : [];
    if (!Array.isArray(value.scenes) || value.scenes.length !== expected.length) return `Storyboard paket mora da sadrži tačno ${expected.length} scena.`;
    const actual = value.scenes.map(scene => Number(scene?.number));
    if (expected.some(number => !actual.includes(number))) return `Storyboard paket nema očekivane scene: ${expected.join(', ')}.`;
    const sceneError=validatePromptScenes(value.scenes,{image:true,video:true}); if(sceneError) return sceneError;
  }
  if (Number(job?.round) === 2 && job?.phase === 'round2-final') {
    if (!value.youtube || typeof value.youtube !== 'object') return 'Završni paket nema youtube objekat.';
    if (!value.qualityAudit || typeof value.qualityAudit !== 'object') return 'Završni paket nema qualityAudit objekat.';
    if (Array.isArray(value.scenes) && value.scenes.length) return 'Završni paket ne treba ponovo da vraća scenes.';
  }
  return '';
}
function jobLabel(job) {
  if (!job) return 'NEMA AKTIVNOG ZAHTEVA';
  if (job.type === 'test') return 'TEST MOSTA';
  if (job.phase === 'prompt-to-spot') return `PROMPT → SPOT — ${job.songTitle || 'nova pesma'} · ${promptSizeLabel(job)}`;
  if (job.phase === 'round2-scenes') return `STORYBOARD ${Number(job.batchIndex) + 1}/${job.batchTotal} — ${job.songTitle || 'nova pesma'} · ${promptSizeLabel(job)}`;
  if (job.phase === 'round2-final') return `ZAVRŠNI YOUTUBE + QA — ${job.songTitle || 'nova pesma'} · ${promptSizeLabel(job)}`;
  return `KRUG ${job.round} — ${job.songTitle || 'nova pesma'} · ${promptSizeLabel(job)}`;
}
async function refreshJob(showConnectedMessage = false) {
  if (refreshBusy) return currentJob;
  refreshBusy = true;
  try {
    const response = await send({ type: 'MSS_GET_JOB' });
    const title = panelNode('[data-mss-job]');
    if (!response?.ok || !response.job) {
      currentJob = null;
      lastJobId = '';
      renderJobBrief();
      if (title) title.textContent = 'MOST JE POVEZAN — ČEKA ZADATAK IZ PROGRAMA';
      setButtons(false);
      setStatus('Veza sa programom radi. Nema aktivnog zadatka. Pokreni Korak 3 u Muzičkom Spot Studiju.', 'warn');
      return null;
    }
    currentJob = response.job;
    renderJobBrief();
    if (title) title.textContent = jobLabel(currentJob);
    const correctPage = isTargetGptPage();
    setButtons(correctPage);
    const isNew = currentJob.id !== lastJobId;
    if (isNew) fallbackAttemptedForJob = '';
    lastJobId = currentJob.id;
    if (!correctPage) {
      setStatus('Otvoren je pogrešan ChatGPT razgovor ili GPT editor. Klikni „OTVORI MOJ PRIVATNI GPT“.', 'error');
      return currentJob;
    }
    if (String(currentJob.prompt || '').length > MAX_PROMPT_CHARS) {
      setButtons(false);
      setStatus(`Zahtev je prevelik (${promptSizeLabel(currentJob)}). Program mora da napravi kompaktan paket ispod 24 KB.`, 'error');
    } else if (currentJob.status === 'result-ready') {
      setStatus('Odgovor je već vraćen programu.', 'ok');
    } else if (currentJob.status === 'waiting-response' || currentJob.status === 'sent') {
      setStatus('Zahtev je poslat. Sačekaj da ChatGPT potpuno završi, pa vrati odgovor.', 'ok');
    } else {
      setStatus(isNew || showConnectedMessage
        ? `Zadatak je spreman (${promptSizeLabel(currentJob)}). Klikni prvo veliko dugme.`
        : `Zadatak čeka slanje (${promptSizeLabel(currentJob)}).`, 'ok');
    }
    return currentJob;
  } finally { refreshBusy = false; }
}
async function insertAndSend() {
  if (!currentJob) await refreshJob(true);
  if (!currentJob) return;
  if (!isTargetGptPage()) {
    setStatus('Otvori tačno svoj privatni GPT, pa ponovi.', 'error');
    return;
  }
  if (hasConversationMessages()) { setStatus('Otvaram potpuno NOV razgovor da stara pesma ne utiče na novi Korak 3. Kada se učita, klikni prvo dugme ponovo.', 'warn'); location.href = TARGET_GPT_URL; return; }
  const prompt = String(currentJob.prompt || '');
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    setStatus(`Zahtev nije bezbedne veličine (${promptSizeLabel(currentJob)}).`, 'error');
    return;
  }
  const composer = findComposer();
  if (!composer) {
    setStatus('Ne nalazim polje za poruku. Otvori novi razgovor u svom privatnom GPT-u i sačekaj da se učita.', 'error');
    return;
  }
  lastAssistantTextBeforeSend = latestAssistantText();
  insertText(composer, prompt);
  await send({ type:'MSS_JOB_STATUS', payload:{ jobId:currentJob.id, status:'inserted', message:`Ubačen kompaktan zahtev od ${promptSizeLabel(currentJob)}.` } });
  setStatus('Zahtev je ubačen. Tražim dugme Pošalji…', 'ok');
  await new Promise(resolve => setTimeout(resolve, 700));
  const button = findSendButton();
  if (!button) {
    setStatus('Tekst je ubačen, ali dugme Pošalji nije pronađeno. Klikni obično ChatGPT dugme za slanje.', 'warn');
    return;
  }
  button.click();
  await send({ type:'MSS_JOB_STATUS', payload:{ jobId:currentJob.id, status:'waiting-response', message:'Kompaktan zahtev je poslat ChatGPT-u.' } });
  currentJob.status = 'waiting-response';
  setStatus('Poslato. Sačekaj završetak. Ne klikći „Vrati odgovor“ dok ChatGPT još piše.', 'ok');
  await new Promise(resolve => setTimeout(resolve, 5000));
  const error = visibleChatGptError();
  if (error) await autoRecoverIfNeeded();
}
async function sendFallbackPrompt(automatic = false) {
  if (!currentJob) await refreshJob(true);
  const prompt = String(currentJob?.fallbackPrompt || '');
  if (!prompt) return setStatus('Za ovaj zadatak nema lakšeg rezervnog zahteva.', 'warn');
  if (!isTargetGptPage()) return setStatus('Najpre otvori tačno svoj privatni GPT.', 'error');
  const composer = findComposer();
  if (!composer) return setStatus('Ne nalazim polje za poruku. Klikni „OTVORI NOV RAZGOVOR U MOM GPT-u“.', 'error');
  fallbackAttemptedForJob = currentJob.id;
  lastAssistantTextBeforeSend = latestAssistantText();
  insertText(composer, prompt);
  await new Promise(resolve => setTimeout(resolve, 550));
  const button = findSendButton();
  if (!button) return setStatus('Ultra laki zahtev je ubačen. Klikni obično ChatGPT dugme Pošalji.', 'warn');
  button.click();
  await send({ type:'MSS_JOB_STATUS', payload:{ jobId:currentJob.id, status:'waiting-response', message:'Poslat je ultra laki rezervni zahtev.' } });
  currentJob.status = 'waiting-response';
  setStatus(automatic ? 'ChatGPT je prijavio grešku. Automatski sam poslao ULTRA LAKI zahtev. Sačekaj novi JSON odgovor.' : 'Poslat je ULTRA LAKI zahtev. Sačekaj završetak.', 'ok');
}
function setAutoModeUi() {
  const button = panelNode('[data-mss-auto]');
  if (!button) return;
  button.textContent = autoModeEnabled ? 'AUTOMATSKI REŽIM: UKLJUČEN' : 'AUTOMATSKI REŽIM: ISKLJUČEN';
  button.dataset.on = String(autoModeEnabled);
}
async function loadAutoModePreference() {
  try {
    const stored = await new Promise(resolve => chrome.storage.local.get([AUTO_MODE_KEY], resolve));
    if (typeof stored?.[AUTO_MODE_KEY] === 'boolean') autoModeEnabled = stored[AUTO_MODE_KEY];
  } catch {}
  setAutoModeUi();
}
function toggleAutoMode() {
  autoModeEnabled = !autoModeEnabled;
  setAutoModeUi();
  try { chrome.storage.local.set({ [AUTO_MODE_KEY]: autoModeEnabled }); } catch {}
  setStatus(autoModeEnabled ? 'Automatski režim uključen: program će sam slati i vraćati odgovore.' : 'Automatski režim isključen: koristi dugmad ručno.', 'ok');
}
// Automatski tik: bez ovoga korisnik mora ručno da klikne "Ubaci i pošalji" pa "Vrati odgovor"
// za SVAKI krug (ideje, storyboard paketi, završni paket) — ovo to radi samo, dugmad ostaju
// kao ručna rezerva ako automatika ne prepozna stranicu (npr. ChatGPT promeni izgled sajta).
async function autoTick() {
  if (!autoModeEnabled || autoBusy || !currentJob) return;
  if (!isTargetGptPage()) return;
  autoBusy = true;
  try {
    if (await autoRecoverIfNeeded()) return;
    const status = String(currentJob.status || '');
    const isPending = !status || status === 'pending';
    if (isPending && autoSentForJob !== currentJob.id) {
      if (hasConversationMessages()) {
        if (autoNavigatedForJob !== currentJob.id) {
          autoNavigatedForJob = currentJob.id;
          setStatus('Automatski otvaram nov razgovor za novi zadatak…', 'ok');
          location.href = TARGET_GPT_URL;
        }
        return;
      }
      autoSentForJob = currentJob.id;
      await insertAndSend();
      return;
    }
    if (status === 'waiting-response' || status === 'sent' || status === 'inserted') {
      if (isGenerating()) return;
      const raw = latestAssistantText();
      if (!raw || raw === lastAssistantTextBeforeSend) return;
      if (autoReturnedForJob === currentJob.id) return;
      autoReturnedForJob = currentJob.id;
      await returnAnswer();
    }
  } catch (error) {
    setStatus(`Automatika je naišla na grešku: ${error.message}. Koristi dugmad ručno.`, 'error');
  } finally {
    autoBusy = false;
  }
}
async function autoRecoverIfNeeded() {
  if (autoRecoveryBusy || !currentJob || currentJob.type === 'test') return false;
  if (!['waiting-response','sent','inserted'].includes(String(currentJob.status || ''))) return false;
  const error = visibleChatGptError();
  if (!error || fallbackAttemptedForJob === currentJob.id || !currentJob.fallbackPrompt) return false;
  autoRecoveryBusy = true;
  try { await sendFallbackPrompt(true); return true; }
  finally { autoRecoveryBusy = false; }
}
async function returnAnswer() {
  if (!currentJob) await refreshJob(true);
  if (!currentJob) return;
  if (!isTargetGptPage()) {
    setStatus('Odgovor mora biti u tačno podešenom privatnom GPT-u.', 'error');
    return;
  }
  if (isGenerating()) {
    setStatus('ChatGPT još generiše odgovor. Sačekaj da dugme za zaustavljanje nestane.', 'warn');
    return;
  }
  const chatError = visibleChatGptError();
  const raw = latestAssistantText();
  if (chatError && (!raw || raw === lastAssistantTextBeforeSend)) {
    if (currentJob.fallbackPrompt && fallbackAttemptedForJob !== currentJob.id) {
      await sendFallbackPrompt(true);
      return;
    }
    setStatus(`Ne vraćam grešku u program. ChatGPT prikazuje: ${chatError}. Otvori novi razgovor i pošalji ultra laki zahtev.`, 'error');
    return;
  }
  if (!raw || raw === lastAssistantTextBeforeSend) {
    setStatus('Nema novog završenog odgovora. Sačekaj da se pojavi JSON odgovor.', 'error');
    return;
  }
  let parsed = extractJsonObject(raw);
  if (!parsed) {
    setStatus('Poslednji odgovor nije validan JSON. U ChatGPT-u napiši: „Vrati samo ispravan JSON bez objašnjenja.“', 'error');
    return;
  }
  parsed = enforceLockedIdentityInAnswer(parsed, currentJob);
  const validationError = validateAnswerForJob(parsed, currentJob);
  if (validationError) {
    setStatus(`Odgovor nije kompletan: ${validationError}`, 'error');
    return;
  }
  const response = await send({ type:'MSS_POST_RESULT', payload:{ jobId:currentJob.id, raw:parsed.raw } });
  if (!response?.ok) {
    setStatus(response?.error || 'Odgovor nije vraćen programu.', 'error');
    return;
  }
  currentJob.status = 'result-ready';
  renderAnswerPrompts();
  setStatus(currentJob.type === 'test'
    ? 'TEST JE VRAĆEN. U programu mora pisati „MOST RADI“.'
    : 'Validan JSON je vraćen i program će ga uvesti.', 'ok');
  if (currentJob.type !== 'test') {
    send({ type:'MSS_NOTIFY', title:'Muzički Spot Studio', body:`Korak 3 je gotov: ${jobLabel(currentJob)}. Vrati se u program.` });
  }
}
function copyPromptFallback() {
  if (!currentJob?.prompt) return setStatus('Nema zahteva za kopiranje.', 'warn');
  navigator.clipboard.writeText(currentJob.prompt)
    .then(() => setStatus('Zahtev je kopiran.', 'ok'))
    .catch(() => setStatus('Kopiranje nije uspelo.', 'error'));
}
function currentParsedAnswer() { const raw=latestAssistantText(); const parsed=extractJsonObject(raw); return enforceLockedIdentityInAnswer(parsed,currentJob); }
function renderJobBrief() {
  const node=panelNode('[data-mss-brief]'); if(!node) return;
  if(!currentJob){node.textContent='Nema aktivnog kreativnog briefa.';return;}
  const direct=currentJob?.payload?.project?.promptToSpot;
  if(direct){
    const refs=(direct.selectedReferences||[]).map(item=>item.title).filter(Boolean);
    node.textContent=[`TIP: ${direct.spotType || 'auto'}`,`PROMPT: ${String(direct.prompt||'').slice(0,420)}`,`SCENE: do ${direct.maxScenes||''} • TRAJANJE: ${direct.requestedDuration||''} s`,`REFERENCE: ${refs.length?refs.join(' | '):'GPT mora da pronađe aktuelne YouTube spotove'}`].join('\n');
  } else node.textContent=`Režim: ${jobLabel(currentJob)}\nGPT mora vratiti validan JSON po pravilima programa.`;
}
function renderAnswerPrompts() {
  const node=panelNode('[data-mss-prompts]'); if(!node) return;
  const parsed=currentParsedAnswer(); const scenes=Array.isArray(parsed?.value?.scenes)?parsed.value.scenes:[];
  if(!scenes.length){node.textContent='U poslednjem GPT odgovoru još nema storyboard scena sa promptovima.';return;}
  node.innerHTML='';
  const summary=el('div',{class:'mss-prompt-summary'},`${scenes.length} scena • ${scenes.filter(x=>x.imagePrompt).length} image promptova • ${scenes.filter(x=>x.videoPrompt).length} video promptova`); node.append(summary);
  scenes.slice(0,36).forEach((scene,index)=>{
    const item=el('details',{class:'mss-prompt-item'}); const title=el('summary',{},`Scena ${scene.number||index+1}: ${scene.sceneTitle||scene.title||scene.location||''}`); item.append(title);
    const ip=el('pre',{},`IMAGE PROMPT\n${scene.imagePrompt||'NEMA'}`); const vp=el('pre',{},`VIDEO PROMPT\n${scene.videoPrompt||'NEMA'}`); item.append(ip,vp); node.append(item);
  });
}
function copyAnswerPrompts(kind) {
  const parsed=currentParsedAnswer(); const scenes=Array.isArray(parsed?.value?.scenes)?parsed.value.scenes:[]; const key=kind==='image'?'imagePrompt':'videoPrompt';
  const text=scenes.map((scene,index)=>`SCENA ${scene.number||index+1}\n${scene[key]||''}`).filter(x=>x.trim()).join('\n\n');
  if(!text.trim()) return setStatus(`Nema ${kind} promptova u poslednjem odgovoru.`,'warn');
  navigator.clipboard.writeText(text).then(()=>setStatus(`${kind==='image'?'Image':'Video'} promptovi su kopirani.`,'ok')).catch(()=>setStatus('Kopiranje nije uspelo.','error'));
}

function buildPanel() {
  if (document.getElementById(PANEL_ID)) return;
  const panel = el('section', { id:PANEL_ID });
  panel.innerHTML = `
    <div class="mss-head"><strong>MUZIČKI SPOT STUDIO ${BRIDGE_VERSION}</strong><button type="button" data-mss-hide aria-label="Sakrij">×</button></div>
    <div class="mss-job" data-mss-job>PROVERAVAM VEZU…</div>
    <button class="mss-auto" type="button" data-mss-auto data-on="true">AUTOMATSKI REŽIM: UKLJUČEN</button>
    <div class="mss-status" data-mss-status>Tražim aktivni Korak 3 zahtev…</div>
    <details class="mss-brief-wrap" open><summary>KREATIVNI BRIEF KOJI SE ŠALJE</summary><pre data-mss-brief>Nema aktivnog briefa.</pre></details>
    <button class="mss-open" type="button" data-mss-open>OTVORI NOV RAZGOVOR U MOM GPT-u</button>
    <button class="mss-primary" type="button" data-mss-send disabled>1. UBACI I POŠALJI U CHATGPT</button>
    <button class="mss-primary" type="button" data-mss-return disabled>2. VRATI ODGOVOR U PROGRAM</button>
    <button class="mss-fallback" type="button" data-mss-fallback>GREŠKA? POŠALJI ULTRA LAKI ZAHTEV</button>
    <button class="mss-open" type="button" data-mss-show-prompts>PRIKAŽI PROMPTOVE IZ ODGOVORA</button>
    <div class="mss-row"><button type="button" data-mss-copy-image>KOPIRAJ IMAGE</button><button type="button" data-mss-copy-video>KOPIRAJ VIDEO</button></div>
    <div class="mss-prompts" data-mss-prompts>Promptovi će se pojaviti kada GPT vrati storyboard.</div>
    <div class="mss-row"><button type="button" data-mss-refresh>PROVERI NOVI ZADATAK</button><button type="button" data-mss-copy>KOPIRAJ ZAHTEV</button></div>
    <small>Koristi unapred upisan privatni GPT. Ne koristi OpenAI API, tunel ni dodatno prijavljivanje.</small>`;
  const style = el('style');
  style.textContent = `#${PANEL_ID}{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:360px;padding:14px;border:1px solid #384463;border-radius:14px;background:#10182b;color:#fff;box-shadow:0 18px 55px rgba(0,0,0,.45);font:13px/1.4 Arial,sans-serif}#${PANEL_ID} .mss-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}#${PANEL_ID} .mss-head button{background:transparent;color:#fff;border:0;font-size:22px;cursor:pointer}#${PANEL_ID} .mss-job{font-weight:800;color:#ffcf66;margin-bottom:6px}#${PANEL_ID} .mss-auto{width:100%;padding:8px;margin-bottom:8px;border:0;border-radius:8px;font-weight:800;cursor:pointer;background:#1d9e72;color:#fff}#${PANEL_ID} .mss-auto[data-on="false"]{background:#3a4260;color:#c7d0e6}#${PANEL_ID} .mss-status{padding:10px;border-radius:9px;background:#1d2944;margin-bottom:9px;white-space:pre-wrap}#${PANEL_ID} .mss-status[data-kind="error"]{background:#54202a}#${PANEL_ID} .mss-status[data-kind="warn"]{background:#55431d}#${PANEL_ID} button{cursor:pointer}#${PANEL_ID} button:disabled{opacity:.45;cursor:not-allowed}#${PANEL_ID} .mss-primary,#${PANEL_ID} .mss-open,#${PANEL_ID} .mss-fallback{width:100%;padding:10px;margin:5px 0;border:0;border-radius:9px;color:white;font-weight:800}#${PANEL_ID} .mss-primary{background:#ff3b69}#${PANEL_ID} .mss-open{background:#4659b8}#${PANEL_ID} .mss-fallback{background:#8a5b13}#${PANEL_ID} .mss-row{display:flex;gap:8px;margin:6px 0}#${PANEL_ID} .mss-row button{flex:1;padding:7px;border:1px solid #53617f;border-radius:8px;background:#202b43;color:white}#${PANEL_ID} small{display:block;color:#b9c4d9;margin-top:7px}#${PANEL_ID} .mss-brief-wrap{margin:8px 0;border:1px solid #39486a;border-radius:9px;padding:7px}#${PANEL_ID} .mss-brief-wrap summary{cursor:pointer;font-weight:800}#${PANEL_ID} .mss-brief-wrap pre{max-height:150px;overflow:auto;white-space:pre-wrap;color:#cfdaee}#${PANEL_ID} .mss-prompts{max-height:280px;overflow:auto;margin:8px 0;padding:8px;border-radius:9px;background:#0b1222}#${PANEL_ID} .mss-prompt-item{border-top:1px solid #34415e;padding:6px 0}#${PANEL_ID} .mss-prompt-item summary{cursor:pointer;font-weight:700}#${PANEL_ID} .mss-prompt-item pre{white-space:pre-wrap;font-size:11px;color:#d9e4f5}`;
  document.documentElement.append(style, panel);
  panel.querySelector('[data-mss-hide]').addEventListener('click', () => panel.style.display='none');
  panel.querySelector('[data-mss-auto]').addEventListener('click', toggleAutoMode);
  panel.querySelector('[data-mss-open]').addEventListener('click', openTargetGpt);
  panel.querySelector('[data-mss-send]').addEventListener('click', () => insertAndSend().catch(error => setStatus(error.message, 'error')));
  panel.querySelector('[data-mss-return]').addEventListener('click', () => returnAnswer().catch(error => setStatus(error.message, 'error')));
  panel.querySelector('[data-mss-fallback]').addEventListener('click', () => sendFallbackPrompt().catch(error => setStatus(error.message, 'error')));
  panel.querySelector('[data-mss-refresh]').addEventListener('click', () => refreshJob(true).catch(error => setStatus(error.message, 'error')));
  panel.querySelector('[data-mss-copy]').addEventListener('click', copyPromptFallback);
  panel.querySelector('[data-mss-show-prompts]').addEventListener('click', renderAnswerPrompts);
  panel.querySelector('[data-mss-copy-image]').addEventListener('click', () => copyAnswerPrompts('image'));
  panel.querySelector('[data-mss-copy-video]').addEventListener('click', () => copyAnswerPrompts('video'));
  loadAutoModePreference();
  refreshJob(true).catch(error => setStatus(error.message, 'error'));
  send({ type:'MSS_HEARTBEAT', source:'chatgpt', page:location.href });
}

buildPanel();
setInterval(() => refreshJob(false).then(() => autoTick()).catch(() => {}), 2500);
setInterval(() => send({ type:'MSS_HEARTBEAT', source:'chatgpt', page:location.href }), 15000);
