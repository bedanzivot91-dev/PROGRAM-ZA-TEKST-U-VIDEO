'use strict';

(() => {
  const state = { projects: [], project: null, tracks: [], busy: false };

  const css = `
    #mss-completion-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:0;border-radius:999px;padding:12px 16px;background:#111827;color:#fff;font:700 13px system-ui;box-shadow:0 12px 30px #0008;cursor:pointer}
    #mss-completion-panel{position:fixed;inset:20px;z-index:2147482999;background:#080b12;color:#e5e7eb;border:1px solid #293244;border-radius:18px;box-shadow:0 20px 70px #000c;display:none;overflow:hidden;font:14px system-ui}
    #mss-completion-panel.open{display:grid;grid-template-columns:320px 1fr}
    #mss-completion-panel button,#mss-completion-panel input,#mss-completion-panel select,#mss-completion-panel textarea{font:inherit}
    .mss-cu-side{padding:16px;border-right:1px solid #293244;overflow:auto}.mss-cu-main{padding:18px;overflow:auto}.mss-cu-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}.mss-cu-btn{border:1px solid #374151;background:#111827;color:#fff;border-radius:9px;padding:8px 10px;cursor:pointer}.mss-cu-btn.primary{background:#2563eb}.mss-cu-btn.danger{background:#7f1d1d}.mss-cu-btn:disabled{opacity:.5;cursor:not-allowed}.mss-cu-input{background:#0f172a;color:#fff;border:1px solid #334155;border-radius:8px;padding:8px;min-width:120px}.mss-cu-area{width:100%;min-height:140px;resize:vertical;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:8px;padding:10px;box-sizing:border-box}.mss-cu-project{padding:10px;border:1px solid #293244;border-radius:10px;margin:7px 0;cursor:pointer}.mss-cu-project.active{border-color:#3b82f6;background:#0b1730}.mss-cu-card{border:1px solid #293244;border-radius:12px;padding:12px;margin:10px 0;background:#0b0f18}.mss-cu-muted{color:#94a3b8;font-size:12px}.mss-cu-ok{color:#86efac}.mss-cu-bad{color:#fca5a5}.mss-cu-warn{color:#fde68a}.mss-cu-track{border:1px solid #334155;border-radius:10px;padding:10px;margin:10px 0}.mss-cu-cue{display:grid;grid-template-columns:100px 100px 1fr auto;gap:6px;margin:6px 0}.mss-cu-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.mss-cu-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.mss-cu-scene{padding:8px;border:1px solid #263244;border-radius:9px;margin:6px 0}.mss-cu-progress{height:8px;background:#1f2937;border-radius:999px;overflow:hidden}.mss-cu-progress>span{display:block;height:100%;background:#2563eb}.mss-cu-kbd{font:12px ui-monospace,monospace;background:#111827;padding:2px 5px;border-radius:5px}
  `;

  function projectId() { return state.project?.projectId || state.project?.id || ''; }
  function setStatus(text, kind = 'muted') {
    const box = document.getElementById('mss-cu-status');
    if (!box) return;
    box.className = kind === 'ok' ? 'mss-cu-ok' : kind === 'bad' ? 'mss-cu-bad' : kind === 'warn' ? 'mss-cu-warn' : 'mss-cu-muted';
    box.textContent = text;
  }
  function showError(error) { setStatus(error?.message || String(error), 'bad'); }
  function setBusy(value, message = '') {
    state.busy = Boolean(value);
    document.querySelectorAll('#mss-completion-panel button').forEach(button => { button.disabled = state.busy; });
    if (message) setStatus(message, 'warn');
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'checked') node.checked = Boolean(value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value !== undefined && value !== null) node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child != null) node.append(child.nodeType ? child : document.createTextNode(String(child)));
    return node;
  }

  async function fileToBase64(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  }

  async function refreshProjects(selectId = '') {
    try {
      const data = await api('/api/audio-projects');
      state.projects = Array.isArray(data) ? data : (data.projects || data.items || []);
      const wanted = selectId || projectId();
      if (wanted) {
        const fresh = state.projects.find(p => (p.projectId || p.id) === wanted);
        if (fresh) state.project = fresh;
      }
      renderProjects();
      renderMain();
    } catch (e) { showError(e); }
  }

  async function refreshProjectDetails() {
    if (!projectId()) return;
    try {
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId())}`);
      state.project = data.project || data;
    } catch (e) { showError(e); }
  }

  function renderProjects() {
    const list = document.getElementById('mss-cu-projects');
    if (!list) return;
    list.innerHTML = '';
    if (!state.projects.length) list.append(el('div', { class:'mss-cu-muted', text:'Nema audio projekata. Napravi prvi projekat.' }));
    for (const project of state.projects) {
      const id = project.projectId || project.id;
      const progress = Number(project.overallProgress || 0);
      const item = el('div', { class:`mss-cu-project ${projectId() === id ? 'active' : ''}` });
      item.append(
        el('strong', { text: project.name || project.songTitle || id }),
        el('div', { class:'mss-cu-muted', text:`${project.artist || ''}${project.status ? ` • ${project.status}` : ''}` }),
        el('div', { class:'mss-cu-progress' }, [el('span', { style:`width:${Math.max(0, Math.min(100, progress))}%` })])
      );
      item.addEventListener('click', async () => {
        state.project = project;
        renderProjects();
        await refreshProjectDetails();
        await refreshTracks();
        renderMain();
      });
      list.append(item);
    }
  }

  async function createProject() {
    const title = prompt('Naziv projekta / pesme:');
    if (!title) return;
    const artist = prompt('Izvođač (opciono):', '') || '';
    try {
      setBusy(true, 'Pravim projekat...');
      const data = await api('/api/audio-projects', { method:'POST', body:JSON.stringify({ name:title, songTitle:title, artist }) });
      state.project = data.project;
      await refreshProjects(projectId());
      await refreshTracks();
      setStatus('Projekat napravljen.', 'ok');
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  async function renameProject() {
    const current = state.project?.name || state.project?.songTitle || '';
    const name = prompt('Novi naziv projekta:', current);
    if (!name || !projectId()) return;
    try {
      setBusy(true, 'Menjam naziv...');
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId())}/rename`, { method:'POST', body:JSON.stringify({ name }) });
      state.project = data.project;
      await refreshProjects(projectId());
      setStatus('Naziv promenjen.', 'ok');
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  async function duplicateProject() {
    if (!projectId()) return;
    try {
      setBusy(true, 'Dupliram projekat...');
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId())}/duplicate`, { method:'POST', body:'{}' });
      state.project = data.project;
      await refreshProjects(projectId());
      await refreshTracks();
      setStatus('Kopija projekta napravljena.', 'ok');
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  async function archiveProject() {
    if (!projectId()) return;
    try {
      setBusy(true, 'Arhiviram projekat...');
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId())}/archive`, { method:'POST', body:JSON.stringify({ archived:true }) });
      state.project = data.project;
      await refreshProjects(projectId());
      setStatus('Projekat arhiviran.', 'ok');
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  async function deleteProject() {
    if (!projectId()) return;
    const name = state.project?.name || state.project?.songTitle || projectId();
    if (!confirm(`TRAJNO obrisati projekat "${name}"? Ova radnja se ne može poništiti.`)) return;
    if (!confirm('Poslednja potvrda: trajno brisanje projekta i njegovih fajlova?')) return;
    try {
      setBusy(true, 'Brišem projekat...');
      await api(`/api/audio-projects/${encodeURIComponent(projectId())}?deletePermanently=true`, { method:'DELETE' });
      state.project = null; state.tracks = [];
      await refreshProjects();
      setStatus('Projekat trajno obrisan.', 'ok');
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  async function uploadAudio(input) {
    const file = input?.files?.[0];
    if (!file || !projectId()) return;
    try {
      setBusy(true, `Učitavam ${file.name} (${Math.round(file.size / 1024 / 1024)} MB)...`);
      const audioBase64 = await fileToBase64(file);
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId())}/audio`, { method:'POST', body:JSON.stringify({ fileName:file.name, audioBase64 }) });
      state.project = data.project;
      await refreshProjects(projectId());
      setStatus(`Audio učitan. Trajanje: ${Math.round((state.project.audio?.durationMs || 0) / 1000)} s.`, 'ok');
    } catch (e) { showError(e); } finally { setBusy(false); input.value = ''; }
  }

  async function saveLyrics() {
    const area = document.getElementById('mss-cu-lyrics');
    if (!area || !projectId()) return;
    try {
      setBusy(true, 'Čuvam tekst pesme...');
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId())}/lyrics`, { method:'PATCH', body:JSON.stringify({ text:area.value }) });
      state.project.lyrics = data.lyrics || data.project?.lyrics || state.project.lyrics;
      await refreshProjectDetails();
      await refreshProjects(projectId());
      setStatus('Tekst pesme sačuvan i parsiran.', 'ok');
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  async function runProjectAction(path, busyMessage, successMessage) {
    if (!projectId()) return;
    try {
      setBusy(true, busyMessage);
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId())}/${path}`, { method:'POST', body:'{}' });
      if (data.project) state.project = data.project;
      await refreshProjectDetails();
      await refreshProjects(projectId());
      renderMain();
      const failureReason = state.project?.lyricsGenerationStatus?.ok === false ? state.project.lyricsGenerationStatus.reason : state.project?.musicAnalysis?.ok === false ? state.project.musicAnalysis.reason : state.project?.transcription?.ok === false ? state.project.transcription.reason : '';
      setStatus(failureReason ? `${successMessage} Ograničenje: ${failureReason}.` : successMessage, failureReason ? 'warn' : 'ok');
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  async function planScenes() {
    if (!projectId()) return;
    const intensity = document.getElementById('mss-cu-intensity')?.value || 'dynamic';
    const minimumSceneDuration = Number(document.getElementById('mss-cu-min-scene')?.value || 1500);
    try {
      setBusy(true, 'Planiram scene...');
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId())}/plan-scenes`, { method:'POST', body:JSON.stringify({ editingIntensity:intensity, minimumSceneDuration }) });
      state.project = data.project;
      await refreshProjects(projectId());
      renderMain();
      setStatus(`Storyboard napravljen: ${state.project.storyboard?.scenes?.length || 0} scena.`, 'ok');
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  async function refreshTracks() {
    if (!projectId()) { state.tracks = []; return; }
    try {
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId())}/lyrics-overlay`);
      state.tracks = data.tracks || [];
    } catch (e) { state.tracks = []; showError(e); }
  }

  async function addTrack() {
    if (!projectId()) return;
    const type = document.getElementById('mss-cu-track-type')?.value || 'lyrics';
    const name = document.getElementById('mss-cu-track-name')?.value || type;
    try {
      await api(`/api/audio-projects/${encodeURIComponent(projectId())}/lyrics-overlay/text-tracks`, { method:'POST', body:JSON.stringify({ type, name, language:'sr' }) });
      await refreshTracks(); renderMain(); setStatus('Text track napravljen.', 'ok');
    } catch (e) { showError(e); }
  }

  async function deleteTrack(trackId) {
    if (!confirm('Obrisati ovaj text track? Backup se pravi pre brisanja.')) return;
    try {
      await api(`/api/audio-projects/${encodeURIComponent(projectId())}/lyrics-overlay/text-tracks/${encodeURIComponent(trackId)}`, { method:'DELETE' });
      await refreshTracks(); renderMain(); setStatus('Text track obrisan.', 'ok');
    } catch (e) { showError(e); }
  }

  async function addCue(trackId) {
    const text = prompt('Tekst cue-a:');
    if (!text) return;
    const start = Number(prompt('Početak u ms:', '0'));
    const end = Number(prompt('Kraj u ms:', String(Math.max(start + 2000, 2000))));
    try {
      await api(`/api/audio-projects/${encodeURIComponent(projectId())}/lyrics-overlay/text-tracks/${encodeURIComponent(trackId)}/text-cues`, { method:'POST', body:JSON.stringify({ startMs:start, endMs:end, text, timingSource:'manual', confidence:1 }) });
      await refreshTracks(); renderMain();
    } catch (e) { showError(e); }
  }

  async function updateCue(trackId, cueId, row) {
    const inputs = row.querySelectorAll('input');
    try {
      await api(`/api/audio-projects/${encodeURIComponent(projectId())}/lyrics-overlay/text-tracks/${encodeURIComponent(trackId)}/text-cues/${encodeURIComponent(cueId)}`, { method:'PATCH', body:JSON.stringify({ startMs:Number(inputs[0].value), endMs:Number(inputs[1].value), text:inputs[2].value }) });
      await refreshTracks(); renderMain(); setStatus('Cue sačuvan.', 'ok');
    } catch (e) { showError(e); }
  }

  async function deleteCue(trackId, cueId) {
    try {
      await api(`/api/audio-projects/${encodeURIComponent(projectId())}/lyrics-overlay/text-tracks/${encodeURIComponent(trackId)}/text-cues/${encodeURIComponent(cueId)}`, { method:'DELETE' });
      await refreshTracks(); renderMain();
    } catch (e) { showError(e); }
  }

  async function validateOverlay() {
    if (!projectId()) return;
    try {
      const result = await api(`/api/audio-projects/${encodeURIComponent(projectId())}/lyrics-overlay/validate`);
      setStatus(result.valid ? 'Lyrics Overlay: validan.' : `Lyrics Overlay: ${result.problems?.join(' | ') || 'nije validan'}`, result.valid ? 'ok' : 'bad');
    } catch (e) { showError(e); }
  }

  function downloadExport(format) {
    if (!projectId()) return;
    window.location.href = `/api/audio-projects/${encodeURIComponent(projectId())}/export?format=${encodeURIComponent(format)}`;
  }
  function downloadTrack(trackId, format) {
    window.location.href = `/api/audio-projects/${encodeURIComponent(projectId())}/lyrics-overlay/export?trackId=${encodeURIComponent(trackId)}&format=${encodeURIComponent(format)}`;
  }

  function renderStoryboard(container) {
    const scenes = state.project?.storyboard?.scenes || [];
    const card = el('div', { class:'mss-cu-card' });
    card.append(el('strong', { text:`STORYBOARD (${scenes.length} scena)` }));
    if (!scenes.length) card.append(el('div', { class:'mss-cu-muted', text:'Još nema scena. Klikni PLANIRAJ SCENE.' }));
    for (const scene of scenes) {
      card.append(el('div', { class:'mss-cu-scene' }, [
        el('strong', { text:`Scena ${scene.number ?? scene.sceneId}` }),
        el('div', { class:'mss-cu-muted', text:`${scene.startMs ?? 0}–${scene.endMs ?? 0} ms • ${scene.cutReason || 'bez razloga reza'}` })
      ]));
    }
    container.append(card);
  }

  function renderMain() {
    const main = document.getElementById('mss-cu-main');
    if (!main) return;
    main.innerHTML = '';
    if (!state.project) {
      main.append(el('h2',{text:'Muzički Spot Studio — kompletan audio workflow'}), el('p',{class:'mss-cu-muted',text:'Izaberi ili napravi projekat levo. Ovaj panel direktno koristi v15.6 audio-projects, ScenePlanner i Lyrics Overlay backend.'}));
      return;
    }
    const p = state.project;
    main.append(el('div',{class:'mss-cu-head'},[
      el('div',{},[el('h2',{text:p.name || p.songTitle || 'Projekat'}),el('div',{class:'mss-cu-muted',text:`ID: ${projectId()}${p.artist ? ` • ${p.artist}` : ''}`})]),
      el('div',{class:'mss-cu-row'},[
        el('button',{class:'mss-cu-btn',text:'Osveži',onclick:async()=>{await refreshProjectDetails();await refreshProjects(projectId());await refreshTracks();renderMain();}}),
        el('button',{class:'mss-cu-btn',text:'Preimenuj',onclick:renameProject}),
        el('button',{class:'mss-cu-btn',text:'Dupliraj',onclick:duplicateProject}),
        el('button',{class:'mss-cu-btn',text:'Arhiviraj',onclick:archiveProject}),
        el('button',{class:'mss-cu-btn danger',text:'Trajno obriši',onclick:deleteProject})
      ])
    ]));

    const audio = el('div',{class:'mss-cu-card'});
    const fileInput = el('input',{type:'file',accept:'.mp3,.wav,.m4a,.aac,.flac',class:'mss-cu-input',onchange:event=>uploadAudio(event.target)});
    audio.append(el('strong',{text:'1. AUDIO'}),el('div',{class:'mss-cu-row'},[fileInput]),el('div',{class:'mss-cu-muted',text:p.audio ? `${p.audio.originalFileName || p.audio.storedFileName} • ${Math.round((p.audio.durationMs || 0)/1000)} s • ${p.audio.codec || ''}` : 'Audio još nije učitan.'}));
    main.append(audio);

    const lyricsCard = el('div',{class:'mss-cu-card'});
    const lyricsArea = el('textarea',{id:'mss-cu-lyrics',class:'mss-cu-area',placeholder:'[Verse]\nTekst pesme...'});
    lyricsArea.value = p.lyrics?.formattedLyrics || p.lyrics?.rawText || '';
    lyricsCard.append(el('strong',{text:'2. TEKST PESME'}),lyricsArea,el('div',{class:'mss-cu-row'},[
      el('button',{class:'mss-cu-btn primary',text:'Sačuvaj tekst',onclick:saveLyrics}),
      el('button',{class:'mss-cu-btn',text:'Auto tekst',onclick:()=>runProjectAction('auto-lyrics','Automatski izvlačim tekst...','Auto-lyrics završen.')}),
      el('button',{class:'mss-cu-btn',text:'Poravnaj sa muzikom',onclick:()=>runProjectAction('align','Poravnavam tekst sa audio zapisom...','Alignment završen.')})
    ]));
    main.append(lyricsCard);

    const analysis = el('div',{class:'mss-cu-card'});
    const intensity = el('select',{id:'mss-cu-intensity',class:'mss-cu-input'},['calm','balanced','dynamic'].map(v=>el('option',{value:v,text:v})));
    intensity.value = 'dynamic';
    const minScene = el('input',{id:'mss-cu-min-scene',class:'mss-cu-input',type:'number',min:'250',step:'250',value:'1500'});
    analysis.append(el('strong',{text:'3. ANALIZA I SCENE'}),el('div',{class:'mss-cu-row'},[
      el('button',{class:'mss-cu-btn',text:'Analiziraj muziku',onclick:()=>runProjectAction('analyze-music','Analiziram muziku...','Analiza muzike završena.')}),
      el('span',{class:'mss-cu-muted',text:'Intenzitet:'}),intensity,
      el('span',{class:'mss-cu-muted',text:'Min. scena ms:'}),minScene,
      el('button',{class:'mss-cu-btn primary',text:'PLANIRAJ SCENE',onclick:planScenes})
    ]));
    main.append(analysis);
    renderStoryboard(main);

    const exports = el('div',{class:'mss-cu-card'});
    exports.append(el('strong',{text:'4. IZVOZ PROJEKTA'}), el('div',{class:'mss-cu-row'},['project.json','storyboard.json','storyboard.txt','scenes.csv','lyrics.srt','timeline.edl','project.pdf','project.zip'].map(format=>el('button',{class:'mss-cu-btn',text:format,onclick:()=>downloadExport(format)}))));
    main.append(exports);

    const trackTools = el('div',{class:'mss-cu-card'});
    const type = el('select',{id:'mss-cu-track-type',class:'mss-cu-input'},['lyrics','translation','title','artist','section','custom','credits'].map(v=>el('option',{value:v,text:v})));
    const name = el('input',{id:'mss-cu-track-name',class:'mss-cu-input',placeholder:'Naziv track-a'});
    trackTools.append(el('strong',{text:'5. LYRICS OVERLAY STUDIO'}),el('div',{class:'mss-cu-row'},[type,name,el('button',{class:'mss-cu-btn primary',text:'+ Novi track',onclick:addTrack}),el('button',{class:'mss-cu-btn',text:'Validiraj',onclick:validateOverlay})]),el('div',{id:'mss-cu-status',class:'mss-cu-muted',text:'Spremno.'}));
    main.append(trackTools);

    if (!state.tracks.length) main.append(el('div',{class:'mss-cu-muted',text:'Nema tekstualnih track-ova.'}));
    for (const track of state.tracks) {
      const card = el('div',{class:'mss-cu-track'});
      card.append(el('div',{class:'mss-cu-head'},[
        el('strong',{text:`${track.name || track.type} (${track.type})`}),
        el('div',{class:'mss-cu-row'},[
          el('button',{class:'mss-cu-btn',text:'+ Cue',onclick:()=>addCue(track.trackId)}),
          ...['srt','vtt','ass','json'].map(f=>el('button',{class:'mss-cu-btn',text:f.toUpperCase(),onclick:()=>downloadTrack(track.trackId,f)})),
          el('button',{class:'mss-cu-btn danger',text:'Obriši track',onclick:()=>deleteTrack(track.trackId)})
        ])
      ]));
      const cues = (track.cues || []).filter(c=>!c.deleted);
      if (!cues.length) card.append(el('div',{class:'mss-cu-muted',text:'Nema cue-ova.'}));
      for (const cue of cues) {
        const row = el('div',{class:'mss-cu-cue'});
        row.append(
          el('input',{class:'mss-cu-input',value:String(cue.startMs)}),
          el('input',{class:'mss-cu-input',value:String(cue.endMs)}),
          el('input',{class:'mss-cu-input',value:cue.text || ''}),
          el('div',{class:'mss-cu-row'},[
            el('button',{class:'mss-cu-btn',text:'Sačuvaj',onclick:()=>updateCue(track.trackId,cue.cueId,row)}),
            el('button',{class:'mss-cu-btn danger',text:'Obriši',onclick:()=>deleteCue(track.trackId,cue.cueId)})
          ])
        );
        card.append(row);
      }
      main.append(card);
    }
  }

  function mount() {
    if (document.getElementById('mss-completion-launcher')) return;
    document.head.append(el('style',{text:css}));
    const launcher = el('button',{id:'mss-completion-launcher',text:'NOVI STUDIO'});
    const panel = el('section',{id:'mss-completion-panel'});
    const side = el('aside',{class:'mss-cu-side'},[
      el('div',{class:'mss-cu-head'},[el('strong',{text:'MOJI SPOTOVI'}),el('button',{class:'mss-cu-btn primary',text:'+',onclick:createProject})]),
      el('div',{class:'mss-cu-muted',text:'Audio → tekst → analiza → scene → overlay → izvoz'}),
      el('div',{id:'mss-cu-projects'})
    ]);
    const main = el('main',{id:'mss-cu-main',class:'mss-cu-main'});
    panel.append(side,main);
    launcher.addEventListener('click',async()=>{
      panel.classList.toggle('open');
      if(panel.classList.contains('open')){
        await refreshProjects();
        if(state.project){await refreshProjectDetails();await refreshTracks();}
        renderMain();
      }
    });
    document.body.append(panel,launcher);
    refreshProjects();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true }); else mount();
})();
