(function () {
  // Global namespace root
  window.PV = window.PV || {};

  const state = {
    mode: 'AND',
    q: '',
    all: [],
    tags: [],
    sel: new Set(),
    rw: false,
    rootHandle: null,
    onlyFavs: loadPref('onlyFavs', false),
    _lastRenderedItems: [],
    _scrollPos: 0,
    _gallery: null,

    // NEW: remember how the library was loaded to support "Reload Library"
    // type: 'rw' | 'zip' | 'files' | null
    source: { type: null, zipFile: null, files: null }
  };

  // tiny DOM helpers
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // prefs
  function savePref(k, v) { try { localStorage.setItem(`pv:${k}`, JSON.stringify(v)); } catch {} }
  function loadPref(k, f) { try { const v = localStorage.getItem(`pv:${k}`); return v ? JSON.parse(v) : f; } catch { return f; } }

  // debounce
  function debounced(fn, ms = 160){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }

  // revoke a list of object URLs
  function revokeURLs(urls){ urls?.forEach(u => { if (u) URL.revokeObjectURL(u); }); }

  PV.state = state;
  PV.$ = $;
  PV.$$ = $$;
  PV.savePref = savePref;
  PV.loadPref = loadPref;
  PV.debounced = debounced;
  PV.revokeURLs = revokeURLs;
})();
