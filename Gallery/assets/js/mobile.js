/* ======== Mobile "TikTok-style" UI Layer ========
   Non-destructive overlay: sits above desktop UI on <=768px screens.
   - R/W-gated actions are disabled unless state.rw is true
   - Uses PV.state.filtered || PV.state.all to render cards
*/
(function(){
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

  const PVNS = (window.PV && window.PV.state) ? window.PV : (window.PV = window.PV || {});
  const state = PVNS.state || (PVNS.state = {});
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  // Toast helper
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

  // Create container if not present
  function ensureMobileRoot(){
    let root = document.querySelector(".mobile-feed");
    if (!root){
      root = document.createElement("div");
      root.className = "mobile-feed";

      // Feed scroller
      const scroller = document.createElement("div");
      scroller.className = "m-feed-scroll";
      root.appendChild(scroller);

      // Bottom nav
      const nav = document.createElement("nav");
      nav.className = "m-nav";
      nav.innerHTML = `
        <button data-tab="home" aria-current="page">🏠<span>Home</span></button>
        <button data-tab="search">🔎<span>Search</span></button>
        <button data-tab="favs">★<span>Favs</span></button>
        <button data-tab="library">📚<span>Library</span></button>
      `;
      root.appendChild(nav);
      document.body.appendChild(root);

      nav.addEventListener("click", (e)=>{
        const btn = e.target.closest("button");
        if (!btn) return;
        $$("[data-tab]", nav).forEach(b => b.removeAttribute("aria-current"));
        btn.setAttribute("aria-current", "page");
        const tab = btn.getAttribute("data-tab");
        if (tab === "library"){
          const loadBtn = document.getElementById("openRW") || document.querySelector("[data-openrw]");
          if (loadBtn) loadBtn.click();
        }else if (tab === "favs"){
          const favBtn = document.getElementById("toggleFavs") || document.querySelector("[data-toggle-favs]");
          if (favBtn) favBtn.click();
          toast("Showing favorites");
        }else if (tab === "search"){
          const s = document.getElementById("searchBox") || document.querySelector("input[type='search']");
          if (s){ s.focus(); s.scrollIntoView({block:'center'}); }
        }else{
          const clear = document.getElementById("clearFilters") || document.querySelector("[data-clear]");
          if (clear) clear.click();
        }
      });
    }

    // Mark page as mobile-active so desktop UI hides
    if (isMobile()) document.body.classList.add("mobile-active");
    else document.body.classList.remove("mobile-active");

    return root;
  }

  // Turn one "prompt" record into a card
  function renderCard(p){
    const card = document.createElement("section");
    card.className = "m-card";
    card.dataset.id = p.id || p.title || Math.random().toString(36).slice(2);

    const media = document.createElement("div");
    media.className = "m-card-media";

    let imgSrc = null;
    if (p.cover && typeof p.cover === "string") imgSrc = p.cover;
    if (!imgSrc && Array.isArray(p.images) && p.images.length) imgSrc = p.images[0];
    if (!imgSrc && p.mainImage) imgSrc = p.mainImage;
    if (!imgSrc) imgSrc = p.image || p.preview || "";

    const img = document.createElement("img");
    img.decoding = "async";
    img.loading = "lazy";
    img.alt = p.title || "image";
    if (imgSrc) img.src = imgSrc;
    media.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "m-card-meta";
    const t = document.createElement("div");
    t.className = "m-title";
    t.textContent = p.title || "Untitled";
    const tags = document.createElement("div");
    tags.className = "m-tags";
    (p.tags || []).slice(0,12).forEach(tag => {
      const chip = document.createElement("span");
      chip.className = "m-tag";
      chip.textContent = tag;
      tags.appendChild(chip);
    });
    meta.appendChild(t);
    meta.appendChild(tags);

    const actions = document.createElement("div");
    actions.className = "m-actions";
    const gated = [
      { key:"download", icon:"⬇️", label:"Download", action: () => tryDownload(p, imgSrc) },
      { key:"add",      icon:"➕", label:"New",      action: () => tryNewPrompt(p) },
      { key:"cover",    icon:"📌", label:"Cover",    action: () => trySetCover(p, imgSrc) },
      { key:"delete",   icon:"🗑️", label:"Delete",   action: () => tryDeleteImage(p, imgSrc) },
      { key:"nsfw",     icon:"⚑",  label:(p.nsfwMode || "AUTO"), action: () => tryToggleNSFW(p) },
    ];
    gated.forEach(g => {
      const btn = document.createElement("button");
      btn.className = "m-action";
      btn.innerHTML = `<span>${g.icon}</span>`;
      btn.title = g.label;
      if (!state.rw){
        btn.classList.add("is-disabled");
        btn.disabled = true;
      }else{
        btn.addEventListener("click", (e)=>{ e.stopPropagation(); g.action && g.action(); });
      }
      const wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.justifyItems = "center";
      wrap.appendChild(btn);
      const lab = document.createElement("div");
      lab.className = "m-action-label";
      lab.textContent = g.label;
      wrap.appendChild(lab);
      actions.appendChild(wrap);
    });

    card.appendChild(media);
    card.appendChild(meta);
    card.appendChild(actions);
    return card;
  }

  // Action shims
  function tryDownload(p, src){
    const dl = window.PV && window.PV.downloadImage;
    if (dl){ dl(p, src); } else { toast("Download (requires RW)"); }
  }
  function tryNewPrompt(){
    const fn = window.PV && window.PV.openNewPromptView || (window.PV && window.PV.createPrompt);
    if (fn){ fn(); } else { toast("Add new prompt (requires RW)"); }
  }
  function trySetCover(p, src){
    const fn = window.PV && window.PV.setCoverImage;
    if (fn){ fn(p, src); } else { toast("Set cover (requires RW)"); }
  }
  function tryDeleteImage(p, src){
    const fn = window.PV && window.PV.deleteImageFromPrompt;
    if (fn){ fn(p, src); } else { toast("Delete image (requires RW)"); }
  }
  function tryToggleNSFW(p){
    const fn = window.PV && window.PV.toggleNSFWMode;
    if (fn){ fn(p); } else { toast("Toggle NSFW (requires RW)"); }
  }

  // Data helpers
  function getPrompts(){
    const arr = (state.filtered && Array.isArray(state.filtered) && state.filtered.length)
      ? state.filtered
      : state.all;
    if (Array.isArray(arr)) return arr.map((x,i)=> normalizePrompt(x, i));
    return [];
  }
  function normalizePrompt(x, i){
    return {
      id: x.id || x.ID || x.title || ("p_" + i),
      title: x.title || x.name || `Prompt #${i+1}`,
      tags: x.tags || x.keywords || [],
      nsfwMode: x.nsfwMode || x.nsfw || x.safety,
      cover: x.cover || (x.images && x.images[0]),
      images: x.images || x.files || (x.image ? [x.image] : []),
      mainImage: x.mainImage || x.preview
    };
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

  // Expose so desktop code can re-render mobile after filters/search
  window.MobileUI = { mountFeed };

  document.addEventListener("DOMContentLoaded", mountFeed);
  window.addEventListener("resize", mountFeed);
  window.addEventListener("pv:data", mountFeed);
})();
