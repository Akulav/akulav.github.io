
(function () {
  const { $, $$, state } = PV;
  let timer = null;
  let pool = [];     // {id, handle}
  let urls = [];     // cached blob urls in same order as pool
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
    pool = list || [];
    urls.forEach(u => URL.revokeObjectURL(u));
    urls = new Array(pool.length);
    idx = 0;
    $('#slideshowView')?.setAttribute('aria-hidden','false');
    document.body.classList.add('no-scroll');
    show(0);
  }
  function closeSlideshow(){
    stopTimer();
    $('#slideshowView')?.setAttribute('aria-hidden','true');
    document.body.classList.remove('no-scroll');
    exitFullscreen();
  }

  function initControls(){
    const interval = loadPref('slideshowSec', 5);
    const inp = $('#slideshowInterval');
    if (inp) inp.value = interval;

    $('#slideshowClose')?.addEventListener('click', closeSlideshow);
    $('#slideshowShuffle')?.addEventListener('click', () => show(pickNextRandom()));
    $('#slideshowPlay')?.addEventListener('click', () => { startTimer(); enterFullscreen($('#slideshowView')); });
    $('#slideshowPause')?.addEventListener('click', stopTimer);

    // Keyboard: ESC to close
    document.addEventListener('keydown', (e)=>{
      if ($('#slideshowView')?.getAttribute('aria-hidden') === 'false' && e.key === 'Escape') { e.preventDefault(); closeSlideshow(); }
      if ($('#slideshowView')?.getAttribute('aria-hidden') === 'false' && e.key === ' ') { e.preventDefault(); if (timer) stopTimer(); else startTimer(); }
    });

    // Wire gallery button (uses current rendered thumbnails)
    $('#startSlideshow')?.addEventListener('click', ()=>{
      if (!state._lastRenderedItems?.length) return;
      const list = [];
      for (const p of state._lastRenderedItems) {
        if (p.files?.previews?.length) for (const h of p.files.previews) list.push({ handle: h, id: p.id });
      }
      if (list.length) openSlideshow(list);
    });

    // Wire detail buttons
    $('#detailFullscreen')?.addEventListener('click', ()=> enterFullscreen($('#detailView')));
    $('#detailSlideshow')?.addEventListener('click', ()=>{
      // Build pool from current detail previews if any
      const dv = window.__pv_detail;
      if (!dv?.previews?.length) return;
      const list = dv.previews.map(h=>({handle:h, id: dv.p?.id }));
      openSlideshow(list);
      // Use seconds from the small input beside the button
      const small = $('#slideshowSecs');
      if (small && small.value){
        $('#slideshowInterval').value = small.value;
      }
      startTimer();
      enterFullscreen($('#slideshowView'));
    });
  }

  // simple localStorage helpers shared elsewhere
  function savePref(k,v){ try{ localStorage.setItem('pv:'+k, JSON.stringify(v)); }catch{} }
  function loadPref(k,f){ try{ const v = localStorage.getItem('pv:'+k); return v?JSON.parse(v):f; }catch{ return f; } }

  window.addEventListener('pv:data', initControls);
  document.addEventListener('DOMContentLoaded', initControls);
})();
