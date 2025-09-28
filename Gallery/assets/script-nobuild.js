/* ========== tiny helpers ========== */
const $ = s => document.querySelector(s);
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

/* ======== NEW: library overlay wiring ======== */
const overlay = $('#libraryOverlay');
const dropZone = $('#dropZone');
const dirInput = $('#dirInput');
const zipInput = $('#zipInput');
const libMsg = $('#libMsg');

function showOverlay(){
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden','false');
}
function hideOverlay(){
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden','true');
  libMsg.textContent='';
}

$('#openRW')?.addEventListener('click', (e)=>{
  e.preventDefault();
  showOverlay();
});

$('#libClose')?.addEventListener('click', hideOverlay);

/* Big square actions */
dropZone?.addEventListener('click', openBestPicker);
dropZone?.addEventListener('keydown', (e)=>{
  if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openBestPicker(); }
});
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
$('#searchBox').addEventListener('input', e=>{ state.q = e.target.value; triggerSearch(); });
$$('input[name="mode"]').forEach(r=> r.addEventListener('change', e=>{ state.mode = e.target.value; applyFilters(); }));
$('#clearFilters').onclick = ()=>{ state.sel.clear(); state.q=''; $('#searchBox').value=''; setOnlyFavs(false); $$('#tagChips .chip').forEach(c=>c.classList.remove('active')); applyFilters(); };
const topFavBtn = $('#toggleFavs'); topFavBtn?.addEventListener('click', ()=> setOnlyFavs(!state.onlyFavs));
$('#openGallery').addEventListener('click', openGallery);

