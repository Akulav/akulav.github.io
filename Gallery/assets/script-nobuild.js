/* ========== tiny helpers ========== */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const savePref = (k,v)=>{ try{ localStorage.setItem(`pv:${k}`, JSON.stringify(v)); }catch{} };
const loadPref = (k,f)=>{ try{ const v=localStorage.getItem(`pv:${k}`); return v?JSON.parse(v):f; }catch{ return f; } };

/* ========== state ========== */
const state = {
  mode: 'AND',
  q: '',
  all: [],
  tags: [],
  sel: new Set(),
  rw: false,
  rootHandle: null,
  onlyFavs: loadPref('onlyFavs', false),
  theme: 'dark',
  _lastRenderedItems: [],
  _gallery: { list: [], idx: 0 },
  _galleryLoaded: 0,
  _galleryTotal: 0,
  _compareSel: new Set(),
};

/* ======== Library overlay wiring ======== */
const overlay = $('#libraryOverlay');
const dropZone = $('#dropZone');
const dirInput = $('#dirInput');
const zipInput = $('#zipInput');
const libMsg = $('#libMsg');
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
function showOverlay(){
  overlay?.classList?.remove('hidden');
  overlay?.setAttribute?.('aria-hidden','false');
}
function hideOverlay(){
  overlay?.classList?.add('hidden');
  overlay?.setAttribute?.('aria-hidden','true');
  if (libMsg) libMsg.textContent='';
}

$('#openRW')?.addEventListener('click', (e)=>{ e.preventDefault(); showOverlay(); });
$('#libClose')?.addEventListener('click', hideOverlay);

/* Big square actions */
dropZone?.addEventListener('click', openBestPicker);
dropZone?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openBestPicker(); } });
dropZone?.addEventListener('dragover', e=>{ e.preventDefault(); dropZone.classList.add('dz-over'); });
dropZone?.addEventListener('dragleave', ()=> dropZone.classList.remove('dz-over'));
dropZone?.addEventListener('drop', async e=>{
  e.preventDefault(); dropZone.classList.remove('dz-over');
  const items = e.dataTransfer?.items;
  const files = e.dataTransfer?.files;
  try{
    libMsg.textContent = 'Reading dropped items…';
    if(items && items.length && items[0].webkitGetAsEntry){
      const all = await entriesToFiles(items);
      await buildFromLooseFiles(all);
    }else if(files && files.length){
      if(files.length===1 && /\.zip$/i.test(files[0].name)){
        await handleZipFile(files[0]);
      }else{
        await buildFromLooseFiles(Array.from(files));
      }
    }else{
      libMsg.textContent = 'Nothing detected. Drop a /prompts folder or tap to pick.';
    }
  }catch(err){
    console.error(err);
    libMsg.textContent = 'Could not read dropped items.';
  }
});

/* Overlay buttons (explicit options) */
$('#libRW')?.addEventListener('click', async ()=>{
  if(!(window.showDirectoryPicker && window.isSecureContext)){
    libMsg.textContent = 'Write access not supported here. Use Folder or ZIP.';
    return;
  }
  try{ await handleOpenRW(); hideOverlay(); }catch(e){ console.warn(e); libMsg.textContent='Write picker was cancelled or failed.'; }
});
$('#libFolder')?.addEventListener('click', ()=> dirInput?.click());
$('#libZip')?.addEventListener('click', ()=> zipInput?.click());

/* Fallback inputs */
dirInput?.addEventListener('change', handleDirPickReadOnly);
zipInput?.addEventListener('change', e=>{ const f=e.target.files?.[0]; if(f) handleZipFile(f); e.target.value=''; });

/* Best picker from square */
async function openBestPicker(){
  // Prefer RW (desktop + https) — if user cancels, fall back silently.
  if(window.showDirectoryPicker && window.isSecureContext){
    try{ await handleOpenRW(); hideOverlay(); return; }catch(e){ /* fall through */ }
  }
  // Folder input next (Android Chrome & many)
  if(dirInput && 'webkitdirectory' in dirInput){ dirInput.click(); return; }
  // ZIP (iOS Safari)
  if(zipInput){ zipInput.click(); return; }
  libMsg.textContent = 'Your browser cannot open folders. Please upload a .zip of your /prompts folder.';
}

/* DataTransferItemList -> File[] (directory drops) */
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

/* ========== existing wires ========== */
const triggerSearch = debounced(()=> applyFilters(), 80);
$('#searchBox')?.addEventListener('input', e=>{ state.q = e.target.value; triggerSearch(); });
$$('input[name="mode"]').forEach(r=> r.addEventListener('change', e=>{ state.mode = e.target.value; applyFilters(); }));
$('#clearFilters')?.addEventListener('click', ()=>{ state.sel.clear(); state.q=''; $('#searchBox').value=''; setOnlyFavs(false); $$('#tagChips .chip').forEach(c=>c.classList.remove('active')); applyFilters(); });
const topFavBtn = $('#toggleFavs'); topFavBtn?.addEventListener('click', ()=> setOnlyFavs(!state.onlyFavs));
$('#openGallery')?.addEventListener('click', openGallery);

/* quick keys */
window.addEventListener('keydown', (e)=>{
  if(e.key === '/' && document.activeElement.tagName !== 'INPUT' && !document.querySelector('dialog[open]')){ e.preventDefault(); $('#searchBox')?.focus(); }
  if(e.key === 'Escape' && document.activeElement?.id === 'searchBox'){ $('#searchBox')?.blur(); }
});

