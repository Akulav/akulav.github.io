(function () {
  const { $, $$, state, savePref } = PV;
  const { FavStore } = PV;

  // No-op tag renderer (kept for compatibility)
  function renderTags(){
    const wrap = $('#tagChips');
    if (wrap) wrap.innerHTML = '';
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

      const tw  = document.createElement('div');
      tw.className = 'thumb-wrap skel';

      const img = document.createElement('img');
      img.className = 'thumb';
      img.loading = 'lazy';
      img.decoding = 'async';

      // ---- single info badge (count + format + dimensions) ----
      const total = (p.files && Array.isArray(p.files.previews)) ? p.files.previews.length : 0;

      let firstPreview = (p.files && Array.isArray(p.files.previews) && p.files.previews[0]) ? p.files.previews[0] : null;
      let ext = '';
      if (firstPreview && firstPreview.name) {
        const dot = firstPreview.name.lastIndexOf('.');
        ext = dot >= 0 ? firstPreview.name.slice(dot + 1) : '';
      }

      const infoBadge = document.createElement('span');
      infoBadge.className = 'count-badge';
      if (total > 0) {
        const upExt = ext ? ext.toUpperCase() : '';
        // show count + format first; dimensions filled in after image loads
        infoBadge.textContent = upExt ? `📷 ${total} · 🖼️ ${upExt}` : `📷 ${total} · 🖼️`;
        infoBadge.setAttribute('aria-label', `Contains ${total} image${total !== 1 ? 's' : ''}${upExt ? ', first is '+upExt : ''}`);
        tw.appendChild(infoBadge);
      }
      // ---------------------------------------------------------

      // Favorite star
      const isFav  = p.favorite || FavStore.has(p.id);
      const favBtn = document.createElement('button');
      favBtn.className = isFav ? 'fav-btn active' : 'fav-btn';
      favBtn.textContent = isFav ? '★' : '☆';
      favBtn.title = isFav ? 'Unfavorite' : 'Favorite';
      favBtn.onclick = (e) => { e.stopPropagation(); toggleFavorite(p, favBtn); };

      // First image preview & dimensions → enhance the info badge
      if (p.files?.previews?.length > 0) {
        PV.loadObjectURL(p.files.previews[0]).then(url => {
          img.src = url;
          img.onload = () => {
            const w = img.naturalWidth || 0;
            const h = img.naturalHeight || 0;
            if (h / w > 1.25) tw.classList.add('tall'); else tw.classList.remove('tall');
            tw.classList.remove('skel');

            if (total > 0) {
              const upExt = ext ? ext.toUpperCase() : '';
              const dims  = (w && h) ? ` ${w}×${h}` : '';
              infoBadge.textContent = upExt
                ? `📷 ${total} · 🖼️ ${upExt}${dims}`
                : `📷 ${total} · 🖼️${dims}`;
              infoBadge.setAttribute('aria-label',
                `Contains ${total} image${total !== 1 ? 's' : ''}${upExt ? ', first is '+upExt : ''}${w&&h ? `, ${w} by ${h} pixels` : ''}`);
            }
          };
        });
      } else {
        img.alt = 'No preview';
        tw.classList.remove('skel');
      }

      // Append thumb, info badge (already added above when total>0), and fav
      tw.append(img, favBtn);

      // Meta (title only; tags removed)
      const meta = document.createElement('div');
      meta.className = 'meta';

      const h3 = document.createElement('h3');
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

      meta.append(h3);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn';
      viewBtn.textContent = 'Open';
      viewBtn.onclick = () => PV.openDetailView(p);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-primary';
      copyBtn.textContent = 'Copy Prompt';
      copyBtn.onclick = async () => {
        const text = await PV.loadPromptText(p);
        navigator.clipboard.writeText(text);
        PV.toastCopied(copyBtn);
      };

      actions.append(viewBtn, copyBtn);

      // Build card
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
    PV.syncFavoritesToDisk && PV.syncFavoritesToDisk();
  }

  PV.renderTags = renderTags;                 // safe no-op
  PV.setOnlyFavs = setOnlyFavs;
  PV.renderGrid = renderGrid;
  PV.equalizeCardHeights = equalizeCardHeights;
  PV.toggleFavorite = toggleFavorite;
})();
