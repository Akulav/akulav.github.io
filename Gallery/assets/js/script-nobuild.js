/* ========== TINY HELPERS ========== */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const savePref = (k,v)=>{ try{ localStorage.setItem(`pv:${k}`, JSON.stringify(v)); }catch{} };
const loadPref = (k,f)=>{ try{ const v=localStorage.getItem(`pv:${k}`); return v?JSON.parse(v):f; }catch{ return f; } };
const debounced = (fn,ms=160)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

/* ========== GLOBAL STATE ========== */
const state = {
  q: '',
  all: [],
  rw: false,
  rootHandle: null,
  onlyFavs: loadPref('onlyFavs', false),
  _lastRenderedItems: [],
  _scrollPos: 0,
};

/* ========== R/W FILE SYSTEM HELPERS ========== */
async function deleteImage(prompt, imageHandle) {
  if (!prompt.dirHandle || !confirm(`Are you sure you want to delete ${imageHandle.name}? This cannot be undone.`)) {
    return false;
  }
  try {
    await prompt.dirHandle.removeEntry(imageHandle.name);
    await refreshPrompt(prompt);
    return true;
  } catch (err) {
    console.error(`Failed to delete ${imageHandle.name}:`, err);
    alert(`Error: Could not delete ${imageHandle.name}.`);
    return false;
  }
}

