/* ===========================
   Prompt → AVIF (Local Only)
   =========================== */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const IMG_RE = /\.(png|jpe?g|webp|bmp|gif|tif|tiff)$/i;

// UI refs
const pickFolder = $('#pickFolder');
const btnScan    = $('#btnScan');
const summary    = $('#summary');
const statTotal  = $('#statTotal');
const statImages = $('#statImages');
const statAvif   = $('#statAvif');
const grid       = $('#previewGrid');

const convertSec = $('#convert');
const btnConvert = $('#btnConvert');
const qualityInp = $('#quality');
const qualityVal = $('#qualityVal');
const prog       = $('#prog');
const progText   = $('#progText');

const resultRow  = $('#resultRow');
const btnDownload= $('#btnDownload');
const resultInfo = $('#resultInfo');

const fallback   = $('#fallback');
const supportBadge = $('#supportBadge');

let currentFiles = [];
let lastZipBlob  = null;

/* ========= Feature Detection ========= */
async function detectAvifEncode() {
  // Try WebCodecs (preferred)
  let wc = false;
  if ('ImageEncoder' in window && typeof ImageEncoder.isTypeSupported === 'function') {
    try { wc = await ImageEncoder.isTypeSupported('image/avif'); } catch {}
  }
  // Try Canvas toBlob/convertToBlob
  let canvasOK = false;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    canvasOK = await new Promise(res => c.toBlob(b => res(!!b), 'image/avif', 0.8));
  } catch {}
  return { webcodecs: !!wc, canvas: !!canvasOK, any: !!(wc || canvasOK) };
}

function setSupportBadge(support) {
  if (support.any) {
    const label = support.webcodecs ? 'WebCodecs' : 'Canvas';
    supportBadge.textContent = `AVIF encode: available (${label})`;
    supportBadge.classList.remove('muted');
  } else {
    supportBadge.textContent = 'AVIF encode: not available — using fallback path (may fail)';
    fallback.classList.remove('hidden');
  }
}

/* ========= Image helpers ========= */
async function decodeBitmap(file) {
  // createImageBitmap is fast and doesn’t layout
  const bmp = await createImageBitmap(file);
  return bmp;
}

async function canvasToAvif(bitmap, quality = 0.72) {
  // Prefer OffscreenCanvas if present
  if ('OffscreenCanvas' in window) {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d', { alpha: true, desynchronized: true });
    ctx.drawImage(bitmap, 0, 0);
    // convertToBlob is widely supported on OffscreenCanvas
    const blob = await c.convertToBlob({ type: 'image/avif', quality });
    bitmap.close?.();
    return blob;
  } else {
    // Fallback to HTMLCanvasElement -> toBlob
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    c.getContext('2d').drawImage(bitmap, 0, 0);
    const blob = await new Promise(res => c.toBlob(res, 'image/avif', quality));
    bitmap.close?.();
    return blob;
  }
}

function extToAvif(path) {
  return path.replace(/\.[^.]+$/, '.avif');
}

/* ========= Scan & Preview ========= */
function summarizeFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.size >= 0);
  currentFiles = files;

  const total = files.length;
  let img = 0, avif = 0;

  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    if (IMG_RE.test(rel)) img++;
    if (/\.avif$/i.test(rel)) avif++;
  }

  statTotal.textContent  = String(total);
  statImages.textContent = String(img);
  statAvif.textContent   = String(avif);

  summary.classList.remove('hidden');
  convertSec.classList.remove('hidden');
  renderPreviewGrid(files);
}

function renderPreviewGrid(files) {
  grid.innerHTML = '';
  // show up to 48 thumbnails to avoid memory spikes
  const thumbs = files.filter(f => IMG_RE.test(f.webkitRelativePath || f.name)).slice(0, 48);

  if (!thumbs.length) {
    grid.innerHTML = `<div class="muted">No image files detected. Make sure you picked your <code>prompts</code> folder.</div>`;
    return;
  }

  thumbs.forEach(file => {
    const url = URL.createObjectURL(file);
    const card = document.createElement('div');
    card.className = 'card';

    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = url;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('load', () => URL.revokeObjectURL(url));

    const meta = document.createElement('div');
    meta.className = 'meta';
    const base = (file.webkitRelativePath || file.name).split('/').slice(-1)[0];
    meta.innerHTML = `<strong>${base}</strong><span>${Math.round(file.size/1024)} KB</span>`;

    card.append(img, meta);
    grid.appendChild(card);
  });
}

