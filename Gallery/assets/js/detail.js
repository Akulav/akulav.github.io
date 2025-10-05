(function () {
  const { $, $$, state } = PV;

  let detail = { p: null, previews: [], index: 0, urls: [] };
  window.__pv_detail = detail;

  function openDetailView(p){
    PV.revokeURLs(detail.urls);
    detail = { p, previews: [], index: 0, urls: [] };
    window.__pv_detail = detail;

    window.location.hash = `prompt/${p.id}`;
    state._scrollPos = window.scrollY;

    const view = $('#detailView');
    if (!view) return;

    const addImagesBtn = $('#detailAddImages');
    if (state.rw) {
      addImagesBtn.style.display = 'inline-block';
      addImagesBtn.onclick = () => $('#imageUploader').click();
    } else addImagesBtn.style.display = 'none';

    const uploader = $('#imageUploader');
    uploader.onchange = async (e) => {
      const files = e.target.files;
      if (files && files.length > 0) await PV.addImagesToPrompt(p, Array.from(files));
      uploader.value = '';
    };

    const detailTitle = $('#detailTitle');
    detailTitle.textContent = p.title;
    if (state.rw) {
      detailTitle.setAttribute('contenteditable','true');
      detailTitle.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); detailTitle.blur(); } };
      detailTitle.onblur = async () => {
        const newTitle = detailTitle.textContent.trim();
        if (newTitle && newTitle !== p.title) await PV.saveTitle(p, newTitle);
        else detailTitle.textContent = p.title;
      };
    } else {
      detailTitle.setAttribute('contenteditable','false');
      detailTitle.onkeydown = null; detailTitle.onblur = null;
    }

    const tagWrap = $('#detailTags'); tagWrap.innerHTML = '';
    (p.tags || []).forEach(t => { const b = document.createElement('span'); b.className = 'chip'; b.textContent = t; tagWrap.appendChild(b); });

    $('#detailBack').onclick = closeDetailView;
    $('#detailCopyPrompt').onclick = async () => { const text = await PV.loadPromptText(p); navigator.clipboard.writeText(text); PV.toastCopied($('#detailCopyPrompt')); };
    $('#detailDownloadImg').onclick = async () => {
      const handle = detail.previews[detail.index]; if (!handle) return;
      const url = await PV.loadObjectURL(handle);
      const a = document.createElement('a'); a.href = url; a.download = handle.name; a.click(); URL.revokeObjectURL(url);
    };

    PV.loadPromptText(p).then(text => renderParsedPrompt(text.trim(), $('#detailPromptText')));

    // ---- THUMB STRIP / SLIDER ----
    const stripWrap = $('#detailThumbsWrap');
    const thumbsRow = $('#detailThumbs');
    const leftBtn   = $('#thumbNavLeft');
    const rightBtn  = $('#thumbNavRight');

    thumbsRow.innerHTML = '';
    detail.previews = p.files?.previews || [];
    detail.urls = new Array(detail.previews.length).fill(null);

    if (detail.previews.length > 0) {
      detail.previews.forEach((handle, i) => {
  const container = document.createElement('div');
  container.className = 'thumb-container';

  const imgThumb = document.createElement('img');
  imgThumb.dataset.idx = i;

  // Intrinsic size = faster layout & decode pipeline
  imgThumb.width = 110;
  imgThumb.height = 110;

  // Prioritize the first batch so they appear immediately; others can be lazy
  if (i < 12) {
    imgThumb.loading = 'eager';
    if ('fetchPriority' in imgThumb) imgThumb.fetchPriority = 'high';
  } else {
    imgThumb.loading = 'lazy';
    if ('fetchPriority' in imgThumb) imgThumb.fetchPriority = 'low';
  }
  imgThumb.decoding = 'async';

  if (i === 0) {
    imgThumb.classList.add('active');
    setDetailHero(i, handle);
  }

  // Create a blob URL, set src, then proactively decode the image
  PV.loadObjectURL(handle).then(url => {
    detail.urls[i] = url;
    imgThumb.src = url;

    // Force decode in the background so it paints without a “black” placeholder
    if (imgThumb.decode) {
      imgThumb.decode().catch(() => {/* ignore decode errors */});
    }
  });

  imgThumb.onclick = () => setDetailHero(i);
  container.appendChild(imgThumb);

  if (state.rw) {
    const actions = document.createElement('div');
    actions.className = 'thumb-actions';

    const isCover = handle.name.startsWith('_');
    const coverBtn = document.createElement('button');
    coverBtn.className = isCover ? 'is-cover' : '';
    coverBtn.title = isCover ? 'Cover image' : 'Set as cover';
    coverBtn.textContent = '★';
    coverBtn.onclick = async (e) => { e.stopPropagation(); await PV.setCoverImage(p, i); };

    const delBtn = document.createElement('button');
    delBtn.className = 'delete';
    delBtn.title = 'Delete';
    delBtn.textContent = '✕';
    delBtn.onclick = async (e) => { e.stopPropagation(); await PV.deleteImageFromPrompt(p, i); };

    actions.append(coverBtn, delBtn);
    container.appendChild(actions);
  }

  thumbsRow.appendChild(container);
});

      // nav button logic
      const updateNav = () => {
        const maxScroll = thumbsRow.scrollWidth - thumbsRow.clientWidth;
        leftBtn.disabled  = thumbsRow.scrollLeft <= 4;
        rightBtn.disabled = thumbsRow.scrollLeft >= maxScroll - 4;
      };
      const scrollBy = (dir = 1) => {
        const step = Math.max(thumbsRow.clientWidth * 0.8, 240);
        thumbsRow.scrollBy({ left: dir * step, behavior: 'smooth' });
      };

      leftBtn.onclick  = () => scrollBy(-1);
      rightBtn.onclick = () => scrollBy(1);
      thumbsRow.addEventListener('scroll', updateNav);
      window.addEventListener('resize', updateNav, { passive: true });
      setTimeout(updateNav, 0); // after layout

    } else {
      $('#detailImg').removeAttribute('src');
      $('#detailImg').alt = 'No preview available';
      thumbsRow.innerHTML = `<div style="padding: 10px; color: var(--muted);">No images.</div>`;
      leftBtn.disabled = rightBtn.disabled = true;
    }
    // ---- END THUMB SLIDER ----

    document.body.classList.add('detail-view-active');
    view.setAttribute('aria-hidden','false');
    PV.lockScroll();
    window.addEventListener('keydown', handleDetailKeys);

    PV.applyNsfwOverride(p);
    const ratingMount = document.getElementById('detailRating');
    if (ratingMount) { ratingMount.innerHTML = ''; ratingMount.appendChild(PV.renderRatingControl(p)); }
    PV.refreshDetailTags(p);
  }

  function closeDetailView(){
    document.body.classList.remove('detail-view-active');
    document.getElementById('detailView')?.setAttribute('aria-hidden','true');
    PV.unlockScroll();
    window.scrollTo({ top: PV.state._scrollPos, behavior: 'instant' });
    if (window.location.hash) history.pushState("", document.title, window.location.pathname + window.location.search);
    PV.revokeURLs(detail.urls);
    detail = { p: null, previews: [], index: 0, urls: [] };
    window.__pv_detail = detail;
    window.removeEventListener('keydown', handleDetailKeys);
  }

  function setDetailHero(i, handle = null){
    const heroImg = $('#detailImg');
    // Promote the hero for immediate fetch/decode
heroImg.loading = 'eager';
heroImg.decoding = 'async';
if ('fetchPriority' in heroImg) heroImg.fetchPriority = 'high';

// Make sure it’s decoded ASAP (prevents a brief black flash on some GPUs)
if (heroImg.decode) {
  heroImg.decode().catch(() => {});
}

    const target  = handle || detail.previews[i];
    if (!target) return;
    detail.index = i;
    const existingUrl = detail.urls[i];
    if (existingUrl) heroImg.src = existingUrl;
    else PV.loadObjectURL(target).then(url => { detail.urls[i] = url; if (detail.index === i) heroImg.src = url; });
    $$('#detailThumbs .thumb-container img').forEach((thumb, idx) => thumb.classList.toggle('active', idx === i));
    const activeThumb = document.querySelector(`#detailThumbs img[data-idx="${i}"]`);
    activeThumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function handleDetailKeys(e){
    if (e.key === 'Escape') { e.preventDefault(); closeDetailView(); }
    if (e.key === 'ArrowRight' && detail.previews.length > 1) { e.preventDefault(); setDetailHero((detail.index + 1) % detail.previews.length); }
    if (e.key === 'ArrowLeft'  && detail.previews.length > 1) { e.preventDefault(); setDetailHero((detail.index - 1 + detail.previews.length) % detail.previews.length); }
  }

  function renderParsedPrompt(text, container){
    container.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = text;
    container.appendChild(p);
  }

  window.__pv_refreshCardBadge = (p) => {
    const card = document.querySelector(`.card [data-id="${p.id}"]`)?.closest('.card');
    const badge = card?.querySelector('.badge');
    if (!badge) return;
    badge.textContent = (p.tags || []).includes('nsfw') ? 'NSFW' : 'SFW';
  };

  PV.openDetailView = openDetailView;
  PV.closeDetailView = closeDetailView;
  PV.setDetailHero = setDetailHero;
})();
