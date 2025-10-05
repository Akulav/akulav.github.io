/* Mobile bootstrap: always create + mount the mobile layer on phones,
   and correctly show/hide it when overlays are open. */
(function(){
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
  const $ = (s,el=document)=>el.querySelector(s);

  // 1) Ensure the mobile root exists even if mobile.js didn’t run yet
  function ensureRoot(){
    if (!isMobile()) { document.body.classList.remove('mobile-active'); return null; }
    document.body.classList.add('mobile-active');

    let root = $('.mobile-feed');
    if (!root){
      root = document.createElement('div');
      root.className = 'mobile-feed';
      root.innerHTML = `
        <div class="m-feed-scroll"></div>
        <nav class="m-nav">
          <button data-tab="home" aria-current="page">🏠<span>Home</span></button>
          <button data-tab="search">🔎<span>Search</span></button>
          <button data-tab="favs">★<span>Favs</span></button>
          <button data-tab="library">📚<span>Library</span></button>
        </nav>
        <div class="m-toast" hidden></div>
      `;
      document.body.appendChild(root);
    }
    return root;
  }

  // 2) Detect actual overlays; if any visible → hide mobile layer
  function updateOverlayFlag(){
    const open = !!document.querySelector('.lib-overlay:not(.hidden):not([aria-hidden="true"])');
    document.body.classList.toggle('overlay-open', open);
  }

  // 3) Try to mount via the real renderer if present; else show placeholder
  function mount(){
    if (!isMobile()) return;
    ensureRoot();
    if (window.MobileUI && typeof MobileUI.mountFeed === 'function'){
      MobileUI.mountFeed();
    } else {
      // fallback: placeholder text until mobile.js is ready
      const scroller = document.querySelector('.mobile-feed .m-feed-scroll');
      if (scroller && !scroller._filled){
        scroller._filled = true;
        scroller.innerHTML =
          `<div style="height:calc(100vh - 64px);display:grid;place-items:center">
             Loading…
           </div>`;
      }
    }
  }

  // 4) Wire nav buttons even if mobile.js isn’t loaded yet
  function wireNav(){
    const nav = document.querySelector('.mobile-feed .m-nav');
    if (!nav || nav._wired) return;
    nav._wired = true;
    nav.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      nav.querySelectorAll('button[data-tab]').forEach(b=>b.removeAttribute('aria-current'));
      btn.setAttribute('aria-current','page');
      const tab = btn.getAttribute('data-tab');

      if (tab === 'library'){
        // prefer RW, else RO, else ZIP button
        (document.getElementById('openRW') ||
         document.querySelector('[data-openrw]') ||
         document.getElementById('openRO') ||
         document.querySelector('[data-openro]') ||
         document.getElementById('openZip') ||
         Array.from(document.querySelectorAll('button')).find(b => /open\s*zip/i.test(b.textContent||'')))
        ?.click();
      } else if (tab === 'favs'){
        (document.getElementById('toggleFavs') ||
         document.querySelector('[data-toggle-favs]'))?.click();
      } else if (tab === 'search'){
        (document.getElementById('searchBox') ||
         document.querySelector('input[type="search"]'))?.focus();
      } else {
        (document.getElementById('clearFilters') ||
         document.querySelector('[data-clear]'))?.click();
      }
    });
  }

  // Observe overlays and DOM changes
  new MutationObserver(()=>{ updateOverlayFlag(); wireNav(); })
    .observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['class','aria-hidden']});

  // Initial kicks
  document.addEventListener('DOMContentLoaded', () => { ensureRoot(); mount(); wireNav(); updateOverlayFlag(); });
  window.addEventListener('resize', () => { ensureRoot(); mount(); });
  window.addEventListener('pv:data', () => { ensureRoot(); mount(); });

  // In case mobile.js loads late
  setTimeout(mount, 0);
  setTimeout(mount, 250);
  setTimeout(mount, 1000);
})();
