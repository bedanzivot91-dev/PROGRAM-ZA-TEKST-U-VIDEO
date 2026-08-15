'use strict';

// Sve biblioteke se učitavaju isključivo lokalno iz vendor/ foldera.
// CSP (script-src 'self') ionako blokira spoljne CDN <script> tagove, a ključne
// audio funkcije (Meyda, WaveSurfer) ne smeju zavisiti od interneta u radu bez mreže.
(() => {
  const libraries = [
    { id: 'wavesurfer', global: 'WaveSurfer', urls: ['vendor/wavesurfer.min.js'] },
    { id: 'meyda', global: 'Meyda', urls: ['vendor/meyda.min.js'] },
    { id: 'sortable', global: 'Sortable', urls: ['vendor/sortable.min.js'] },
    { id: 'jszip', global: 'JSZip', urls: ['vendor/jszip.min.js'] },
    { id: 'pica', global: 'pica', urls: ['vendor/pica.min.js'] },
    { id: 'smartcrop', globals: ['smartcrop', 'SmartCrop'], urls: ['vendor/smartcrop.min.js'] },
    { id: 'colorthief', globals: ['ColorThief', 'colorthief'], urls: ['vendor/colorthief.min.js'] },
    { id: 'papaparse', global: 'Papa', urls: ['vendor/papaparse.min.js'] },
    { id: 'web-audio-beat-detector', global: 'WebAudioBeatDetector', urls: ['vendor/web-audio-beat-detector.min.js'] }
  ];

  const available = lib => lib.global ? Boolean(window[lib.global]) : lib.globals.some(name => Boolean(window[name]));
  const notify = (lib, ok, url, error = '') => window.dispatchEvent(new CustomEvent('mss:vendor-loaded', {
    detail: { id: lib.id, ok, url, error }
  }));

  function loadUrl(url, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let finished = false;
      const finish = (ok, error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (!ok) script.remove();
        ok ? resolve(url) : reject(error || new Error('Biblioteka nije učitana.'));
      };
      const timer = setTimeout(() => finish(false, new Error('Isteklo je vreme za CDN.')), timeoutMs);
      script.src = url;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => finish(true);
      script.onerror = () => finish(false, new Error('CDN nije dostupan.'));
      document.head.appendChild(script);
    });
  }

  async function loadLibrary(lib) {
    if (available(lib)) return notify(lib, true, 'already-loaded');
    let lastError = null;
    for (const url of lib.urls) {
      try {
        await loadUrl(url);
        if (!available(lib)) throw new Error('Fajl je učitan, ali globalni objekat nedostaje.');
        notify(lib, true, url);
        return;
      } catch (error) { lastError = error; }
    }
    notify(lib, false, '', lastError?.message || 'Biblioteka nije dostupna.');
  }

  libraries.forEach(lib => loadLibrary(lib));
})();
