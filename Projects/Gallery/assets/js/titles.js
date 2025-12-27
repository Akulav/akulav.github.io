(function () {
  const { state } = PV;

  // Always write ONLY { title } to tags.json
  async function writeTitleJSON(p, title){
    if (!state.rw || !p?.dirHandle) return false;
    const clean = (title || '').toString().trim() || 'Untitled';
    try{
      const fh = await p.dirHandle.getFileHandle('tags.json', { create: true });
      const w  = await fh.createWritable();
      await w.write(new Blob([JSON.stringify({ title: clean }, null, 2)], { type:'application/json' }));
      await w.close();
      return true;
    }catch(e){
      console.error('writeTitleJSON failed', e);
      return false;
    }
  }

  // Local title overrides
  const KEY = 'pv:titleOverrides:v1';
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { cache = {}; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} };

  const TitleStore = {
    get: id => cache[id] || null,
    set: (id, title) => { cache[id] = title; persist(); },
    del: id => { delete cache[id]; persist(); }
  };

  // Save title (memory + disk). No tag fields. No merging.
  async function saveTitle(p, newTitle){
    const title = (newTitle || '').trim() || p.title || 'Untitled';
    p.title = title;

    let wrote = false;
    try{
      if (p?.dirHandle && state.rw) {
        wrote = await writeTitleJSON(p, title);
      }
    }catch(e){
      console.warn('RW title write failed', e);
    }

    // Update visible UI if present
    const cardH = document.querySelector(`.card .title[data-id="${p.id}"]`);
    if (cardH) cardH.textContent = title;

    const dt = document.getElementById('detailTitle');
    if (dt && window.__pv_detail?.p?.id === p.id) dt.textContent = title;

    TitleStore.set(p.id, title);
    return wrote;
  }

  // Expose
  PV.writeTagsJSON = writeTitleJSON; // keep name for back-compat if other modules call it
  PV.TitleStore = TitleStore;
  PV.saveTitle = saveTitle;
})();