/* quick keys */
window.addEventListener('keydown', (e)=>{
  if(e.key === '/' && document.activeElement.tagName !== 'INPUT' && !document.querySelector('dialog[open]')){ e.preventDefault(); $('#searchBox').focus(); }
  if(e.key === 'Escape' && document.activeElement.id === 'searchBox'){ $('#searchBox').blur(); }
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

/* ========== RW loader (unchanged) ========== */
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

/* ======= NEW: Read-only folder & ZIP fallbacks (mobile-friendly) ======= */
async function handleDirPickReadOnly(e){
  const files = Array.from(e.target.files || []);
  if(!files.length) return;
  await buildFromLooseFiles(files);
}
async function handleZipFile(file){
  if(!window.JSZip){ alert('JSZip not available'); return; }
  try{
    libMsg.textContent = 'Reading ZIP…';
    const zip = await JSZip.loadAsync(file);
    const groups = new Map(); // key: 'prompts/<folder>'
    const fileEntries = Object.values(zip.files).filter(zf => !zf.dir);

    for (const zf of fileEntries){
      const rel = zf.name.replace(/^[\/]+/, '');
      const parts = rel.split('/');
      if (parts.length < 1) continue;

      let folderKey;
      const pIdx = parts.indexOf('prompts');
      if (pIdx >= 0){
        if (parts.length < pIdx+2) continue;
        folderKey = parts.slice(0, pIdx+2).join('/'); // prompts/<folder>
      } else {
        if (parts.length < 2) continue;
        folderKey = `prompts/${parts[0]}`;
      }

      const bucket = groups.get(folderKey) || { folder: folderKey, promptFile:null, tagsFile:null, previews:[] };
      const leaf = (parts.at(-1)||'').toLowerCase();

      if(leaf==='prompt.txt'){
        const blob = await zf.async('blob');
        bucket.promptFile = new File([blob], 'prompt.txt', { type:'text/plain' });
      }else if(leaf==='tags.json'){
        const blob = await zf.async('blob');
        bucket.tagsFile = new File([blob], 'tags.json', { type:'application/json' });
      }else if(/\.(jpg|jpeg|png|webp|avif)$/i.test(leaf)){
        const blob = await zf.async('blob');
        const mime = guessMimeFromName(leaf);
        const name = parts.at(-1);
        bucket.previews.push(new File([blob], name, { type:mime }));
      }
      groups.set(folderKey, bucket);
    }

    const all = [];
    const tagSet = new Set();

    for (const [folder, g] of groups){
      if(!g.tagsFile) continue;
      const meta = await readJSONFile(g.tagsFile).catch(()=>null);
      if(!meta) continue;

      const id = folder.replace(/\s+/g,'-').toLowerCase();
      const title = meta.title || folder.split('/').at(-1);
      const tags = Array.isArray(meta.tags) ? meta.tags : [];
      tags.forEach(t=> tagSet.add(t));
      g.previews.sort((a,b)=> a.name.localeCompare(b.name));
      const favorite = loadLocalFavorite(id);
      all.push({ id, title, tags, folder, files:{ prompt:g.promptFile||null, tags:g.tagsFile, previews:g.previews }, favorite });
    }

    if(!all.length){ libMsg.textContent = 'No prompts found in ZIP. Ensure /prompts/<folder>/tags.json exists.'; return; }
    finalizeLibrary(all, tagSet);
    hideOverlay();
  }catch(err){
    console.error('ZIP load failed', err);
    libMsg.textContent = 'Could not read ZIP. Make sure it contains /prompts with tags.json files.';
  }finally{
    // reset for re-pick of same file
    if (zipInput) zipInput.value = '';
  }
}

async function buildFromLooseFiles(files){
  libMsg.textContent = 'Indexing files…';

  const groups = new Map(); // key: "prompts/<folder>"

  for (const f of files){
    const rel = (f.webkitRelativePath || f.name).replace(/^[\/]*/, '');
    const parts = rel.split('/');
    if (parts.length < 1) continue;

    let folderKey;
    const pIdx = parts.indexOf('prompts');

    if (pIdx >= 0) {
      if (parts.length < pIdx + 2) continue;          // need prompts/<folder>/...
      folderKey = parts.slice(0, pIdx + 2).join('/'); // prompts/<folder>
    } else {
      if (parts.length < 2) continue;                 // need <folder>/...
      folderKey = `prompts/${parts[0]}`;              // prompts/<folder>
    }

    const bucket = groups.get(folderKey) || { folder: folderKey, promptFile:null, tagsFile:null, previews:[] };
    const leaf = (parts.at(-1) || '').toLowerCase();

    if (leaf === 'prompt.txt') bucket.promptFile = f;
    else if (leaf === 'tags.json') bucket.tagsFile = f;
    else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(leaf)) bucket.previews.push(f);

    groups.set(folderKey, bucket);
  }

  const all = [];
  const tagSet = new Set();

  for (const [folder, g] of groups){
    if (!g.tagsFile) continue;
    const meta = await readJSONFile(g.tagsFile).catch(()=>null);
    if (!meta) continue;

    const id = folder.replace(/\s+/g,'-').toLowerCase();
    const title = meta.title || folder.split('/').at(-1);
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    tags.forEach(t=> tagSet.add(t));
    g.previews.sort((a,b)=> a.name.localeCompare(b.name));

    const favorite = loadLocalFavorite(id);
    all.push({
      id, title, tags, folder,
      files: { prompt: g.promptFile || null, tags: g.tagsFile, previews: g.previews },
      favorite
    });
  }

  if (!all.length){
    libMsg.textContent = 'No prompts detected. Select your /prompts (with tags.json).';
    return;
  }

  finalizeLibrary(all, tagSet);
  hideOverlay();
}

/* helpers for RO paths */
async function readJSONFile(file){ const txt = await file.text(); return JSON.parse(txt); }
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
  state.rw=false; // RO unless RW path set it true
  state.all=all; state.tags=Array.from(tagSet).sort((a,b)=>a.localeCompare(b));
  renderTags(); ensureFavSwitch();
  preloadSnippets(all).then(()=> applyFilters());
  applyFilters();
}
async function preloadSnippets(list){
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
  const wrap=$('#tagChips'); wrap.innerHTML='';
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
  if(state.onlyFavs){ list=list.filter(p=> p.favorite); }

  state._lastRenderedItems=list;
  renderGrid(list); equalizeCardHeights();
}

