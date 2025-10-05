/* Mobile collections feed + gallery
   - Title overlay near top, thumbnails overlay near bottom
   - Horizontal snap carousel + left/right tap zones
   - Bottom nav: Search • Favs • Gallery • Library
   - DOM-first, then State; resolves strings, File/Blob, and FileSystemFileHandle → URLs
   - Merges by data-id first; else by normalized title (emoji stripped)
*/
(function(){
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
  const PVNS  = window.PV || (window.PV = {});
  const state = PVNS.state || (PVNS.state = {});

  /* ---------- utils ---------- */
  const stripEmoji = s => String(s||"").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
  const normTitle  = s => stripEmoji(s).replace(/\s+/g," ").trim().toLowerCase();

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

  /* ----- URL resolution (string | File | Blob | FileSystemFileHandle | {url}) ----- */
  async function anyToUrl(x){
    try{
      if (!x) return "";
      if (typeof x === "string") return x;
      if (x.url || x.href) return x.url || x.href;

      // File/Blob (also covers File from ZIP)
      if (typeof x === "object" && (x instanceof Blob || ("size" in x && "type" in x && typeof x.arrayBuffer === "function"))){
        return URL.createObjectURL(x);
      }

      // FileSystemFileHandle (R/W folder)
      if (typeof x === "object" && typeof x.getFile === "function"){
        const f = await x.getFile();
        return URL.createObjectURL(f);
      }

      // PV helper, if present
      if (window.PV?.Utils?.fileToUrl) {
        const u = await PV.Utils.fileToUrl(x);
        if (u) return u;
      }
    }catch(_){}
    return "";
  }

  async function resolveAll(rawList){
    const out = [];
    for (const r of rawList){ out.push(await anyToUrl(r)); }
    return Array.from(new Set(out.filter(Boolean)));
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

  /* ---------- DOM-first scraping (handles <img>, data-src, background-image) ---------- */
  function extractUrlsFromNode(node){
    const urls = new Set();

    node.querySelectorAll("img").forEach(img=>{
      const u = img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("data-lazy") || "";
      if (u) urls.add(u);
    });

    node.querySelectorAll("[data-src],[data-image],[data-bg],[data-url]").forEach(el=>{
      const u = el.getAttribute("data-src") || el.getAttribute("data-image") || el.getAttribute("data-bg") || el.getAttribute("data-url");
      if (u) urls.add(u);
    });

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
    const cards = $$("#grid > *, .results .grid > *, .page .grid > *, .page .card, .page .prompt, .page [data-id]");
    const list = [];
    cards.forEach((node,i)=>{
      const urls = extractUrlsFromNode(node);
      if (!urls.length) return;
      const titleEl =
        node.querySelector('[class*="title" i], h3, h2, .name') ||
        node.querySelector("figcaption") || node.querySelector("[title]");
      const title = (titleEl?.textContent || titleEl?.getAttribute?.("title") || "").trim() || `Item #${i+1}`;
      const id = node.getAttribute("data-id") || "";
      list.push({ id, idOrTitle: id || normTitle(title), title, raw: urls });
    });
    return list;
  }

  function fromStateRaw(){
    const src = (state.filtered && state.filtered.length) ? state.filtered : (state.all || []);
    if (!Array.isArray(src)) return [];
    return src.map((x,i)=>{
      const raw = [];
      if (Array.isArray(x.images)) raw.push(...x.images);
      if (x.image) raw.push(x.image);
      if (x.files && Array.isArray(x.files.images)) raw.push(...x.files.images);
      if (x.preview) raw.unshift(x.preview);
      if (x.cover) raw.unshift(x.cover);
      const id = x.id || x.ID || "";
      const title = x.title || x.name || `Prompt #${i+1}`;
      return { id, idOrTitle: id || normTitle(title), title, raw };
    });
  }

  function mergeRaw(domList, stateList){
    const map = new Map();
    domList.forEach(p=>{
      const key = p.idOrTitle;
      map.set(key, { id:p.id, title:p.title, raw:[...(p.raw||[])] });
    });
    stateList.forEach(p=>{
      const key = p.idOrTitle;
      const cur = map.get(key);
      if (cur){
        cur.id = cur.id || p.id;
        cur.title = cur.title || p.title;
        cur.raw.push(...(p.raw||[]));
      }else{
        map.set(key, { id:p.id, title:p.title, raw:[...(p.raw||[])] });
      }
    });
    return Array.from(map.values());
  }

  /* ---------- UI helpers ---------- */
  function openPrompt(p){
    if (PVNS.openPrompt) { try{ PVNS.openPrompt(p); return; }catch(_){ } }
    const target = p.id
      ? $(`.page [data-id="${CSS.escape(p.id)}"]`)
      : $$("#grid > *, .page .card, .page .prompt").find(el=>{
          const t = el.querySelector('[class*="title" i], h3, h2, .name, figcaption');
          return normTitle(t?.textContent||"") === normTitle(p.title||"");
        });
    const openBtn = target && Array.from(target.querySelectorAll("button")).find(b => /open/i.test(b.textContent||""));
    if (openBtn) openBtn.click();
  }

  function renderCardResolved(p, urls){
    if (!urls.length) return null;

    const card = document.createElement("section");
    card.className = "m-card";
    if (p.id) card.dataset.id = p.id;

    /* overlays */
    const header = document.createElement("div");
    header.className = "m-header";
    const title = document.createElement("div");
    title.className = "m-title";
    title.textContent = p.title || "Untitled";
    header.appendChild(title);

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

    const thumbs = document.createElement("div");
    thumbs.className = "m-thumbs";
    urls.forEach((u, i)=>{
      const t = document.createElement("img");
      t.className = "m-thumb" + (i===0 ? " is-on" : "");
      t.src = u; t.alt = `thumb ${i+1}`;
      t.addEventListener("click", ()=> {
        track.scrollTo({ left: i * track.clientWidth, behavior:'smooth' });
        setThumb(i);
      });
      thumbs.appendChild(t);
    });

    const setThumb = (idx)=>{
      Array.from(thumbs.children).forEach((el,i)=> el.classList.toggle("is-on", i===idx));
    };

    const advance = (dir)=>{
      const w = track.clientWidth;
      const cur = Math.round(track.scrollLeft / w);
      const next = Math.max(0, Math.min(cur + dir, urls.length-1));
      track.scrollTo({ left: next * w, behavior: 'smooth' });
      setThumb(next);
    };
    tapL.addEventListener("click", (e)=>{ e.stopPropagation(); advance(-1); });
    tapR.addEventListener("click", (e)=>{ e.stopPropagation(); advance(+1); });

    const onScroll = ()=>{
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      setThumb(Math.max(0, Math.min(idx, urls.length-1)));
    };
    track.addEventListener("scroll", onScroll, {passive:true});

    // tap middle to open detail
    carousel.addEventListener("click", (e)=>{
      const x = e.clientX, w = carousel.clientWidth;
      if (x > w*0.33 && x < w*0.67) openPrompt(p);
    });

    card.appendChild(carousel);    /* main image layer */
    card.appendChild(header);      /* overlay near top */
    card.appendChild(thumbs);      /* overlay near bottom */
    return card;
  }

  /* ---------- Gallery mode ---------- */
  async function mountGallery(){
    const root = ensureMobileRoot();
    const sc = root.querySelector(".m-feed-scroll");
    sc.innerHTML = "";

    const dom = fromDOM();
    const stateRaw = fromStateRaw();
    const merged = mergeRaw(dom, stateRaw);

    if (!merged.length){
      sc.innerHTML = `<div style="height:calc(100vh - 56px);display:grid;place-items:center">No items. Load Library or adjust filters.</div>`;
      return;
    }

    const container = document.createElement("div");
    container.className = "m-gallery";
    sc.appendChild(container);

    for (const p of merged){
      const urls = await resolveAll(p.raw || []);
      for (const u of urls){
        const img = document.createElement("img");
        img.className = "m-g-img";
        img.alt = p.title || "image";
        img.loading = "lazy"; img.decoding = "async";
        img.src = u;
        img.addEventListener("click", ()=> openPrompt(p));
        container.appendChild(img);
      }
    }
  }

  /* ---------- Collections feed ---------- */
  async function mountFeed(){
    if (!isMobile()) { document.body.classList.remove("mobile-active"); return; }
    document.body.classList.add("mobile-active");

    const root = ensureMobileRoot();
    const scroller = root.querySelector(".m-feed-scroll");
    if (!scroller) return;

    scroller.innerHTML = "";

    const dom = fromDOM();            // DOM FIRST
    const stateRaw = fromStateRaw();  // then state
    const merged = mergeRaw(dom, stateRaw);

    if (!merged.length){
      scroller.innerHTML = `<div style="height:calc(100vh - 56px);display:grid;place-items:center">No items. Load Library or adjust filters.</div>`;
      return;
    }

    for (const p of merged){
      const urls = await resolveAll(p.raw || []);
      const card = renderCardResolved(p, urls);
      if (card) scroller.appendChild(card);
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

  document.addEventListener("DOMContentLoaded", ()=>{ mountFeed(); });
  window.addEventListener("resize", ()=>{ mountFeed(); });
  window.addEventListener("pv:data", ()=>{ mountFeed(); });
})();
