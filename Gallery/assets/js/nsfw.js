(function () {
  const { $, $$, state } = PV;
  const { writeTagsJSON } = PV;

  function readNsfwFlagFromMeta(meta){
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
    if (!p.tags) p.tags = [];
    const has = p.tags.includes('nsfw');
    if (p.nsfw === 'nsfw' && !has) {
      p.tags = ['nsfw', ...p.tags];
    } else if (p.nsfw === 'sfw' && has) {
      p.tags = p.tags.filter(t => t !== 'nsfw');
    }
  }

  function effectiveNSFW(p){
    if (p.nsfw === 'nsfw') return true;
    if (p.nsfw === 'sfw')  return false;
    return p.tags?.includes('nsfw');
  }

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

  function refreshDetailTags(p){
    const chipWrap = $('#detailTags');
    if (!chipWrap) return;
    chipWrap.innerHTML = '';
    (p.tags || []).forEach(t => {
      const span = document.createElement('span');
      span.className = 'chip';
      span.textContent = t;
      span.title = 'Filter by tag';
      span.onclick = () => {
        if (!PV.state.sel.has(t)) {
          PV.state.sel.add(t);
          PV.$$('#tagChips .chip').forEach(c => { if(c.textContent === t) c.classList.add('active'); });
          window.__pv_applyFilters?.();
        }
      };
      chipWrap.appendChild(span);
    });
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
    const markActive = () => { btns.forEach(b => b.classList.toggle('active', b.dataset.set === (p.nsfw || 'auto'))); };
    markActive();
    btns.forEach(b => {
      b.addEventListener('click', async () => {
        p.nsfw = b.dataset.set;
        applyNsfwOverride(p);
        try { await saveNsfwOverride(p); } catch {}
        try { refreshDetailTags(p); } catch {}
        window.__pv_refreshCardBadge?.(p);
        markActive();
      });
    });
    return wrap;
  }

  PV.readNsfwFlagFromMeta = readNsfwFlagFromMeta;
  PV.applyNsfwOverride = applyNsfwOverride;
  PV.effectiveNSFW = effectiveNSFW;
  PV.saveNsfwOverride = saveNsfwOverride;
  PV.refreshDetailTags = refreshDetailTags;
  PV.renderRatingControl = renderRatingControl;
})();
