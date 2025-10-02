/* ========== TINY HELPERS ========== */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const savePref = (k,v)=>{ try{ localStorage.setItem(`pv:${k}`, JSON.stringify(v)); }catch{} };
const loadPref = (k,f)=>{ try{ const v=localStorage.getItem(`pv:${k}`); return v?JSON.parse(v):f; }catch{ return f; } };
const debounced = (fn,ms=160)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

/* ========== GLOBAL STATE ========== */
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
  const currentCover = prompt.files.previews.find(h => h.name.startsWith(prefix));
  try {
    if (currentCover && currentCover.name !== newCoverHandle.name) {
      const oldName = currentCover.name;
      const newName = oldName.substring(prefix.length);
      const file = await currentCover.getFile();
      const newHandle = await prompt.dirHandle.getFileHandle(newName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(file);
      await writable.close();
      await prompt.dirHandle.removeEntry(oldName);
    }
    if (newCoverHandle.name.startsWith(prefix)) {
      return true;
    }
    const oldName = newCoverHandle.name;
    const newName = prefix + oldName;
    const file = await newCoverHandle.getFile();
    const newHandle = await prompt.dirHandle.getFileHandle(newName, { create: true });
    const writable = await newHandle.createWritable();
    await writable.write(file);
    await writable.close();
    await prompt.dirHandle.removeEntry(oldName);
    await refreshPrompt(prompt);
    return true;
  } catch (err) {
    console.error('Failed to set cover image:', err);
    alert('Error setting cover image.');
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
    updatedPreviews.sort((a,b)=> a.name.localeCompare(b.name));
    prompt.files.previews = updatedPreviews;
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
    const { items, tagSet } = await scanPromptsRW(promptsDir);
    const rootFavs=await readRootFavorites(rootForManifest).catch(()=>null);
    const rootFavSet=new Set(rootFavs?.ids||[]);
    for(const p of items){ if(!p.favorite && rootFavSet.has(p.id)) p.favorite=true; }
    await finalizeLibrary(items, tagSet);
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
    const { items, tagSet } = await scanPromptsRW(promptsDir);
    const rootFavs = await readRootFavorites(rootForManifest).catch(() => null);
    const rootFavSet = new Set(rootFavs?.ids || []);
    for(const p of items){ if(!p.favorite && rootFavSet.has(p.id)) p.favorite=true; }
    await finalizeLibrary(items, tagSet);
  } catch (err) {
    console.error("Failed to reload library:", err);
    alert("Failed to reload library. You may need to grant permissions again.");
  }
}

async function tryGetSubdir(dir,name){ try{ return await dir.getDirectoryHandle(name,{create:false}); }catch{ return null; } }

async function scanPromptsRW(promptsDir) {
  const items = []; const tagSet = new Set();
  for await (const [entryName, entryHandle] of promptsDir.entries()) {
    if (entryHandle.kind !== 'directory') continue;
    const folder = `prompts/${entryName}`;
    const p = { id: folder.replace(/\s+/g, '-').toLowerCase(), title: entryName, tags: [], folder, files: { prompt: null, tags: null, previews: [] }, dirHandle: entryHandle, favorite: false, rootHandle: state.rootHandle };
    for await (const [childName, child] of entryHandle.entries()) {
      const lower = childName.toLowerCase();
      if (child.kind === 'file') {
        if (lower === 'prompt.txt') { p.files.prompt = child; }
        else if (lower === 'tags.json') { p.files.tags = child; }
        else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(lower)) { p.files.previews.push(child); }
        else if(lower==='favorites.json'){ const data=await readJSONHandle(child).catch(()=>null); if(data?.favorite===true) p.favorite=true; }
      }
    }
    if (!p.files.tags) continue;
    const meta = await readJSONHandle(p.files.tags).catch(() => null);
    if (!meta) continue;
    p.title = meta.title || p.title;
    p.tags = Array.isArray(meta.tags) ? meta.tags : [];
    p.tags.forEach(t => tagSet.add(t));
    p.files.previews.sort((a, b) => a.name.localeCompare(b.name));
    items.push(p);
  }
  items.sort((a, b) => a.title.localeCompare(b.title));
  return { items, tagSet };
}