/* ========== favorites-only ========== */
function setOnlyFavs(v){
  state.onlyFavs = !!v; savePref('onlyFavs', state.onlyFavs);
  topFavBtn?.classList.toggle('active', state.onlyFavs);
  $('#favSwitch')?.classList.toggle('active', state.onlyFavs);
  applyFilters();
}
function ensureFavSwitch(){
  if($('#favSwitch')) return;
  const wrap=document.createElement('div'); wrap.className='chips'; wrap.style.marginTop='10px';
  const chip=document.createElement('button'); chip.id='favSwitch'; chip.className='chip'; chip.textContent='Only favorites';
  chip.onclick=()=> setOnlyFavs(!state.onlyFavs);
  wrap.appendChild(chip);
  $('#filters')?.appendChild(wrap);
  chip.classList.toggle('active', state.onlyFavs);
  topFavBtn?.classList.toggle('active', state.onlyFavs);
}

/* ========== RW loader (unchanged core) ========== */
async function handleOpenRW(){
  const root=await showDirectoryPicker({ mode:'readwrite' });
  let promptsDir=await tryGetSubdir(root,'prompts'); let rootForManifest=root;
  if(!promptsDir){ const nm=(root.name||'').toLowerCase(); if(nm==='prompts'){ promptsDir=root; rootForManifest=root; } }
  if(!promptsDir){ alert('Please pick the folder that contains the "prompts" directory (or the "prompts" directory itself).'); return; }
  state.rw=true; state.rootHandle=rootForManifest;
  const { items, tagSet } = await scanPromptsRW(promptsDir);
  const rootFavs=await readRootFavorites(rootForManifest).catch(()=>null);
  const rootFavSet=new Set(rootFavs?.ids||[]);
  for(const p of items){ if(!p.favorite && rootFavSet.has(p.id)) p.favorite=true; }
  finalizeLibrary(items, tagSet);
}
async function tryGetSubdir(dir,name){ try{ return await dir.getDirectoryHandle(name,{create:false}); }catch{ return null; } }
async function scanPromptsRW(promptsDir){
  const items=[]; const tagSet=new Set();
  for await (const [entryName, entryHandle] of promptsDir.entries()){
    if(entryHandle.kind!=='directory') continue;
    const folder=`prompts/${entryName}`;
    const p={ id: folder.replace(/\s+/g,'-').toLowerCase(), title: entryName, tags: [], folder, files:{prompt:null,tags:null,previews:[]}, dirHandle: entryHandle, favorite:false, rootHandle: state.rootHandle };
    for await (const [childName, child] of entryHandle.entries()){
      const lower=childName.toLowerCase();
      if(child.kind==='file'){
        if(lower==='prompt.txt'){ p.files.prompt=child; }
        else if(lower==='tags.json'){ p.files.tags=child; }
        else if(/\.(jpg|jpeg|png|webp|avif)$/i.test(lower)){ p.files.previews.push(child); }
        else if(lower==='favorites.json'){ const data=await readJSONHandle(child).catch(()=>null); if(data?.favorite===true) p.favorite=true; }
      }
    }
    if(!p.files.tags) continue;
    const meta=await readJSONHandle(p.files.tags).catch(()=>null); if(!meta) continue;
    p.title=meta.title||p.title;
    p.tags=Array.isArray(meta.tags)?meta.tags:[]; p.tags.forEach(t=> tagSet.add(t));
    p.files.previews.sort((a,b)=> a.name.localeCompare(b.name));
    items.push(p);
  }
  items.sort((a,b)=> a.title.localeCompare(b.title));
  return { items, tagSet };
}
async function readJSONHandle(h){ const f=await h.getFile(); return JSON.parse(await f.text()); }

/* ======= Read-only folder & ZIP fallbacks (mobile-friendly) ======= */
async function handleDirPickReadOnly(e){
  const files = Array.from(e.target.files || []);
  if(!files.length) return;
  await buildFromLooseFiles(files);
}

/* Robust favorites store with localStorage + safe fallback */
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
function loadLocalFavorite(id){ return FavStore.has(id); }
function toggleFavorite(idOrPrompt, starBtn){
  // supports toggleFavorite(p, btn) from cards OR toggleFavorite(id)
  let id = typeof idOrPrompt === 'string' ? idOrPrompt : idOrPrompt?.id;
  if (!id) return;
  if (FavStore.has(id)) { FavStore.del(id); if(starBtn){ starBtn.classList.remove('active'); starBtn.textContent='☆'; } }
  else { FavStore.add(id); if(starBtn){ starBtn.classList.add('active'); starBtn.textContent='★'; } }
  if (typeof idOrPrompt === 'object'){ idOrPrompt.favorite = FavStore.has(id); applyFilters(); }
}

function isZipEntry(x){ return x && typeof x.async === 'function' && typeof x.name === 'string'; }

