(function () {
  const { state, $, $$ } = PV;

  async function writeTagsJSON(p, newMeta){
    if (!state.rw || !p?.dirHandle) return false;
    try{
      const fh = await p.dirHandle.getFileHandle('tags.json', { create: true });
      const w = await fh.createWritable();
      await w.write(new Blob([JSON.stringify(newMeta, null, 2)], { type:'application/json' }));
      await w.close();
      return true;
    }catch(e){ console.error('writeTagsJSON failed', e); return false; }
  }

  const KEY = 'pv:titleOverrides:v1';
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { cache = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} };

  const TitleStore = {
    get: id => cache[id] || null,
    set: (id, title) => { cache[id] = title; save(); },
    del: id => { delete cache[id]; save(); }
  };

  async function saveTitle(p, newTitle){
    const title = (newTitle || '').trim() || p.title || 'Untitled';
    p.title = title;
    let wrote = false;
    try{
      if (p?.dirHandle && state.rw) {
        let meta = { title, tags: Array.isArray(p.tags) ? p.tags : [] };
        try {
          const fh = await p.dirHandle.getFileHandle('tags.json', { create:false });
          const f  = await fh.getFile();
          const j  = JSON.parse(await f.text());
          meta = { ...j, title };
        } catch {}
        wrote = await writeTagsJSON(p, meta);
      }
    }catch(e){ console.warn('RW title write failed', e); }
    TitleStore.set(p.id, title);

    const cardH = document.querySelector(`.card .title[data-id="${p.id}"]`);
    if (cardH) cardH.textContent = title;
    const dt = document.getElementById('detailTitle');
    if (dt && window.__pv_detail?.p?.id === p.id) dt.textContent = title;
    return wrote;
  }

  PV.writeTagsJSON = writeTagsJSON;
  PV.TitleStore = TitleStore;
  PV.saveTitle = saveTitle;
})();