async function readJSONHandle(h) { const f = await h.getFile(); return JSON.parse(await f.text()); }

async function handleDirPickReadOnly(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  await buildFromLooseFiles(files);
}

function isZipEntry(x) { return x && typeof x.async === 'function' && typeof x.name === 'string'; }

async function handleZipFile(file) { /* Your full handleZipFile function */ }
async function buildFromLooseFiles(files) { /* Your full buildFromLooseFiles function */ }
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
      let meta = { title, tags: Array.isArray(p.tags) ? p.tags : [] };
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

/* ========== APP INITIALIZATION & STATE MANAGEMENT ========== */
async function finalizeLibrary(all, tagSet) {
  all.forEach(p => { const t = TitleStore.get(p.id); if (t) p.title = t; });

  state.all = all;
  state.tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  
  const newPromptBtn = $('#newPromptBtn');
  const reloadLibraryBtn = $('#reloadLibraryBtn');
  if (state.rw) {
    if (newPromptBtn) newPromptBtn.style.display = 'inline-block';
    if (reloadLibraryBtn) reloadLibraryBtn.style.display = 'inline-block';
  } else {
    if (newPromptBtn) newPromptBtn.style.display = 'none';
    if (reloadLibraryBtn) reloadLibraryBtn.style.display = 'none';
  }

  renderTags();
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
      try{ p._snippet = (await loadPromptText(p)).toString().slice(0, 2000); }
      catch{ p._snippet=''; }
    }));
    await new Promise(r=> setTimeout(r,0));
  }
}

function applyFilters() {
  const q = (state.q || '').trim().toLowerCase();
  let list = state.all;

  if(q){
    list = list.filter(p => {
      const hay = ((p.title || '') + ' ' + (p.tags || []).join(' ') + ' ' + (p._snippet || '')).toLowerCase();
      return hay.includes(q);
    });
  }

  if(state.sel.size){
    list = list.filter(p => {
      const has = p.tags || [];
      return state.mode === 'AND'
        ? [...state.sel].every(t => has.includes(t))
        : [...state.sel].some(t => has.includes(t));
    });
  }

  if(state.onlyFavs){
    list = list.filter(p => p.favorite || FavStore.has(p.id));
  }

  state._lastRenderedItems = list;
  renderGrid(list);
  equalizeCardHeights();
}

