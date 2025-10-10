
(function(){
  const { $, $$, state } = PV;
  const { writeTagsJSON } = PV;

  // ---- State ----
  state._variantByPrompt = state._variantByPrompt || {}; // { [id]: 'all'|'normal'|'phone' }

  // ---- Helpers ----
  function ensureMetaInit(p){
    p.meta = p.meta || {};
    p.meta.imageKinds = p.meta.imageKinds || {}; // filename -> 'phone'|'normal'
  }

  async function attachMetaKinds(p){
    try{
      if (p.files?.tags){
        const meta = await PV.readJSONHandle(p.files.tags).catch(()=>null);
        if (meta){
          ensureMetaInit(p);
          p.meta.imageKinds = Object.assign({}, meta.imageKinds || {});
        }
      }
    }catch(e){}
  }

  function currentMode(p){ return state._variantByPrompt[p.id] || 'all'; }

  function filterPreviewsFor(p){
    const mode = currentMode(p);
    ensureMetaInit(p);
    const kinds = p.meta.imageKinds;
    const list = p.files?.previews || [];
    if (mode === 'all') return list;
    return list.filter(h => {
      const tag = (kinds?.[h.name] || 'normal').toLowerCase();
      return (mode === 'phone') ? (tag === 'phone') : (tag === 'normal');
    });
  }

  function addVariantBadgeToCard(card, p){
    try{
      const tw = card.querySelector('.thumb-wrap');
      const first = p.files?.previews?.[0];
      if (!tw || !first) return;

      ensureMetaInit(p);
      let vb = tw.querySelector('.variant-badge');
      const tag = (p.meta.imageKinds?.[first.name] || 'normal').toLowerCase();

      if (!vb){
        vb = document.createElement('span');
        vb.className = 'variant-badge';
        tw.appendChild(vb);
      }
      vb.textContent = tag === 'phone' ? 'Phone' : 'Normal';
      vb.classList.toggle('phone', tag === 'phone');
      vb.classList.toggle('normal', tag !== 'phone');

      arrangeBadges(card, p);
    }catch(e){}
  }

  function arrangeBadges(card, p){
    const tw = card.querySelector('.thumb-wrap'); if (!tw) return;
    let wrap = tw.querySelector('.badges-wrap');
    if (!wrap){
      wrap = document.createElement('div');
      wrap.className = 'badges-wrap';
      tw.appendChild(wrap);
    }
    // move/normalize the existing SFW/NSFW badge
    const raw = tw.querySelector('.badge');
    if (raw){
      const isN = (p.tags||[]).includes('nsfw');
      raw.classList.add(isN ? 'nsfw' : 'sfw');
      raw.style.position = 'static';
      raw.style.left = raw.style.top = '';
      if (raw.parentElement !== wrap) wrap.appendChild(raw);
    }
    // move variant badge
    const vb = tw.querySelector('.variant-badge');
    if (vb && vb.parentElement !== wrap) wrap.appendChild(vb);
  }

  async function tagImagesKind(p, names, kind){
    ensureMetaInit(p);
    names.forEach(n => p.meta.imageKinds[n] = (kind === 'phone' ? 'phone' : 'normal'));
    let meta = {};
    if (p.files?.tags){ meta = await PV.readJSONHandle(p.files.tags).catch(()=>({})) || {}; }
    meta.imageKinds = Object.assign({}, meta.imageKinds || {}, p.meta.imageKinds);
    await writeTagsJSON(p, meta);
  }

  // ---- Detail header filter ----
  function ensureVariantToggle(p){
    const hdr = document.querySelector('#detailView .detail-header');
    if (!hdr || document.getElementById('variantToggle')) return;

    const wrap = document.createElement('div');
    wrap.id = 'variantToggle';

    const keys = ['all','normal','phone'];
    keys.forEach(key => {
      const b = document.createElement('button');
      b.className = 'btn' + ((currentMode(p)===key) ? ' active' : '');
      b.textContent = key === 'all' ? 'All' : (key === 'phone' ? 'Phone' : 'Normal');
      b.onclick = ()=>{
        state._variantByPrompt[p.id] = key;
        $$('#variantToggle .btn').forEach(el=> el.classList.toggle('active', el===b));
        // Force full re-open so previews & hero rebuild correctly
        PV.openDetailView && PV.openDetailView(p);
        // ensure toggles and thumb pills after rebuild
        setTimeout(()=> { ensureVariantToggle(p); decorateThumbToggles(p); }, 0);
      };
      wrap.appendChild(b);
    });

    hdr.appendChild(wrap);
  }

  // ---- Per-thumb toggle pill (RW) ----
  function decorateThumbToggles(p){
    try{
      const dv = window.__pv_detail; if (!dv) return;
      const list = dv.previews || [];
      const rows = document.querySelectorAll('#detailThumbs .thumb-container');
      rows.forEach((wrap, i)=>{
        if (wrap.querySelector('.kind-toggle')) return;
        const h = list[i]; if (!h) return;
        ensureMetaInit(p);
        const tag = (p.meta.imageKinds?.[h.name] || 'normal').toLowerCase();
        if (!state.rw) return; // only show in RW mode
        const btn = document.createElement('button');
        btn.className = 'kind-toggle ' + tag;
        btn.textContent = tag === 'phone' ? 'Phone' : 'Normal';
        btn.title = 'Toggle Normal/Phone';
        btn.onclick = async (e)=>{
          e.stopPropagation();
          const next = (p.meta.imageKinds?.[h.name] === 'phone') ? 'normal' : 'phone';
          await tagImagesKind(p, [h.name], next);
          p.meta.imageKinds[h.name] = next;
          btn.classList.toggle('phone', next==='phone');
          btn.classList.toggle('normal', next!=='phone');
          btn.textContent = next === 'phone' ? 'Phone' : 'Normal';
          // If cover changed kind, refresh card badges
          if (h.name.startsWith('_')){
            const card = document.querySelector(`.card [data-id="${p.id}"]`)?.closest('.card');
            if (card){ addVariantBadgeToCard(card, p); arrangeBadges(card, p); }
          }
        };
        wrap.appendChild(btn);
      });
    }catch(e){}
  }

  // ---- Hooks ----
  const _renderGrid = PV.renderGrid;
  PV.renderGrid = function(items){
    if (!Array.isArray(items)) return;
    _renderGrid && _renderGrid(items);
    const map = new Map(items.map(p => [p.id, p]));
    $$('#grid .card').forEach(card => {
      const id = card.querySelector('.title')?.dataset?.id;
      const p = map.get(id);
      if (p){
        addVariantBadgeToCard(card, p);
        arrangeBadges(card, p);
      }
    });
  };

  const _openDetail = PV.openDetailView;
  PV.openDetailView = async function(p){
    // Attach kinds from tags.json if present
    await attachMetaKinds(p).catch(()=>{});

    const mode = currentMode(p);
    if (mode === 'all'){
      _openDetail && _openDetail(p);
    } else {
      // temporarily filter previews during render
      const original = p.files?.previews || [];
      const filtered = filterPreviewsFor(p);
      p.files.previews = filtered;
      _openDetail && _openDetail(p);
      p.files.previews = original;
    }
    ensureVariantToggle(p);
    decorateThumbToggles(p);
    watchDetailThumbs(p);
  };

  let _obsDetail = null;
  function watchDetailThumbs(p){
    try{
      if (_obsDetail) { try{ _obsDetail.disconnect(); }catch{} }
      const target = document.getElementById('detailThumbs');
      if (!target) return;
      _obsDetail = new MutationObserver(()=> decorateThumbToggles(p));
      _obsDetail.observe(target, { childList: true, subtree: false });
    }catch(e){}
  }

  // Expose for debugging
  PV.tagImagesKind = tagImagesKind;
})();
