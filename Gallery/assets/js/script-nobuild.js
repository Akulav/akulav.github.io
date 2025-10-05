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


// ===== NSFW helpers =====


function refreshDetailTags(p){
  const chipWrap = $('#detailTags');
  if (!chipWrap) return;
  chipWrap.innerHTML = '';
  (p.tags || []).forEach(t => {
    const span = document.createElement('span');
    span.className = 'chip';
    span.textContent = t;
    span.title = 'Filter by tag';
    span.onclick = () => { if (!state.sel.has(t)) { state.sel.add(t); $$('#tagChips .chip').forEach(c => { if(c.textContent === t) c.classList.add('active'); }); applyFilters(); } };
    chipWrap.appendChild(span);
  });
}

function refreshCardBadge(p){
  const card = $(`.card [data-id="${p.id}"]`)?.closest('.card');
  if (!card) return;
  const badge = card.querySelector('.badge');
  if (!badge) return;
  // Use tags (after override) to drive label
  badge.textContent = (p.tags || []).includes('nsfw') ? 'NSFW' : 'SFW';
}

function renderRatingControl(p){
  const wrap = document.createElement('div');
  wrap.className = 'rating-ctrl';
  wrap.innerHTML = `
    <div class="rating-label">Content rating</div>
    <div class="rating-seg">
      <button data-set="sfw">SFW</button>
      <button data-set="auto">Auto</button>
      <button data-set="nsfw">NSFW</button>
    </div>
  `;

  const btns = wrap.querySelectorAll('button');
  const markActive = () => {
    btns.forEach(b => b.classList.toggle('active', b.dataset.set === (p.nsfw || 'auto')));
  };
  markActive();

  btns.forEach(b=>{
    b.addEventListener('click', async () => {
      const val = b.dataset.set; // 'sfw'|'auto'|'nsfw'
      p.nsfw = val;
      // apply to tags in-memory
      applyNsfwOverride(p);
      // persist if RW
      try { await saveNsfwOverride(p); } catch {}

      // refresh visible chips/badges in detail & in card grid if needed
      try { refreshDetailTags(p); } catch {}
      try { refreshCardBadge(p); } catch {}
      markActive();
    });
  });

  return wrap;
}


function readNsfwFlagFromMeta(meta){
  // support either boolean "nsfw" or string "rating"
  if (!meta) return 'auto';
  if (typeof meta.nsfw === 'boolean') return meta.nsfw ? 'nsfw' : 'sfw';
  if (typeof meta.rating === 'string') {
    const r = meta.rating.toLowerCase();
    if (r === 'nsfw') return 'nsfw';
    if (r === 'sfw')  return 'sfw';
  }
  return 'auto';
}

function applyNsfwOverride(p){
  // Ensure visual/tag consistency based on p.nsfw override
  if (!p.tags) p.tags = [];
  const has = p.tags.includes('nsfw');

  if (p.nsfw === 'nsfw' && !has) {
    p.tags = ['nsfw', ...p.tags];
  } else if (p.nsfw === 'sfw' && has) {
    p.tags = p.tags.filter(t => t !== 'nsfw');
  }
  // 'auto' does nothing; Tagger-derived 'nsfw' remains as-is
}

function effectiveNSFW(p){
  if (p.nsfw === 'nsfw') return true;
  if (p.nsfw === 'sfw')  return false;
  return p.tags?.includes('nsfw');
}

// Write the override (RW only). Keeps existing title, writes tags + nsfw.
async function saveNsfwOverride(p){
  if (!state.rw || !p?.dirHandle) return;
  let title = p.title || 'Untitled';
  try {
    const fh = await p.dirHandle.getFileHandle('tags.json', { create:false }).catch(()=>null);
    if (fh) {
      const f = await fh.getFile();
      const j = JSON.parse(await f.text());
      if (j?.title) title = j.title;
    }
  } catch {}
  const nsfw = (p.nsfw === 'nsfw') ? true : (p.nsfw === 'sfw') ? false : undefined;
  const payload = (nsfw === undefined) ? { title, tags: p.tags } : { title, tags: p.tags, nsfw };
  await writeTagsJSON(p, payload);
}