async function setCoverImage(prompt, newCoverHandle) {
  if (!prompt.dirHandle) return false;
  const prefix = '_';
  const operations = [];
  const currentCover = prompt.files.previews.find(h => h.name.startsWith(prefix));
  if (currentCover && currentCover.name !== newCoverHandle.name) {
    operations.push({ type: 'rename', handle: currentCover, newName: currentCover.name.substring(prefix.length) });
  }
  if (!newCoverHandle.name.startsWith(prefix)) {
    operations.push({ type: 'rename', handle: newCoverHandle, newName: prefix + newCoverHandle.name });
  }
  if (operations.length === 0) return true;

  try {
    for (const op of operations) {
      const file = await op.handle.getFile();
      const newHandle = await prompt.dirHandle.getFileHandle(op.newName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(file);
      await writable.close();
      await prompt.dirHandle.removeEntry(op.handle.name);
    }
    await refreshPrompt(prompt);
    return true;
  } catch (err) {
    console.error('Failed to set cover image:', err);
    alert('Error setting cover image. Please reload the library.');
    await rescanCurrentLibrary();
    return false;
  }
}

async function addImagesToPrompt(prompt, files) {
  if (!prompt.dirHandle || files.length === 0) return false;
  try {
    for (const file of files) {
      const newHandle = await prompt.dirHandle.getFileHandle(file.name, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(file);
      await writable.close();
    }
    await refreshPrompt(prompt);
    return true;
  } catch (err) {
    console.error('Failed to add images:', err);
    alert('Error adding images.');
    return false;
  }
}

async function refreshPrompt(prompt) {
  const updatedPreviews = [];
  for await (const [childName, child] of prompt.dirHandle.entries()) {
    if (child.kind === 'file' && /\.(jpg|jpeg|png|webp|avif)$/i.test(childName)) {
      updatedPreviews.push(child);
    }
  }
  updatedPreviews.sort((a,b)=> {
    const aIsCover = a.name.startsWith('_');
    const bIsCover = b.name.startsWith('_');
    if (aIsCover && !bIsCover) return -1;
    if (!aIsCover && bIsCover) return 1;
    return a.name.localeCompare(b.name);
  });

  prompt.files.previews = updatedPreviews;

  const masterPrompt = state.all.find(p => p.id === prompt.id);
  if (masterPrompt) masterPrompt.files.previews = updatedPreviews;

  openDetailView(prompt);
  applyFilters();
}

/* ========== "NEW PROMPT" MODAL LOGIC ========== */
function openNewPromptModal() {
  $('#newPromptModal')?.classList.remove('hidden');
  $('#newPromptModal')?.setAttribute('aria-hidden', 'false');
  $('#newPromptForm')?.reset();
  $('#newPromptMsg').textContent = '';
}
function closeNewPromptModal() {
  $('#newPromptModal')?.classList.add('hidden');
  $('#newPromptModal')?.setAttribute('aria-hidden', 'true');
}

/* ========== LIBRARY LOADING & SCANNING LOGIC ========== */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function configureOverlayForEnv(){
  const rwBtn = $('#libRW');
  const folderBtn = $('#libFolder');
  const zipBtn = $('#libZip');
  const hint = $('.dz-hint');
  if(isIOS){
    rwBtn?.setAttribute('disabled','');
    folderBtn?.setAttribute('disabled','');
    zipBtn?.removeAttribute('disabled');
    if(hint) hint.textContent = 'On iPhone/iPad, pick a .zip of your /prompts folder.';
  }
}
function showOverlay(){ $('#libraryOverlay')?.classList?.remove('hidden'); }
function hideOverlay(){ $('#libraryOverlay')?.classList?.add('hidden'); }

async function openBestPicker(){
  if(isMobile) { $('#zipInput')?.click(); return; }
  if(window.showDirectoryPicker && window.isSecureContext){
    try{ await handleOpenRW(); return; }catch(e){ /* fall through */ }
  }
  $('#dirInput')?.click();
}

async function entriesToFiles(items){
  const out = [];
  const walkers = [];
  for(const it of items){
    const entry = it.webkitGetAsEntry?.();
    if(!entry) continue;
    walkers.push(walkEntry(entry, out));
  }
  await Promise.all(walkers);
  return out;
}
async function walkEntry(entry, out){
  if(entry.isFile){
    await new Promise((res,rej)=> entry.file(f=>{ out.push(f); res(); }, rej));
  }else if(entry.isDirectory){
    const reader = entry.createReader();
    const batch = await new Promise((res,rej)=> reader.readEntries(res, rej));
    await Promise.all(batch.map(ch=> walkEntry(ch, out)));
    if(batch.length){
      let more;
      while((more = await new Promise((res,rej)=> reader.readEntries(res, rej))).length){
        await Promise.all(more.map(ch=> walkEntry(ch, out)));
      }
    }
  }
}

async function handleOpenRW() {
  try {
    const root = await window.showDirectoryPicker({ mode: 'readwrite' });
    let promptsDir;
    let rootForManifest = root;
    try {
      promptsDir = await root.getDirectoryHandle('prompts');
    } catch (e) {
      if (root.name.toLowerCase() === 'prompts') {
        promptsDir = root;
      } else {
        alert('Could not find a "prompts" directory within the selected folder.');
        return;
      }
    }
    state.rw = true;
    state.rootHandle = rootForManifest;
    const { items } = await scanPromptsRW(promptsDir);
    const rootFavs = await readRootFavorites(rootForManifest).catch(()=>null);
    const rootFavSet = new Set(rootFavs?.ids||[]);
    for(const p of items){ if(!p.favorite && rootFavSet.has(p.id)) p.favorite=true; }
    await finalizeLibrary(items);
  } catch (err) {
    console.warn("R/W Picker cancelled or failed.", err);
  }
}

async function rescanCurrentLibrary() {
  if (!state.rw || !state.rootHandle) {
    alert("No R/W library loaded to reload.");
    return;
  }
  try {
    const rootForManifest = state.rootHandle;
    let promptsDir = await rootForManifest.getDirectoryHandle('prompts').catch(() => null);
    if (!promptsDir && rootForManifest.name.toLowerCase() === 'prompts') {
      promptsDir = rootForManifest;
    }
    if (!promptsDir) {
      alert("Could not find the 'prompts' directory in the stored handle.");
      return;
    }
    const { items } = await scanPromptsRW(promptsDir);
    const rootFavs = await readRootFavorites(rootForManifest).catch(() => null);
    const rootFavSet = new Set(rootFavs?.ids || []);
    for(const p of items){ if(!p.favorite && rootFavSet.has(p.id)) p.favorite=true; }
    await finalizeLibrary(items);
  } catch (err) {
    console.error("Failed to reload library:", err);
    alert("Failed to reload library. You may need to grant permissions again.");
  }
}

async function tryGetSubdir(dir,name){ try{ return await dir.getDirectoryHandle(name,{create:false}); }catch{ return null; } }

async function scanPromptsRW(promptsDir) {
  const items = [];
  for await (const [entryName, entryHandle] of promptsDir.entries()) {
    if (entryHandle.kind !== 'directory') continue;
    const folder = `prompts/${entryName}`;
    const p = {
      id: folder.replace(/\s+/g, '-').toLowerCase(),
      title: entryName,
      folder,
      files: { prompt: null, tags: null, previews: [] },
      dirHandle: entryHandle,
      favorite: false,
      rootHandle: state.rootHandle,
    };
    for await (const [childName, child] of entryHandle.entries()) {
      const lower = childName.toLowerCase();
      if (child.kind === 'file') {
        if (lower === 'prompt.txt') { p.files.prompt = child; }
        else if (lower === 'tags.json') { p.files.tags = child; }
        else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(lower)) { p.files.previews.push(child); }
        else if (lower === 'favorites.json') {
          const data = await readJSONHandle(child).catch(() => null);
          if (data?.favorite === true) p.favorite = true;
        }
      }
    }
    if (!p.files.prompt) continue;
    if (p.files.tags) {
      const meta = await readJSONHandle(p.files.tags).catch(() => null);
      if (meta?.title) p.title = meta.title;
    }
    p.files.previews.sort((a, b) => {
      const aIsCover = a.name.startsWith('_');
      const bIsCover = b.name.startsWith('_');
      if (aIsCover && !bIsCover) return -1;
      if (!aIsCover && bIsCover) return 1;
      return a.name.localeCompare(b.name);
    });
    items.push(p);
  }
  items.sort((a, b) => a.title.localeCompare(b.title));
  return { items };
}

async function readJSONHandle(h) { const f = await h.getFile(); return JSON.parse(await f.text()); }

async function handleDirPickReadOnly(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  await buildFromLooseFiles(files);
}

function isZipEntry(x) { return x && typeof x.async === 'function' && typeof x.name === 'string'; }

async function handleZipFile(file) {
  if (!file) return;
  const libMsg = $('#libMsg');

  if (!/\.zip$/i.test(file.name)) { libMsg.textContent = 'Please choose a .zip file.'; return; }
  if (!window.JSZip) { libMsg.textContent = 'ZIP support not loaded.'; return; }

  try {
    libMsg.textContent = 'Reading ZIP…';
    const ab = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(ab, { createFolders: false });
    const fileEntries = Object.values(zip.files).filter(zf => !zf.dir);

    const groups = new Map();
    for (const zf of fileEntries) {
      const rel = (zf.name || '').replace(/^[\/]+/, '');
      const parts = rel.split('/').filter(Boolean);

      let folderKey;
      const pIdx = parts.indexOf('prompts');
      if (pIdx >= 0) {
        if (parts.length < pIdx + 2) continue;
        folderKey = parts.slice(0, pIdx + 2).join('/');
      } else {
        if (parts.length < 2) continue;
        folderKey = `prompts/${parts[0]}`;
      }

      let g = groups.get(folderKey);
      if (!g) {
        g = { folder: folderKey, prompt: null, tagsFile: null, previews: [], favFile: null };
        groups.set(folderKey, g);
      }

      const base = parts[parts.length - 1].toLowerCase();
      if (base === 'prompt.txt') g.prompt = zf;
      else if (base === 'tags.json') g.tagsFile = zf;
      else if (base === 'favorites.json') g.favFile = zf;
      else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(base)) g.previews.push(zf);
    }

    const all = [];
    for (const g of groups.values()) {
      if (!g.prompt) continue;

      let title = g.folder.split('/').at(-1);
      if (g.tagsFile) {
        try {
          const meta = JSON.parse(await g.tagsFile.async('string'));
          if (meta?.title) title = meta.title;
        } catch {}
      }

      const id = g.folder.replace(/\s+/g, '-').toLowerCase();

      let favorite = false;
      if (g.favFile) {
        try {
          const favObj = JSON.parse(await g.favFile.async('string'));
          favorite = !!favObj?.favorite;
        } catch {}
      }

      g.previews.sort((a, b) => a.name.localeCompare(b.name));

      all.push({
        id,
        title,
        folder: g.folder,
        files: { prompt: g.prompt, tags: g.tagsFile, previews: g.previews },
        favorite,
      });
    }

    if (!all.length) { libMsg.textContent = 'No prompts detected in ZIP.'; return; }
    await finalizeLibrary(all);
  } catch (err) {
    console.error('ZIP parse failed:', err);
    libMsg.textContent = 'Failed to read ZIP.';
  }
}

