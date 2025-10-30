
(function () {
  const { $, $$, state } = PV;
  let timer = null;
  let pool = [];
  let urls = [];
  let idx = 0;

  function enterFullscreen(el){
    const target = el || document.documentElement;
    const req = target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen;
    if (req) try{ req.call(target); }catch{}
  }
  function exitFullscreen(){
    const ex = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (ex) try{ ex.call(document); }catch{}
  }

  function show(i){
    idx = i;
    const img = $('#slideshowImg');
    if (!img) return;
    const h = pool[idx]?.handle;
    if (!h) return;
    const existing = urls[idx];
    if (existing) img.src = existing;
    else PV.loadObjectURL(h).then(u => { urls[idx]=u; if (idx===i) img.src = u; });
  }

  function pickNextRandom(){
    if (!pool.length) return 0;
    if (pool.length === 1) return 0;
    let next = Math.floor(Math.random() * pool.length);
    if (next === idx) next = (idx + 1) % pool.length;
    return next;
  }

  function startTimer(){
    const sec = Math.max(2, Math.min(120, parseInt($('#slideshowInterval')?.value || '5', 10)));
    savePref('slideshowSec', sec);
    stopTimer();
    timer = setInterval(() => { show(pickNextRandom()); }, sec * 1000);
    $('#slideshowPlay')?.setAttribute('disabled','true');
    $('#slideshowPause')?.removeAttribute('disabled');
  }
  function stopTimer(){
    if (timer) { clearInterval(timer); timer = null; }
    $('#slideshowPlay')?.removeAttribute('disabled');
    $('#slideshowPause')?.setAttribute('disabled','true');
  }

  function openSlideshow(list){
    fitControls();
    pool = list || [];
    // revoke any old URLs
    urls.forEach(u => { try { if (u) URL.revokeObjectURL(u); } catch{} });
    urls = new Array(pool.length);
    idx = 0;
    $('#slideshowView')?.setAttribute('aria-hidden','false');
    document.body.classList.add('no-scroll');
    show(0);
  }

  function closeSlideshow(){
    stopTimer();
    // cleanup URLs to avoid leaks
    urls.forEach(u => { try { if (u) URL.revokeObjectURL(u); } catch{} });
    urls = [];
    $('#slideshowView')?.setAttribute('aria-hidden','true');
    document.body.classList.remove('no-scroll');
    exitFullscreen();
  }

  function fitControls(){
    try{
      const hdr = document.querySelector('#slideshowView .slideshow-header');
      const ctr = document.querySelector('#slideshowView .slideshow-controls');
      if (!hdr || !ctr) return;
      const closeBtn = document.getElementById('slideshowClose');
      const hdrW = hdr.clientWidth;
      const closeW = closeBtn ? (closeBtn.getBoundingClientRect().width + 12) : 0;
      const avail = Math.max(120, hdrW - closeW - 12);
      ctr.style.transform = 'none';
      const need = ctr.scrollWidth;
      const scale = need > avail ? Math.max(0.7, Math.min(1, avail / need)) : 1;
      ctr.style.transform = (scale < 0.999) ? `scale(${scale})` : 'none';
    }catch(e){}
  }
  // Optional exposure (if other modules want to call it)
  PV.fitControls = fitControls;

  // debounce util local to this IIFE
  const debounce = (fn, ms=120) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  const fitDebounced = debounce(fitControls, 120);

  function initControls(){
    if (initControls._did) return; initControls._did = true;

    const interval = loadPref('slideshowSec', 5);
    const inp = $('#slideshowInterval');
    if (inp) inp.value = interval;

    $('#slideshowClose')?.addEventListener('click', closeSlideshow);
    $('#slideshowShuffle')?.addEventListener('click', () => show(pickNextRandom()));
    $('#slideshowPlay')?.addEventListener('click', () => { startTimer(); enterFullscreen($('#slideshowView')); });
    $('#slideshowPause')?.addEventListener('click', stopTimer);

    // Keep layout tidy
    window.addEventListener('resize', fitDebounced);
    window.addEventListener('orientationchange', fitDebounced);
    $('#slideshowInterval')?.addEventListener('input', fitDebounced);
    $('#slideshowShuffle')?.addEventListener('click', fitDebounced);
    $('#slideshowPlay')?.addEventListener('click', fitDebounced);
    $('#slideshowPause')?.addEventListener('click', fitDebounced);

    // Keyboard helpers (when open)
    document.addEventListener('keydown', (e)=>{
      const open = $('#slideshowView')?.getAttribute('aria-hidden') === 'false';
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); closeSlideshow(); }
      if (e.key === ' ')      { e.preventDefault(); if (timer) stopTimer(); else startTimer(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(pickNextRandom()); }
    });

    // Start from current filter (gallery button)
    $('#startSlideshow')?.addEventListener('click', ()=>{
      if (!state._lastRenderedItems?.length) return;
      const list = [];
      for (const p of state._lastRenderedItems) {
        if (p.files?.previews?.length) {
          for (const h of p.files.previews) list.push({ handle: h, id: p.id });
        }
      }
      if (list.length) openSlideshow(list);
    });

    // Start from current prompt (detail button)
    $('#detailFullscreen')?.addEventListener('click', ()=> enterFullscreen($('#detailView')));
    $('#detailSlideshow')?.addEventListener('click', ()=>{
      const dv = window.__pv_detail;
      if (!dv?.previews?.length) return;
      const list = dv.previews.map(h=>({handle:h, id: dv.p?.id }));
      openSlideshow(list);
      const small = $('#slideshowSecs');
      if (small && small.value) $('#slideshowInterval').value = small.value;
      startTimer();
      enterFullscreen($('#slideshowView'));
    });

    // Quickbar (mobile)
    document.getElementById('ssQuickPlay') ?.addEventListener('click', startTimer);
    document.getElementById('ssQuickPause')?.addEventListener('click', stopTimer);
    document.getElementById('ssQuickClose')?.addEventListener('click', closeSlideshow);
  }

  // localStorage helpers (scoped)
  function savePref(k,v){ try{ localStorage.setItem('pv:'+k, JSON.stringify(v)); }catch{} }
  function loadPref(k,f){ try{ const v = localStorage.getItem('pv:'+k); return v?JSON.parse(v):f; }catch{ return f; } }

  window.addEventListener('pv:data', ()=>{ initControls(); fitControls(); });
  document.addEventListener('DOMContentLoaded', ()=>{ initControls(); fitControls(); });
})();