/* ========== UI RENDERING ========== */
function renderTags(){
  const wrap=$('#tagChips'); if(!wrap) return;
  wrap.innerHTML='';
  state.tags.forEach(t=>{
    const b=document.createElement('button'); b.className='chip'; b.textContent=t; b.dataset.tag=t;
    b.onclick=()=>{ if(state.sel.has(t)) state.sel.delete(t); else state.sel.add(t); b.classList.toggle('active'); applyFilters(); };
    wrap.appendChild(b);
  });
}

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
    const tw = document.createElement('div');
    tw.className = 'thumb-wrap skel';
    const img = document.createElement('img');
    img.className = 'thumb';
    img.loading = 'lazy';
    img.decoding = 'async';

    const badge=document.createElement('span');
    badge.className='badge';
    badge.textContent=(p.tags||[]).includes('nsfw')?'NSFW':'SFW';

    const isFav = p.favorite || FavStore.has(p.id);
    const favBtn = document.createElement('button');
    favBtn.className = isFav ? 'fav-btn active' : 'fav-btn';
    favBtn.textContent = isFav ? '★' : '☆';
    favBtn.title = isFav ? 'Unfavorite' : 'Favorite';
    favBtn.onclick = (e) => { e.stopPropagation(); toggleFavorite(p, favBtn); };

    const count = document.createElement('span');
    const n = p.files?.previews?.length || 0;
    if (n > 0) {
        count.className = 'count-badge';
        count.textContent = `📸 ${n}`;
        count.title = `${n} image${n !== 1 ? 's' : ''}`;
    }

    if(p.files.previews.length > 0){
        loadObjectURL(p.files.previews[0]).then(url => { img.src = url; img.onload = () => tw.classList.remove('skel'); });
    } else {
        img.alt = 'No preview';
        tw.classList.remove('skel');
    }
    tw.append(img, badge, favBtn);
    if (n > 0) tw.appendChild(count);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const h3 = document.createElement('h3');
    h3.className = 'title';
    h3.textContent = p.title;
    h3.setAttribute('contenteditable', state.rw ? 'true' : 'false');
    h3.setAttribute('spellcheck','false');
    h3.dataset.id = p.id;
    if (state.rw) {
        h3.addEventListener('keydown', (e) => { if(e.key === 'Enter') { e.preventDefault(); h3.blur(); }});
        h3.addEventListener('blur', () => { const newTitle = h3.textContent.trim(); if (newTitle && newTitle !== p.title) { saveTitle(p, newTitle); } else { h3.textContent = p.title; }});
    }
    
    const tags = document.createElement('div');
    tags.className = 'tags';
    (p.tags || []).forEach(t => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = t;
        span.title = 'Filter by tag';
        span.style.cursor = 'pointer';
        span.onclick = () => {
            if (!state.sel.has(t)) {
                state.sel.add(t);
                $$('#tagChips .chip').forEach(c => { if(c.textContent === t) c.classList.add('active'); });
                applyFilters();
            }
        };
        tags.appendChild(span);
    });

    meta.append(h3, tags);
    
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn';
    viewBtn.textContent = 'Open';
    viewBtn.onclick = () => openDetailView(p);
    actions.appendChild(viewBtn);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-primary';
    copyBtn.textContent = 'Copy Prompt';
    copyBtn.onclick = async () => {
        const text = await loadPromptText(p);
        navigator.clipboard.writeText(text);
        toastCopied(copyBtn);
    };
    actions.appendChild(copyBtn);
    card.append(tw, meta, actions);
    grid.appendChild(card);
  });
}

function equalizeCardHeights(){
  const cards=$$('.card');
  if(!cards.length) return;
  cards.forEach(c=> c.style.height='auto');
  let maxH=0;
  cards.forEach(c=> maxH=Math.max(maxH, c.getBoundingClientRect().height));
  if(maxH > 0) cards.forEach(c=> c.style.height=`${Math.ceil(maxH)}px`);
}