async function buildFromLooseFiles(files) {
  const libMsg = $('#libMsg');
  libMsg.textContent = 'Indexing files…';

  const groups = new Map();
  for (const f of files) {
    const rel = (f.webkitRelativePath || f.name).replace(/^[\/]*/, '');
    const parts = rel.split('/');

    let folderKey;
    const pIdx = parts.indexOf('prompts');
    if (pIdx >= 0) {
      if (parts.length >= pIdx + 2) folderKey = parts.slice(0, pIdx + 2).join('/');
    } else {
      if (parts.length >= 2) folderKey = `prompts/${parts[0]}`;
    }
    if (!folderKey) continue;

    let g = groups.get(folderKey);
    if (!g) {
      g = { folder: folderKey, promptFile: null, tagsFile: null, previews: [], favFile: null };
      groups.set(folderKey, g);
    }

    const base = parts[parts.length - 1].toLowerCase();
    if (base === 'prompt.txt') g.promptFile = f;
    else if (base === 'tags.json') g.tagsFile = f;
    else if (base === 'favorites.json') g.favFile = f;
    else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(base)) g.previews.push(f);
  }

  const all = [];
  for (const [folder, g] of groups.entries()) {
    if (!g.promptFile) continue;

    let title = folder.split('/').at(-1);
    if (g.tagsFile) {
      const meta = await readJSONFile(g.tagsFile).catch(() => null);
      if (meta?.title) title = meta.title;
    }

    const id = folder.replace(/\s+/g, '-').toLowerCase();

    let favorite = false;
    if (g.favFile) {
      const favObj = await readJSONFile(g.favFile).catch(() => null);
      favorite = !!favObj?.favorite;
    }

    g.previews.sort((a, b) => a.name.localeCompare(b.name));

    all.push({
      id,
      title,
      folder,
      files: { prompt: g.promptFile, tags: g.tagsFile, previews: g.previews },
      favorite,
    });
  }

  if (!all.length) { libMsg.textContent = 'No prompts detected. Select your /prompts with prompt.txt files.'; return; }
  await finalizeLibrary(all);
}

async function readJSONFile(f){ return JSON.parse(await f.text()); }

/* ========== FAVORITES LOGIC ========== */
const FavStore = (() => {
  const KEY = 'pv:favs:v1';
  let mem = new Set();
  let useLocal = true;
  try { const t='__t'; localStorage.setItem(t,'1'); localStorage.removeItem(t); } catch { useLocal = false; }
  const read = () => {
    if (!useLocal) return mem;
    try { const raw = localStorage.getItem(KEY); return raw ? new Set(JSON.parse(raw)) : new Set(); }
    catch { useLocal = false; return mem; }
  };
  const write = (set) => {
    if (!useLocal) { mem = set; return; }
    try { localStorage.setItem(KEY, JSON.stringify([...set])); }
    catch { useLocal = false; mem = set; }
  };
  let cache = read();
  return {
    has: (id) => cache.has(id),
    add: (id) => { cache.add(id); write(cache); },
    del: (id) => { cache.delete(id); write(cache); },
    all: () => [...cache]
  };
})();

function setOnlyFavs(v){
  state.onlyFavs = !!v; savePref('onlyFavs', state.onlyFavs);
  $('#toggleFavs')?.classList.toggle('active', state.onlyFavs);
  $('#favSwitch')?.classList.toggle('active', state.onlyFavs);
  applyFilters();
}

