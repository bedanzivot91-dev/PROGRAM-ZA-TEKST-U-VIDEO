'use strict';

(() => {
  const state = { projects: [], project: null, tracks: [] };

  const css = `
    #mss-completion-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:0;border-radius:999px;padding:12px 16px;background:#111827;color:#fff;font:700 13px system-ui;box-shadow:0 12px 30px #0008;cursor:pointer}
    #mss-completion-panel{position:fixed;inset:20px;z-index:2147482999;background:#080b12;color:#e5e7eb;border:1px solid #293244;border-radius:18px;box-shadow:0 20px 70px #000c;display:none;overflow:hidden;font:14px system-ui}
    #mss-completion-panel.open{display:grid;grid-template-columns:300px 1fr}
    #mss-completion-panel button,#mss-completion-panel input,#mss-completion-panel select,#mss-completion-panel textarea{font:inherit}
    .mss-cu-side{padding:16px;border-right:1px solid #293244;overflow:auto}.mss-cu-main{padding:18px;overflow:auto}.mss-cu-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}.mss-cu-btn{border:1px solid #374151;background:#111827;color:#fff;border-radius:9px;padding:8px 10px;cursor:pointer}.mss-cu-btn.primary{background:#2563eb}.mss-cu-btn.danger{background:#7f1d1d}.mss-cu-input{background:#0f172a;color:#fff;border:1px solid #334155;border-radius:8px;padding:8px;min-width:120px}.mss-cu-project{padding:10px;border:1px solid #293244;border-radius:10px;margin:7px 0;cursor:pointer}.mss-cu-project.active{border-color:#3b82f6;background:#0b1730}.mss-cu-card{border:1px solid #293244;border-radius:12px;padding:12px;margin:10px 0;background:#0b0f18}.mss-cu-muted{color:#94a3b8;font-size:12px}.mss-cu-ok{color:#86efac}.mss-cu-bad{color:#fca5a5}.mss-cu-track{border:1px solid #334155;border-radius:10px;padding:10px;margin:10px 0}.mss-cu-cue{display:grid;grid-template-columns:90px 90px 1fr auto;gap:6px;margin:6px 0}.mss-cu-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
  `;

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
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child != null) node.append(child.nodeType ? child : document.createTextNode(String(child)));
    return node;
  }

  function showError(error) {
    const box = document.getElementById('mss-cu-status');
    if (box) { box.className = 'mss-cu-bad'; box.textContent = error?.message || String(error); }
  }

  async function refreshProjects() {
    try {
      const data = await api('/api/audio-projects');
      state.projects = Array.isArray(data) ? data : (data.projects || data.items || []);
      renderProjects();
      if (state.project) {
        const fresh = state.projects.find(p => (p.projectId || p.id) === (state.project.projectId || state.project.id));
        if (fresh) state.project = fresh;
      }
      renderMain();
    } catch (e) { showError(e); }
  }

  function renderProjects() {
    const list = document.getElementById('mss-cu-projects');
    if (!list) return;
    list.innerHTML = '';
    if (!state.projects.length) list.append(el('div', { class:'mss-cu-muted', text:'Nema audio projekata. Napravi prvi projekat.' }));
    for (const project of state.projects) {
      const id = project.projectId || project.id;
      const item = el('div', { class:`mss-cu-project ${state.project && (state.project.projectId || state.project.id) === id ? 'active' : ''}` });
      item.append(el('strong', { text: project.name || project.songTitle || id }), el('div', { class:'mss-cu-muted', text:`${project.artist || ''} ${project.status ? '• '+project.status : ''}` }));
      item.addEventListener('click', async () => { state.project = project; renderProjects(); await refreshTracks(); renderMain(); });
      list.append(item);
    }
  }

  async function createProject() {
    const title = prompt('Naziv projekta / pesme:');
    if (!title) return;
    try {
      const data = await api('/api/audio-projects', { method:'POST', body:JSON.stringify({ name:title, songTitle:title }) });
      state.project = data.project;
      await refreshProjects();
      await refreshTracks();
    } catch (e) { showError(e); }
  }

  async function refreshTracks() {
    if (!state.project) { state.tracks = []; return; }
    const id = state.project.projectId || state.project.id;
    try {
      const data = await api(`/api/audio-projects/${encodeURIComponent(id)}/lyrics-overlay`);
      state.tracks = data.tracks || [];
    } catch (e) { state.tracks = []; showError(e); }
  }

  async function addTrack() {
    if (!state.project) return;
    const id = state.project.projectId || state.project.id;
    const type = document.getElementById('mss-cu-track-type')?.value || 'lyrics';
    const name = document.getElementById('mss-cu-track-name')?.value || type;
    try {
      await api(`/api/audio-projects/${encodeURIComponent(id)}/lyrics-overlay/text-tracks`, { method:'POST', body:JSON.stringify({ type, name, language:'sr' }) });
      await refreshTracks(); renderMain();
    } catch (e) { showError(e); }
  }

  async function addCue(trackId) {
    const projectId = state.project.projectId || state.project.id;
    const text = prompt('Tekst cue-a:');
    if (!text) return;
    const start = Number(prompt('Početak u ms:', '0'));
    const end = Number(prompt('Kraj u ms:', String(Math.max(start + 2000, 2000))));
    try {
      await api(`/api/audio-projects/${encodeURIComponent(projectId)}/lyrics-overlay/text-tracks/${encodeURIComponent(trackId)}/text-cues`, { method:'POST', body:JSON.stringify({ startMs:start, endMs:end, text, timingSource:'manual', confidence:1 }) });
      await refreshTracks(); renderMain();
    } catch (e) { showError(e); }
  }

  async function updateCue(trackId, cueId, row) {
    const projectId = state.project.projectId || state.project.id;
    const inputs = row.querySelectorAll('input');
    try {
      await api(`/api/audio-projects/${encodeURIComponent(projectId)}/lyrics-overlay/text-tracks/${encodeURIComponent(trackId)}/text-cues/${encodeURIComponent(cueId)}`, { method:'PATCH', body:JSON.stringify({ startMs:Number(inputs[0].value), endMs:Number(inputs[1].value), text:inputs[2].value }) });
      await refreshTracks(); renderMain();
    } catch (e) { showError(e); }
  }

  async function deleteCue(trackId, cueId) {
    const projectId = state.project.projectId || state.project.id;
    try {
      await api(`/api/audio-projects/${encodeURIComponent(projectId)}/lyrics-overlay/text-tracks/${encodeURIComponent(trackId)}/text-cues/${encodeURIComponent(cueId)}`, { method:'DELETE' });
      await refreshTracks(); renderMain();
    } catch (e) { showError(e); }
  }

  async function validateOverlay() {
    if (!state.project) return;
    const id = state.project.projectId || state.project.id;
    try {
      const result = await api(`/api/audio-projects/${encodeURIComponent(id)}/lyrics-overlay/validate`);
      const status = document.getElementById('mss-cu-status');
      status.className = result.valid ? 'mss-cu-ok' : 'mss-cu-bad';
      status.textContent = result.valid ? 'Lyrics Overlay: validan.' : `Lyrics Overlay: ${result.problems?.join(' | ') || 'nije validan'}`;
    } catch (e) { showError(e); }
  }

  function downloadExport(format) {
    if (!state.project) return;
    const id = state.project.projectId || state.project.id;
    window.location.href = `/api/audio-projects/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`;
  }

  function downloadTrack(trackId, format) {
    const id = state.project.projectId || state.project.id;
    window.location.href = `/api/audio-projects/${encodeURIComponent(id)}/lyrics-overlay/export?trackId=${encodeURIComponent(trackId)}&format=${encodeURIComponent(format)}`;
  }

  function renderMain() {
    const main = document.getElementById('mss-cu-main');
    if (!main) return;
    main.innerHTML = '';
    if (!state.project) {
      main.append(el('h2',{text:'Audio pipeline + Lyrics Overlay'}), el('p',{class:'mss-cu-muted',text:'Izaberi projekat levo. Ovaj panel povezuje postojeći v15.6 backend sa stvarnim korisničkim interfejsom.'}));
      return;
    }
    const p = state.project;
    main.append(el('div',{class:'mss-cu-head'},[el('div',{},[el('h2',{text:p.name || p.songTitle || 'Projekat'}),el('div',{class:'mss-cu-muted',text:`ID: ${p.projectId || p.id}`})]),el('button',{class:'mss-cu-btn',text:'Osveži',onclick:async()=>{await refreshProjects();await refreshTracks();renderMain();}})]));

    const exports = el('div',{class:'mss-cu-card'});
    exports.append(el('strong',{text:'IZVOZ PROJEKTA'}), el('div',{class:'mss-cu-row'},['project.json','storyboard.json','storyboard.txt','scenes.csv','lyrics.srt','timeline.edl','project.pdf','project.zip'].map(format=>el('button',{class:'mss-cu-btn',text:format,onclick:()=>downloadExport(format)}))));
    main.append(exports);

    const trackTools = el('div',{class:'mss-cu-card'});
    const type = el('select',{id:'mss-cu-track-type',class:'mss-cu-input'},['lyrics','translation','title','artist','section','custom','credits'].map(v=>el('option',{value:v,text:v})));
    const name = el('input',{id:'mss-cu-track-name',class:'mss-cu-input',placeholder:'Naziv track-a'});
    trackTools.append(el('strong',{text:'LYRICS OVERLAY STUDIO'}),el('div',{class:'mss-cu-row'},[type,name,el('button',{class:'mss-cu-btn primary',text:'+ Novi track',onclick:addTrack}),el('button',{class:'mss-cu-btn',text:'Validiraj',onclick:validateOverlay})]),el('div',{id:'mss-cu-status',class:'mss-cu-muted',text:'Spremno.'}));
    main.append(trackTools);

    if (!state.tracks.length) main.append(el('div',{class:'mss-cu-muted',text:'Nema tekstualnih track-ova.'}));
    for (const track of state.tracks) {
      const card = el('div',{class:'mss-cu-track'});
      card.append(el('div',{class:'mss-cu-head'},[el('strong',{text:`${track.name || track.type} (${track.type})`}),el('div',{class:'mss-cu-row'},[el('button',{class:'mss-cu-btn',text:'+ Cue',onclick:()=>addCue(track.trackId)}),...['srt','vtt','ass','json'].map(f=>el('button',{class:'mss-cu-btn',text:f.toUpperCase(),onclick:()=>downloadTrack(track.trackId,f)}))])])) ;
      const cues = (track.cues || []).filter(c=>!c.deleted);
      if (!cues.length) card.append(el('div',{class:'mss-cu-muted',text:'Nema cue-ova.'}));
      for (const cue of cues) {
        const row = el('div',{class:'mss-cu-cue'});
        row.append(el('input',{class:'mss-cu-input',value:String(cue.startMs)}),el('input',{class:'mss-cu-input',value:String(cue.endMs)}),el('input',{class:'mss-cu-input',value:cue.text || ''}),el('div',{class:'mss-cu-row'},[el('button',{class:'mss-cu-btn',text:'Sačuvaj',onclick:()=>updateCue(track.trackId,cue.cueId,row)}),el('button',{class:'mss-cu-btn danger',text:'Obriši',onclick:()=>deleteCue(track.trackId,cue.cueId)})]));
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
    const side = el('aside',{class:'mss-cu-side'},[el('div',{class:'mss-cu-head'},[el('strong',{text:'MOJI SPOTOVI'}),el('button',{class:'mss-cu-btn primary',text:'+',onclick:createProject})]),el('div',{id:'mss-cu-projects'})]);
    const main = el('main',{id:'mss-cu-main',class:'mss-cu-main'});
    panel.append(side,main);
    launcher.addEventListener('click',async()=>{panel.classList.toggle('open');if(panel.classList.contains('open')){await refreshProjects();if(state.project)await refreshTracks();renderMain();}});
    document.body.append(panel,launcher);
    refreshProjects();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true }); else mount();
})();