async function handleZipFile(file){
  if (!file) { libMsg.textContent = 'No file picked.'; return; }
  if (!/\.zip$/i.test(file.name)) { libMsg.textContent = 'Please choose a .zip file.'; return; }
  if (!window.JSZip) { libMsg.textContent = 'ZIP support not loaded.'; return; }
  try {
    libMsg.textContent = 'Reading ZIP…';
    const ab = (file.arrayBuffer) ? await file.arrayBuffer() : file;
    const zip = await JSZip.loadAsync(ab, { createFolders:false });
    const fileEntries = Object.values(zip.files).filter(zf => !zf.dir);
    const totalZip = fileEntries.length || 1;
    let processedZip = 0;

    const groups = new Map();
    for (const zf of fileEntries){
      try {
        const rel = (zf.name || '').replace(/^[\/]+/, '');
        const parts = rel.split('/').filter(Boolean);
        if (!parts.length) { processedZip++; continue; }
        let folderKey;
        const pIdx = parts.indexOf('prompts');
        if (pIdx >= 0) {
          if (parts.length < pIdx + 2) { processedZip++; continue; }
          folderKey = parts.slice(0, pIdx + 2).join('/');
        } else {
          if (parts.length < 2) { processedZip++; continue; }
          folderKey = `prompts/${parts[0]}`;
        }
        const leaf = (parts.at(-1) || '').toLowerCase();
        if (leaf !== 'prompt.txt' &&
            leaf !== 'tags.json' &&
            !/\.(jpg|jpeg|png|webp|avif)$/i.test(leaf)){
          processedZip++; continue;
        }
        const bucket = groups.get(folderKey) || { folder: folderKey, promptFile:null, tagsFile:null, previews:[] };
        if (leaf === 'prompt.txt') bucket.promptFile = zf;
        else if (leaf === 'tags.json') bucket.tagsFile = zf;
        else bucket.previews.push(zf);
        groups.set(folderKey, bucket);
      } catch {/* skip entry */}
      processedZip++;
      if (processedZip % 200 === 0){
        const pct = Math.min(99, Math.floor((processedZip/totalZip)*100));
        libMsg.textContent = `Reading ZIP… ${pct}%`;
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const all = [];
    const tagSet = new Set();
    const entries = Array.from(groups.values());

    for (let i = 0; i < entries.length; i++){
      const g = entries[i];
      libMsg.textContent = `Indexing… ${Math.min(99, Math.floor(((i+1)/entries.length)*100))}%`;
      await new Promise(r => setTimeout(r, 0));
      if (!g.tagsFile) continue;
      let meta=null; try { meta = JSON.parse(await g.tagsFile.async('string')); } catch { continue; }
      const id = g.folder.replace(/\s+/g,'-').toLowerCase();
      const title = meta.title || g.folder.split('/').at(-1);
      const tags = Array.isArray(meta.tags) ? meta.tags : [];
      tags.forEach(t => tagSet.add(t));
      g.previews.sort((a,b)=> a.name.localeCompare(b.name));
      all.push({
        id, title, tags, folder: g.folder,
        files: { prompt: g.promptFile || null, tags: g.tagsFile, previews: g.previews },
        favorite: loadLocalFavorite(id)
      });
    }

    libMsg.textContent = 'Finalizing…';
    finalizeLibrary(all, tagSet);
    hideOverlay();
  } catch (err){
    console.error('ZIP parse failed:', err);
    libMsg.textContent = 'Failed to read ZIP. Try re-zipping on desktop or reduce size.';
  }
}

async function buildFromLooseFiles(files){
  libMsg.textContent = 'Indexing files… 0%';
  const groups = new Map();
  const total = files.length || 1;
  const TICK_EVERY = 250;

  for (let i=0; i<files.length; i++){
    const f = files[i];
    const rel = (f.webkitRelativePath || f.name).replace(/^[\/]*/, '');
    const parts = rel.split('/');
    if (parts.length >= 1){
      let folderKey;
      const pIdx = parts.indexOf('prompts');
      if (pIdx >= 0){
        if (parts.length >= pIdx + 2){
          folderKey = parts.slice(0, pIdx + 2).join('/');
        }
      } else {
        if (parts.length >= 2){
          folderKey = `prompts/${parts[0]}`;
        }
      }
      if (folderKey){
        const bucket = groups.get(folderKey) || { folder: folderKey, promptFile:null, tagsFile:null, previews:[] };
        const leaf = (parts.at(-1) || '').toLowerCase();
        if (leaf === 'prompt.txt') bucket.promptFile = f;
        else if (leaf === 'tags.json') bucket.tagsFile = f;
        else if (/(\.jpg|\.jpeg|\.png|\.webp|\.avif)$/i.test(leaf)) bucket.previews.push(f);
        groups.set(folderKey, bucket);
      }
    }
    if (i % TICK_EVERY === 0){
      const pct = Math.min(99, Math.floor((i/total)*100));
      libMsg.textContent = `Indexing files… ${pct}%`;
      await new Promise(r => setTimeout(r, 0));
    }
  }

  const all = [];
  const tagSet = new Set();
  const groupArr = Array.from(groups.entries());
  const metaTotal = groupArr.length || 1;
  for (let gi=0; gi<groupArr.length; gi++){
    const [folder, g] = groupArr[gi];
    if (!g.tagsFile) continue;
    const meta = await readJSONFile(g.tagsFile).catch(()=>null);
    if (gi % 20 === 0){ libMsg.textContent = `Reading metadata… ${Math.min(99, Math.floor((gi/metaTotal)*100))}%`; await new Promise(r=>setTimeout(r,0)); }
    if (!meta) continue;
    const id = folder.replace(/\s+/g,'-').toLowerCase();
    const title = meta.title || folder.split('/').at(-1);
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    tags.forEach(t=> tagSet.add(t));
    g.previews.sort((a,b)=> a.name.localeCompare(b.name));
    const favorite = loadLocalFavorite(id);
    all.push({ id, title, tags, folder, files:{ prompt:g.promptFile || null, tags:g.tagsFile, previews:g.previews }, favorite });
  }

  if (!all.length){
    libMsg.textContent = 'No prompts detected. Select your /prompts (with tags.json).';
    return;
  }

  libMsg.textContent = 'Finalizing…';
  finalizeLibrary(all, tagSet);
  hideOverlay();
}
async function readJSONFile(f){ return JSON.parse(await f.text()); }
function guessMimeFromName(name){
  const ext=(name.split('.').pop()||'').toLowerCase();
  if(ext==='jpg'||ext==='jpeg') return 'image/jpeg';
  if(ext==='png') return 'image/png';
  if(ext==='webp') return 'image/webp';
  if(ext==='avif') return 'image/avif';
  return 'application/octet-stream';
}

/* ========== library finalize ========== */
function finalizeLibrary(all, tagSet){
  state.rw=false;
  state.all=all; state.tags=Array.from(tagSet).sort((a,b)=>a.localeCompare(b));
  renderTags(); ensureFavSwitch();
  preloadSnippets(all).then(()=> applyFilters());
  applyFilters();
  document.body.classList.remove('boot-gate');
  const openBtn = $('#openRW'); if (openBtn) openBtn.remove();
}
async function preloadSnippets(list){
  if (typeof isMobile !== 'undefined' && isMobile) { list = list.slice(0, 24); }
  const BATCH=20;
  for(let i=0;i<list.length;i+=BATCH){
    const slice=list.slice(i,i+BATCH);
    await Promise.all(slice.map(async p=>{
      try{
        const txt=await loadPromptText(p).catch(()=>'(No prompt.txt)');
        p._snippet = (await txt).toString().slice(0, 2000);
      }catch{ p._snippet=''; }
    }));
    await new Promise(r=> setTimeout(r,0));
  }
}
function renderTags(){
  const wrap=$('#tagChips'); if(!wrap) return;
  wrap.innerHTML='';
  state.tags.forEach(t=>{
    const b=document.createElement('button'); b.className='chip'; b.textContent=t; b.dataset.tag=t;
    b.onclick=()=>{ if(state.sel.has(t)) state.sel.delete(t); else state.sel.add(t); b.classList.toggle('active'); applyFilters(); };
    wrap.appendChild(b);
  });
}

/* ========== filtering + grid ========== */
function applyFilters(){
  const q = (state.q||'').trim().toLowerCase();
  let list = state.all;

  if(q){
    list = list.filter(p=>{
      const hay = ((p.title||'') + ' ' + (p.tags||[]).join(' ') + ' ' + (p._snippet||'')).toLowerCase();
      return hay.includes(q);
    });
  }

  if(state.sel.size){
    list=list.filter(p=>{
      const has=p.tags||[];
      return state.mode==='AND'
        ? [...state.sel].every(t=>has.includes(t))
        : [...state.sel].some(t=>has.includes(t));
    });
  }
  if(state.onlyFavs){ list=list.filter(p=> p.favorite || FavStore.has(p.id)); }

  state._lastRenderedItems=list;
  renderGrid(list); equalizeCardHeights();
}

function renderGrid(items){
  const grid=$('#grid'), stats=$('#stats'), empty=$('#empty');
  if(!grid||!stats||!empty) return;
  grid.innerHTML=''; stats.textContent=`${items.length} prompt${items.length!==1?'s':''}`;
  empty.style.display = items.length ? 'none' : 'block';

  items.forEach(p=>{
    const card=document.createElement('article'); card.className='card';

    const tw=document.createElement('div'); tw.className='thumb-wrap skel';
    const img=document.createElement('img'); img.className='thumb'; img.loading='lazy'; img.decoding='async';
    const badge=document.createElement('span'); badge.className='badge'; badge.textContent=(p.tags||[]).includes('nsfw')?'NSFW':'SFW';

    const fav=document.createElement('button'); fav.className='fav-btn'; fav.textContent=(p.favorite||FavStore.has(p.id))?'★':'☆';
    if(p.favorite||FavStore.has(p.id)) fav.classList.add('active');
    fav.title=(p.favorite||FavStore.has(p.id))?'Unfavorite':'Favorite';
    fav.onclick=(ev)=>{ ev.stopPropagation(); toggleFavorite(p, fav); };

    const count = document.createElement('span');
    const n = p.files?.previews?.length || 0;
    if (n > 0) { count.className='count-badge'; count.textContent=`📸 ${n}`; count.title=`${n} image${n!==1?'s':''}`; }

    if(p.files.previews.length){
      loadObjectURL(p.files.previews[0]).then(url=>{
        img.src=url;
        img.addEventListener('load', ()=> { tw.classList.remove('skel'); try{ const [r,g,b]=extractDominantColorFromImage(img); card.style.setProperty('--glow', `rgba(${r},${g},${b},0.28)`);}catch{} }, { once:true });
      });
    } else { img.alt='No preview'; tw.classList.remove('skel'); }

    tw.append(img, badge, fav);
    if(n>0) tw.appendChild(count);

    const meta=document.createElement('div'); meta.className='meta';
    const h3=document.createElement('h3'); h3.className='title'; h3.textContent=p.title;

    const tags=document.createElement('div'); tags.className='tags';
    (p.tags||[]).forEach(t=>{
      const span=document.createElement('span'); span.className='tag'; span.textContent=t; span.title='Filter by tag'; span.style.cursor='pointer';
      span.onclick=()=>{ if(!state.sel.has(t)){ state.sel.add(t); $$('#tagChips .chip').forEach(c=>{ if(c.textContent===t) c.classList.add('active'); }); applyFilters(); } };
      tags.appendChild(span);
    });
    meta.append(h3, tags);

    const actions=document.createElement('div'); actions.className='card-actions';
    const viewBtn=document.createElement('button'); viewBtn.className='viewBtn'; viewBtn.textContent='Open';
    const copyBtn=document.createElement('button'); copyBtn.className='copyBtn btn btn-primary'; copyBtn.textContent='Copy Prompt';
    actions.append(viewBtn,copyBtn);

viewBtn.onclick = () => openDetailView(p);
    copyBtn.onclick = async ()=>{ const txt=await loadPromptText(p); await navigator.clipboard.writeText((await txt).trim()); toastCopied(copyBtn); };

    card.append(tw,meta,actions);
    grid.appendChild(card);
  });
}

/* equalize card heights */
function equalizeCardHeights(){
  const cards=$$('.card'); cards.forEach(c=> c.style.height='auto');
  let maxH=0; cards.forEach(c=> maxH=Math.max(maxH, c.getBoundingClientRect().height));
  cards.forEach(c=> c.style.height=`${Math.ceil(maxH)}px`);
}
window.addEventListener('resize', ()=>{ if(state._lastRenderedItems.length) equalizeCardHeights(); });

/* file/object urls */
async function loadObjectURL(handleOrFile){
  let blob = null;
  if (handleOrFile && typeof handleOrFile === 'object') {
    if ('getFile' in handleOrFile) {
      const f = await handleOrFile.getFile();
      blob = f;
    } else if (isZipEntry(handleOrFile)) {
      blob = await handleOrFile.async('blob');
    } else if (handleOrFile instanceof Blob) {
      blob = handleOrFile;
    }
  }
  if (!blob) throw new TypeError('Unsupported object for createObjectURL');
  return URL.createObjectURL(blob);
}

async function loadPromptText(p){
  const h = p.files?.prompt;
  if (!h) return '(No prompt.txt found)';
  if ('getFile' in h) { const f = await h.getFile(); return f.text(); }
  if (isZipEntry(h)) { return h.async('string'); }
  if (h && typeof h.text === 'function') { return h.text(); }
  return '(No prompt.txt found)';
}

/* copy micro-toast */
function toastCopied(btn){
  btn.classList.add('is-ok');
  const prev=btn.textContent;
  btn.textContent='✓ Copied';
  btn.disabled=true;
  setTimeout(()=>{ btn.classList.remove('is-ok'); btn.textContent=prev; btn.disabled=false; },900);
}

/* ===== Modal / Compare / Scrubber ===== */


/* ===== Search for this line in your script: ===== */
/* ===== Modal / Compare / Scrubber ===== */

// REPLACE the entire section from `let _modalState...` down to (but not including) `/* compare overlay */`
// with the following new code.

let _detailState = { p: null, previews: [], index: 0, urls: [] };

function openDetailView(p) {
  _detailState.p = p; // Store the current prompt object

  const view = $('#detailView');
  if (!view) return;

  // --- Populate Header ---
  $('#detailTitle').textContent = p.title;
  const tagWrap = $('#detailTags');
  tagWrap.innerHTML = '';
  (p.tags || []).forEach(t => {
    const b = document.createElement('span');
    b.className = 'chip';
    b.textContent = t;
    tagWrap.appendChild(b);
  });

  // --- Wire up Actions ---
  $('#detailBack').onclick = closeDetailView;
  $('#detailCopyPrompt').onclick = async () => {
    const text = await loadPromptText(p);
    await navigator.clipboard.writeText(text.trim());
    toastCopied($('#detailCopyPrompt'));
  };
  $('#detailDownloadImg').onclick = async () => {
    try {
      const i = _detailState.index || 0;
      const handle = _detailState.previews[i];
      const url = await loadObjectURL(handle);
      const name = (handle && handle.name) ? handle.name : `image-${i + 1}.jpg`;
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) { console.error('Download image failed:', err); }
  };

  // --- Populate Prompt ---
  loadPromptText(p).then(text => {
    $('#detailPromptText').textContent = text.trim();
  });

  // --- Populate Gallery ---
  const thumbsRow = $('#detailThumbs');
  thumbsRow.innerHTML = '';
  _detailState.previews = p.files.previews;
  _detailState.index = 0;
  _detailState.urls = new Array(p.files.previews.length).fill(null);

  if (p.files.previews.length > 0) {
    p.files.previews.forEach((handle, i) => {
      const imgThumb = document.createElement('img');
      imgThumb.dataset.idx = i;
      if (i === 0) imgThumb.classList.add('active');
      
      // Lazy load thumbnail images
      loadObjectURL(handle).then(url => {
        _detailState.urls[i] = url;
        imgThumb.src = url;
        // Load the first image into the hero immediately
        if (i === 0) {
          $('#detailImg').src = url;
        }
      });

      imgThumb.onclick = () => setDetailHero(i);
      thumbsRow.appendChild(imgThumb);
    });
  } else {
    $('#detailImg').removeAttribute('src');
    $('#detailImg').alt = 'No preview available';
  }

  // --- Show the View ---
  document.body.classList.add('detail-view-active');
  view.setAttribute('aria-hidden', 'false');
  lockScroll();

  // --- Keyboard Nav ---
  window.addEventListener('keydown', handleDetailKeys);
}

function setDetailHero(i) {
  if (!_detailState.urls[i]) return; // Don't switch if URL not loaded yet
  
  _detailState.index = i;
  $('#detailImg').src = _detailState.urls[i];

  $$('#detailThumbs img').forEach((thumb, idx) => {
    thumb.classList.toggle('active', idx === i);
  });
  
  // Ensure the active thumbnail is visible
  const activeThumb = $(`#detailThumbs img[data-idx="${i}"]`);
  activeThumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function closeDetailView() {
  document.body.classList.remove('detail-view-active');
  $('#detailView')?.setAttribute('aria-hidden', 'true');
  unlockScroll();

  // Cleanup: revoke URLs to free memory and remove key listener
  _detailState.urls.forEach(url => { if(url) URL.revokeObjectURL(url); });
  _detailState = { p: null, previews: [], index: 0, urls: [] };
  window.removeEventListener('keydown', handleDetailKeys);
}

function handleDetailKeys(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeDetailView();
  }
  if (e.key === 'ArrowRight' && _detailState.previews.length > 1) {
    e.preventDefault();
    const next = (_detailState.index + 1) % _detailState.previews.length;
    setDetailHero(next);
  }
  if (e.key === 'ArrowLeft' && _detailState.previews.length > 1) {
    e.preventDefault();
    const prev = (_detailState.index - 1 + _detailState.previews.length) % _detailState.previews.length;
    setDetailHero(prev);
  }
}

// DELETE the functions: openCompare, closeCompare, renderCompareSelection as they are no longer used.
// You can re-implement them within the new detail view later if needed.

/* ===== Now, find where the card buttons are wired up: ===== */
// Inside the `renderGrid` function...

// Finally, DELETE the entire <dialog id="promptModal"> from your index.html. It's no longer needed.


/* scroll lock */
/* scroll lock (with scrollbar compensation) */
let __pv_padRight = '';
function lockScroll(){
  const doc = document.documentElement;
  const body = document.body;
  const sw = window.innerWidth - doc.clientWidth; // scrollbar width
  __pv_padRight = body.style.paddingRight || '';
  if (sw > 0) body.style.paddingRight = sw + 'px';

  body.classList.add('no-scroll');
  doc.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
}
function unlockScroll(){
  const doc = document.documentElement;
  const body = document.body;
  body.classList.remove('no-scroll');
  doc.style.overflow = '';
  body.style.overflow = '';
  body.style.paddingRight = __pv_padRight;
  __pv_padRight = '';
}


/* favorites (RW write helpers retained for desktop RW mode) */
function favKey(id){ return `pv:fav:${id}`; }
function saveLocalFavorite(id,val){ try{ if(val) localStorage.setItem(favKey(id),'1'); else localStorage.removeItem(favKey(id)); }catch{} }
async function toggleFavoriteRW(p, starBtn){
  p.favorite=!p.favorite; starBtn.textContent=p.favorite?'★':'☆'; starBtn.classList.toggle('active', p.favorite);
  if(!state.rw){ saveLocalFavorite(p.id, p.favorite); applyFilters(); return; }
  if(!p.dirHandle){ console.warn('No dirHandle on prompt; cannot write.'); applyFilters(); return; }
  try{ await writePerFolderFavorite(p.dirHandle, p.favorite); }catch(e){ console.error(e); }
  if(state.rootHandle){ try{ await writeRootFavorites(state.rootHandle, state.all); }catch(e){ console.error(e); } }
  applyFilters();
}
async function writePerFolderFavorite(dirHandle,isFav){
  const fh=await dirHandle.getFileHandle('favorites.json',{create:true});
  const w=await fh.createWritable();
  await w.write(new Blob([JSON.stringify({favorite:!!isFav,ts:Date.now()},null,2)],{type:'application/json'})); await w.close();
}
async function readRootFavorites(rootHandle){ try{ const fh=await rootHandle.getFileHandle('_favorites.json',{create:false}); const f=await fh.getFile(); return JSON.parse(await f.text()); }catch{ return {ids:[]}; } }
async function writeRootFavorites(rootHandle,all){ const ids=all.filter(p=>p.favorite).map(p=>p.id); const fh=await rootHandle.getFileHandle('_favorites.json',{create:true}); const w=await fh.createWritable(); await w.write(new Blob([JSON.stringify({updated:new Date().toISOString(),count:ids.length,ids},null,2)],{type:'application/json'})); await w.close(); }

/* ===== Gallery + ZIP export ===== */
let _galleryObserver=null, _galleryURLs=[];
const GALLERY_PAGE_SIZE = 120;

function collectCurrentPreviewHandles(){
  const list=[];
  for(const p of state._lastRenderedItems){
    if(p.files?.previews?.length){ for(const h of p.files.previews) list.push({handle:h,id:p.id}); }
  }
  return list;
}

async function openGallery(){
  const dlg=$('#galleryModal');
  const grid=$('#galleryGrid'); const sentinel=$('#gallerySentinel');
  const count=$('#galleryCount'); const prog=$('#galleryProgress'), progTxt=$('#galleryProgressText');

  grid.innerHTML=''; grid.appendChild(sentinel); sentinel.textContent='Loading…';
  _galleryURLs=[];
  const list=collectCurrentPreviewHandles();
  state._gallery={ list, idx:0 }; state._galleryLoaded=0; state._galleryTotal=list.length;
  count.textContent=list.length; updateGalleryProgress();

  await galleryLoadNextPage();

  if(_galleryObserver) _galleryObserver.disconnect();
  _galleryObserver=new IntersectionObserver(async entries=>{
    if(entries.some(e=> e.isIntersecting)){ await galleryLoadNextPage(); if(state._gallery.idx>=state._gallery.list.length){ sentinel.textContent='No more images'; } }
  }, { root:grid, threshold:0.15 });
  _galleryObserver.observe(sentinel);

  $('#exportZip').onclick = ()=> exportZipOfCurrentFilter();

  $('#closeGallery').onclick=()=>{
    dlg.close();
    if(_galleryObserver) _galleryObserver.disconnect();
    _galleryURLs.forEach(u=> URL.revokeObjectURL(u)); _galleryURLs=[];
  };

  dlg.showModal();

  function updateGalleryProgress(){
    const total=Math.max(1,state._galleryTotal);
    const frac=state._galleryLoaded/total;
    prog.value=frac; prog.max=1; progTxt.textContent=`${Math.floor(frac*100)}%`;
  }

  async function galleryLoadNextPage(){
    if(state._gallery.idx >= state._gallery.list.length) return;
    const end=Math.min(state._gallery.idx+GALLERY_PAGE_SIZE, state._gallery.list.length);
    const frag=document.createDocumentFragment();
    for(let i=state._gallery.idx;i<end;i++){
      const { handle }=state._gallery.list[i];
      const url=await loadObjectURL(handle); _galleryURLs.push(url);
      const im=document.createElement('img'); im.className='gimg'; im.src=url; im.loading='lazy'; im.decoding='async';
      frag.appendChild(im);
      im.addEventListener('load', ()=>{ state._galleryLoaded++; updateGalleryProgress(); }, { once:true });
    }
    grid.insertBefore(frag, sentinel);
    state._gallery.idx=end;
  }
}

async function exportZipOfCurrentFilter(){
  if(!window.JSZip){ alert('JSZip not available'); return; }
  const btn = $('#exportZip');
  const prog=$('#galleryProgress'), progTxt=$('#galleryProgressText');

  const list = collectCurrentPreviewHandles();
  if(!list.length) return;

  btn.disabled = true; btn.textContent = 'Zipping…';
  prog.value = 0; progTxt.textContent = '0%';

  const zip = new JSZip();
  let done = 0;

  for(const item of list){
    const { handle, id } = item;
    let file, name;
    if('getFile' in handle){ file = await handle.getFile(); name = file.name; }
    else { file = handle; name = handle.name; }
    const folder = zip.folder(id) || zip;
    const arrayBuf = await file.arrayBuffer();
    folder.file(name, arrayBuf);
    done++;
    const frac = done / list.length;
    prog.value = frac; progTxt.textContent = `${Math.floor(frac*100)}%`;
  }

  const blob = await zip.generateAsync({type:'blob', streamFiles:true});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `prompt-vault-export-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(a.href), 2000);

  btn.textContent = 'Export ZIP'; btn.disabled = false;
}

/* ===== utils ===== */
function debounced(fn,ms=160){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

document.addEventListener('DOMContentLoaded', () => {
  configureOverlayForEnv();
  if (typeof showOverlay === 'function') showOverlay();
  const empty = $('#empty');
  empty && empty.addEventListener('click', () => showOverlay());
});

/* Dominant color extraction (fast average downscale) */
function extractDominantColorFromImage(imgEl){
  try{
    const w=imgEl.naturalWidth||imgEl.width, h=imgEl.naturalHeight||imgEl.height;
    const sz = 32;
    const cw = Math.max(1, Math.min(sz, w)), ch = Math.max(1, Math.min(sz, h));
    const c=document.createElement('canvas'); c.width=cw; c.height=ch;
    const ctx=c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imgEl, 0, 0, cw, ch);
    const data=ctx.getImageData(0,0,cw,ch).data;
    let r=0,g=0,b=0,count=0;
    for(let i=0;i<data.length;i+=4){
      const a=data[i+3];
      if(a<8) continue;
      r+=data[i]; g+=data[i+1]; b+=data[i+2]; count++;
    }
    if(!count) return [106,160,255];
    r=Math.round(r/count); g=Math.round(g/count); b=Math.round(b/count);
    return [r,g,b];
  }catch{ return [106,160,255]; }
}

/* ===== Mobile-first modal wiring ===== */
function setupMobileModal(dlg, p, deps){
  // Only activate on phones
  if (!window.matchMedia('(max-width: 700px)').matches) return;

  dlg.classList.add('is-mobile');

  // --- Build the bottom sheet once ---
  let sheet = dlg.querySelector('.mobile-sheet');
  if (!sheet){
    sheet = document.createElement('div');
    sheet.className = 'mobile-sheet'; // collapsed by default via CSS
    sheet.innerHTML = `
      <div class="ms-handle" aria-label="Drag to expand/collapse"></div>
      <div class="ms-body">
        <h3 class="ms-title" id="msTitle"></h3>
        <div class="ms-tags" id="msTags"></div>
        <pre class="prompt-pre block" id="msPrompt"></pre>
        <div class="ms-actions">
          <button id="msCopy" class="btn btn-primary">Copy Prompt</button>
          <button id="msCopyDims" class="btn">Copy Size</button>
          <button id="msDownload" class="btn">Download image</button>
        </div>
      </div>
    `;
    dlg.appendChild(sheet);
  }

  // --- Fill content (title, tags, prompt) ---
  const { titleEl, promptEl, copyBtn, copyDimsBtn, downloadImgBtn, setHero } = deps;

  const msTitle = sheet.querySelector('#msTitle');
  const msTags  = sheet.querySelector('#msTags');
  const msPrompt= sheet.querySelector('#msPrompt');

  msTitle.textContent = titleEl?.textContent || (p.title || '');
  msTags.innerHTML = '';
  (p.tags || []).forEach(t=>{
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = t;
    chip.onclick = () => {
      if(!state.sel.has(t)){
        state.sel.add(t);
        $$('#tagChips .chip').forEach(c=>{ if(c.textContent===t) c.classList.add('active'); });
        applyFilters();
      }
    };
    msTags.appendChild(chip);
  });
  msPrompt.textContent = promptEl?.textContent || '';

  // Reuse existing actions
  sheet.querySelector('#msCopy').onclick     = ()=> copyBtn?.click();
  sheet.querySelector('#msCopyDims').onclick = ()=> copyDimsBtn?.click();
  sheet.querySelector('#msDownload').onclick = ()=> downloadImgBtn?.click();

  // --- Measure: reserve space for thumbs + sheet peek so hero fills the rest ---
  const root   = document.documentElement;
  const handle = sheet.querySelector('.ms-handle');
  const thumbs = dlg.querySelector('#modalThumbs');

  const setVars = () => {
    const peek   = Math.max(44, (handle?.offsetHeight || 0)); // visible collapsed height
    const thumbH = Math.max(96, (thumbs?.offsetHeight || 0)); // total thumbnail bar height
    root.style.setProperty('--sheetPeek', `${peek}px`);
    root.style.setProperty('--thumbH',    `${thumbH}px`);
  };

  // Let layout paint, then measure
  requestAnimationFrame(setVars);
  const _onResize = ()=> requestAnimationFrame(setVars);
  window.addEventListener('resize', _onResize, { passive:true });

  // --- Drag to expand/collapse (pixel-based, no percent drift) ---
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
  const curY = () => {
    const m = (sheet.style.transform || '').match(/translateY\(([-\d.]+)px\)/);
    return m ? parseFloat(m[1]) : (sheet.classList.contains('expanded') ? 0 : collapsedY());
  };
  const collapsedY = () => {
    const h = sheet.getBoundingClientRect().height;
    const peekPx = parseFloat(getComputedStyle(root).getPropertyValue('--sheetPeek')) || 54;
    return Math.max(0, h - peekPx);
  };

  let dragging=false, startY=0, baseY=0;

  const pointerY = (e)=> (e.touches?.[0]?.clientY ?? e.clientY ?? 0);

  const onDown = (e)=>{
    dragging = true;
    startY = pointerY(e);
    baseY  = sheet.classList.contains('expanded') ? 0 : collapsedY();
    sheet.style.willChange = 'transform';
    sheet.style.transition  = 'none';
    sheet.setPointerCapture?.(e.pointerId || 0);
  };

  const onMove = (e)=>{
    if(!dragging) return;
    const dy = pointerY(e) - startY;
    const y  = clamp(baseY + dy, 0, collapsedY());
    sheet.style.transform = `translateY(${Math.round(y)}px)`;
    // prevent the page from scrolling while horizontal movement is small
    if (e.cancelable) e.preventDefault();
  };

  const onUp = ()=>{
    if(!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    const y = curY();
    const expand = y < collapsedY()/2;
    sheet.classList.toggle('expanded', expand);
    // clear inline transform so CSS class controls it
    sheet.style.transform = '';
    sheet.style.willChange = '';
  };

  const handleEl = handle; // alias
  handleEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  // Touch fallbacks
  handleEl.addEventListener('touchstart', onDown, {passive:true});
  window.addEventListener('touchmove', onMove, {passive:false});
  window.addEventListener('touchend', onUp);

  // Tap to toggle
  handleEl.addEventListener('click', ()=>{
    const expand = !sheet.classList.contains('expanded');
    sheet.classList.toggle('expanded', expand);
    sheet.style.transform = '';
  });

  // Clean up listeners when the dialog closes
  const cleanup = ()=>{
    window.removeEventListener('resize', _onResize);
    handleEl.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    handleEl.removeEventListener('touchstart', onDown);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    handleEl.removeEventListener('click', ()=>{});
  };
  dlg.addEventListener('close', cleanup, { once:true });

  // --- Swipe left/right on hero to navigate images ---
  const hero = dlg.querySelector('#modalImg');
  let sx=0, sy=0, swiping=false;

  const onSwipeStart = (e)=>{
    const t = e.touches?.[0] || e;
    sx = t.clientX; sy = t.clientY;
    swiping = true;
  };
  const onSwipeMove = (e)=>{
    if(!swiping) return;
    const t = e.touches?.[0] || e;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && e.cancelable) e.preventDefault(); // horizontal intent
  };
  const onSwipeEnd = (e)=>{
    if(!swiping) return; swiping=false;
    const t = e.changedTouches?.[0] || e;
    const dx = t.clientX - sx;
    if(Math.abs(dx) > 60 && _modalState.urls.length > 1){
      const next = dx < 0
        ? (_modalState.index + 1) % _modalState.urls.length
        : (_modalState.index - 1 + _modalState.urls.length) % _modalState.urls.length;
      setHero(next);
    }
  };

  hero.addEventListener('touchstart', onSwipeStart, {passive:true});
  hero.addEventListener('touchmove',  onSwipeMove,  {passive:false});
  hero.addEventListener('touchend',   onSwipeEnd);
}
