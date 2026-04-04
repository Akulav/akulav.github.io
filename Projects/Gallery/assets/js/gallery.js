(function () {
  const { $, state } = PV;

  let _galleryObserver = null;
  let _galleryURLs = [];
  let _galleryLoading = false;

  function openGallery(){
    state._scrollPos = window.scrollY;

    const view = $('#galleryView');
    const grid = $('#galleryGrid');
    const sentinel = $('#gallerySentinel');
    const meta  = $('#galleryMeta');

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

    // EXPORT button now works
    document.getElementById('exportZip').onclick = () => PV.exportZipOfCurrentFilter();

    document.getElementById('galleryBack').onclick = closeGallery;
    window.addEventListener('keydown', handleGalleryKeys);

    document.body.classList.add('gallery-view-active');
    view.setAttribute('aria-hidden','false');
    PV.lockScroll();

    async function galleryLoadNextPage(){
      if (_galleryLoading) return;
      if (state._gallery.idx >= state._gallery.list.length) return;
      _galleryLoading = true;
      const end = Math.min(state._gallery.idx + 40, state._gallery.list.length);
      const frag = document.createDocumentFragment();

      for (let i = state._gallery.idx; i < end; i++){
        const { handle, id } = state._gallery.list[i];
        const url = await PV.loadObjectURL(handle);
        _galleryURLs.push(url);
        const im = document.createElement('img');
        im.className = 'gimg';
        im.src = url; im.loading = 'lazy'; im.decoding = 'async'; im.onload = () => { try{ im.style.aspectRatio = `${im.naturalWidth} / ${im.naturalHeight}`; }catch{} };
        im.onclick = () => {
          const promptToOpen = PV.state.all.find(p => p.id === id);
          if (promptToOpen) { closeGallery(); PV.openDetailView(promptToOpen); }
        };
        frag.appendChild(im);
      }
      grid.insertBefore(frag, sentinel);
      state._gallery.idx = end;
      _galleryLoading = false;
    }
  }

  function closeGallery(){
    document.body.classList.remove('gallery-view-active');
    document.getElementById('galleryView')?.setAttribute('aria-hidden','true');
    PV.unlockScroll();
    window.scrollTo({ top: state._scrollPos, behavior: 'instant' });
    window.removeEventListener('keydown', handleGalleryKeys);
    if (_galleryObserver) _galleryObserver.disconnect();
    _galleryURLs.forEach(u => URL.revokeObjectURL(u));
    _galleryURLs = [];
  }

  function handleGalleryKeys(e){ if (e.key === 'Escape') { e.preventDefault(); closeGallery(); } }

  function collectCurrentPreviewHandles(){
    const list = [];
    const seen = new Set();
    for (const p of state._lastRenderedItems) {
      if (p.files?.previews?.length){
        p.files.previews.forEach((h, idx) => {
          const key = p.id + ':' + idx;
          if (!seen.has(key)) { seen.add(key); list.push({ handle: h, id: p.id, idx }); }
        });
      }
    }
    return list;
  }

  PV.openGallery = openGallery;
  PV.closeGallery = closeGallery;
})();
