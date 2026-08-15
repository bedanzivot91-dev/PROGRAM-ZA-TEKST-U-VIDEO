'use strict';

function notifyStudio(detail) {
  window.dispatchEvent(new CustomEvent('mss-plus-bridge-extension', { detail }));
}
async function connect() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'MSS_LOCAL_PAGE', baseUrl: location.origin, source:'local' });
    notifyStudio(response);
  } catch (error) { notifyStudio({ ok: false, error: error.message || String(error) }); }
}
connect();
setInterval(connect, 30000);