function renderParsedPrompt(text, container) {
  container.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = text;
  container.appendChild(p);
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
      detailTitle.onblur = () => { const newTitle = detailTitle.textContent.trim(); if (newTitle && newTitle !== p.title) { saveTitle(p, newTitle); } else { detailTitle.textContent = p.title; }};
  } else {
      detailTitle.setAttribute('contenteditable', 'false');
      detailTitle.onkeydown = null;
      detailTitle.onblur = null;
  }

  const tagWrap = $('#detailTags');
  tagWrap.innerHTML = '';
  (p.tags || []).forEach(t => { const b = document.createElement('span'); b.className = 'chip'; b.textContent = t; tagWrap.appendChild(b); });

  $('#detailBack').onclick = closeDetailView;
  $('#detailCopyPrompt').onclick = async () => {
    const text = await loadPromptText(p);
    navigator.clipboard.writeText(text);
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
  loadPromptText(p).then(text => { renderParsedPrompt(text.trim(), promptContainer); });

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
function openGallery(){
  const list = state._lastRenderedItems.flatMap(p => p.files?.previews?.map(h => ({ handle:h, prompt:p })) || []);
  const total = list.length;
  if (!total){ alert('No images in current results.'); return; }
  state._gallery = { list, idx:0 };
  const grid = $('#galleryGrid');
  const meta = $('#galleryMeta');
  const progress = $('#galleryProgress');
  const progressText = $('#galleryProgressText');
  grid.innerHTML='';
  meta.textContent = `${total} image${total!==1?'s':''}`;
  progress.value = 0; progress.max = total; progressText.textContent = '0%';
  document.body.classList.add('gallery-view-active');
  $('#galleryView').setAttribute('aria-hidden','false');
  const BATCH=24;
  let loaded=0;
  for (let i=0;i<total;i++){
    const cell = document.createElement('img');
    cell.className='gimg';
    grid.appendChild(cell);
    loadObjectURL(list[i].handle).then(url=>{
      cell.src=url;
      cell.onclick = ()=>{
        const p = list[i].prompt;
        closeGallery();
        openDetailView(p);
      };
      loaded++;
      progress.value=loaded; progressText.textContent = Math.floor((loaded/total)*100) + '%';
    });
    if (i % BATCH === 0) { /* yield */ }
  }
  $('#galleryBack').onclick = closeGallery;
  $('#exportZip').onclick = exportCurrentGalleryAsZip;
}
function closeGallery(){
  document.body.classList.remove('gallery-view-active');
  $('#galleryView').setAttribute('aria-hidden','true');
}
async function exportCurrentGalleryAsZip(){
  if (!window.JSZip){ alert('JSZip not loaded'); return; }
  const zip = new JSZip();
  let i=1;
  for (const item of state._gallery.list){
    try{
      const f = await item.handle.getFile();
      zip.file(item.handle.name || `image-${i++}.jpg`, f);
    }catch{}
  }
  const blob = await zip.generateAsync({type:'blob'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gallery.zip'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(a.href), 1500);
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

async function exportZipOfCurrentFilter() {
  if (!window.JSZip) { alert('JSZip library not available.'); return; }
  const btn = $('#exportZip');
  const prog = $('#galleryProgress'), progTxt = $('#galleryProgressText');
  const list = collectCurrentPreviewHandles();
  if (!list.length) return;

  btn.disabled = true;
  btn.textContent = 'Zipping…';
  prog.value = 0;
  progTxt.textContent = '0%';

  const zip = new JSZip();
  let done = 0;

  for (const item of list) {
    const { handle, id } = item;
    let file, name;
    if ('getFile' in handle) { file = await handle.getFile(); name = file.name; }
    else { file = handle; name = handle.name; }
    const folder = zip.folder(id.replace('prompts/', '')) || zip;
    const arrayBuf = await file.arrayBuffer();
    folder.file(name, arrayBuf);
    done++;
    const frac = done / list.length;
    prog.value = frac;
    progTxt.textContent = `${Math.floor(frac * 100)}%`;
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `prompt-vault-export-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  btn.textContent = 'Export as ZIP';
  btn.disabled = false;
}

async function loadObjectURL(handle) {
    if (!handle) return '';
    try {
      if ('getFile' in handle) {
          const file = await handle.getFile();
          return URL.createObjectURL(file);
      }
      return URL.createObjectURL(handle);
    } catch(e) {
      console.error("Could not create object URL from handle", handle, e);
      return '';
    }
}

async function loadPromptText(p) {
    const handle = p.files?.prompt;
    if (!handle) return '(No prompt.txt)';
    try {
      if ('getFile' in handle) {
          const file = await handle.getFile();
          return file.text();
      }
      if(typeof handle.async === 'function') {
        return handle.async('string');
      }
      return '(Could not load prompt)';
    } catch(e) {
        console.error("Could not load prompt text", p, e);
        return '(Error loading prompt)';
    }
}

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
          const tags = $('#newTags').value.split(',').map(t => t.trim()).filter(Boolean);
          const promptText = $('#newPromptText').value;
          const images = $('#newImages').files;
          if (!title) throw new Error('Title is required.');
          const folderName = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-');
          if (!folderName) throw new Error('Could not generate a valid folder name from the title.');
          const promptsDir = await state.rootHandle.getDirectoryHandle('prompts', { create: true });
          const newDirHandle = await promptsDir.getDirectoryHandle(folderName, { create: true });
          const tagsMeta = { title, tags };
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
              handleOpenRW();
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

    $$('input[name="mode"]').forEach(r => r.addEventListener('change', e => { state.mode = e.target.value; applyFilters(); }));
    $('#clearFilters')?.addEventListener('click', () => {
        state.sel.clear();
        state.q = '';
        searchBox.value = '';
        setOnlyFavs(false);
        $$('#tagChips .chip').forEach(c => c.classList.remove('active'));
        applyFilters();
    });

    $('#toggleFavs')?.addEventListener('click', () => setOnlyFavs(!state.onlyFavs));
    $('#openGallery')?.addEventListener('click', openGallery);
});