/* ============================
   AUTO-TAGGING ENGINE (no deps)
   ============================ */

const Tagger = (() => {
  // 0) Canonical maps & stopwords  -----------------------------------------
  // keep this list tame—focused on SD-style prompts (you can extend later)
  const STOP = new Set([
    'masterpiece','best','quality','ultra-detailed','ultradetailed','highres','high-res','hires',
    'full','body','uncropped','centered','composition','solo','1girl','girl','female','woman',
    'detailed','realistic','cinematic','shading','lighting','light','soft','warm','glow','cozy',
    'atmosphere','background','intimate','bedroom','sheets','silky','detailed','with','and','or',
    'either','showing','naturally','options','option','either','the','a','an','in','on','at','of',
    'to','for','by','from','over','under','front','back','low','high','very','more','less','no','hand',
    'neck','half','out','other','wrist','while','visibly','visible','looking','looking at viewer','looking at camera',
    'pretending','head','herself','her','surface','view','viewer','camera','slight','slightly','own','forward','body','both',
    'down','cheek','long','look','link','but','support','onto','only','one','through','optional','other',
    'above','below','near','upper','edge','frame','focus','scene','setting',
    'open','off','together','between','still','clearly','completely','poking','them','tea','wrist','up','turn','tugging',
    'tight','toned','stare','side'
  ]);

  // simple NSFW lexical bucket (expand as you wish)
  const NSFW_HARD = [
    'pussy','vagina','clitoris','labia','areola','nipples','boobs','breast','penis','cum','semen','cock','vulva'
  ];
  const NSFW_SOFT = [
    'nude','naked','nsfw','lewd','panties','wet','saliva','fluids','underboob','underwear','lingerie',
    'spread','spread_pussy','pussy_spread','panties_pulled_aside'
  ];

  // === Canonicalization & Lemmatization ===
  // Equivalence groups: all 'forms' collapse into 'canon'
  const EQUIV = [
    // adverb/adjective → base
    { canon:'playful',        forms:['playfully'] },

    // wetness family
    { canon:'wet',            forms:['wetly','wetness','drenched','soaked','soaking','dripping','drippin','puddling','puddle','drenching'] },

    // shiny family
    { canon:'shiny',          forms:['shine','shining','glistening','glossy','sheen'] },

    // smile / kiss / peek
    { canon:'smile',          forms:['smiling','smiled'] },
    { canon:'kiss',           forms:['kissing','kissed'] },
    { canon:'peeking',        forms:['peek','peeks','peeked'] },

    // orgasm / masturbation families
    { canon:'orgasm',         forms:['orgasmic'] },
    { canon:'masturbation',   forms:['masturbating','masturbate','self_pleasure','self-stimulation'] },

    // press / squeeze / arch / blush / tie
    { canon:'pressing',       forms:['pressed','press'] },
    { canon:'squeezing',      forms:['squeeze','squeezed','grabbing'] },
    { canon:'arching',        forms:['arched','arch'] },
    { canon:'blushing',       forms:['blush','blushed'] },
    { canon:'tied',           forms:['tie','tying'] },
    { canon:'straddling',     forms:['straddle','straddling'] },

    // posture
    { canon:'standing',       forms:['stand','stood'] },
    { canon:'sitting',        forms:['sit','sat'] },
    { canon:'lying',          forms:['laying','lie','lied','lay'] },

    // outfit/clothing
    { canon:'clothes',        forms:['clothing','outfit','clothe'] },

    // sunglasses
    { canon:'sunglasses',     forms:['sunglass'] },

    // light variants
    { canon:'spotlight',      forms:['spot-light'] },
    { canon:'sunlight',       forms:['sun light','sun-light'] },

    // plurals you want singular
    { canon:'lesbian',        forms:['lesbians'] },
    { canon:'sofa',           forms:['sofas'] },
    { canon:'desk',           forms:['desks'] },
    { canon:'kitchen',        forms:['kitchens'] },
  ];

  // Build lookup map from EQUIV
  const CANON = new Map();
  for (const g of EQUIV) {
    const base = g.canon.toLowerCase();
    CANON.set(base, base);
    for (const f of g.forms) CANON.set(f.toLowerCase(), base);
  }
  // plus some single-word synonyms
  CANON.set('boobs','breasts'); CANON.set('boob','breast');
  CANON.set('tits','breasts');  CANON.set('nipples','nipple');
  CANON.set('pussies','vulva');  // plural directly to canonical
  CANON.set('vagina','vulva');  CANON.set('pussy','vulva');
  CANON.set('ass','butt');      CANON.set('buttocks','butt');
  CANON.set('face','portrait'); CANON.set('hair','hairstyle');
  CANON.set('see_through','see-through'); CANON.set('seethrough','see-through');

  // phrase extractors (regex → emit tags[]) & text cleaner
  // Run these BEFORE tokenization so we keep multi-word concepts.
  const PHRASES = [
    { re: /\b(doggy\s*style)\b/i, tags: ['pose:doggy'], strip:true },
    { re: /\bkneeling on bed\b/i, tags: ['kneeling','bed'], strip:true },
    { re: /\blegs?\s+spread\b/i, tags: ['legs_spread'], strip:true },
    { re: /\bhead turned back\b/i, tags: ['look_back'], strip:true },
    { re: /\bsitting on (?:the )?edge of bed\b/i, tags: ['sitting','bed_edge'], strip:true },
    { re: /\bangle (?:very )?low\b/i, tags: ['cam:low_angle'], strip:true },
    { re: /\blow front perspective\b/i, tags: ['cam:low_front'], strip:true },
    { re: /\bcentered composition\b/i, tags: ['framing:centered'], strip:true },
    { re: /\bsoft warm (?:bedroom )?lighting\b/i, tags: ['light:soft_warm'], strip:true },
    { re: /\bwarm sunset glow\b/i, tags: ['light:sunset_glow'], strip:true },
    { re: /\bflushed(?: cheeks)?\b/i, tags: ['face:flushed'], strip:true },
    { re: /\b(inviting|seductive) expression\b/i, tags: ['exp:seductive'], strip:true },
    { re: /\bpony(?:\s|-)?tail\b/i, tags: ['hair:ponytail'], strip:true },
    { re: /\bcolored hair\b/i, tags: ['hair:colored'], strip:true },
    { re: /\b(earrings?)\b/i, tags: ['accessory:earrings'], strip:true },
    { re: /\bleg warmers?\b/i, tags: ['accessory:leg_warmers'], strip:true },
    { re: /\bcrop top\b/i, tags: ['clothes:crop_top'], strip:true },
    { re: /\bloose slipping t-?shirt\b/i, tags: ['clothes:loose_tshirt'], strip:true },
    { re: /\bpanties pulled aside\b/i, tags: ['panties_pulled_aside'], strip:true },
    { re: /\bwet panties\b/i, tags: ['panties_wet'], strip:true },
    { re: /\bspread pussy\b/i, tags: ['pussy_spread'], strip:true },
    { re: /\bsqueez(?:ing|e) (?:her )?own boob\b/i, tags: ['hands:on_breast'], strip:true },
    { re: /\b(fingering)\b/i, tags: ['fingering'], strip:true },
    { re: /\bpressing down on (?:her )?own ass(?: cheek)?\b/i, tags: ['hands:on_butt'], strip:true },
    { re: /\bbreasts (?:either )?pressed against bed\b/i, tags: ['breasts:pressed'], strip:true },
    { re: /\bbreasts? hanging naturally\b/i, tags: ['breasts:hanging'], strip:true },
    { re: /\bass raised high\b/i, tags: ['butt:raised'], strip:true },
    { re: /\bbed(?:room)?\b/i, tags: ['scene:bedroom'], strip:false }, // keep the word too
  ];

  // light morphological reducer for common English endings
// 1) No plural logic here; only adverbs/nominalizers and verb endings.
function reduceVariant(tok) {
  let t = tok;

  // adverbs / nominalizers
  if (t.endsWith('ly')   && t.length > 4) t = t.slice(0, -2);   // playfully → playful
  if (t.endsWith('ness') && t.length > 6) t = t.slice(0, -4);   // wetness  → wet

  // -ing → base (restore silent 'e' for outline/outlining, etc.)
  if (t.endsWith('ing') && t.length > 5) {
    const stem = t.slice(0, -3);
    if (/[^aeiou]lin$/.test(stem)) t = stem + 'e';  // outlin → outline
    else                           t = stem;
  }

  // -ed → base (restore silent 'e' for outlined → outline)
  if (t.endsWith('ed') && t.length > 4) {
    const stem = t.slice(0, -2);
    if (/[^aeiou]lin$/.test(stem)) t = stem + 'e';
    else                           t = stem;
  }

  return t;
}

// 2) Proper plural → singular logic lives here.
function singularize(tok){
  let t = tok;

  // panties → panty, bodies → body, etc.
  if (t.endsWith('ies') && t.length > 4) return t.slice(0, -3) + 'y';

  // -sses / -zzes (e.g., kisses handled below; classes → class via -es rule)
  if (t.endsWith('sses') || t.endsWith('zzes')) return t.slice(0, -2);

  // -es after sibilants/zh/x/ch/sh/z (boxes → box, kisses → kiss, bushes → bush)
  if (t.endsWith('es') && t.length > 4) {
    const root = t.slice(0, -2);
    if (/(s|x|z|ch|sh)$/.test(root)) return root;
    // otherwise fall through to the general -s rule below
  }

  // General final -s (but not -ss)
  if (t.endsWith('s') && t.length > 3 && !t.endsWith('ss')) t = t.slice(0, -1);

  // final safety: sometimes upstream steps can yield "panti"
  if (t === 'panti') t = 'panty';

  return t;
}


  // simple plural → singular trim (only for common anatomy/etc)
  function singularize(tok){
    if (tok.endsWith('ies')) return tok.slice(0,-3)+'y';
    if (tok.endsWith('sses')||tok.endsWith('zzes')) return tok.slice(0,-2);
    if (tok.endsWith('s') && tok.length > 3 && !tok.endsWith('ss')) return tok.slice(0,-1);
    return tok;
  }

  // utility helpers ---------------------------------------------------------
  function normalize(s){
    // unify separators, flatten option braces, strip weights like `)1.4` or `(tag:1.2)`
    return s
      .replace(/[{}]/g, ', ')
      .replace(/[()]/g, ' ')
      .replace(/:[0-9.]+/g, '')       // (tag:1.2) → tag
      .replace(/[,/|]+/g, ',')        // unify separators
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(s){
    return s
      .toLowerCase()
      .split(/[,\s]+/)
      .map(w=> w.replace(/[^a-z:_-]/g,''))
      .filter(Boolean);
  }

  // final canonicalizer used by Tagger
  function canon(tok){
    let t = tok.toLowerCase();

    // fix a few common typos seen in screenshots
    const typos = {
      invinting:'inviting',
      focu:'focus',
      clothe:'clothes',
      mischievou:'mischievous',
    };
    if (typos[t]) t = typos[t];

    // reduce morphology
    t = reduceVariant(t);

    // map via equivalence groups & synonyms
    if (CANON.has(t)) t = CANON.get(t);

    // extra single-word synonyms not covered in EQUIV
    const quick = {
      boobs:'breasts', boob:'breast', tits:'breasts', nipples:'nipple',
      vagina:'vulva', pussy:'vulva', clit:'clitoris',
      outfit:'clothes', clothing:'clothes'
    };
    if (quick[t]) t = quick[t];

    // final plural → singular normalization
    t = singularize(t);
    return t;
  }

  function scoreToken(tok){
    // lightweight scoring: anatomy/actions/camera > setting > generic
    if (/^(pose:|cam:|hands:|breasts:|butt:|face:|exp:)/.test(tok)) return 5;
    if (/^(light:|scene:|framing:|hair:|accessory:|clothes:)/.test(tok)) return 4;
    if (NSFW_HARD.includes(tok)) return 6;
    if (NSFW_SOFT.includes(tok)) return 4.5;
    if (tok.length <= 2) return 0.5;
    return 2;
  }

  function postProcess(bag){
    // 1) NSFW flag
    const hasHard = NSFW_HARD.some(w => bag.has(w));
    const hasSoft = NSFW_SOFT.some(w => bag.has(w));
    if (hasHard || hasSoft) bag.set('nsfw', (bag.get('nsfw')||0) + (hasHard? 6 : 4));

    // 2) collapse near-duplicates (e.g., panties_wet + wet → keep panties_wet)
    if (bag.has('wet') && bag.has('panties_wet')) bag.delete('wet');

    return bag;
  }

  function bagToSortedArray(bag, limit=24){
    return [...bag.entries()]
      .sort((a,b)=> b[1] - a[1])
      .slice(0, limit)
      .map(([t])=>t);
  }

  // public: extract tags from raw prompt text
  function extract(rawText){
    if (!rawText || typeof rawText !== 'string') return [];
    let text = rawText;

    // 1) phrase pass (emit tags and optionally strip matched text)
    const em = new Set();
    PHRASES.forEach(p=>{
      const m = text.match(p.re);
      if (m) {
        p.tags.forEach(t=> em.add(t));
        if (p.strip) text = text.replace(p.re, ' ');
      }
    });

    // 2) normalize & tokenize
    text = normalize(text);
    const tokens = tokenize(text);

    // 3) build frequency bag
    const bag = new Map();
    for (let tok of tokens){
      if (!tok || STOP.has(tok)) continue;

      // canon & score
      tok = canon(tok);

      // light normalization of common SD tokens
      if (tok === '1girl') tok = 'solo_female';
      if (tok === 'solo') tok = 'solo_female';

      const sc = scoreToken(tok);
      if (sc <= 0) continue;
      bag.set(tok, (bag.get(tok)||0) + sc);
    }

    // 4) merge phrase-emitted tags with higher weight
    em.forEach(t => bag.set(t, (bag.get(t)||0)+6));

    // 5) post process + finalize
    postProcess(bag);
    return bagToSortedArray(bag);
  }

  // bulk helper: mutate prompts list with generated tags
  async function tagPrompts(list, {writeBack=false} = {}){
    const BATCH = 24;
    for (let i = 0; i < list.length; i += BATCH){
      const slice = list.slice(i, i+BATCH);
      await Promise.all(slice.map(async (p)=>{
        try{
          const txt = await loadPromptText(p);
          const tags = extract(txt);
          p.tags = tags;

          // Optional: write back to tags.json (title preserved if available)
          if (writeBack && state.rw && p.dirHandle){
            let title = p.title || 'Untitled';
            try{
              // if there is an existing tags.json, try to keep any other fields
              const fh = await p.dirHandle.getFileHandle('tags.json', { create:false }).catch(()=>null);
              if (fh) {
                const f = await fh.getFile(); const j = JSON.parse(await f.text());
                title = (j && j.title) ? j.title : title;
              }
            }catch{}
            await writeTagsJSON(p, { title, tags });
          }
        }catch(e){
          console.warn('Tagging failed for', p?.id, e);
          p.tags = [];
        }
      }));
      await new Promise(r=> setTimeout(r,0));
    }
  }

  return { extract, tagPrompts };
})();



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
    operations.push({
      type: 'rename',
      handle: currentCover,
      newName: currentCover.name.substring(prefix.length)
    });
  }
  if (!newCoverHandle.name.startsWith(prefix)) {
    operations.push({
      type: 'rename',
      handle: newCoverHandle,
      newName: prefix + newCoverHandle.name
    });
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
    if(masterPrompt) masterPrompt.files.previews = updatedPreviews;
    
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
  if(isMobile) {
      $('#zipInput')?.click();
      return;
  }
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
  const items = [];

  for await (const [entryName, entryHandle] of promptsDir.entries()) {
    if (entryHandle.kind !== 'directory') continue;

    const folder = `prompts/${entryName}`;
    const p = {
      id: folder.replace(/\s+/g, '-').toLowerCase(),
      title: entryName,
      tags: [],
      folder,
      files: { prompt: null, tags: null, previews: [] },
      dirHandle: entryHandle,
      favorite: false,
      rootHandle: state.rootHandle,
      nsfw: 'auto', // 'nsfw' | 'sfw' | 'auto'
    };

    // Walk files inside the prompt folder
    for await (const [childName, child] of entryHandle.entries()) {
      const lower = childName.toLowerCase();
      if (child.kind === 'file') {
        if (lower === 'prompt.txt') {
          p.files.prompt = child;
        } else if (lower === 'tags.json') {
          p.files.tags = child; // we’ll read only {title, nsfw}
        } else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(lower)) {
          p.files.previews.push(child);
        } else if (lower === 'favorites.json') {
          const data = await readJSONHandle(child).catch(() => null);
          if (data?.favorite === true) p.favorite = true;
        }
      }
    }

    // Require prompt.txt to consider it a valid collection
    if (!p.files.prompt) continue;

    // Use tags.json only for title + nsfw flag (ignore old tags)
    if (p.files.tags) {
      const meta = await readJSONHandle(p.files.tags).catch(() => null);
      if (meta?.title) p.title = meta.title;
      p.nsfw = readNsfwFlagFromMeta(meta); // 'nsfw' | 'sfw' | 'auto'
    }

    // Cover-first sort: files starting with '_' come first
    p.files.previews.sort((a, b) => {
      const aIsCover = a.name.startsWith('_');
      const bIsCover = b.name.startsWith('_');
      if (aIsCover && !bIsCover) return -1;
      if (!aIsCover && bIsCover) return 1;
      return a.name.localeCompare(b.name);
    });

    items.push(p);
  }

  // Auto-generate tags from prompt text
  await Tagger.tagPrompts(items, { writeBack: false });

  // Apply manual NSFW/SFW override (adds/removes 'nsfw' tag)
  items.forEach(applyNsfwOverride);

  // Build global tag set
  const tagSet = new Set();
  items.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));

  // Sort by title for grid
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

