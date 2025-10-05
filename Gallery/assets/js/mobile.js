/* ======== Mobile "TikTok-style" UI Layer ========
   - Renders a simple feed (image + title) on <=768px screens
   - No RW action buttons on mobile
   - Works even if images are FileSystem handles (resolves to object URLs)
   - Bottom nav is wired to desktop logic (clear, search, favorites, library)
*/
(function(){
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  const PVNS  = window.PV || (window.PV = {});
  const state = PVNS.state || (PVNS.state = {});

  // ---------- helpers ----------
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
    t._hid = setTimeout(()=> t.classList.remove("show"), 1200);
  }

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
        <button data-tab="home" aria-current="page">🏠<span>Home</span></button>
        <button data-tab="search">🔎<span>Search</span></button>
        <button data-tab="favs">★<span>Favs</span></button>
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

  // Try to get a visible list of prompts from state
  function collectFromState(){
    const arr = (state.filtered && Array.isArray(state.filtered) && state.filtered.length)
      ? state.filtered
      : state.all;
    if (!Array.isArray(arr)) return [];
    return arr.map((x,i) => normalizePrompt(x, i));
  }

  // DOM fallback — read from existing desktop cards
  function collectFromDOM(){
    const cards = $$(".page .card, .page .prompt, .page [data-id]");
    const list = [];
    cards.forEach((n,i)=>{
      const img = n.querySelector("img");
      if (!img) return;
      const titleEl = n.querySelector('[class*="title" i], h3, h2, .name') || {};
      const chips = Array.from(n.querySelectorAll('.chips .chip, .tags .tag, .chip')).slice(0,12).map(c=>c.textContent.trim());
      list.push({
        id: n.getAttribute("data-id") || img.currentSrc || img.src || ("d_" + i),
        title: (titleEl.textContent || "").trim() || "Untitled",
        cover: img.currentSrc || img.src || "",
        images: [img.currentSrc || img.src].filter(Boolean),
        tags: chips
      });
    });
    return list;
  }

  function normalizePrompt(x, i){
    return {
      id: x.id || x.ID || x.title || ("p_" + i),
      title: x.title || x.name || `Prompt #${i+1}`,
      tags: x.tags || x.keywords || [],
      cover: x.cover || (x.images && x.images[0]) || x.image || x.preview || null,
      images: x.images || (x.image ? [x.image] : []),
      dirHandle: x.dirHandle,     // keep handles for FS fetch
      files: x.files              // some builds keep {previews:[FileHandle,...]}
    };
  }

  async function fileHandleToUrl(h){
    try{
      const f = await h.getFile();
      return URL.createObjectURL(f);
    }catch(_){ return null; }
  }

  // Resolve a usable image URL from the prompt data; async when needed.
  async function resolveImageUrl(p){
    // direct string
    if (typeof p.cover === "string" && p.cover) return p.cover;

    // PV helpers if present
    if (window.PV){
      if (typeof PV.getImageURL === "function"){
        try{ const u = await PV.getImageURL(p, 0); if (u) return u; }catch(_){}
      }
      if (typeof PV.urlForImage === "function"){
        try{ const u = await PV.urlForImage(p, 0); if (u) return u; }catch(_){}
      }
    }

    // images array: strings or handles
    if (Array.isArray(p.images) && p.images.length){
      for (const it of p.images){
        if (typeof it === "string" && it) return it;
        if (it && typeof it.getFile === "function"){ const u = await fileHandleToUrl(it); if (u) return u; }
      }
    }

    // known place for preview handles
    const previews = p.files && (p.files.previews || p.files.images || p.files.list);
    if (Array.isArray(previews)){
      for (const h of previews){
        if (typeof h === "string" && h) return h;
        if (h && typeof h.getFile === "function"){ const u = await fileHandleToUrl(h); if (u) return u; }
      }
    }

    // DOM fallback: find a desktop card image by id/title
    const byId = $(`.page [data-id="${CSS.escape(p.id||"")}"] img`);
    if (byId && (byId.currentSrc || byId.src)) return byId.currentSrc || byId.src;

    const titleSel = `.page [class*="title" i], .page h2, .page h3, .page .name`;
    const candidates = $$(titleSel).filter(el => (el.textContent||"").trim() === (p.title||""));
    for (const el of candidates){
      const img = el.closest(".card,.prompt,[data-id]")?.querySelector("img");
      if (img && (img.currentSrc || img.src)) return img.currentSrc || img.src;
    }

    return "";
  }

  function renderCard(p){
    const card = document.createElement("section");
    card.className = "m-card";
    card.dataset.id = p.id || Math.random().toString(36).slice(2);

    const media = document.createElement("div");
    media.className = "m-card-media";
    const img = document.createElement("img");
    img.alt = p.title || "image";
    media.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "m-card-meta";
    const t = document.createElement("div");
    t.className = "m-title";
    t.textContent = p.title || "Untitled";

    const tagsWrap = document.createElement("div");
    tagsWrap.className = "m-tags";
    (p.tags || []).slice(0,12).forEach(tag => {
      const chip = document.createElement("span");
      chip.className = "m-tag";
      chip.textContent = tag;
      tagsWrap.appendChild(chip);
    });

    meta.appendChild(t);
    meta.appendChild(tagsWrap);

    // open detail on tap
    card.addEventListener("click", ()=> openPrompt(p));

    card.appendChild(media);
    card.appendChild(meta);

    // async image resolution
    resolveImageUrl(p).then(url => { if (url) img.src = url; });

    return card;
  }

  function openPrompt(p){
    // Prefer a direct API if your app exposes one
    if (PVNS.openPrompt) { try{ PVNS.openPrompt(p); return; }catch(_){ } }

    // Otherwise click the "Open" button on the desktop card if we can find it
    const container = $(`.page [data-id="${CSS.escape(p.id||"")}"]`)
                   || $$(".page .card, .page .prompt").find(el => {
                        const titleEl = el.querySelector('[class*="title" i], h3, h2, .name');
                        return (titleEl?.textContent||"").trim() === (p.title||"");
                      });
    const openBtn = container && (container.querySelector('button') && Array.from(container.querySelectorAll('button')).find(b => /open/i.test(b.textContent||"")));
    if (openBtn){ openBtn.click(); return; }
  }

  function getPrompts(){
    const fromState = collectFromState();
    // If state exists but images look unresolved, fall back to DOM
    const looksEmpty = !fromState.length || fromState.every(p => !p.cover && !(Array.isArray(p.images) && p.images.length));
    if (looksEmpty){
      const fromDom = collectFromDOM();
      if (fromDom.length) return fromDom;
    }
    return fromState;
  }

  function mountFeed(){
    if (!isMobile()) { document.body.classList.remove("mobile-active"); return; }
    document.body.classList.add("mobile-active");

    const root = ensureMobileRoot();
    const scroller = root.querySelector(".m-feed-scroll");
    if (!scroller) return;

    scroller.innerHTML = "";
    const prompts = getPrompts();
    if (!prompts.length){
      const empty = document.createElement("div");
      empty.style.display = "grid";
      empty.style.placeItems = "center";
      empty.style.height = "calc(100vh - 64px)";
      empty.textContent = "No items. Load Library or adjust filters.";
      scroller.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    prompts.forEach(p => frag.appendChild(renderCard(p)));
    scroller.appendChild(frag);
  }

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
        (document.getElementById("openRW") ||
         document.querySelector("[data-openrw]") ||
         document.getElementById("openRO") ||
         document.querySelector("[data-openro]") ||
         document.getElementById("openZip") ||
         Array.from(document.querySelectorAll("button")).find(b => /open\s*zip/i.test(b.textContent||"")))
        ?.click();

        // Hide mobile layer while overlay is open
        const overlay = $(".lib-overlay");
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
        // Try the official toggler, else toggle state + re-apply
        (document.getElementById("toggleFavs") || document.querySelector("[data-toggle-favs]"))?.click();
        if (!document.getElementById("toggleFavs")){
          state.onlyFavs = !state.onlyFavs;
          window.__pv_applyFilters?.();
        }
        toast(state.onlyFavs ? "Favorites ON" : "Favorites OFF");
        return;
      }

      if (tab === "search"){
        const s = document.getElementById("searchBox") || document.querySelector("input[type='search']");
        if (s){
          // focus existing search; user types and desktop filter will fire
          s.focus();
          s.scrollIntoView({block:"center"});
        }else{
          // simple inline prompt fallback
          const q = prompt("Search:");
          if (q != null){
            state.q = String(q);
            window.__pv_applyFilters?.();
          }
        }
        return;
      }

      // home
      (document.getElementById("clearFilters") || document.querySelector("[data-clear]"))?.click();
      // fallback: reset common state flags and re-apply
      if (!document.getElementById("clearFilters")){
        state.onlyFavs = false;
        state.q = "";
        window.__pv_applyFilters?.();
      }
    });
  }

  // Observe overlays and DOM changes to keep things in sync
  new MutationObserver(()=>{
    const open = !!document.querySelector(".lib-overlay:not(.hidden):not([aria-hidden='true'])");
    document.body.classList.toggle("overlay-open", open);
  }).observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:["class","aria-hidden"] });

  // Public hook so desktop can refresh the mobile feed
  window.MobileUI = { mountFeed };

  document.addEventListener("DOMContentLoaded", mountFeed);
  window.addEventListener("resize", mountFeed);
  window.addEventListener("pv:data", mountFeed);
})();