function toggleFavorite(p, starBtn){
  const id = p?.id;
  if (!id) return;
  const isFav = FavStore.has(id);
  if (isFav) { FavStore.del(id); } else { FavStore.add(id); }
  p.favorite = !isFav;
  starBtn.classList.toggle('active', !isFav);
  starBtn.textContent = !isFav ? '★' : '☆';
  if(state.onlyFavs) applyFilters();
}

async function readRootFavorites(rootHandle){ try{ const fh=await rootHandle.getFileHandle('_favorites.json',{create:false}); const f=await fh.getFile(); return JSON.parse(await f.text()); }catch{ return {ids:[]}; } }
async function writeRootFavorites(rootHandle,all){ const ids=all.filter(p=>p.favorite).map(p=>p.id); const fh=await rootHandle.getFileHandle('_favorites.json',{create:true}); const w=await fh.createWritable(); await w.write(new Blob([JSON.stringify({updated:new Date().toISOString(),count:ids.length,ids},null,2)],{type:'application/json'})); await w.close(); }

/* ========== TITLE EDITING LOGIC ========== */
const TitleStore = (() => {
  const KEY = 'pv:titleOverrides:v1';
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e) { cache = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch(e){} };
  return {
    get: (id) => cache[id] || null,
    set: (id, title) => { cache[id] = title; save(); },
    del: (id) => { delete cache[id]; save(); }
  };
})();

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

