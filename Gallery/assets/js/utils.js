(function () {
  const { $, state } = PV;

  function showOverlay(){ $('#libraryOverlay')?.classList?.remove('hidden'); }
  function hideOverlay(){ $('#libraryOverlay')?.classList?.add('hidden'); }

  const isIOS    = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  function configureOverlayForEnv(){
    const rwBtn = $('#libRW');
    const folderBtn = $('#libFolder');
    const zipBtn = $('#libZip');
    const hint = document.querySelector('.dz-hint');
    if (isIOS) {
      rwBtn?.setAttribute('disabled','');
      folderBtn?.setAttribute('disabled','');
      zipBtn?.removeAttribute('disabled');
      if (hint) hint.textContent = 'On iPhone/iPad, pick a .zip of your /prompts folder.';
    }
  }

  async function entriesToFiles(items){
    const out = [];
    const walkers = [];
    for (const it of items) {
      const entry = it.webkitGetAsEntry?.();
      if (!entry) continue;
      walkers.push(walkEntry(entry, out));
    }
    await Promise.all(walkers);
    return out;
  }
  async function walkEntry(entry, out){
    if (entry.isFile) {
      await new Promise((res, rej) => entry.file(f => { out.push(f); res(); }, rej));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const batch = await new Promise((res,rej) => reader.readEntries(res, rej));
      await Promise.all(batch.map(ch => walkEntry(ch, out)));
      if (batch.length){
        let more;
        while((more = await new Promise((res,rej)=> reader.readEntries(res, rej))).length){
          await Promise.all(more.map(ch=> walkEntry(ch, out)));
        }
      }
    }
  }

  let __pv_padRight = '';
  function lockScroll(){
    const doc = document.documentElement;
    const body = document.body;
    const sw = window.innerWidth - doc.clientWidth;
    __pv_padRight = body.style.paddingRight || '';
    if (sw > 0) body.style.paddingRight = sw + 'px';
    body.classList.add('no-scroll');
  }
  function unlockScroll(){
    const body = document.body;
    body.classList.remove('no-scroll');
    body.style.paddingRight = __pv_padRight;
    __pv_padRight = '';
  }

  function toastCopied(btn){
    btn.classList.add('is-ok');
    const prev = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.disabled = true;
    setTimeout(() => { btn.classList.remove('is-ok'); btn.textContent = prev; btn.disabled = false; }, 900);
  }

  async function readJSONFile(f){ return JSON.parse(await f.text()); }
  async function readJSONHandle(h){ const f = await h.getFile(); return JSON.parse(await f.text()); }

  async function openBestPicker(){
    const zipInput = document.getElementById('zipInput');
    if (isMobile) { zipInput?.click(); return; }
    if (window.showDirectoryPicker && window.isSecureContext) {
      // Let app.js decide to call RW path
      throw new Error('Use handleOpenRW() caller path');
    }
    document.getElementById('dirInput')?.click();
  }

  function setBadge(cardEl, isNsfw){
    const badge = cardEl.querySelector('.badge');
    if (!badge) return;
    badge.textContent = isNsfw ? 'NSFW' : 'SFW';
  }

  PV.showOverlay = showOverlay;
  PV.hideOverlay = hideOverlay;
  PV.isIOS = isIOS;
  PV.isMobile = isMobile;
  PV.configureOverlayForEnv = configureOverlayForEnv;
  PV.entriesToFiles = entriesToFiles;
  PV.lockScroll = lockScroll;
  PV.unlockScroll = unlockScroll;
  PV.toastCopied = toastCopied;
  PV.readJSONFile = readJSONFile;
  PV.readJSONHandle = readJSONHandle;
  PV.openBestPicker = openBestPicker;
  PV.setBadge = setBadge;
})();
