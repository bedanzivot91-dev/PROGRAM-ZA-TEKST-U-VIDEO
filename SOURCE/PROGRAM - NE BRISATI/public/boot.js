'use strict';

// Ovaj mali lokalni fajl se učitava pre svih CDN biblioteka.
// Zbog toga launcher odmah dobija potvrdu da je browser zaista otvorio Studio,
// čak i kada je internet spor ili neka spoljna biblioteka kasni.
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

  window.__MSS_BROWSER_CLIENT_ID__ = clientId;
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, 4000);
  window.addEventListener('pagehide', closeSession, { capture: true });
  window.addEventListener('beforeunload', closeSession, { capture: true });
})();