async function saveTitle(p, newTitle){
  const title = (newTitle || '').trim() || p.title || 'Untitled';
  p.title = title; // update in-memory
  let wrote = false;
  try{
    if (p?.dirHandle && state.rw) {
      let meta = { title };
      try {
        const fh = await p.dirHandle.getFileHandle('tags.json', { create: false });
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
  if (dt && _detailState?.p?.id === p.id) dt.textContent = title;
  return wrote;
}

/* ========== PROMPT EDITING LOGIC (inline, like title) ========== */
const PromptStore = (() => {
  const KEY = 'pv:promptOverrides:v1';
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { cache = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} };
  return {
    get: (id) => (cache[id] ?? null),
    set: (id, text) => { cache[id] = text; save(); },
    del: (id) => { delete cache[id]; save(); }
  };
})();

async function savePromptText(p, newText) {
  const text = (newText ?? '').toString();
  let wrote = false;

  if (state.rw && p?.dirHandle) {
    try {
      const fh = await p.dirHandle.getFileHandle('prompt.txt', { create: true });
      const w  = await fh.createWritable();
      await w.write(text);
      await w.close();
      wrote = true;
      PromptStore.del(p.id); // disk is truth now
    } catch (e) {
      console.warn('RW prompt write failed, falling back to local override', e);
    }
  }
  if (!wrote) {
    PromptStore.set(p.id, text); // RO/ZIP mode
  }

  // keep snippet fresh for search
  p._snippet = text.slice(0, 2000);
  const master = state.all.find(x => x.id === p.id);
  if (master) master._snippet = p._snippet;

  const ed = document.getElementById('promptEditor');
  if (ed) { ed.dataset.saved = '1'; setTimeout(()=>{ ed.dataset.saved=''; }, 600); }

  return wrote;
}

/* ========== APP INITIALIZATION & STATE MANAGEMENT ========== */
async function finalizeLibrary(all) {
  all.forEach(p => { const t = TitleStore.get(p.id); if (t) p.title = t; });

  state.all = all;

  const newPromptBtn = $('#newPromptBtn');
  const reloadLibraryBtn = $('#reloadLibraryBtn');
  if (state.rw) {
    if (newPromptBtn) newPromptBtn.style.display = 'inline-block';
    if (reloadLibraryBtn) reloadLibraryBtn.style.display = 'inline-block';
  } else {
    if (newPromptBtn) newPromptBtn.style.display = 'none';
    if (reloadLibraryBtn) reloadLibraryBtn.style.display = 'none';
  }

  ensureFavSwitch();
  await preloadSnippets(all);

  applyFilters();
  document.body.classList.remove('boot-gate');
  hideOverlay();
}

async function preloadSnippets(list){
  if (isMobile) { list = list.slice(0, 24); }
  const BATCH=20;
  for(let i=0;i<list.length;i+=BATCH){
    const slice=list.slice(i,i+BATCH);
    await Promise.all(slice.map(async p=>{
      try{
        const txt = await loadPromptText(p);
        p._snippet = (txt || '').toString().slice(0, 2000);
      } catch { p._snippet=''; }
    }));
    await new Promise(r=> setTimeout(r,0));
  }
}

function applyFilters() {
  const q = (state.q || '').trim().toLowerCase();
  let list = state.all;

  if(q){
    list = list.filter(p => {
      const hay = ((p.title || '') + ' ' + (p._snippet || '')).toLowerCase();
      return hay.includes(q);
    });
  }

  if(state.onlyFavs){
    list = list.filter(p => p.favorite || FavStore.has(p.id));
  }

  state._lastRenderedItems = list;
  renderGrid(list);
  equalizeCardHeights();
}

/* ========== UI RENDERING (no tags) ========== */
function ensureFavSwitch(){
  if($('#favSwitch')) return;
  const wrap=document.createElement('div'); wrap.className='chips'; wrap.style.marginTop='10px';
  const chip=document.createElement('button'); chip.id='favSwitch'; chip.className='chip'; chip.textContent='Only favorites';
  chip.onclick=()=> setOnlyFavs(!state.onlyFavs);
  wrap.appendChild(chip);
  $('#filters')?.appendChild(wrap);
  chip.classList.toggle('active', state.onlyFavs);
  $('#toggleFavs')?.classList.toggle('active', state.onlyFavs);
}

function renderGrid(items) {
  const grid = $('#grid'), stats = $('#stats'), empty = $('#empty');
  if(!grid || !stats || !empty) return;

  grid.innerHTML = '';
  stats.textContent = `${items.length} prompt${items.length !== 1 ? 's' : ''}`;
  empty.style.display = items.length ? 'none' : 'block';

  items.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';

    const tw  = document.createElement('div');
    tw.className = 'thumb-wrap skel';

    const img = document.createElement('img');
    img.className = 'thumb';
    img.loading = 'lazy';
    img.decoding = 'async';

    // Favorite star
    const isFav  = p.favorite || FavStore.has(p.id);
    const favBtn = document.createElement('button');
    favBtn.className = isFav ? 'fav-btn active' : 'fav-btn';
    favBtn.textContent = isFav ? '★' : '☆';
    favBtn.title = isFav ? 'Unfavorite' : 'Favorite';
    favBtn.onclick = (e) => { e.stopPropagation(); toggleFavorite(p, favBtn); };

    // unified info chip: count + first format (+ dimensions)
    const total = p.files?.previews?.length || 0;
    let ext = '';
    if (total > 0) {
      const name = p.files.previews[0].name || '';
      const dot = name.lastIndexOf('.');
      if (dot >= 0) ext = name.slice(dot + 1).toUpperCase();
    }
    const info = document.createElement('span');
    info.className = 'count-badge';
    if (total > 0) {
      info.textContent = ext ? `📷 ${total} · 🖼️ ${ext}` : `📷 ${total} · 🖼️`;
      info.setAttribute('aria-label', `Contains ${total} image${total !== 1 ? 's' : ''}${ext ? ', first is ' + ext : ''}`);
      tw.appendChild(info);
    }

    if (total > 0) {
      loadObjectURL(p.files.previews[0]).then(url => {
        img.src = url;
        img.onload = () => {
          const w = img.naturalWidth || 0;
          const h = img.naturalHeight || 0;
          if (h / w > 1.25) tw.classList.add('tall'); else tw.classList.remove('tall');
          tw.classList.remove('skel');
          if (total > 0) {
            const dims = (w && h) ? ` ${w}×${h}` : '';
            info.textContent = ext ? `📷 ${total} · 🖼️ ${ext}${dims}` : `📷 ${total} · 🖼️${dims}`;
            info.setAttribute('aria-label',
              `Contains ${total} image${total !== 1 ? 's' : ''}${ext ? ', first is ' + ext : ''}${w && h ? `, ${w} by ${h} pixels` : ''}`);
          }
        };
      });
    } else {
      img.alt = 'No preview';
      tw.classList.remove('skel');
    }

    tw.append(img, favBtn);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const h3 = document.createElement('h3');
    h3.className = 'title';
    h3.textContent = p.title;
    h3.setAttribute('contenteditable', state.rw ? 'true' : 'false');
    h3.setAttribute('spellcheck','false');
    h3.dataset.id = p.id;

    if (state.rw) {
      h3.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); h3.blur(); } });
      h3.addEventListener('blur', () => {
        const newTitle = h3.textContent.trim();
        if (newTitle && newTitle !== p.title) { saveTitle(p, newTitle); }
        else { h3.textContent = p.title; }
      });
    }

    meta.append(h3);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn';
    viewBtn.textContent = 'Open';
    viewBtn.onclick = () => openDetailView(p);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-primary';
    copyBtn.textContent = 'Copy Prompt';
    copyBtn.onclick = async () => {
      // copy current local/edited text if detail is open, else load
      const ed = document.getElementById('promptEditor');
      const text = (ed && _detailState?.p?.id === p.id) ? ed.textContent : await loadPromptText(p);
      await navigator.clipboard.writeText(text);
      toastCopied(copyBtn);
    };

    actions.append(viewBtn, copyBtn);
    card.append(tw, meta, actions);
    grid.appendChild(card);
  });
}

function equalizeCardHeights(){
  const cards=$$('.card');
  if(!cards.length || window.innerWidth <= 520) {
    cards.forEach(c => c.style.height = 'auto');
    return;
  }
  cards.forEach(c=> c.style.height='auto');
  let maxH=0;
  cards.forEach(c=> maxH=Math.max(maxH, c.getBoundingClientRect().height));
  if(maxH > 0) cards.forEach(c=> c.style.height=`${Math.ceil(maxH)}px`);
}

/* ========== LOADERS (ObjectURL + Prompt text with overrides) ========== */
async function loadObjectURL(handle) {
  if (!handle) return '';
  try {
    if ('getFile' in handle) {
      const file = await handle.getFile();
      return URL.createObjectURL(file);
    }
    if (handle instanceof Blob) return URL.createObjectURL(handle);
    if (typeof handle.async === 'function') {
      const blob = await handle.async('blob');
      return URL.createObjectURL(blob);
    }
    return '';
  } catch(e) {
    console.error("Could not create object URL from handle", handle, e);
    return '';
  }
}