/* ========= Convert → ZIP ========= */
async function convertFolderToAvifZip(fileList, { quality = 0.72, onProgress = () => {} } = {}) {
  const files = Array.from(fileList).filter(f => f.size >= 0);
  const zip = new JSZip();

  // We keep exact relative paths
  const items = files.map(f => ({
    file: f,
    rel: (f.webkitRelativePath || f.name).replace(/^[\/]+/, ''),
    isImage: IMG_RE.test(f.webkitRelativePath || f.name),
    isAVIF: /\.avif$/i.test(f.webkitRelativePath || f.name),
  }));

  const total = items.length;
  let done = 0;

  for (const it of items) {
    if (it.isImage && !it.isAVIF) {
      // Decode -> draw -> AVIF
      try {
        const bmp = await decodeBitmap(it.file);
        const avifBlob = await canvasToAvif(bmp, quality);
        zip.file(extToAvif(it.rel), avifBlob);
      } catch (e) {
        // If conversion fails for a file, fall back to copying original
        console.warn('AVIF conversion failed, copying original:', it.rel, e);
        zip.file(it.rel, it.file);
      }
    } else {
      // Non-images and .avif files: copy as-is
      zip.file(it.rel, it.file);
    }

    done++;
    onProgress(done, total);
    // Keep UI responsive
    await new Promise(r => setTimeout(r, 0));
  }

  // Build ZIP (STORE is fine; you can set {compression:"DEFLATE"} if you want)
  const outBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return outBlob;
}

/* ========= Wire UI ========= */
qualityInp.addEventListener('input', () => {
  qualityVal.textContent = Number(qualityInp.value).toFixed(2);
});

btnScan.addEventListener('click', () => {
  if (!pickFolder.files?.length) {
    pickFolder.click();
    return;
  }
  summarizeFiles(pickFolder.files);
});

pickFolder.addEventListener('change', () => {
  if (pickFolder.files?.length) {
    summarizeFiles(pickFolder.files);
  }
});

btnConvert.addEventListener('click', async () => {
  if (!currentFiles.length) {
    alert('Pick your /prompts folder first.');
    pickFolder.click();
    return;
  }

  btnConvert.disabled = true;
  resultRow.classList.add('hidden');
  prog.value = 0; prog.max = currentFiles.length;
  progText.textContent = 'Starting…';

  const start = performance.now();
  lastZipBlob = await convertFolderToAvifZip(currentFiles, {
    quality: Number(qualityInp.value),
    onProgress: (done, total) => {
      prog.max = total;
      prog.value = done;
      const pct = Math.floor(done / total * 100);
      progText.textContent = `Converting… ${done}/${total} (${pct}%)`;
    }
  });

  const ms = Math.round(performance.now() - start);
  progText.textContent = `Finished in ${ms} ms`;
  resultInfo.textContent = `ZIP size: ~${Math.round(lastZipBlob.size / 1024)} KB`;
  resultRow.classList.remove('hidden');
  btnConvert.disabled = false;
});

btnDownload.addEventListener('click', () => {
  if (!lastZipBlob) return;
  const url = URL.createObjectURL(lastZipBlob);
  const a = document.createElement('a');
  a.href = url; a.download = 'prompts-avif.zip';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

/* ========= Boot ========= */
(async () => {
  const support = await detectAvifEncode();
  setSupportBadge(support);
  if (!support.webcodecs && support.canvas) {
    // Canvas path is fine; warn panel stays hidden unless neither path exists
  }
  if (!support.any) {
    fallback.classList.remove('hidden');
  }
})();
