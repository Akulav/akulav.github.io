// assets/js/detail.js
(function () {
  const { state, $, $$ } = PV;

  let _detailState = { p: null, previews: [], index: 0, urls: [] };

  function revokeAll(urls) { urls?.forEach(u => { if (u) URL.revokeObjectURL(u); }); }

  async function setDetailHero(i, handle = null) {
    const img = document.getElementById('detailImg');
    const target = handle || _detailState.previews[i];
    if (!target || !img) return;

    _detailState.index = i;

    const existing = _detailState.urls[i];
    if (existing) {
      img.src = existing;
    } else {
      const url = await PV.loadObjectURL(target);
      _detailState.urls[i] = url;
      if (_detailState.index === i) img.src = url;
    }

    // Toggle active state on images
    $$('#detailThumbs .thumb-container img')
      .forEach((t, idx) => t.classList.toggle('active', idx === i));

    // Toggle 'selected' state on containers (drives always-visible overlay)
    const containers = document.querySelectorAll('#detailThumbs .thumb-container');
    containers.forEach((c, idx) => c.classList.toggle('selected', idx === i));

    // Keep selected thumb in view
    const active = document.querySelector(`#detailThumbs img[data-idx="${i}"]`);
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function handleDetailKeys(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeDetailView(); }
    if (e.key === 'ArrowRight' && _detailState.previews.length > 1) {
      e.preventDefault(); setDetailHero((_detailState.index + 1) % _detailState.previews.length);
    }
    if (e.key === 'ArrowLeft' && _detailState.previews.length > 1) {
      e.preventDefault(); setDetailHero((_detailState.index - 1 + _detailState.previews.length) % _detailState.previews.length);
    }
  }

  async function openDetailView(p) {
    // reset state
    revokeAll(_detailState.urls);
    _detailState = { p: null, previews: [], index: 0, urls: [] };

    _detailState.p = p;
    window.location.hash = `prompt/${p.id}`;
    state._scrollPos = window.scrollY;

    const view = document.getElementById('detailView');
    if (!view) return;

    // Title (same UX as your title editing)
    const dt = document.getElementById('detailTitle');
    dt.textContent = p.title;
    if (state.rw) {
      dt.setAttribute('contenteditable', 'true');
      dt.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); dt.blur(); } };
      dt.onblur = () => {
        const newTitle = dt.textContent.trim();
        if (newTitle && newTitle !== p.title) { PV.saveTitle(p, newTitle); }
        else { dt.textContent = p.title; }
      };
    } else {
      dt.setAttribute('contenteditable', 'false');
      dt.onkeydown = null;
      dt.onblur = null;
    }

    // Actions
    document.getElementById('detailBack').onclick = closeDetailView;

    // Copy Prompt prefers live edited text, else loads latest
    document.getElementById('detailCopyPrompt').onclick = async () => {
      const ed = document.getElementById('promptEditor');
      const live = ed?.getAttribute('contenteditable') === 'true' ? ed.textContent : null;
      const text = live ?? await PV.loadPromptTextWithOverride(p);
      await navigator.clipboard.writeText(text || '');
      PV.toastCopied(document.getElementById('detailCopyPrompt'));
    };

    // Download current hero image
    const dlBtn = document.getElementById('detailDownloadImg');
    dlBtn.onclick = async () => {
      const handle = _detailState.previews[_detailState.index];
      if (!handle) return;
      const url = await PV.loadObjectURL(handle);
      const a = document.createElement('a');
      a.href = url;
      a.download = handle.name;
      a.click();
      URL.revokeObjectURL(url);
    };

    // Add images visible only in RW
    const addBtn = document.getElementById('detailAddImages');
    const uploader = document.getElementById('imageUploader');
    if (state.rw) {
      addBtn.style.display = 'inline-block';
      addBtn.onclick = () => uploader.click();
    } else {
      addBtn.style.display = 'none';
    }
    uploader.onchange = async (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        await PV.addImagesToPrompt?.(p, Array.from(files));
      }
      uploader.value = '';
    };

    // Prompt editor: load + mount contenteditable (auto-save on blur)
    const promptBox = document.getElementById('detailPromptText');
    promptBox.textContent = 'Loading…';
    const txt = await PV.loadPromptTextWithOverride(p);
    promptBox.textContent = (txt || '').toString();
    PV.mountPromptEditor(p); // <-- enables editing + saves to disk on blur

    // Thumbs
    const thumbs = document.getElementById('detailThumbs');
    thumbs.innerHTML = '';
    _detailState.previews = p.files?.previews || [];
    _detailState.urls = new Array(_detailState.previews.length).fill(null);

    if (_detailState.previews.length > 0) {
      _detailState.previews.forEach((handle, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'thumb-container';
        wrap.dataset.idx = i;

        // Click anywhere in the container to select (prevents 1px hover issues)
        wrap.onclick = () => setDetailHero(i);

        const im = document.createElement('img');
        im.dataset.idx = i;
        im.style.pointerEvents = 'none'; // so overlay zone never loses hover
        if (i === 0) {
          im.classList.add('active');
          wrap.classList.add('selected');   // keep overlay visible on first thumb
          setDetailHero(i, handle);
        }
        PV.loadObjectURL(handle).then(url => {
          _detailState.urls[i] = url;
          im.src = url;
        });

        if (state.rw) {
          const actions = document.createElement('div');
          actions.className = 'thumb-actions';

          const isCover = handle.name.startsWith('_');

          const coverBtn = document.createElement('button');
          coverBtn.title = 'Set as cover image';
          coverBtn.innerHTML = '★';
          if (isCover) coverBtn.classList.add('is-cover');
          coverBtn.onclick = (e) => { e.stopPropagation(); PV.setCoverImage?.(p, handle); };

          const delBtn = document.createElement('button');
          delBtn.title = 'Delete image';
          delBtn.innerHTML = '✕';
          delBtn.className = 'delete';
          delBtn.onclick = (e) => { e.stopPropagation(); PV.deleteImage?.(p, handle); };

          actions.append(coverBtn, delBtn);
          wrap.appendChild(actions);
        }

        wrap.appendChild(im);
        thumbs.appendChild(wrap);
      });
    } else {
      const hero = document.getElementById('detailImg');
      if (hero) {
        hero.removeAttribute('src');
        hero.alt = 'No preview available';
      }
      if (state.rw) {
        thumbs.innerHTML = `<div style="padding:10px;color:var(--muted);">No images. <a href="#" onclick="document.getElementById('imageUploader').click();return false;">Add some.</a></div>`;
      }
    }

    // Show view
    document.body.classList.add('detail-view-active');
    view.setAttribute('aria-hidden', 'false');
    PV.lockScroll?.();
    window.addEventListener('keydown', handleDetailKeys);

    // Optional: rating control mount point (kept as-is if present)
    const ratingMount = document.getElementById('detailRating');
    if (ratingMount && PV.renderRatingControl) {
      ratingMount.innerHTML = '';
      ratingMount.appendChild(PV.renderRatingControl(p));
    }
  }

  function closeDetailView() {
    document.body.classList.remove('detail-view-active');
    const view = document.getElementById('detailView');
    view?.setAttribute('aria-hidden', 'true');
    PV.unlockScroll?.();
    window.scrollTo({ top: state._scrollPos, behavior: 'instant' });
    if (window.location.hash) {
      history.pushState('', document.title, window.location.pathname + window.location.search);
    }
    revokeAll(_detailState.urls);
    _detailState = { p: null, previews: [], index: 0, urls: [] };
    window.removeEventListener('keydown', handleDetailKeys);
  }

  // Expose open/close for other modules
  PV.openDetailView = openDetailView;
  PV.closeDetailView = closeDetailView;
  PV.setDetailHero = setDetailHero;
})();