async function loadPromptText(p) {
  const local = PromptStore.get(p.id);
  if (local !== null) return local;

  const handle = p.files?.prompt;
  if (!handle) return '(No prompt.txt)';
  try {
    if ('getFile' in handle) {
      const file = await handle.getFile();
      return file.text();
    }
    if (typeof handle.async === 'function') {
      return handle.async('string');
    }
    if (typeof handle.text === 'function') {
      return handle.text();
    }
    return '(Could not load prompt)';
  } catch(e) {
    console.error("Could not load prompt text", p, e);
    return '(Error loading prompt)';
  }
}

/* ========== Prompt renderer: inline contenteditable editor ========== */
function renderParsedPrompt(text, container, p) {
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'prompt-editor-wrap';

  const ed = document.createElement('div');
  ed.id = 'promptEditor';
  ed.className = 'prompt-editor';
  ed.contentEditable = 'true';
  ed.spellcheck = false;

  ed.addEventListener('paste', e => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, t);
  });

  ed.textContent = text || '';

  ed.addEventListener('blur', async () => {
    if (!p) return;
    const next = ed.textContent;
    if (next !== text) {
      await savePromptText(p, next);
    }
  });

  ed.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (!p) return;
      await savePromptText(p, ed.textContent);
    }
  });

  const status = document.createElement('div');
  status.className = 'prompt-save-status';
  status.textContent = 'Saved';

  wrap.append(ed, status);
  container.appendChild(wrap);
}

/* ========== FULLSCREEN DETAIL VIEW ========== */
let _detailState = { p: null, previews: [], index: 0, urls: [] };

function openDetailView(p) {
  _detailState.urls.forEach(url => { if (url) URL.revokeObjectURL(url); });
  _detailState = { p: null, previews: [], index: 0, urls: [] };

  _detailState.p = p;
  window.location.hash = `prompt/${p.id}`;
  state._scrollPos = window.scrollY;
  const view = $('#detailView');
  if (!view) return;

  const addImagesBtn = $('#detailAddImages');
  if (state.rw) {
    addImagesBtn.style.display = 'inline-block';
    addImagesBtn.onclick = () => $('#imageUploader').click();
  } else {
    addImagesBtn.style.display = 'none';
  }

  const uploader = $('#imageUploader');
  uploader.onchange = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await addImagesToPrompt(p, Array.from(files));
    }
    uploader.value = '';
  };

  const detailTitle = $('#detailTitle');
  detailTitle.textContent = p.title;
  if(state.rw) {
    detailTitle.setAttribute('contenteditable', 'true');
    detailTitle.onkeydown = (e) => { if(e.key === 'Enter') { e.preventDefault(); detailTitle.blur(); }};
    detailTitle.onblur = () => {
      const newTitle = detailTitle.textContent.trim();
      if (newTitle && newTitle !== p.title) { saveTitle(p, newTitle); }
      else { detailTitle.textContent = p.title; }
    };
  } else {
    detailTitle.setAttribute('contenteditable', 'false');
    detailTitle.onkeydown = null;
    detailTitle.onblur = null;
  }

  const tagWrap = $('#detailTags');
  if (tagWrap) tagWrap.innerHTML = '';

  $('#detailBack').onclick = closeDetailView;

  $('#detailCopyPrompt').onclick = async () => {
    const ed = document.getElementById('promptEditor');
    const text = ed ? ed.textContent : await loadPromptText(p);
    await navigator.clipboard.writeText(text || '');
    toastCopied($('#detailCopyPrompt'));
  };

  $('#detailDownloadImg').onclick = async () => {
    const handle = _detailState.previews[_detailState.index];
    if (!handle) return;
    const url = await loadObjectURL(handle);
    const a = document.createElement('a');
    a.href = url;
    a.download = handle.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const promptContainer = $('#detailPromptText');
  loadPromptText(p).then(text => { renderParsedPrompt((text || '').toString(), promptContainer, p); });

  const thumbsRow = $('#detailThumbs');
  thumbsRow.innerHTML = '';
  _detailState.previews = p.files?.previews || [];
  _detailState.urls = new Array(_detailState.previews.length).fill(null);

  if (_detailState.previews.length > 0) {
    _detailState.previews.forEach((handle, i) => {
      const container = document.createElement('div');
      container.className = 'thumb-container';
      const imgThumb = document.createElement('img');
      imgThumb.dataset.idx = i;
      if (i === 0) {
        imgThumb.classList.add('active');
        setDetailHero(i, handle);
      }
      loadObjectURL(handle).then(url => { _detailState.urls[i] = url; imgThumb.src = url; });
      imgThumb.onclick = () => setDetailHero(i);
      container.appendChild(imgThumb);

      if (state.rw) {
        const actions = document.createElement('div');
        actions.className = 'thumb-actions';
        const isCover = handle.name.startsWith('_');
        const coverBtn = document.createElement('button');
        coverBtn.title = 'Set as cover image';
        coverBtn.innerHTML = '★';
        if (isCover) coverBtn.classList.add('is-cover');
        coverBtn.onclick = (e) => { e.stopPropagation(); setCoverImage(p, handle); };
        const deleteBtn = document.createElement('button');
        deleteBtn.title = 'Delete image';
        deleteBtn.innerHTML = '✕';
        deleteBtn.className = 'delete';
        deleteBtn.onclick = (e) => { e.stopPropagation(); deleteImage(p, handle); };
        actions.append(coverBtn, deleteBtn);
        container.appendChild(actions);
      }
      thumbsRow.appendChild(container);
    });
  } else {
    $('#detailImg').removeAttribute('src');
    $('#detailImg').alt = 'No preview available';
    if (state.rw) {
      thumbsRow.innerHTML = `<div style="padding: 10px; color: var(--muted);">No images. <a href="#" onclick="$('#imageUploader').click(); return false;">Add some.</a></div>`;
    }
  }

  document.body.classList.add('detail-view-active');
  view.setAttribute('aria-hidden', 'false');
  lockScroll();
  window.addEventListener('keydown', handleDetailKeys);

  const ratingMount = document.getElementById('detailRating');
  if (ratingMount) {
    ratingMount.innerHTML = '';
    // if you mount something later, keep here
  }
}