async function handleZipFile(file) {
  if (!file) return;
  const libMsg = $('#libMsg');

  if (!/\.zip$/i.test(file.name)) {
    libMsg.textContent = 'Please choose a .zip file.';
    return;
  }
  if (!window.JSZip) {
    libMsg.textContent = 'ZIP support not loaded.';
    return;
  }

  try {
    libMsg.textContent = 'Reading ZIP…';
    const ab = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(ab, { createFolders: false });
    const fileEntries = Object.values(zip.files).filter(zf => !zf.dir);

    // Group by prompt folder
    const groups = new Map();
    for (const zf of fileEntries) {
      const rel = (zf.name || '').replace(/^[\/]+/, '');
      const parts = rel.split('/').filter(Boolean);

      let folderKey;
      const pIdx = parts.indexOf('prompts');
      if (pIdx >= 0) {
        if (parts.length < pIdx + 2) continue; // need /prompts/<folder>/...
        folderKey = parts.slice(0, pIdx + 2).join('/');
      } else {
        // accept <folder>/... (fallback)
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
      else if (base === 'tags.json') g.tagsFile = zf;           // title + nsfw only
      else if (base === 'favorites.json') g.favFile = zf;
      else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(base)) g.previews.push(zf);
    }

    // Build items
    const all = [];
    for (const g of groups.values()) {
      if (!g.prompt) continue; // require prompt.txt

      let title = g.folder.split('/').at(-1);
      let nsfwFlag = 'auto';

      if (g.tagsFile) {
        try {
          const meta = JSON.parse(await g.tagsFile.async('string'));
          if (meta?.title) title = meta.title;
          nsfwFlag = readNsfwFlagFromMeta(meta);
        } catch {}
      }

      const id = g.folder.replace(/\s+/g, '-').toLowerCase();

      // favorite from favorites.json (if any), else leave false
      let favorite = false;
      if (g.favFile) {
        try {
          const favObj = JSON.parse(await g.favFile.async('string'));
          favorite = !!favObj?.favorite;
        } catch {}
      } else {
        // ZIP mode usually doesn’t use FavStore; keep false or your memory logic
        favorite = false;
      }

      g.previews.sort((a, b) => a.name.localeCompare(b.name));

      all.push({
        id,
        title,
        tags: [], // will be generated
        folder: g.folder,
        files: { prompt: g.prompt, tags: g.tagsFile, previews: g.previews },
        favorite,
        nsfw: nsfwFlag
      });
    }

    if (!all.length) {
      libMsg.textContent = 'No prompts detected in ZIP.';
      return;
    }

    // Generate tags from prompt
    await Tagger.tagPrompts(all, { writeBack: false });

    // Apply NSFW override
    all.forEach(applyNsfwOverride);

    // Global tag set
    const tagSet = new Set();
    all.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));

    await finalizeLibrary(all, tagSet);
  } catch (err) {
    console.error('ZIP parse failed:', err);
    libMsg.textContent = 'Failed to read ZIP.';
  }
}



