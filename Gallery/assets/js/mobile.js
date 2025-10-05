/* ======== Mobile "Collections feed" UI ========
   - Vertical scroll of collections (prompts)
   - Each collection has a horizontal, swipeable image carousel
   - Zero RW actions on mobile; tap opens desktop detail
   - Uses PV.state when available; falls back to DOM scraping
*/
(function(){
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
  const PVNS  = window.PV || (window.PV = {});
  const state = PVNS.state || (PVNS.state = {});

  /* ---------- toast ---------- */
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
    t._hid = setTimeout(()=> t.classList.remove("show"), 1000);
  }

  /* ---------- mount root ---------- */
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

  /* ---------- data sources ---------- */
  function fromState(){
    const arr = (state.filtered && Array.isArray(state.filtered) && state.filtered.length)
      ? state.filtered
      : state.all;
    if (!Array.isArray(arr)) return [];
    return arr.map((x,i)=> normalizePrompt(x, i));
  }

  function fromDOM(){
    const cards = $$(".page .card, .page .prompt, .page [data-id]");
    const list = [];
    cards.forEach((node,i)=>{
      const titleEl = node.querySelector('[class*="title" i], h3, h2, .name');
      const imgs = Array.from(node.querySelectorAll("img"));
      if (!imgs.length) return;
      const title = (titleEl?.textContent || "").trim() || `Item #${i+1}`;
      const urls  = imgs.map(im => im.currentSrc || im.src).filter(Boolean);
      list.push({ id: node.getAttribute("data-id") || urls[0] || ("dom_"+i), title, images: urls, cover: urls[0] });
    });
    return list;
  }

  function normalizePrompt(x, i){
    const images = [];
    if (Array.isArray(x.images)) images.push(...x.images);
    if (x.image && !images.length) images.push(x.image);
    if (x.files && Array.isArray(x.files.images)) images.push(...x.files.images);
    if (x.preview) images.unshift(x.preview);
    if (x.cover) images.unshift(x.cover);

    return {
      id: x.id || x.ID || x.title || ("p_"+i),
      title: x.title || x.name || `Prompt #${i+1}`,
      images: images.filter(Boolean),
      cover: x.cover || images[0] || "",
      dirHandle: x.dirHandle,
      files: x.files
    };
  }

  async function fileHandleToUrl(h){
    try{ const f = await h.getFile(); return URL.createObjectURL(f); }
    catch(_){ return null; }
  }

  async function toUrl(item){
    if (typeof item === "string") return item;
    if (item && typeof item.getFile === "function") return await fileHandleToUrl(item);
    return "";
  }

  async function resolveAllImages(p){
    const srcs = [];
    for (const it of (p.images || [])){
      const u = await toUrl(it);
      if (u) srcs.push(u);
    }
    if (!srcs.length && p.cover) {
      const u = await toUrl(p.cover);
      if (u) srcs.push(u);
    }
    return srcs;
  }

  /* ---------- UI pieces ---------- */
  function dots(n){
    const wrap = document.createElement("div");
    wrap.className = "m-dots";
    for (let i=0; i<n; i++){
      const d = document.createElement("span");
      d.className = "m-dot";
      if (i===0) d.classList.add("is-on");
      wrap.appendChild(d);
    }
    return wrap;
  }

  function setDotActive(dotsEl, idx){
    const children = Array.from(dotsEl.children);
    children.forEach((el,i)=> el.classList.toggle("is-on", i===idx));
  }

  function openPrompt(p){
    // preferred desktop hook
    if (PVNS.openPrompt) { try{ PVNS.openPrompt(p); return; }catch(_){ } }

    // fallback: click "Open" on matching desktop card
    const container = $(`.page [data-id="${CSS.escape(p.id||"")}"]`)
                   || $$(".page .card, .page .prompt").find(el => {
                        const te = el.querySelector('[class*="title" i], h3, h2, .name');
                        return (te?.textContent||"").trim() === (p.title||"");
                      });
    const openBtn = container && Array.from(container.querySelectorAll("button")).find(b => /open/i.test(b.textContent||""));
    if (openBtn) openBtn.click();
  }

  function renderCard(p, urls){
    const card = document.createElement("section");
    card.className = "m-card";
    card.dataset.id = p.id || Math.random().toString(36).slice(2);

    /* carousel */
    const carousel = document.createElement("div");
    carousel.className = "m-carousel";
    const track = document.createElement("div");
    track.className = "m-track";
    carousel.appendChild(track);

    urls.forEach(u=>{
      const item = document.createElement("div");
      item.className = "m-item";
      const img = document.createElement("img");
      img.alt = p.title || "image";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = u;
      item.appendChild(img);
      track.appendChild(item);
    });

    /* title row */
    const row = document.createElement("div");
    row.className = "m-row";
    const title = document.createElement("div");
    title.className = "m-title";
    title.textContent = p.title || "Untitled";
    const ddots = dots(Math.max(urls.length,1));
    row.appendChild(title);
    row.appendChild(ddots);

    /* swipe position → dots */
    const onScroll = ()=>{
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      setDotActive(ddots, Math.max(0, Math.min(idx, urls.length-1)));
    };
    track.addEventListener("scroll", onScroll, {passive:true});
    // jump to next/prev on tap near edges
    carousel.addEventListener("click", (e)=>{
      const x = e.clientX, w = carousel.clientWidth;
      const cur = Math.round(track.scrollLeft / w);
      if (x > w*0.66) track.scrollTo({left: (cur+1)*w, behavior:'smooth'});
      else if (x < w*0.34) track.scrollTo({left: Math.max(0,cur-1)*w, behavior:'smooth'});
      else openPrompt(p);
    });

    card.appendChild(carousel);
    card.appendChild(row);
    return card;
  }

  /* ---------- main render ---------- */
  async function mountFeed(){
    if (!isMobile()) { document.body.classList.remove("mobile-active"); return; }
    document.body.classList.add("mobile-active");

    const root = ensureMobileRoot();
    const scroller = root.querySelector(".m-feed-scroll");
    if (!scroller) return;

    scroller.innerHTML = "";
    let data = fromState();
    if (!data.length) data = fromDOM();
    if (!data.length){
      const empty = document.createElement("div");
      empty.style.cssText = "height:calc(100vh - 56px);display:grid;place-items:center";
      empty.textContent = "No items. Load Library or adjust filters.";
      scroller.appendChild(empty);
      return;
    }

    // Build cards
    for (const p of data){
      const urls = await resolveAllImages(p);
      const card = renderCard(p, urls.length ? urls : [p.cover || ""]);
      scroller.appendChild(card);
    }
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
        (document.getElementById("openRW") ||
         document.querySelector("[data-openrw]") ||
         document.getElementById("openRO") ||
         document.querySelector("[data-openro]") ||
         document.getElementById("openZip") ||
         Array.from(document.querySelectorAll("button")).find(b => /open\s*zip/i.test(b.textContent||"")))
        ?.click();

        // hide mobile while overlay open
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
        (document.getElementById("toggleFavs") || document.querySelector("[data-toggle-favs]"))?.click();
        toast("Favorites toggled");
        // re-render feed with current filters
        setTimeout(()=> window.MobileUI?.mountFeed?.(), 50);
        return;
      }

      if (tab === "search"){
        const s = document.getElementById("searchBox") || document.querySelector("input[type='search']");
        if (s){ s.focus(); s.scrollIntoView({block:"center"}); }
        else{
          const q = prompt("Search:");
          if (q != null){ state.q = String(q); window.__pv_applyFilters?.(); }
        }
        setTimeout(()=> window.MobileUI?.mountFeed?.(), 50);
        return;
      }

      // home (clear filters)
      (document.getElementById("clearFilters") || document.querySelector("[data-clear]"))?.click();
      if (!document.getElementById("clearFilters")){
        state.onlyFavs = false; state.q = ""; window.__pv_applyFilters?.();
      }
      setTimeout(()=> window.MobileUI?.mountFeed?.(), 50);
    });
  }

  /* ---------- observers & hooks ---------- */
  new MutationObserver(()=>{
    const open = !!document.querySelector(".lib-overlay:not(.hidden):not([aria-hidden='true'])");
    document.body.classList.toggle("overlay-open", open);
  }).observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:["class","aria-hidden"] });

  window.MobileUI = { mountFeed };

  document.addEventListener("DOMContentLoaded", mountFeed);
  window.addEventListener("resize", mountFeed);
  window.addEventListener("pv:data", mountFeed);
})();
