/* Mobile collections feed + gallery (TikTok style)
   - Title/Thumb overlays
   - Horizontal snap carousel
   - Collects images from DOM, state, and recursively from dirHandle (R/W)
   - Merges by data-id; else by normalized (emoji-stripped) title
*/
(function(){
  const isMobile = () => matchMedia("(max-width: 768px)").matches;
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
  const PVNS  = window.PV || (window.PV = {});
  const state = PVNS.state || (PVNS.state = {});

  const stripEmoji = s => String(s||"").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
  const normTitle  = s => stripEmoji(s).replace(/\s+/g," ").trim().toLowerCase();

  function toast(msg){
    let t = $(".m-toast");
    if (!t){ t = Object.assign(document.createElement("div"), { className:"m-toast" }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(t._hid);
    t._hid = setTimeout(()=> t.classList.remove("show"), 900);
  }

  /* ---------- string | Blob/File | FileSystemFileHandle | {url} → objectURL/string ---------- */
  async function anyToUrl(x){
    try{
      if (!x) return "";
      if (typeof x === "string") return x;
      if (x.url || x.href) return x.url || x.href;
      if (typeof x === "object" && (x instanceof Blob || ("size" in x && "type" in x && typeof x.arrayBuffer==="function")))
        return URL.createObjectURL(x);
      if (typeof x === "object" && typeof x.getFile === "function"){
        const f = await x.getFile(); return URL.createObjectURL(f);
      }
      if (window.PV?.Utils?.fileToUrl){ const u = await PV.Utils.fileToUrl(x); if (u) return u; }
    }catch(_){} return "";
  }
  async function resolveAll(raw){ const out=[]; for (const r of raw) out.push(await anyToUrl(r)); return Array.from(new Set(out.filter(Boolean))); }

  /* ---------- recursively enumerate images from dirHandle (covers /images subfolder, etc.) ---------- */
  async function listImagesDeep(handle){
    const out=[]; if (!handle || typeof handle.entries!=="function") return out;
    const ok = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

    async function walk(h){
      for await (const [name,child] of h.entries()){
        if (!child) continue;
        if (child.kind === "file"){
          if (ok.test(name||"")) out.push(child);
        } else if (child.kind === "directory"){
          await walk(child);        // ← recurse into /images or any nested folder
        }
      }
    }
    await walk(handle);

    // stable order by path/name
    out.sort((a,b)=> String(a.name||"").localeCompare(String(b.name||""),'en',{numeric:true}));
    return out;
  }

  /* ---------- scrape DOM (cover & any lazy/bg) ---------- */
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
      const m = bg && bg.startsWith("url(") && bg.match(/url\((['"]?)(.*?)\1\)/);
      if (m && m[2]) urls.add(m[2]);
    });
    return Array.from(urls);
  }

  function fromDOM(){
    const cards = $$("#grid > *, .results .grid > *, .page .grid > *, .page .card, .page .prompt, .page [data-id]");
    const list = [];
    cards.forEach((node,i)=>{
      const raw = extractUrlsFromNode(node);
      if (!raw.length) return;
      const titleEl = node.querySelector('[class*="title" i], h3, h2, .name, figcaption') || node.querySelector("[title]");
      const title = (titleEl?.textContent || titleEl?.getAttribute?.("title") || "").trim() || `Item #${i+1}`;
      const id = node.getAttribute("data-id") || "";
      list.push({ id, idOrTitle: id || normTitle(title), title, raw });
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
      return { id, idOrTitle: id || normTitle(title), title, raw, dirHandle: x.dirHandle || x.handle || null };
    });
  }

  function mergeRaw(domList, stateList){
    const map = new Map();
    domList.forEach(p=> map.set(p.idOrTitle, { id:p.id, title:p.title, raw:[...(p.raw||[])], dirHandle:null }));
    stateList.forEach(p=>{
      const cur = map.get(p.idOrTitle);
      if (cur){
        cur.id = cur.id || p.id;
        cur.title = cur.title || p.title;
        cur.raw.push(...(p.raw||[]));
        if (p.dirHandle) cur.dirHandle = p.dirHandle;
      } else {
        map.set(p.idOrTitle, { id:p.id, title:p.title, raw:[...(p.raw||[])], dirHandle:p.dirHandle||null });
      }
    });
    return Array.from(map.values());
  }

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
    card.className = "m-card"; if (p.id) card.dataset.id = p.id;

    const header  = document.createElement("div"); header.className  = "m-header";
    const titleEl = document.createElement("div"); titleEl.className = "m-title"; titleEl.textContent = p.title || "Untitled";
    header.appendChild(titleEl);

    const carousel = document.createElement("div"); carousel.className = "m-carousel";
    const track    = document.createElement("div"); track.className    = "m-track";
    carousel.appendChild(track);

    const tapL = document.createElement("div"); tapL.className = "m-tap-left";
    const tapR = document.createElement("div"); tapR.className = "m-tap-right";
    carousel.appendChild(tapL); carousel.appendChild(tapR);

    urls.forEach(u=>{
      const item = document.createElement("div"); item.className = "m-item";
      const img  = document.createElement("img"); img.alt = p.title || "image"; img.loading = "lazy"; img.decoding = "async"; img.src = u;
      item.appendChild(img); track.appendChild(item);
    });

    const thumbs = document.createElement("div"); thumbs.className = "m-thumbs";
    urls.forEach((u,i)=>{
      const t = document.createElement("img");
      t.className = "m-thumb" + (i===0 ? " is-on" : ""); t.src = u; t.alt = `thumb ${i+1}`;
      t.addEventListener("click", ()=>{ track.scrollTo({ left: i * track.clientWidth, behavior:'smooth' }); setThumb(i); });
      thumbs.appendChild(t);
    });

    const setThumb = (idx)=> Array.from(thumbs.children).forEach((el,i)=> el.classList.toggle("is-on", i===idx));
    const advance  = (dir)=>{ const w=track.clientWidth, cur=Math.round(track.scrollLeft/w); const next=Math.max(0,Math.min(cur+dir,urls.length-1)); track.scrollTo({left: next*w, behavior:'smooth'}); setThumb(next); };
    tapL.addEventListener("click", e=>{ e.stopPropagation(); advance(-1); });
    tapR.addEventListener("click", e=>{ e.stopPropagation(); advance(+1); });
    track.addEventListener("scroll", ()=>{ const i=Math.round(track.scrollLeft/track.clientWidth); setThumb(Math.max(0,Math.min(i,urls.length-1))); }, {passive:true});

    carousel.addEventListener("click", e=>{ const x=e.clientX, w=carousel.clientWidth; if (x>w*0.33 && x<w*0.67) openPrompt(p); });

    card.appendChild(carousel); card.appendChild(header); card.appendChild(thumbs);
    return card;
  }

  async function mountGallery(){
    const root = ensureMobileRoot();
    const sc   = root.querySelector(".m-feed-scroll");
    sc.innerHTML = "";

    const merged = mergeRaw(fromDOM(), fromStateRaw());
    if (!merged.length){ sc.innerHTML = `<div style="height:calc(100vh - 56px);display:grid;place-items:center">No items. Load Library or adjust filters.</div>`; return; }

    const box = document.createElement("div"); box.className = "m-gallery"; sc.appendChild(box);

    for (const p of merged){
      let raw = p.raw || [];
      if (p.dirHandle) raw = raw.concat(await listImagesDeep(p.dirHandle)); /* RECURSIVE */
      const urls = await resolveAll(raw);
      for (const u of urls){
        const img = document.createElement("img"); img.className="m-g-img"; img.alt=p.title||"image";
        img.loading="lazy"; img.decoding="async"; img.src=u; img.addEventListener("click", ()=> openPrompt(p));
        box.appendChild(img);
      }
    }
  }

  async function mountFeed(){
    if (!isMobile()) { document.body.classList.remove("mobile-active"); return; }
    document.body.classList.add("mobile-active");

    const root = ensureMobileRoot();
    const sc   = root.querySelector(".m-feed-scroll");
    if (!sc) return; sc.innerHTML = "";

    const merged = mergeRaw(fromDOM(), fromStateRaw());
    if (!merged.length){ sc.innerHTML = `<div style="height:calc(100vh - 56px);display:grid;place-items:center">No items. Load Library or adjust filters.</div>`; return; }

    for (const p of merged){
      let raw = p.raw || [];
      if (p.dirHandle) raw = raw.concat(await listImagesDeep(p.dirHandle)); /* RECURSIVE */
      const urls = await resolveAll(raw);
      const card = renderCardResolved(p, urls);
      if (card) sc.appendChild(card);
    }
  }

  function ensureMobileRoot(){
    let root = $(".mobile-feed");
    if (!root){
      root = document.createElement("div");
      root.className = "mobile-feed";
      root.innerHTML = `
        <div class="m-feed-scroll"></div>
        <nav class="m-nav">
          <button data-tab="search" aria-current="page">🔎<span>Search</span></button>
          <button data-tab="favs">★<span>Favs</span></button>
          <button data-tab="gallery">🖼️<span>Gallery</span></button>
          <button data-tab="library">📚<span>Library</span></button>
        </nav>
        <div class="m-toast" hidden></div>`;
      document.body.appendChild(root);
      wireNav(root.querySelector(".m-nav"));
    }
    document.body.classList.toggle("mobile-active", isMobile());
    return root;
  }

  function wireNav(nav){
    if (!nav || nav._wired) return; nav._wired = true;
    nav.addEventListener("click", (e)=>{
      const btn = e.target.closest("button[data-tab]"); if (!btn) return;
      nav.querySelectorAll("button[data-tab]").forEach(b => b.removeAttribute("aria-current"));
      btn.setAttribute("aria-current","page");
      const tab = btn.getAttribute("data-tab");

      if (tab === "library"){
        (document.getElementById("openRW") || document.getElementById("libRW") ||
         document.getElementById("libFolder") || document.getElementById("libZip"))?.click();
        const overlay = document.getElementById("libraryOverlay");
        if (overlay){
          const setFlag = ()=>{
            const hidden = overlay.classList.contains("hidden") || overlay.getAttribute("aria-hidden")==="true";
            document.body.classList.toggle("overlay-open", !hidden);
            if (hidden){ mountFeed(); }
          };
          setFlag();
          new MutationObserver(setFlag).observe(overlay, { attributes:true, attributeFilter:["class","aria-hidden"] });
        }
        return;
      }
      if (tab === "favs"){ document.getElementById("toggleFavs")?.click(); toast("Favorites toggled"); setTimeout(mountFeed, 60); return; }
      if (tab === "search"){
        const s = document.getElementById("searchBox"); if (s){ s.focus(); s.scrollIntoView({block:"center"}); }
        else { const q = prompt("Search:"); if (q != null){ state.q = String(q); window.__pv_applyFilters?.(); } }
        setTimeout(mountFeed, 60); return;
      }
      if (tab === "gallery"){ mountGallery(); return; }
    });
  }

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