function renderGrid(items){
  const grid=$('#grid'), stats=$('#stats'), empty=$('#empty');
  grid.innerHTML=''; stats.textContent=`${items.length} prompt${items.length!==1?'s':''}`;
  empty.style.display = items.length ? 'none' : 'block';

  items.forEach(p=>{
    const card=document.createElement('article'); card.className='card';

    const tw=document.createElement('div'); tw.className='thumb-wrap skel';
    const img=document.createElement('img'); img.className='thumb'; img.loading='lazy'; img.decoding='async';
    const badge=document.createElement('span'); badge.className='badge'; badge.textContent=(p.tags||[]).includes('nsfw')?'NSFW':'SFW';

    const fav=document.createElement('button'); fav.className='fav-btn'; fav.textContent=p.favorite?'★':'☆'; if(p.favorite) fav.classList.add('active');
    fav.title=p.favorite?'Unfavorite':'Favorite';
    fav.onclick=(ev)=>{ ev.stopPropagation(); toggleFavorite(p,fav).catch(console.error); };

    const count = document.createElement('span');
    const n = p.files?.previews?.length || 0;
    if (n > 0) { count.className='count-badge'; count.textContent=`🖼 ${n}`; count.title=`${n} image${n!==1?'s':''}`; }

    if(p.files.previews.length){
      loadObjectURL(p.files.previews[0]).then(url=>{
        img.src=url; img.addEventListener('load', ()=> tw.classList.remove('skel'), { once:true });
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

    viewBtn.onclick = ()=> openModal(p);
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
  if('getFile' in handleOrFile){ const f=await handleOrFile.getFile(); return URL.createObjectURL(f); }
  return URL.createObjectURL(handleOrFile);
}
async function loadPromptText(p){
  if(p.files.prompt){
    if('getFile' in p.files.prompt){ const f=await p.files.prompt.getFile(); return f.text(); }
    return p.files.prompt.text();
  }
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

/* ===== Modal / Compare / Scrubber (unchanged) ===== */
let _modalState = { previews:[], index:0, urls:[] };

async function openModal(p){
  const dlg=$('#promptModal');
  const title=$('#modalTitle');
  const tagWrap=$('#modalTags');
  const pre=$('#modalPrompt');
  const hero=$('#modalImg');
  const thumbsRow=$('#modalThumbs');
  const thumbScrub=$('#thumbScrub');
  const copyBtn=$('#copyPrompt');
  const resEl=$('#imgRes');
  const fmtEl=$('#imgFmt');
  const copyDimsBtn=$('#copyDims');

  lockScroll();

  state._compareSel.clear(); renderCompareSelection();

  title.textContent=p.title;
  tagWrap.innerHTML='';
  (p.tags||[]).forEach(t=>{
    const b=document.createElement('span'); b.className='chip'; b.textContent=t; b.title='Filter by tag';
    b.onclick=()=>{ if(!state.sel.has(t)){ state.sel.add(t); $$('#tagChips .chip').forEach(c=>{ if(c.textContent===t) c.classList.add('active'); }); applyFilters(); } };
    tagWrap.appendChild(b);
  });

  const txt=await loadPromptText(p); pre.textContent=(await txt).trim();

  thumbsRow.innerHTML='';
  _modalState={ previews:p.files.previews, index:0, urls:[] };

  if(p.files.previews.length){
    const firstURL=await loadObjectURL(p.files.previews[0]); hero.src=firstURL; _modalState.urls.push(firstURL);
    await updateImgMeta(0);
    p.files.previews.forEach(async (h,i)=>{
      const u=i===0?firstURL:await loadObjectURL(h); if(i!==0) _modalState.urls.push(u);
      const im=document.createElement('img'); im.src=u; if(i===0) im.classList.add('active');
      im.onclick=(ev)=>{ if(ev.shiftKey){ toggleCompareSelect(i, im); } else { setHero(i); } };
      im.addEventListener('contextmenu', e=>{ e.preventDefault(); toggleCompareSelect(i, im); });
      thumbsRow.appendChild(im);
    });
  } else { hero.removeAttribute('src'); hero.alt='No preview'; resEl.textContent='— × —'; fmtEl.textContent='—'; }

  function setHero(i){
    _modalState.index=i; hero.src=_modalState.urls[i];
    $$('#modalThumbs img').forEach((n,idx)=> n.classList.toggle('active', idx===i));
    ensureThumbVisible(i);
    updateImgMeta(i);
  }

  async function updateImgMeta(i){
    const handle = _modalState.previews[i];
    let format = '—';
    try{
      if(handle){
        const file = 'getFile' in handle ? await handle.getFile() : handle;
        if(file && file.type) format = file.type.split('/').pop().toUpperCase();
        else {
          const nm = (file?.name || handle?.name || '').toLowerCase();
          const m = nm.match(/\.(\w+)$/); if(m) format = m[1].toUpperCase();
        }
      }
    }catch{}
    fmtEl.textContent = format;

    if(!hero.complete){
      await new Promise(r=> hero.addEventListener('load', r, { once:true }));
    }
    const w = hero.naturalWidth || 0, h = hero.naturalHeight || 0;
    resEl.textContent = `${w} × ${h}`;

    copyDimsBtn.onclick = async ()=>{ try{ await navigator.clipboard.writeText(`${w}x${h}`); copyDimsBtn.textContent='✓'; setTimeout(()=> copyDimsBtn.textContent='Copy', 700); }catch{} };
  }

  function ensureThumbVisible(i){
    const el = thumbsRow?.children?.[i];
    if(!el) return;
    const pad = 24;
    const left = el.offsetLeft - pad;
    const right = el.offsetLeft + el.offsetWidth + pad;
    const curLeft = thumbsRow.scrollLeft;
    const curRight = curLeft + thumbsRow.clientWidth;
    if(left < curLeft) thumbsRow.scrollTo({ left, behavior:'smooth' });
    else if(right > curRight) thumbsRow.scrollTo({ left: right - thumbsRow.clientWidth, behavior:'smooth' });
  }

  function updateThumbScrubMax(){
    const maxScroll = Math.max(0, thumbsRow.scrollWidth - thumbsRow.clientWidth);
    thumbScrub.dataset.maxScroll = String(maxScroll);
    const pct = maxScroll ? (thumbsRow.scrollLeft / maxScroll) * 100 : 0;
    thumbScrub.value = String(pct);
    thumbScrub.style.display = maxScroll > 0 ? '' : 'none';
  }
  thumbScrub.oninput = ()=>{
    const maxScroll = Number(thumbScrub.dataset.maxScroll || 0);
    const pct = Number(thumbScrub.value) / 100;
    thumbsRow.scrollLeft = Math.round(maxScroll * pct);
  };
  let _scrubSync = null;
  thumbsRow.addEventListener('scroll', ()=>{
    if(_scrubSync) cancelAnimationFrame(_scrubSync);
    _scrubSync = requestAnimationFrame(()=>{
      const maxScroll = Number(thumbScrub.dataset.maxScroll || 0);
      const pct = maxScroll ? (thumbsRow.scrollLeft / maxScroll) * 100 : 0;
      thumbScrub.value = String(pct);
    });
  });
  new ResizeObserver(updateThumbScrubMax).observe(thumbsRow);
  setTimeout(updateThumbScrubMax, 0);

  $('#closeModal').onclick = ()=>{ dlg.close(); };
  copyBtn.onclick = async ()=>{ await navigator.clipboard.writeText(pre.textContent); toastCopied(copyBtn); };

  dlg.addEventListener('cancel', (e)=>{ e.preventDefault(); dlg.close(); }, { once:true });
  dlg.addEventListener('close', ()=>{ unlockScroll(); _modalState.urls.forEach(u=> URL.revokeObjectURL(u)); _modalState={previews:[],index:0,urls:[]}; closeCompare(true); }, { once:true });

  dlg.onkeydown=(e)=>{ if(_modalState.urls.length<=1) return;
    if(e.key==='ArrowRight'){ e.preventDefault(); setHero((_modalState.index+1)%_modalState.urls.length); }
    if(e.key==='ArrowLeft'){ e.preventDefault(); setHero((_modalState.index-1+_modalState.urls.length)%_modalState.urls.length); }
    if(e.key.toLowerCase()==='c' && state._compareSel.size===2){ e.preventDefault(); openCompare(); }
    if(e.key==='Escape' && !$('#compareOverlay').classList.contains('hidden')){ e.preventDefault(); closeCompare(); }
  };

  dlg.showModal();

  function toggleCompareSelect(i, imgEl){
    if(state._compareSel.has(i)) state._compareSel.delete(i);
    else {
      if(state._compareSel.size>=2){ const last=[...state._compareSel].pop(); state._compareSel=new Set([last]); }
      state._compareSel.add(i);
    }
    renderCompareSelection();
    if(state._compareSel.size===2) openCompare();
  }
  function renderCompareSelection(){
    $$('#modalThumbs img').forEach((n,idx)=>{
      const selected = state._compareSel.has(idx);
      n.style.outline = selected ? '2px solid #6aa0ff' : '';
      n.style.outlineOffset = selected ? '1px' : '';
    });
  }
}

/* compare overlay */
function openCompare(){
  const ov=$('#compareOverlay'); if(!ov) return;
  const [a,b]=[...state._compareSel].sort((x,y)=>x-y);
  const imgA=$('#cmpA'), imgB=$('#cmpB'), range=$('#cmpRange');
  imgA.src=_modalState.urls[a]; imgB.src=_modalState.urls[b];
  range.value=50; ov.style.setProperty('--split','50%');
  range.oninput=()=> ov.style.setProperty('--split', `${range.value}%`);
  $('#compareClose').onclick=()=> closeCompare();
  ov.setAttribute('tabindex','-1'); ov.classList.remove('hidden'); ov.setAttribute('aria-hidden','false'); ov.focus({ preventScroll:true });
}
function closeCompare(skipFocus){
  const ov=$('#compareOverlay'); if(!ov) return;
  $('#cmpRange').oninput=null; $('#compareClose').onclick=null;
  ov.classList.add('hidden'); ov.setAttribute('aria-hidden','true');
  if(document.activeElement===ov) ov.blur();
  if(!skipFocus) $('#promptModal')?.focus({ preventScroll:true });
}

/* scroll lock */
function lockScroll(){ document.body.classList.add('no-scroll'); document.documentElement.style.overflow='hidden'; document.body.style.overflow='hidden'; }
function unlockScroll(){ document.body.classList.remove('no-scroll'); document.documentElement.style.overflow=''; document.body.style.overflow=''; }

/* favorites */
function favKey(id){ return `pv:fav:${id}`; }
function saveLocalFavorite(id,val){ try{ if(val) localStorage.setItem(favKey(id),'1'); else localStorage.removeItem(favKey(id)); }catch{} }
async function toggleFavorite(p, starBtn){
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

/* ===== Gallery + ZIP export (unchanged) ===== */
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