function closeDetailView() {
  document.body.classList.remove('detail-view-active');
  $('#detailView')?.setAttribute('aria-hidden', 'true');
  unlockScroll();
  window.scrollTo({ top: state._scrollPos, behavior: 'instant' });
  if (window.location.hash) { history.pushState("", document.title, window.location.pathname + window.location.search); }
  _detailState.urls.forEach(url => { if (url) URL.revokeObjectURL(url); });
  _detailState = { p: null, previews: [], index: 0, urls: [] };
  window.removeEventListener('keydown', handleDetailKeys);
}

function setDetailHero(i, handle = null) {
  const heroImg = $('#detailImg');
  const targetHandle = handle || _detailState.previews[i];
  if (!targetHandle) return;
  _detailState.index = i;
  const existingUrl = _detailState.urls[i];
  if (existingUrl) {
    heroImg.src = existingUrl;
  } else {
    loadObjectURL(targetHandle).then(url => {
      _detailState.urls[i] = url;
      if (_detailState.index === i) {
        heroImg.src = url;
      }
    });
  }
  $$('#detailThumbs .thumb-container img').forEach((thumb, idx) => { thumb.classList.toggle('active', idx === i); });
  const activeThumb = $(`#detailThumbs img[data-idx="${i}"]`);
  activeThumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function handleDetailKeys(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeDetailView(); }
  if (e.key === 'ArrowRight' && _detailState.previews.length > 1) { e.preventDefault(); setDetailHero((_detailState.index + 1) % _detailState.previews.length); }
  if (e.key === 'ArrowLeft' && _detailState.previews.length > 1) { e.preventDefault(); setDetailHero((_detailState.index - 1 + _detailState.previews.length) % _detailState.previews.length); }
}

/* ========== GALLERY & UTILITIES ========== */
let _galleryObserver = null;
let _galleryURLs = [];

function openGallery() {
  state._scrollPos = window.scrollY;
  const view = $('#galleryView');
  const grid = $('#galleryGrid');
  const sentinel = $('#gallerySentinel');
  const meta = $('#galleryMeta');

  if (!view || !grid || !sentinel || !meta) return;

  grid.innerHTML = '';
  grid.appendChild(sentinel);
  sentinel.textContent = 'Loading…';
  _galleryURLs.forEach(u => URL.revokeObjectURL(u));
  _galleryURLs = [];

  const list = collectCurrentPreviewHandles();
  state._gallery = { list, idx: 0 };
  meta.textContent = `${list.length} image${list.length !== 1 ? 's' : ''}`;

  galleryLoadNextPage();

  if (_galleryObserver) _galleryObserver.disconnect();
  _galleryObserver = new IntersectionObserver(async entries => {
    if (entries.some(e => e.isIntersecting)) {
      await galleryLoadNextPage();
      if (state._gallery.idx >= state._gallery.list.length) {
        sentinel.textContent = 'No more images';
        _galleryObserver.disconnect();
      }
    }
  }, { root: grid, rootMargin: '500px' });
  _galleryObserver.observe(sentinel);

  $('#exportZip').onclick = () => exportZipOfCurrentFilter();
  $('#galleryBack').onclick = closeGallery;
  window.addEventListener('keydown', handleGalleryKeys);

  document.body.classList.add('gallery-view-active');
  view.setAttribute('aria-hidden', 'false');
  lockScroll();

  async function galleryLoadNextPage() {
    if (state._gallery.idx >= state._gallery.list.length) return;
    const end = Math.min(state._gallery.idx + 40, state._gallery.list.length);
    const frag = document.createDocumentFragment();

    for (let i = state._gallery.idx; i < end; i++) {
      const { handle, id } = state._gallery.list[i];
      const url = await loadObjectURL(handle);
      _galleryURLs.push(url);
      const im = document.createElement('img');
      im.className = 'gimg';
      im.src = url;
      im.loading = 'lazy';
      im.decoding = 'async';
      im.onclick = () => {
        const promptToOpen = state.all.find(p => p.id === id);
        if (promptToOpen) {
          closeGallery();
          openDetailView(promptToOpen);
        }
      };
      frag.appendChild(im);
    }
    grid.insertBefore(frag, sentinel);
    state._gallery.idx = end;
  }
}

function closeGallery() {
  document.body.classList.remove('gallery-view-active');
  $('#galleryView')?.setAttribute('aria-hidden', 'true');
  unlockScroll();
  window.scrollTo({ top: state._scrollPos, behavior: 'instant' });
  window.removeEventListener('keydown', handleGalleryKeys);
  if (_galleryObserver) _galleryObserver.disconnect();
  _galleryURLs.forEach(u => URL.revokeObjectURL(u));
  _galleryURLs = [];
}