async function buildFromLooseFiles(files) {
  const libMsg = $('#libMsg');
  libMsg.textContent = 'Indexing files…';

  // Group by prompt folder
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
    else if (base === 'tags.json') g.tagsFile = f;         // title + nsfw only
    else if (base === 'favorites.json') g.favFile = f;
    else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(base)) g.previews.push(f);
  }

  // Build items
  const all = [];
  for (const [folder, g] of groups.entries()) {
    if (!g.promptFile) continue; // require prompt.txt

    let title = folder.split('/').at(-1);
    let nsfwFlag = 'auto';

    if (g.tagsFile) {
      const meta = await readJSONFile(g.tagsFile).catch(() => null);
      if (meta?.title) title = meta.title;
      nsfwFlag = readNsfwFlagFromMeta(meta);
    }

    const id = folder.replace(/\s+/g, '-').toLowerCase();

    // favorite from favorites.json else false
    let favorite = false;
    if (g.favFile) {
      const favObj = await readJSONFile(g.favFile).catch(() => null);
      favorite = !!favObj?.favorite;
    }

    g.previews.sort((a, b) => a.name.localeCompare(b.name));

    all.push({
      id,
      title,
      tags: [], // generated later
      folder,
      files: { prompt: g.promptFile, tags: g.tagsFile, previews: g.previews },
      favorite,
      nsfw: nsfwFlag
    });
  }

  if (!all.length) {
    libMsg.textContent = 'No prompts detected. Select your /prompts with prompt.txt files.';
    return;
  }

  // Generate tags from prompt
  await Tagger.tagPrompts(all, { writeBack: false });

  // Apply NSFW override
  all.forEach(applyNsfwOverride);

  // Global tag set
  const tagSet = new Set();
  all.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));

  await finalizeLibrary(all, tagSet);
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
  if(!cards.length || window.innerWidth <= 520) {
      cards.forEach(c => c.style.height = 'auto');
      return;
  };
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

  applyNsfwOverride(p);

