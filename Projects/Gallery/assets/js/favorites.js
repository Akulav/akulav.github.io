(function () {
  const KEY = 'pv:favs:v1';
  let mem = new Set();
  let useLocal = true;
  try { const t='__t'; localStorage.setItem(t,'1'); localStorage.removeItem(t); } catch { useLocal = false; }

  function read(){
    if (!useLocal) return mem;
    try { const raw = localStorage.getItem(KEY); return raw ? new Set(JSON.parse(raw)) : new Set(); }
    catch { useLocal = false; return mem; }
  }
  function write(set){
    if (!useLocal) { mem = set; return; }
    try { localStorage.setItem(KEY, JSON.stringify([...set])); }
    catch { useLocal = false; mem = set; }
  }

  let cache = read();

  PV.FavStore = {
    has: (id) => cache.has(id),
    add: (id) => { cache.add(id); write(cache); },
    del: (id) => { cache.delete(id); write(cache); },
    all: () => [...cache]
  };
})();