function handleGalleryKeys(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeGallery();
  }
}

function collectCurrentPreviewHandles() {
  const list = [];
  for (const p of state._lastRenderedItems) {
    if (p.files?.previews?.length) {
      for (const h of p.files.previews) {
        list.push({ handle: h, id: p.id });
      }
    }
  }
  return list;
}

async function exportZipOfCurrentFilter() { /* Your ZIP export function */ }

/* ========== SCROLL LOCK + TOAST ========== */
let __pv_padRight = '';
function lockScroll(){
  const doc = document.documentElement;
  const body = document.body;
  const sw = window.innerWidth - doc.clientWidth;
  __pv_padRight = body.style.paddingRight || '';
  if (sw > 0) body.style.paddingRight = sw + 'px';
  body.classList.add('no-scroll');
}
function unlockScroll(){
  const body = document.body;
  body.classList.remove('no-scroll');
  body.style.paddingRight = __pv_padRight;
  __pv_padRight = '';
}

function toastCopied(btn){
  btn.classList.add('is-ok');
  const prev=btn.textContent;
  btn.textContent='✓ Copied';
  btn.disabled=true;
  setTimeout(()=>{ btn.classList.remove('is-ok'); btn.textContent=prev; btn.disabled=false; },900);
}

const triggerSearch = debounced(()=> applyFilters(), 160);

/* ========== DOMCONTENTLOADED - APP STARTUP ========== */
document.addEventListener('DOMContentLoaded', () => {
  configureOverlayForEnv();
  showOverlay();

  // ZIP picker wiring
  const libZipBtn = document.getElementById('libZip');
  const zipInput  = document.getElementById('zipInput');
  libZipBtn?.addEventListener('click', () => zipInput?.click());
  zipInput?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) handleZipFile(f);
    e.target.value = '';
  });

  $('#newPromptBtn')?.addEventListener('click', openNewPromptModal);
  $('#newPromptClose')?.addEventListener('click', closeNewPromptModal);
  $('#newPromptForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.rw || !state.rootHandle) {
      alert('Read/Write access is required to save new prompts.');
      return;
    }
    const saveBtn = $('#newPromptSave');
    const msgEl = $('#newPromptMsg');
    saveBtn.disabled = true;
    msgEl.textContent = 'Saving...';
    try {
      const title = $('#newTitle').value.trim();
      const promptText = $('#newPromptText').value;
      const images = $('#newImages').files;
      if (!title) throw new Error('Title is required.');
      const folderName = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-');
      if (!folderName) throw new Error('Could not generate a valid folder name from the title.');
      const promptsDir = await state.rootHandle.getDirectoryHandle('prompts', { create: true });
      const newDirHandle = await promptsDir.getDirectoryHandle(folderName, { create: true });

      // tags.json: title only
      const tagsMeta = { title };
      const tagsFileHandle = await newDirHandle.getFileHandle('tags.json', { create: true });
      let writable = await tagsFileHandle.createWritable();
      await writable.write(JSON.stringify(tagsMeta, null, 2));
      await writable.close();

      if (promptText) {
        const promptFileHandle = await newDirHandle.getFileHandle('prompt.txt', { create: true });
        writable = await promptFileHandle.createWritable();
        await writable.write(promptText);
        await writable.close();
      }
      for (const imageFile of images) {
        const imageFileHandle = await newDirHandle.getFileHandle(imageFile.name, { create: true });
        writable = await imageFileHandle.createWritable();
        await writable.write(imageFile);
        await writable.close();
      }
      msgEl.textContent = 'Success! Reloading library...';
      setTimeout(() => {
        closeNewPromptModal();
        rescanCurrentLibrary();
      }, 1000);
    } catch (err) {
      msgEl.textContent = `Error: ${err.message}`;
      console.error('Failed to save new prompt:', err);
    } finally {
      saveBtn.disabled = false;
    }
  });

  $('#reloadLibraryBtn')?.addEventListener('click', rescanCurrentLibrary);
  $('#openRW')?.addEventListener('click', showOverlay);
  $('#libClose')?.addEventListener('click', hideOverlay);
  $('#libRW')?.addEventListener('click', handleOpenRW);
  $('#libFolder')?.addEventListener('click', () => $('#dirInput')?.click());
  $('#zipInput')?.addEventListener('change', e => { const f = e.target.files?.[0]; if (f) { handleZipFile(f); e.target.value=''; } });
  $('#dirInput')?.addEventListener('change', handleDirPickReadOnly);
  $('#empty')?.addEventListener('click', () => showOverlay());

  const dropZone = $('#dropZone');
  dropZone?.addEventListener('click', openBestPicker);
  dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dz-over'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dz-over'));
  dropZone?.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('dz-over');
    const items = e.dataTransfer?.items;
    if (items && items.length > 0) {
      const all = await entriesToFiles(items);
      await buildFromLooseFiles(all);
    }
  });

  const searchBox = $('#searchBox');
  searchBox?.addEventListener('input', e => { state.q = e.target.value; triggerSearch(); });

  $('#clearFilters')?.addEventListener('click', () => {
    state.q = '';
    if(searchBox) searchBox.value = '';
    setOnlyFavs(false);
    applyFilters();
  });

  $('#toggleFavs')?.addEventListener('click', () => setOnlyFavs(!state.onlyFavs));
  $('#openGallery')?.addEventListener('click', openGallery);
});
