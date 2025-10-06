/* Mobile UX — design only. No new data. 
   - Adds body.mobile-on
   - Styles detailView as a true fullscreen page
   - Adds a bottom bar that delegates to existing buttons (Search, Favs, Gallery, Open)
   - Hides non-mobile actions via CSS (see mobile.css)
*/
(function () {
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
  const isMobile = () => matchMedia('(max-width:768px)').matches;

  // --- bottom bar (delegates to existing app controls) ---
  function ensureBar() {
    let bar = $('.mbar');
    if (bar) return bar;
    bar = document.createElement('nav');
    bar.className = 'mbar';
    bar.innerHTML = `
      <button data-tab="search" aria-current="true" title="Search">🔎</button>
      <button data-tab="favs"   title="Favorites">★</button>
      <button data-tab="gallery" title="Gallery">🖼️</button>
      <button data-tab="library" title="Open Library">📚</button>
    `;
    document.body.appendChild(bar);

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
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
        return;
      }
      if (tab === 'gallery') {
        $('#openGallery')?.click();
        return;
      }
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

  // Keep mobile layout in sync with overlays (library modal)
  function watchOverlays() {
    const overlay = document.getElementById('libraryOverlay');
    if (!overlay) return;
    const set = () => {
      const open = !overlay.classList.contains('hidden') &&
                   overlay.getAttribute('aria-hidden') !== 'true';
      document.body.classList.toggle('overlay-open', open);
    };
    set();
    new MutationObserver(set).observe(overlay, {
      attributes: true, attributeFilter: ['class', 'aria-hidden']
    });
  }

  // Make detailView behave like a real virtual page (no DOM move; design-only)
  function patchDetailView() {
    const dv = document.getElementById('detailView');
    if (!dv) return;

    // When detail is opened via your existing code, it toggles aria-hidden.
    // We ensure body stays scroll-locked and bar remains visible underneath.
    const set = () => {
      const open = dv.getAttribute('aria-hidden') !== 'true';
      document.body.classList.toggle('dv-open', open);
    };
    set();
    new MutationObserver(set).observe(dv, { attributes: true, attributeFilter: ['aria-hidden'] });

    // Make thumb nav more obviously scrollable on mobile (no logic changes)
    const thumbs = $('#detailThumbs');
    if (thumbs && !thumbs.hasAttribute('data-mobile-tuned')) {
      thumbs.setAttribute('data-mobile-tuned', 'true');
      thumbs.setAttribute('tabindex', '0');
    }
  }

  // Entry
  function boot() {
    if (!isMobile()) {
      document.body.classList.remove('mobile-on');
      const bar = $('.mbar'); if (bar) bar.remove();
      return;
    }
    document.body.classList.add('mobile-on');
    ensureBar();
    watchOverlays();
    patchDetailView();
  }

  document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('resize', boot);
  window.addEventListener('pv:data', boot);
})();
