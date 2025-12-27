(function(){
  'use strict';

  // UI refs
  const els = {
    pickRW:      document.getElementById('pickRW'),
    pickDirRO:   document.getElementById('pickDirRO'),
    pickFiles:   document.getElementById('pickFiles'),
    scanZip:     document.getElementById('scanZip'),
    zipInput:    document.getElementById('zipInput'),

    statTotal:   document.getElementById('statTotal'),
    statImages:  document.getElementById('statImages'),
    statRoot:    document.getElementById('statRoot'),
    fileList:    document.getElementById('fileList'),

    fmtRadios:   () => document.querySelector('input[name="fmt"]:checked'),
    quality:     document.getElementById('quality'),
    qualityVal:  document.getElementById('qualityVal'),
    speed:       document.getElementById('speed'),
    concurrency: document.getElementById('concurrency'),
    concVal:     document.getElementById('concVal'),

    btnConvert:  document.getElementById('btnConvert'),
    downloadZip: document.getElementById('downloadZip'),

    convBar:     document.getElementById('convBar'),
    convPct:     document.getElementById('convPct'),
    convCount:   document.getElementById('convCount'),
    zipBar:      document.getElementById('zipBar'),
    zipPct:      document.getElementById('zipPct'),
    log:         document.getElementById('convLog'),

    capNote:     document.getElementById('capabilityNote'),
    capBanner:   document.getElementById('capBanner'),
    capText:     document.getElementById('capText'),
  };

  // State
  const S = {
    mode: 'RO',
    rootName: '—',
    rwRoot: null,
    files: [],
    images: [],
    caps: { webcodecsAvif:false, webcodecsWebp:false, canvasAvif:false, canvasWebp:false, rwAvailable:false },
    converting: false,
    zipObjectUrl: null
  };

  const IMAGE_RE = /\.(png|jpg|jpeg|webp|avif)$/i;

  /* ===== Utils ===== */
  const log = (msg) => {
    const t = new Date().toLocaleTimeString();
    els.log.textContent += `🟦 [${t}] ${msg}\n`;
    els.log.scrollTop = els.log.scrollHeight;
  };
  const setConvProgress = (done, total) => {
    const pct = total ? Math.floor((done/total)*100) : 0;
    els.convBar.style.width = pct + '%';
    els.convPct.textContent = pct + '%';
    els.convCount.textContent = `${done} / ${total}`;
  };
  const setZipProgress = (pct) => {
    const p = Math.floor(pct);
    els.zipBar.style.width = p + '%';
    els.zipPct.textContent = p + '%';
  };
  const resetUI = () => {
    els.statTotal.textContent = '0';
    els.statImages.textContent = '0';
    els.statRoot.textContent = '—';
    els.fileList.innerHTML = '';
    setConvProgress(0,0);
    setZipProgress(0);
    els.downloadZip.style.display = 'none';
    if (S.zipObjectUrl) { URL.revokeObjectURL(S.zipObjectUrl); S.zipObjectUrl = null; }
  };

  const niceBytes = (n) => {
    if (!Number.isFinite(n)) return '—';
    const u = ['B','KB','MB','GB','TB']; let i=0;
    while(n>=1024 && i<u.length-1){ n/=1024; i++; }
    return `${n.toFixed(1)} ${u[i]}`;
  };

  /* ===== Capability detection ===== */
  async function detectCapabilities(){
    S.caps.rwAvailable = !!(window.showDirectoryPicker && window.isSecureContext);

    const hasWE = 'ImageEncoder' in window;
    let wcAvif = false, wcWebp = false;
    if (hasWE && window.ImageEncoder?.isConfigSupported) {
      try { wcAvif = !!(await ImageEncoder.isConfigSupported({ type:'image/avif', quality:0.6 })).supported; } catch {}
      try { wcWebp = !!(await ImageEncoder.isConfigSupported({ type:'image/webp', quality:0.8 })).supported; } catch {}
    }

    const testCanvasType = (type) => new Promise((res)=>{
      const c = document.createElement('canvas');
      c.width = c.height = 2; c.getContext('2d').fillRect(0,0,2,2);
      if (!c.toBlob) return res(false);
      c.toBlob((b)=> res(!!b), type, 0.75);
    });

    const canAvif = await testCanvasType('image/avif');
    const canWebp = await testCanvasType('image/webp');

    S.caps.webcodecsAvif = wcAvif;
    S.caps.webcodecsWebp = wcWebp;
    S.caps.canvasAvif = canAvif;
    S.caps.canvasWebp = canWebp;

    const parts = [];
    parts.push(`🔐 RW: ${S.caps.rwAvailable ? 'yes' : 'no'}`);
    parts.push(`🧩 WC AVIF: ${wcAvif ? 'yes' : 'no'}`);
    parts.push(`🧩 WC WebP: ${wcWebp ? 'yes' : 'no'}`);
    parts.push(`🖌️ Canvas AVIF: ${canAvif ? 'yes' : 'no'}`);
    parts.push(`🖌️ Canvas WebP: ${canWebp ? 'yes' : 'no'}`);
    els.capNote.textContent = parts.join(' • ');

    const wantAvif = () => (document.querySelector('input[name="fmt"]:checked')?.value || 'avif') === 'avif';
    const showBanner = wantAvif() && !(wcAvif || canAvif);
    els.capBanner.style.display = showBanner ? 'block' : 'none';
    els.capText.textContent =
      'AVIF encode not available — choose WebP or try a Chromium browser with AVIF encode support.';
  }

  /* ===== Intake helpers ===== */
  function summarizeAndEnable(){
    els.statTotal.textContent = S.files.length;
    els.statImages.textContent = S.images.length;
    els.statRoot.textContent = S.rootName;

    els.fileList.innerHTML = '';
    const frag = document.createDocumentFragment();
    S.files.slice(0, 250).forEach(it=>{
      const li = document.createElement('li');
      li.textContent = `${it.path}${it.isImage ? '' : ' (copy)'} — ${niceBytes(it.file.size)}`;
      frag.appendChild(li);
    });
    els.fileList.appendChild(frag);
    if (S.files.length > 250) {
      const li = document.createElement('li');
      li.textContent = `…and ${S.files.length - 250} more`;
      els.fileList.appendChild(li);
    }
    els.btnConvert.disabled = S.files.length === 0;
  }

  async function walkRW(dirHandle, relPath, out){
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.')) continue;
      if (handle.kind === 'directory') {
        await walkRW(handle, relPath ? `${relPath}/${name}` : name, out);
      } else {
        try {
          const f = await handle.getFile();
          const path = relPath ? `${relPath}/${name}` : name;
          const isImage = /\.(png|jpg|jpeg|webp|avif)$/i.test(name);
          out.push({ file:f, path, isImage });
        } catch {
          log(`⛔ Skip (no access): ${name}`);
        }
      }
    }
  }

  function absorbROFiles(fileList){
    const arr = Array.from(fileList || []);
    const out = [];
    let root = 'Picked (RO)';

    const roots = new Set();
    for (const f of arr) {
      const wrp = f.webkitRelativePath || '';
      if (wrp) roots.add(wrp.split('/')[0]);
    }
    if (roots.size === 1) root = [...roots][0];

    for (const f of arr) {
      const wrp = f.webkitRelativePath;
      const name = f.name;
      let rel = name;
      if (wrp && wrp.includes('/')) {
        const parts = wrp.split('/');
        rel = parts.slice(1).join('/') || name;
      }
      const isImage = /\.(png|jpg|jpeg|webp|avif)$/i.test(name);
      out.push({ file:f, path: rel, isImage });
    }
    return { out, root };
  }

  /* ===== Conversion ===== */
  async function decodeToBitmap(file){
    try { return await createImageBitmap(file); }
    catch {
      const url = URL.createObjectURL(file);
      try{
        const bmp = await new Promise((resolve, reject)=>{
          const img = new Image();
          img.onload = () => {
            try{
              const c = document.createElement('canvas');
              c.width = img.naturalWidth; c.height = img.naturalHeight;
              c.getContext('2d').drawImage(img, 0, 0);
              c.toBlob(b=>{
                if (!b) return reject(new Error('canvas toBlob null'));
                createImageBitmap(b).then(resolve, reject);
              });
            }catch(e){ reject(e); }
          };
          img.onerror = reject;
          img.src = url;
        });
        return bmp;
      } finally { URL.revokeObjectURL(url); }
    }
  }

  async function encodeWebCodecs(bmp, type, quality){
    const q = Math.max(1, Math.min(100, quality)) / 100;
    const cfg = { type, quality: q, width:bmp.width, height:bmp.height };
    if (type === 'image/avif') { cfg.codec = 'av1'; cfg.chroma = '444'; }
    const enc = new ImageEncoder(cfg);
    const { image } = await enc.encode(bmp);
    return await image.createBlob();
  }

  async function encodeCanvas(bmp, type, quality){
    const q = Math.max(1, Math.min(100, quality)) / 100;
    if ('OffscreenCanvas' in window) {
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      return await c.convertToBlob({ type, quality: q });
    } else {
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      return await new Promise((res, rej)=> {
        c.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), type, q);
      });
    }
  }

  async function convertOne(entry, fmt, quality){
    const type = fmt === 'avif' ? 'image/avif' : 'image/webp';
    const useWC = (fmt === 'avif' ? S.caps.webcodecsAvif : S.caps.webcodecsWebp);
    const useCanvas = (fmt === 'avif' ? S.caps.canvasAvif : S.caps.canvasWebp);

    const bmp = await decodeToBitmap(entry.file);
    let outBlob = null;
    if (useWC) {
      try { outBlob = await encodeWebCodecs(bmp, type, quality); }
      catch(e){ log(`🪫 WebCodecs failed for ${entry.path}, fallback… (${e.message||e})`); }
    }
    if (!outBlob && useCanvas) outBlob = await encodeCanvas(bmp, type, quality);
    if (!outBlob) throw new Error('No encoder available for ' + type);

    const newPath = entry.path.replace(/\.(png|jpg|jpeg|webp|avif)$/i, '') + (fmt === 'avif' ? '.avif' : '.webp');
    return { blob: outBlob, path: newPath };
  }

  async function runPool(items, worker, concurrency, onStep){
    const results = new Array(items.length);
    let next = 0, done = 0;

    async function runner(i){
      try { results[i] = await worker(items[i], i); }
      catch (e){ results[i] = null; }
      finally { done++; onStep && onStep(done, items.length); }

      while (next < items.length){
        const j = next++; await runner(j); return;
      }
    }
    const starters = [];
    const startN = Math.min(concurrency, items.length);
    next = startN;
    for (let i=0;i<startN;i++) starters.push(runner(i));
    await Promise.all(starters);
    return results;
  }

  /* ===== ZIP build ===== */
  async function buildZip(convertedMap){
    const zip = new JSZip();
    const total = S.files.length;
    let added = 0;

    for (const entry of S.files) {
      const override = convertedMap.get(entry.path);
      if (override) zip.file(override.path, override.blob);
      else zip.file(entry.path, entry.file);

      added++;
      if ((added % 50) === 0) {
        setZipProgress((added/total)*100);
        await new Promise(r=> setTimeout(r,0));
      }
    }
    setZipProgress(100);

    const blob = await zip.generateAsync({ type:'blob' }, (meta)=> setZipProgress(meta.percent));
    if (S.zipObjectUrl) URL.revokeObjectURL(S.zipObjectUrl);
    S.zipObjectUrl = URL.createObjectURL(blob);

    const ts = new Date().toISOString().replace(/[:T]/g,'-').slice(0,16);
    const name = `${S.rootName || 'converted'}-${ts}.zip`;
    els.downloadZip.href = S.zipObjectUrl;
    els.downloadZip.download = name;
    els.downloadZip.style.display = 'inline-block';
  }

  /* ===== Picks ===== */
  document.getElementById('pickRW').addEventListener('click', async ()=>{
    if (!S.caps.rwAvailable) {
      alert('R/W requires Chromium + secure origin (https/localhost).');
      return;
    }
    clearAll();
    try{
      const root = await window.showDirectoryPicker({ mode:'readwrite' });
      S.mode = 'RW'; S.rwRoot = root; S.rootName = root.name || 'RW Root';

      const out = [];
      await walkRW(root, '', out);
      S.files = out;
      S.images = out.map((v,i)=> v.isImage ? i : -1).filter(i=> i>=0);
      log(`📁 R/W folder: ${out.length} entries, ${S.images.length} image(s)`);
      summarizeAndEnable();
    } catch { log('🕳️ R/W picker cancelled.'); }
  });

  document.getElementById('pickDirRO').addEventListener('change', (e)=>{
    clearAll();
    const { out, root } = absorbROFiles(e.target.files);
    S.mode = 'RO'; S.rootName = root || 'RO Folder';
    S.files = out;
    S.images = out.map((v,i)=> v.isImage ? i : -1).filter(i=> i>=0);
    log(`📁 RO folder: ${out.length} entries, ${S.images.length} image(s)`);
    summarizeAndEnable();
  });

  document.getElementById('pickFiles').addEventListener('change', (e)=>{
    clearAll();
    const { out, root } = absorbROFiles(e.target.files);
    S.mode = 'RO'; S.rootName = root || 'RO Files';
    S.files = out;
    S.images = out.map((v,i)=> v.isImage ? i : -1).filter(i=> i>=0);
    log(`🧩 RO files: ${out.length} entries, ${S.images.length} image(s)`);
    summarizeAndEnable();
  });

  document.getElementById('scanZip').addEventListener('click', ()=> document.getElementById('zipInput').click());
  document.getElementById('zipInput').addEventListener('change', async (e)=>{
    clearAll();
    const f = e.target.files?.[0];
    if (!f) return;
    try{
      log(`🗜️ Reading ZIP: ${f.name}`);
      const ab = await f.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const out = [];
      let root = f.name.replace(/\.zip$/i,'');
      const files = Object.values(zip.files).filter(zf => !zf.dir);

      for (const zf of files) {
        const blob = await zf.async('blob');
        const name = zf.name.replace(/^\/+/,'');
        const isImage = /\.(png|jpg|jpeg|webp|avif)$/i.test(name);
        out.push({ file: new File([blob], name), path: name, isImage });
        const top = name.split('/')[0];
        if (top && top !== '.' && top !== '..') root = top;
      }
      S.mode = 'RO'; S.rootName = root || 'ZIP';
      S.files = out;
      S.images = out.map((v,i)=> v.isImage ? i : -1).filter(i=> i>=0);
      log(`🗜️ ZIP: ${out.length} entries, ${S.images.length} image(s)`);
      summarizeAndEnable();
    } catch(err){
      log('⛔ ZIP parse failed: ' + (err.message||err));
      alert('Failed to read ZIP.');
    } finally { e.target.value = ''; }
  });

  // Options bindings
  els.quality.addEventListener('input', ()=> els.qualityVal.textContent = els.quality.value);
  els.concurrency.addEventListener('input', ()=> els.concVal.textContent = els.concurrency.value);
  document.addEventListener('change', (e)=>{
    if (e.target && e.target.name === 'fmt') {
      const needAvif = e.target.value === 'avif';
      const avifAvail = S.caps.webcodecsAvif || S.caps.canvasAvif;
      els.capBanner.style.display = (needAvif && !avifAvail) ? 'block' : 'none';
    }
  });

  /* ===== Convert ===== */
  els.btnConvert.addEventListener('click', async ()=>{
    if (S.converting || !S.files.length) return;

    S.converting = true;
    els.btnConvert.disabled = true;
    els.downloadZip.style.display = 'none';
    setConvProgress(0, S.images.length);
    setZipProgress(0);
    els.log.textContent = '';

    const fmt = els.fmtRadios().value;        // 'avif' | 'webp'
    const quality = parseInt(els.quality.value, 10);
    const conc = parseInt(els.concurrency.value, 10);

    log(`▶️ Start: ${S.images.length} image(s), ${fmt}, q=${quality}, parallel=${conc}`);

    try{
      const imageEntries = S.images.map(i => S.files[i]);

      const results = await runPool(
        imageEntries,
        async (entry) => {
          try {
            const r = await convertOne(entry, fmt, quality);
            log(`✅ ${entry.path} → ${r.path}`);
            return { ok:true, from:entry.path, to:r.path, blob:r.blob };
          } catch (e){
            log(`❌ ${entry.path} — ${e.message||e}`);
            return { ok:false, from:entry.path };
          }
        },
        conc,
        (done,total)=> setConvProgress(done,total)
      );

      const convertedMap = new Map();
      let success = 0;
      for (const r of results) {
        if (r && r.ok) { convertedMap.set(r.from, { path:r.to, blob:r.blob }); success++; }
      }
      log(`🏁 Conversion: ${success}/${results.length} succeeded.`);

      await buildZip(convertedMap);
      log('📦 ZIP ready — use “⬇️ Download ZIP”.');
    } catch (e){
      log('💥 Fatal: ' + (e.message||e));
      alert('Conversion failed. See log for details.');
    } finally {
      S.converting = false;
      els.btnConvert.disabled = false;
    }
  });

  /* ===== Helpers ===== */
  function clearAll(){
    resetUI();
    els.log.textContent = '';
  }

  /* ===== Boot ===== */
  (async function boot(){
    await detectCapabilities();
  })();

})();
