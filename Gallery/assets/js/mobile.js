/* Mobile collections feed + gallery (DOM-first, no blank frames)
   - Vertical feed of collections
   - Each collection: horizontal snap carousel (swipe or tap left/right)
   - Bottom nav: Search • Favs • Gallery • Library
   - Uses your real IDs: #searchBox, #toggleFavs, #openRW (topbar), and falls back to #libRW/#libFolder/#libZip
*/
(function(){
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
  const PVNS  = window.PV || (window.PV = {});
  const state = PVNS.state || (PVNS.state = {});

  /* ----- toast ----- */
  function toast(msg){
    let t = $(".m-toast");
    if (!t){
      t = document.createElement("div");
      t.className = "m-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._hid);
    t._hid = setTimeout(()=> t.classList.remove("show"), 900);
  }

  /* ----- root ----- */
  function ensureMobileRoot(){
    let root = $(".mobile-feed");
    if (!root){
      root = document.createElement("div");
      root.className = "mobile-feed";

      const scroller = document.createElement("div");
      scroller.className = "m-feed-scroll";
      root.appendChild(scroller);

      const nav = document.createElement("nav");
      nav.className = "m-nav";
      nav.innerHTML = `
        <button data-tab="search"  aria-current="page">🔎<span>Search</span></button>
        <button data-tab="favs">★<span>Favs</span></button>
        <button data-tab="gallery">🖼️<span>Gallery</span></button>
        <button data-tab="library">📚<span>Library</span></button>
      `;
      root.appendChild(nav);

      const toastEl = document.createElement("div");
      toastEl.className = "m-toast";
      toastEl.hidden = true;
      root.appendChild(toastEl);

      document.body.appendChild(root);
      wireNav(nav);
    }
    document.body.classList.toggle("mobile-active", isMobile());
    return root;
  }

  /* ---------- DOM-first scraping (handles <img>, data-src, and background-image) ---------- */
  function extractUrlsFromNode(node){
    const urls = new Set();

    // <img> and lazy <img data-src>
    node.querySelectorAll("img").forEach(img=>{
      const u = img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("data-lazy") || "";
      if (u) urls.add(u);
    });

    // common lazy attributes on any element
    node.querySelectorAll("[data-src],[data-image],[data-bg],[data-url]").forEach(el=>{
      const u = el.getAttribute("data-src") || el.getAttribute("data-image") || el.getAttribute("data-bg") || el.getAttribute("data-url");
      if (u) urls.add(u);
    });

    // background-image styles
    node.querySelectorAll("*").forEach(el=>{
      const bg = (el.style && el.style.backgroundImage) || getComputedStyle(el).backgroundImage;
      if (bg && bg.startsWith("url(")){
        const m = bg.match(/url\((['"]?)(.*?)\1\)/);
        if (m && m[2]) urls.add(m[2]);
      }
    });

    return Array.from(urls);
  }

  function fromDOM(){
    // Try several selectors; your grid is #grid
    const cards = $$("#grid > *, .results .grid > *, .page .grid > *, .page .card, .page .prompt, .page [data-id]");
    const list = [];
    cards.forEach((node,i)=>{
      const urls = extractUrlsFromNode(node);
      if (!urls.length) return;  // skip truly imageless cards
      const titleEl =
        node.querySelector('[class*="title" i], h3, h2, .name') ||
        node.querySelector("figcaption") ||
        node.querySelector("[title]");
      const title = (titleEl?.textContent || titleEl?.getAttribute?.("title") || "").trim() || `Item #${i+1}`;
      list.push({ id: node.getAttribute("data-id") || urls[0] || ("dom_"+i), title, images: urls });
    });
    return list;
  }

  // Optionally merge with state if it adds more URLs
  function mergeWithState(domList){
    const arr = (state.filtered && state.filtered.length) ? state.filtered : (state.all || []);
    if (!arr.length) return domList;

    const byTitle = Object.create(null);
    domList.forEach(p => { byTitle[p.title] = p; });

    arr.forEach(x=>{
      const title = x.title || x.name;
      if (!title) return;
      const images = [];
      if (Array.isArray(x.images)) images.push(...x.images);
      if (x.image) images.push(x.image);
      if (x.files && Array.isArray(x.files.images)) images.push(...x.files.images);
      if (x.preview) images.unshift(x.preview);
      if (x.cover) images.unshift(x.cover);

      const urls = [];
      for (const it of images){
        if (typeof it === "string" && it) urls.push(it);
      }
      if (!urls.length) return;

      if (byTitle[title]) {
        const s = new Set([...byTitle[title].images, ...urls]);
        byTitle[title].images = Array.from(s);
      } else {
        byTitle[title] = { id: x.id || title, title, images: urls };
      }
    });

    return Object.values(byTitle).filter(p => p.images && p.images.length);
  }

  /* ---------- UI helpers ---------- */
  function dots(n){
    const wrap = document.createElement("div");
    wrap.className = "m-dots";
    for (let i=0;i<n;i++){
      const d = document.createElement("span");
      d.className = "m-dot"; if (i===0) d.classList.add("is-on");
      wrap.appendChild(d);
    }
    return wrap;
  }
  function setDotActive(dotsEl, idx){
    Array.from(dotsEl.children).forEach((el,i)=> el.classList.toggle("is-on", i===idx));
  }

  function openPrompt(p){
    if (PVNS.openPrompt) { try{ PVNS.openPrompt(p); return; }catch(_){ } }
    const container = $(`.page [data-id="${CSS.escape(p.id||"")}"]`)
                   || $$("#grid > *, .page .card, .page .prompt").find(el=>{
                        const t = el.querySelector('[class*="title" i], h3, h2, .name, figcaption');
                        return (t?.textContent||"").trim() === (p.title||"");
                      });
    const openBtn = container && Array.from(container.querySelectorAll("button")).find(b => /open/i.test(b.textContent||""));
    if (openBtn) openBtn.click();
  }

  function renderCard(p){
    const urls = p.images || [];
    if (!urls.length) return null;

    const card = document.createElement("section");
    card.className = "m-card";
    card.dataset.id = p.id || Math.random().toString(36).slice(2);

    const carousel = document.createElement("div");
    carousel.className = "m-carousel";
    const track = document.createElement("div");
    track.className = "m-track";
    carousel.appendChild(track);

    const tapL = document.createElement("div"); tapL.className = "m-tap-left";
    const tapR = document.createElement("div"); tapR.className = "m-tap-right";
    carousel.appendChild(tapL); carousel.appendChild(tapR);

    urls.forEach(u=>{
      const item = document.createElement("div");
      item.className = "m-item";
      const img = document.createElement("img");
      img.alt = p.title || "image";
      img.loading = "lazy"; img.decoding = "async";
      img.src = u;
      item.appendChild(img);
      track.appendChild(item);
    });

    const row = document.createElement("div");
    row.className = "m-row";
    const title = document.createElement("div");
    title.className = "m-title";
    title.textContent = p.title || "Untitled";
    const ddots = dots(Math.max(urls.length,1));
    row.appendChild(title); row.appendChild(ddots);

    const advance = (dir)=>{
      const w = track.clientWidth;
      const cur = Math.round(track.scrollLeft / w);
      const next = Math.max(0, Math.min(cur + dir, urls.length-1));
      track.scrollTo({ left: next * w, behavior: 'smooth' });
    };
    tapL.addEventListener("click", (e)=>{ e.stopPropagation(); advance(-1); });
    tapR.addEventListener("click", (e)=>{ e.stopPropagation(); advance(+1); });

    const onScroll = ()=>{
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      setDotActive(ddots, Math.max(0, Math.min(idx, urls.length-1)));
    };
    track.addEventListener("scroll", onScroll, {passive:true});

    // tap middle to open
    carousel.addEventListener("click", (e)=>{
      const x = e.clientX, w = carousel.clientWidth;
      if (x > w*0.33 && x < w*0.67) openPrompt(p);
    });

    card.appendChild(carousel);
    card.appendChild(row);
    return card;
  }

  /* ---------- Gallery mode ---------- */
  function mountGallery(){
    const root = ensureMobileRoot();
    const sc = root.querySelector(".m-feed-scroll");
    sc.innerHTML = "";

    const dom = fromDOM();
    const data = mergeWithState(dom);
    if (!data.length){
      sc.innerHTML = `<div style="height:calc(100vh - 56px);display:grid;place-items:center">No items. Load Library or adjust filters.</div>`;
      return;
    }

    const container = document.createElement("div");
    container.className = "m-gallery";
    sc.appendChild(container);

    for (const p of data){
      for (const u of p.images){
        const img = document.createElement("img");
        img.className = "m-g-img";
        img.alt = p.title || "image";
        img.loading = "lazy";
        img.decoding = "async";
        img.src = u;
        img.addEventListener("click", ()=> openPrompt(p));
        container.appendChild(img);
      }
    }
  }

  /* ---------- Collections feed ---------- */
  function mountFeed(){
    if (!isMobile()) { document.body.classList.remove("mobile-active"); return; }
    document.body.classList.add("mobile-active");

    const root = ensureMobileRoot();
    const scroller = root.querySelector(".m-feed-scroll");
    if (!scroller) return;

    scroller.innerHTML = "";

    const dom = fromDOM();            // DOM FIRST (prevents blanks)
    const data = mergeWithState(dom); // merge with state if helpful

    if (!data.length){
      scroller.innerHTML = `<div style="height:calc(100vh - 56px);display:grid;place-items:center">No items. Load Library or adjust filters.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    data.forEach(p => {
      const card = renderCard(p);
      if (card) frag.appendChild(card);
    });
    scroller.appendChild(frag);
  }

  /* ---------- bottom nav ---------- */
  function wireNav(navEl){
    if (!navEl || navEl._wired) return;
    navEl._wired = true;

    navEl.addEventListener("click", (e)=>{
      const btn = e.target.closest("button[data-tab]");
      if (!btn) return;
      navEl.querySelectorAll("button[data-tab]").forEach(b => b.removeAttribute("aria-current"));
      btn.setAttribute("aria-current","page");
      const tab = btn.getAttribute("data-tab");

      if (tab === "library"){
        // Prefer topbar #openRW which opens your overlay; then fall back to sheet buttons
        (document.getElementById("openRW") || document.getElementById("libRW") ||
         document.getElementById("libFolder") || document.getElementById("libZip"))?.click();

        const overlay = document.getElementById("libraryOverlay");
        if (overlay){
          const setFlag = ()=>{
            const hidden = overlay.classList.contains("hidden") ||
                           overlay.getAttribute("aria-hidden")==="true";
            document.body.classList.toggle("overlay-open", !hidden);
            if (hidden){ mountFeed(); }
          };
          setFlag();
          new MutationObserver(setFlag).observe(overlay, { attributes:true, attributeFilter:["class","aria-hidden"] });
        }
        return;
      }

      if (tab === "favs"){
        document.getElementById("toggleFavs")?.click();
        toast("Favorites toggled");
        setTimeout(mountFeed, 60);
        return;
      }

      if (tab === "search"){
        const s = document.getElementById("searchBox");
        if (s){ s.focus(); s.scrollIntoView({block:"center"}); }
        else{
          const q = prompt("Search:");
          if (q != null){ state.q = String(q); window.__pv_applyFilters?.(); }
        }
        setTimeout(mountFeed, 60);
        return;
      }

      if (tab === "gallery"){
        mountGallery();
        return;
      }
    });
  }

  /* ---------- overlay observer & public hook ---------- */
  new MutationObserver(()=>{
    const overlay = document.getElementById("libraryOverlay");
    const open = overlay && !overlay.classList.contains("hidden") && overlay.getAttribute("aria-hidden")!=="true";
    document.body.classList.toggle("overlay-open", !!open);
  }).observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:["class","aria-hidden"] });

  window.MobileUI = { mountFeed, mountGallery };

  document.addEventListener("DOMContentLoaded", mountFeed);
  window.addEventListener("resize", mountFeed);
  window.addEventListener("pv:data", mountFeed);
})();
