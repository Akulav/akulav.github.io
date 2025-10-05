/* Mobile bootstrap: creates the shell only and hands off to mobile.js
   NOTE: no "Home" tab here; nav matches mobile.js */
(function(){
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
  const $ = (s,el=document)=>el.querySelector(s);

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
          <button data-tab="search" aria-current="page">🔎<span>Search</span></button>
          <button data-tab="favs">★<span>Favs</span></button>
          <button data-tab="gallery">🖼️<span>Gallery</span></button>
          <button data-tab="library">📚<span>Library</span></button>
        </nav>
        <div class="m-toast" hidden></div>
      `;
      document.body.appendChild(root);
    }
    return root;
  }

  function updateOverlayFlag(){
    const open = !!document.querySelector('.lib-overlay:not(.hidden):not([aria-hidden="true"])');
    document.body.classList.toggle('overlay-open', open);
  }

  function mount(){
    if (!isMobile()) return;
    ensureRoot();
    if (window.MobileUI && typeof MobileUI.mountFeed === 'function'){
      MobileUI.mountFeed();
    } else {
      const scroller = document.querySelector('.mobile-feed .m-feed-scroll');
      if (scroller && !scroller._filled){
        scroller._filled = true;
        scroller.innerHTML =
          `<div style="height:calc(100vh - 56px);display:grid;place-items:center">
             Loading…
           </div>`;
      }
    }
  }

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
        (document.getElementById('openRW') ||
         document.getElementById('libRW') ||
         document.getElementById('libFolder') ||
         document.getElementById('libZip'))?.click();
      } else if (tab === 'favs'){
        document.getElementById('toggleFavs')?.click();
      } else if (tab === 'search'){
        (document.getElementById('searchBox') ||
         document.querySelector('input[type="search"]'))?.focus();
      } else if (tab === 'gallery'){
        window.MobileUI?.mountGallery?.();
      }
    });
  }

  new MutationObserver(()=>{ updateOverlayFlag(); wireNav(); })
    .observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['class','aria-hidden']});

  document.addEventListener('DOMContentLoaded', () => { ensureRoot(); mount(); wireNav(); updateOverlayFlag(); });
  window.addEventListener('resize', () => { ensureRoot(); mount(); });
  window.addEventListener('pv:data', () => { ensureRoot(); mount(); });

  setTimeout(mount, 0);
  setTimeout(mount, 250);
  setTimeout(mount, 1000);
})();
