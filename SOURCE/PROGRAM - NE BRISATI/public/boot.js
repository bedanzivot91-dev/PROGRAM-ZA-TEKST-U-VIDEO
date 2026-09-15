'use strict';

// Ovaj mali lokalni fajl se učitava pre svih CDN biblioteka.
// Launcher odmah dobija potvrdu da je browser otvorio Studio, a zatim se učitava
// dodatni v15.6 UI koji povezuje novi audio/lyrics backend bez diranja starog app.js toka.
(() => {
  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return [...bytes].map((value, index) => `${[4, 6, 8, 10].includes(index) ? '-' : ''}${value.toString(16).padStart(2, '0')}`).join('');
  }

  const clientId = createId();
  let heartbeatTimer = null;
  let closeSent = false;

  async function heartbeat() {
    if (closeSent) return;
    try {
      await fetch(`/api/app/heartbeat?id=${encodeURIComponent(clientId)}`, {
        method: 'POST',
        cache: 'no-store',
        keepalive: true
      });
    } catch (_) {}
  }

  function closeSession() {
    if (closeSent) return;
    closeSent = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    const url = `/api/app/close?id=${encodeURIComponent(clientId)}`;
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob(['{}'], { type: 'application/json' }));
      else fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }).catch(() => {});
    } catch (_) {}
  }

  function loadCompletionUi() {
    if (document.querySelector('script[data-mss-completion-ui]')) return;
    const script = document.createElement('script');
    script.src = '/completion-ui.js';
    script.defer = true;
    script.dataset.mssCompletionUi = '1';
    script.onerror = () => console.error('[MSS] completion-ui.js nije učitan.');
    document.head.appendChild(script);
  }

  window.__MSS_BROWSER_CLIENT_ID__ = clientId;
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, 4000);
  window.addEventListener('pagehide', closeSession, { capture: true });
  window.addEventListener('beforeunload', closeSession, { capture: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadCompletionUi, { once: true });
  else loadCompletionUi();
})();
