/* Mobile UX — design only (no new data)
   - Adds body.mobile-on
   - Sticky bottom bar with safe-area padding
   - Delegates to existing controls (Search, Favs, Gallery, Open)
   - DetailView behaves like a full-screen “page”
*/
(function () {
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
  const isMobile = () => matchMedia('(max-width:768px)').matches;

  // --- utilities ---
  const raf = (fn)=> (window.requestAnimationFrame? requestAnimationFrame(fn) : setTimeout(fn,16));
  function throttle(fn, ms=150){
    let t=0, p=null, lastArgs=null;
    return function(...args){
      const now=Date.now(); lastArgs=args;
      if (!t || now-t>=ms){
        t=now; fn.apply(this,args);
      } else if (!p){
        p=setTimeout(()=>{ t=Date.now(); p=null; fn.apply(this,lastArgs); }, ms-(now-t));
      }
    };
  }

  // Keep the bar above the soft keyboard on mobile
  function hookViewportResize(nav){
    try{
      if (!window.visualViewport) return;
      const vv = window.visualViewport;
      const onVV = throttle(()=>{
        const kbOpen = vv.height < window.innerHeight - 40; // heuristic
        nav.style.transform = kbOpen ? `translateY(${(window.innerHeight - vv.height - vv.offsetTop) * -1}px)` : '';
      }, 60);
      vv.addEventListener('resize', onVV, { passive: true });
      vv.addEventListener('scroll', onVV, { passive: true });
    }catch{}
  }

  // --- bottom bar (delegates to existing app controls) ---
  function ensureBar() {
    let bar = $('.mbar');
    if (bar) return bar;

    bar = document.createElement('nav');
    bar.className = 'mbar';
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'Mobile quick actions');

    bar.innerHTML = `
      <button data-tab="favs" aria-pressed="${$('#toggleFavs')?.classList.contains('active') ? 'true':'false'}" aria-label="Favorites" title="Favorites">★</button>
      <button data-tab="gallery" aria-label="Gallery" title="Gallery">🖼️</button>
      <button data-tab="library" aria-label="Open Library" title="Open Library">📚</button>
    `;
    document.body.appendChild(bar);

    hookViewportResize(bar);

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;

      // reflect selection state
      bar.querySelectorAll('button[data-tab]').forEach(b => b.removeAttribute('aria-current'));
      btn.setAttribute('aria-current', 'true');

      const tab = btn.getAttribute('data-tab');
      if (tab === 'search') {
        const s = $('#searchBox');
        if (s) { s.focus(); s.scrollIntoView({block:'center'}); }
        return;
      }
      if (tab === 'favs') {
        $('#toggleFavs')?.click();
        // sync pressed state
        const active = $('#toggleFavs')?.classList.contains('active');
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        return;
      }
      if (tab === 'gallery') { $('#openGallery')?.click(); return; }
      if (tab === 'library') {
        (document.getElementById('openRW') ||
         document.getElementById('libRW') ||
         document.getElementById('libFolder') ||
         document.getElementById('libZip'))?.click();
        return;
      }
    });

    return bar;
  }

  // Keep mobile layout in sync with overlay (make bar inert when overlay open)
  function watchOverlays() {
    const overlay = document.getElementById('libraryOverlay');
    const bar = $('.mbar');
    if (!overlay || !bar) return;

    const set = () => {
      const open = !overlay.classList.contains('hidden') &&
                   overlay.getAttribute('aria-hidden') !== 'true';
      document.body.classList.toggle('overlay-open', open);
      // prevent tabbing/clicking the bar behind the overlay
      if ('inert' in bar) {
        bar.inert = !!open;
      } else {
        bar.style.pointerEvents = open ? 'none' : '';
      }
    };
    set();
    new MutationObserver(set).observe(overlay, {
      attributes: true, attributeFilter: ['class', 'aria-hidden']
    });
  }

  // DetailView polish only (design)
  function patchDetailView() {
    const dv = document.getElementById('detailView');
    if (!dv) return;

    const set = () => {
      const open = dv.getAttribute('aria-hidden') !== 'true';
      document.body.classList.toggle('dv-open', open);
    };
    set();
    new MutationObserver(set).observe(dv, { attributes: true, attributeFilter: ['aria-hidden'] });

    const thumbs = $('#detailThumbs');
    if (thumbs && !thumbs.hasAttribute('data-mobile-tuned')) {
      thumbs.setAttribute('data-mobile-tuned', 'true');
      thumbs.setAttribute('tabindex', '0');
      // CSS will do the rest (momentum scroll)
    }
  }

  function boot() {
    if (!isMobile()) {
      document.body.classList.remove('mobile-on');
      const bar = $('.mbar'); if (bar) bar.remove();
      return;
    }
    document.body.classList.add('mobile-on');
    const bar = ensureBar();
    // run these after layout to avoid jank
    raf(() => { watchOverlays(); patchDetailView(); });
  }

  document.addEventListener('DOMContentLoaded', boot, { once: true });
  window.addEventListener('resize', throttle(boot, 150), { passive: true });
  window.addEventListener('pv:data', throttle(boot, 150));
})();
