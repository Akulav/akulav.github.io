/* Mobile collections feed + gallery
   - Vertical feed of collections
   - Each collection has a horizontal, snap carousel (swipe + tap left/right)
   - Bottom nav: Search, Favs, Gallery, Library
   - Pure black background; no RW actions on mobile
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
    t._hid = setTimeout(()=> t.classList.remove("show"), 900);
  }

  /* ---------- root ---------- */
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

  /* ---------- data ---------- */
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
      cover: x.cover || images[0] || ""
    };
  }
  async function fileHandleToUrl(h){
    try{ const f = await h.getFile(); return URL.createObjectURL(f); }
    catch(_){ return null; }
  }
  async function toUrl(it){
    if (typeof it === "string") return it;
    if (it && typeof it.getFile === "function") return await fileHandleToUrl(it);
    return "";
  }
  async function resolveAllImages(p){
    const out = [];
    for (const it of (p.images || [])){
      const u = await toUrl(it);
      if (u) out.push(u);
    }
    if (!out.length && p.cover){
      const u = await toUrl(p.cover);
      if (u) out.push(u);
    }
    return out;
  }

  /* ---------- UI ---------- */
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
                   || $$(".page .card, .page .prompt").find(el=>{
                        const t = el.querySelector('[class*="title" i], h3, h2, .name');
                        return (t?.textContent||"").trim() === (p.title||"");
                      });
    const openBtn = container && Array.from(container.querySelectorAll("button")).find(b => /open/i.test(b.textContent||""));
    if (openBtn) openBtn.click();
  }

  function renderCard(p, urls){
    const card = document.createElement("section");
    card.className = "m-card";
    card.dataset.id = p.id || Math.random().toString(36).slice(2);

    const carousel = document.createElement("div");
    carousel.className = "m-carousel";
    const track = document.createElement("div");
    track.className = "m-track";
    carousel.appendChild(track);

    const tapL = document.createElement("div");
    tapL.className = "m-tap-left";
    const tapR = document.createElement("div");
    tapR.className = "m-tap-right";
    carousel.appendChild(tapL);
    carousel.appendChild(tapR);

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

    const row = document.createElement("div");
    row.className = "m-row";
    const title = document.createElement("div");
    title.className = "m-title";
    title.textContent = p.title || "Untitled";
    const ddots = dots(Math.max(urls.length,1));
    row.appendChild(title);
    row.appendChild(ddots);

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

    // tap center to open
    carousel.addEventListener("click", (e)=>{
      const x = e.clientX, w = carousel.clientWidth;
      if (x > w*0.33 && x < w*0.67) openPrompt(p);
    });

    card.appendChild(carousel);
    card.appendChild(row);
    return card;
  }

  /* ---------- Gallery mode ---------- */
  async function mountGallery(){
    const root = ensureMobileRoot();
    const sc = root.querySelector(".m-feed-scroll");
    sc.innerHTML = "";
    let data = fromState();
    if (!data.length) data = fromDOM();
    if (!data.length){
      sc.innerHTML = `<div style="height:calc(100vh - 56px);display:grid;place-items:center">No items. Load Library or adjust filters.</div>`;
      return;
    }
    const container = document.createElement("div");
    container.className = "m-gallery";
    sc.appendChild(container);

    for (const p of data){
      const urls = await resolveAllImages(p);
      for (const u of (urls.length ? urls : [p.cover || ""])){
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
      scroller.innerHTML = `<div style="height:calc(100vh - 56px);display:grid;place-items:center">No items. Load Library or adjust filters.</div>`;
      return;
    }

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

    navEl.addEventListener("click", async (e)=>{
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
        (document.getElementById("toggleFavs") ||
         document.querySelector("[data-toggle-favs]"))?.click();
        toast("Favorites toggled");
        setTimeout(()=> window.MobileUI?.mountFeed?.(), 60);
        return;
      }

      if (tab === "search"){
        const s = document.getElementById("searchBox") || document.querySelector("input[type='search']");
        if (s){ s.focus(); s.scrollIntoView({block:"center"}); }
        else{
          const q = prompt("Search:");
          if (q != null){ state.q = String(q); window.__pv_applyFilters?.(); }
        }
        setTimeout(()=> window.MobileUI?.mountFeed?.(), 60);
        return;
      }

      if (tab === "gallery"){
        await mountGallery();
        return;
      }
    });
  }

  /* ---------- observers & public hook ---------- */
  new MutationObserver(()=>{
    const open = !!document.querySelector(".lib-overlay:not(.hidden):not([aria-hidden='true'])");
    document.body.classList.toggle("overlay-open", open);
  }).observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:["class","aria-hidden"] });

  window.MobileUI = { mountFeed, mountGallery };

  document.addEventListener("DOMContentLoaded", mountFeed);
  window.addEventListener("resize", mountFeed);
  window.addEventListener("pv:data", mountFeed);
})();
