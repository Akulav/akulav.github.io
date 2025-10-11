(function () {
  const { $, $$, state, savePref } = PV;
  const { FavStore } = PV;

  function renderTags(){
    const wrap = $('#tagChips'); if (!wrap) return;
    wrap.innerHTML = '';
    state.tags.forEach(t => {
      const b = document.createElement('button');
      b.className   = 'chip';
      b.textContent = t;
      b.dataset.tag = t;
      b.onclick = () => {
        if (state.sel.has(t)) state.sel.delete(t); else state.sel.add(t);
        b.classList.toggle('active');
        window.__pv_applyFilters?.();
      };
      wrap.appendChild(b);
    });
  }

  function setOnlyFavs(v){
    state.onlyFavs = !!v; savePref('onlyFavs', state.onlyFavs);
    $('#toggleFavs')?.classList.toggle('active', state.onlyFavs);
    $('#favSwitch')?.classList.toggle('active', state.onlyFavs);
    window.__pv_applyFilters?.();
  }

  function renderGrid(items){
    const grid  = $('#grid'), stats = $('#stats'), empty = $('#empty');
    if (!grid || !stats || !empty) return;

    grid.innerHTML = '';
    stats.textContent = `${items.length} prompt${items.length !== 1 ? 's' : ''}`;
    empty.style.display = items.length ? 'none' : 'block';

    items.forEach(p => {
      const card = document.createElement('article');
      card.className = 'card';

      const tw  = document.createElement('div'); tw.className = 'thumb-wrap skel';
      const img = document.createElement('img'); img.className = 'thumb'; img.loading = 'lazy'; img.decoding = 'async';

      // ---- image count badge (restored) ----
      const n = (p.files && Array.isArray(p.files.previews)) ? p.files.previews.length : 0;
      if (n > 0) {
        const count = document.createElement('span');
        count.className = 'count-badge';
        count.setAttribute('aria-label', `${n} image${n !== 1 ? 's' : ''}`);
        count.textContent = `📷 ${n}`;
        tw.appendChild(count);
      }
      // --------------------------------------

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = (p.tags || []).includes('nsfw') ? 'NSFW' : 'SFW';

      const isFav  = p.favorite || FavStore.has(p.id);
      const favBtn = document.createElement('button');
      favBtn.className = isFav ? 'fav-btn active' : 'fav-btn';
      favBtn.textContent = isFav ? '★' : '☆';
      favBtn.title = isFav ? 'Unfavorite' : 'Favorite';
      favBtn.onclick = (e) => { e.stopPropagation(); toggleFavorite(p, favBtn); };

      if (p.files?.previews?.length > 0) {
        PV.loadObjectURL(p.files.previews[0]).then(url => { img.src = url; img.onload = () => { /* pv:aspect detect */ if (img.naturalHeight / img.naturalWidth > 1.25) tw.classList.add('tall'); else tw.classList.remove('tall'); tw.classList.remove('skel'); }; });
      } else { img.alt = 'No preview'; tw.classList.remove('skel'); }

      tw.append(img, badge, favBtn);

      const meta = document.createElement('div'); meta.className = 'meta';
      const h3   = document.createElement('h3');
      h3.className   = 'title';
      h3.textContent = p.title;
      h3.setAttribute('contenteditable', state.rw ? 'true' : 'false');
      h3.setAttribute('spellcheck','false');
      h3.dataset.id = p.id;

      if (state.rw) {
        h3.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); h3.blur(); } });
        h3.addEventListener('blur', async () => {
          const { saveTitle } = PV;
          const newTitle = h3.textContent.trim();
          if (newTitle && newTitle !== p.title) await saveTitle(p, newTitle);
          else h3.textContent = p.title;
        });
      }

      const tags = document.createElement('div'); tags.className = 'tags';
      (p.tags || []).forEach(t => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = t;
        span.title = 'Filter by tag';
        span.style.cursor = 'pointer';
        span.onclick = () => {
          if (!state.sel.has(t)) {
            state.sel.add(t);
            $$('#tagChips .chip').forEach(c => { if (c.textContent === t) c.classList.add('active'); });
            window.__pv_applyFilters?.();
          }
        };
        tags.appendChild(span);
      });

      meta.append(h3, tags);

      const actions = document.createElement('div'); actions.className = 'card-actions';
      const viewBtn = document.createElement('button'); viewBtn.className = 'btn'; viewBtn.textContent = 'Open'; viewBtn.onclick = () => PV.openDetailView(p);
      const copyBtn = document.createElement('button'); copyBtn.className = 'btn btn-primary'; copyBtn.textContent = 'Copy Prompt';
      copyBtn.onclick = async () => { const text = await PV.loadPromptText(p); navigator.clipboard.writeText(text); PV.toastCopied(copyBtn); };

      actions.append(viewBtn, copyBtn);
      card.append(tw, meta, actions);
      grid.appendChild(card);
    });
  }

  function equalizeCardHeights(){
    const cards = $$('.card');
    if (!cards.length || window.innerWidth <= 520) { cards.forEach(c => c.style.height = 'auto'); return; }
    cards.forEach(c => c.style.height = 'auto');
    let maxH = 0;
    cards.forEach(c => maxH = Math.max(maxH, c.getBoundingClientRect().height));
    if (maxH > 0) cards.forEach(c => c.style.height = `${Math.ceil(maxH)}px`);
  }

  function toggleFavorite(p, starBtn){
    const isFav = PV.FavStore.has(p.id);
    if (isFav) PV.FavStore.del(p.id); else PV.FavStore.add(p.id);
    p.favorite = !isFav;
    starBtn.classList.toggle('active', !isFav);
    starBtn.textContent = !isFav ? '★' : '☆';
    if (state.onlyFavs) window.__pv_applyFilters?.();
    // persist to disk if RW
    PV.syncFavoritesToDisk && PV.syncFavoritesToDisk();
  }

  PV.renderTags = renderTags;
  PV.setOnlyFavs = setOnlyFavs;
  PV.renderGrid = renderGrid;
  PV.equalizeCardHeights = equalizeCardHeights;
  PV.toggleFavorite = toggleFavorite;
})();