// mount rating control
const ratingMount = document.getElementById('detailRating');
if (ratingMount) {
  ratingMount.innerHTML = '';
  ratingMount.appendChild(renderRatingControl(p));
}

// make sure the visible chips match (nsfw chip etc.)
refreshDetailTags(p);
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

async function loadObjectURL(handle) {
    if (!handle) return '';
    try {
      if ('getFile' in handle) {
          const file = await handle.getFile();
          return URL.createObjectURL(file);
      }
      if (handle instanceof Blob) {
          return URL.createObjectURL(handle);
      }
      if (typeof handle.async === 'function') { // JSZip object
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
      // Fallback for Blob/File
      if (typeof handle.text === 'function') {
          return handle.text();
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

    // --- ZIP picker wiring (fix) ---
const libZipBtn = document.getElementById('libZip');
const zipInput  = document.getElementById('zipInput');

libZipBtn?.addEventListener('click', () => zipInput?.click());

zipInput?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) handleZipFile(f);
  // clear so picking the same file twice still fires 'change'
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

    $$('input[name="mode"]').forEach(r => r.addEventListener('change', e => { state.mode = e.target.value; applyFilters(); }));
    $('#clearFilters')?.addEventListener('click', () => {
        state.sel.clear();
        state.q = '';
        if(searchBox) searchBox.value = '';
        setOnlyFavs(false);
        $$('#tagChips .chip').forEach(c => c.classList.remove('active'));
        applyFilters();
    });

    $('#toggleFavs')?.addEventListener('click', () => setOnlyFavs(!state.onlyFavs));
    $('#openGallery')?.addEventListener('click', openGallery);
});