'use strict';

(() => {
  const state = { projects: [], projectId: '', imageBatch: null, videoBatch: null, backups: [] };

  async function api(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function setMessage(text, ok = true) {
    const box = document.getElementById('mss-workflow-message');
    if (!box) return;
    box.textContent = text;
    box.style.color = ok ? '#86efac' : '#fca5a5';
  }

  function selectedProjectId() {
    return state.projectId || document.getElementById('mss-workflow-project')?.value || '';
  }

  async function loadProjects() {
    const data = await api('/api/audio-projects');
    state.projects = data.projects || [];
    if (!state.projectId && state.projects[0]) state.projectId = state.projects[0].projectId;
    const select = document.getElementById('mss-workflow-project');
    if (!select) return;
    select.innerHTML = state.projects.map(project => `<option value="${esc(project.projectId)}">${esc(project.name || project.songTitle || project.projectId)}</option>`).join('');
    select.value = state.projectId;
  }

  async function loadBackups() {
    const projectId = selectedProjectId();
    if (!projectId) return;
    const data = await api(`/api/audio-projects/${encodeURIComponent(projectId)}/backups`);
    state.backups = data.backups || [];
    const list = document.getElementById('mss-workflow-backups');
    if (!list) return;
    if (!state.backups.length) {
      list.innerHTML = '<div class="mss-wf-muted">Nema backup-a za ovaj projekat.</div>';
      return;
    }
    list.innerHTML = state.backups.map((backup, index) => `
      <div class="mss-wf-backup">
        <div><b>${esc(backup.reason || 'backup')}</b><br><span class="mss-wf-muted">${esc(backup.createdAt || backup.timestamp || backup.fileName)}</span></div>
        <button data-restore-index="${index}">Vrati ovu verziju</button>
      </div>`).join('');
    list.querySelectorAll('[data-restore-index]').forEach(button => button.addEventListener('click', () => restoreBackup(Number(button.dataset.restoreIndex))));
  }

  async function restoreBackup(index) {
    const backup = state.backups[index];
    const projectId = selectedProjectId();
    if (!backup || !projectId) return;
    if (!confirm(`Vrati projekat na backup "${backup.reason || backup.fileName}"? Trenutno stanje će prvo biti sačuvano kao novi backup.`)) return;
    try {
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId)}/restore-backup`, {
        method: 'POST', body: JSON.stringify({ fileName: backup.fileName })
      });
      setMessage(`Backup vraćen: ${data.project?.name || projectId}`);
      await loadBackups();
    } catch (error) { setMessage(error.message, false); }
  }

  async function nextBatch(kind) {
    const projectId = selectedProjectId();
    if (!projectId) return;
    try {
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId)}/${kind}-prompts/next-batch`, { method:'POST', body:'{}' });
      if (kind === 'image') state.imageBatch = data; else state.videoBatch = data;
      const output = document.getElementById(`mss-workflow-${kind}-batch`);
      if (output) output.value = JSON.stringify(data, null, 2);
      const responseArea = document.getElementById(`mss-workflow-${kind}-response`);
      if (responseArea && data.batchId && Array.isArray(data.sceneIds)) {
        const items = data.sceneIds.map(sceneId => kind === 'image'
          ? { sceneId, scenePrompt:'', sceneNegativePrompt:'' }
          : { sceneId, videoPrompt:'', negativeVideoPrompt:'' });
        responseArea.value = JSON.stringify({ batchId:data.batchId, items }, null, 2);
      }
      setMessage(data.done ? `${kind === 'image' ? 'Image' : 'Video'} prompt queue je završena.` : `Dobijen ${kind} batch: ${data.batchId || 'bez ID-a'}.`);
    } catch (error) { setMessage(error.message, false); }
  }

  async function submitBatch(kind) {
    const projectId = selectedProjectId();
    const area = document.getElementById(`mss-workflow-${kind}-response`);
    if (!projectId || !area) return;
    let body;
    try { body = JSON.parse(area.value); }
    catch { setMessage('AI odgovor nije validan JSON.', false); return; }
    try {
      const data = await api(`/api/audio-projects/${encodeURIComponent(projectId)}/${kind}-prompts/submit`, {
        method:'POST', body:JSON.stringify(body)
      });
      setMessage(`${kind === 'image' ? 'Image' : 'Video'} prompt batch je prihvaćen i zaključan.`);
      if (data.project) {
        const output = document.getElementById(`mss-workflow-${kind}-batch`);
        if (output) output.value = JSON.stringify({ accepted:true, progress:data.project.progress, projectId:data.project.projectId }, null, 2);
      }
    } catch (error) { setMessage(error.message, false); }
  }

  function mount() {
    if (document.getElementById('mss-workflow-launcher')) return;
    const style = document.createElement('style');
    style.textContent = `
      #mss-workflow-launcher{position:fixed;right:18px;bottom:68px;z-index:2147483000;border:1px solid #334155;border-radius:999px;padding:10px 14px;background:#172033;color:#fff;font:700 12px system-ui;cursor:pointer}
      #mss-workflow-panel{position:fixed;right:30px;top:30px;bottom:30px;width:min(760px,calc(100vw - 60px));z-index:2147483001;background:#080b12;color:#e5e7eb;border:1px solid #334155;border-radius:16px;box-shadow:0 20px 70px #000c;display:none;overflow:auto;padding:16px;font:13px system-ui;box-sizing:border-box}
      #mss-workflow-panel.open{display:block} #mss-workflow-panel button{background:#111827;color:#fff;border:1px solid #374151;border-radius:8px;padding:7px 10px;cursor:pointer}
      #mss-workflow-panel select,#mss-workflow-panel textarea{width:100%;box-sizing:border-box;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:8px;padding:8px;margin:6px 0}
      #mss-workflow-panel textarea{min-height:130px;font:12px ui-monospace,monospace}.mss-wf-card{border:1px solid #293244;border-radius:11px;padding:11px;margin:10px 0}.mss-wf-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mss-wf-muted{color:#94a3b8;font-size:12px}.mss-wf-backup{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid #1f2937}
    `;
    document.head.append(style);

    const button = document.createElement('button');
    button.id = 'mss-workflow-launcher';
    button.textContent = 'BACKUP + AI BATCH';

    const panel = document.createElement('section');
    panel.id = 'mss-workflow-panel';
    panel.innerHTML = `
      <div class="mss-wf-row"><h2 style="margin-right:auto">Napredni tok projekta</h2><button id="mss-workflow-close">Zatvori</button></div>
      <label>Projekat</label><select id="mss-workflow-project"></select>
      <div class="mss-wf-card">
        <div class="mss-wf-row"><b>Backup / restore</b><button id="mss-workflow-refresh-backups">Osveži backup-e</button></div>
        <div id="mss-workflow-backups" class="mss-wf-muted">Izaberi projekat i osveži.</div>
      </div>
      <div class="mss-wf-card">
        <div class="mss-wf-row"><b>Image prompt batch</b><button id="mss-workflow-image-next">Sledeći batch</button><button id="mss-workflow-image-submit">Prihvati JSON odgovor</button></div>
        <textarea id="mss-workflow-image-batch" readonly placeholder="Batch zahtev / status"></textarea>
        <textarea id="mss-workflow-image-response" placeholder="Ovde ubaci AI JSON odgovor"></textarea>
      </div>
      <div class="mss-wf-card">
        <div class="mss-wf-row"><b>Video prompt batch</b><button id="mss-workflow-video-next">Sledeći batch</button><button id="mss-workflow-video-submit">Prihvati JSON odgovor</button></div>
        <textarea id="mss-workflow-video-batch" readonly placeholder="Batch zahtev / status"></textarea>
        <textarea id="mss-workflow-video-response" placeholder="Ovde ubaci AI JSON odgovor"></textarea>
      </div>
      <div id="mss-workflow-message" class="mss-wf-muted">Spremno.</div>`;

    button.addEventListener('click', async () => {
      panel.classList.add('open');
      try { await loadProjects(); await loadBackups(); } catch (error) { setMessage(error.message, false); }
    });
    panel.querySelector('#mss-workflow-close').addEventListener('click', () => panel.classList.remove('open'));
    panel.querySelector('#mss-workflow-project').addEventListener('change', async event => { state.projectId = event.target.value; await loadBackups(); });
    panel.querySelector('#mss-workflow-refresh-backups').addEventListener('click', loadBackups);
    panel.querySelector('#mss-workflow-image-next').addEventListener('click', () => nextBatch('image'));
    panel.querySelector('#mss-workflow-image-submit').addEventListener('click', () => submitBatch('image'));
    panel.querySelector('#mss-workflow-video-next').addEventListener('click', () => nextBatch('video'));
    panel.querySelector('#mss-workflow-video-submit').addEventListener('click', () => submitBatch('video'));

    document.body.append(button, panel);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true }); else mount();
})();
