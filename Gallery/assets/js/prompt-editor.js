// assets/js/prompt-editor.js
(function () {
  const { state } = PV;

  // Local fallback store for read-only/ZIP libraries
  const PromptStore = (() => {
    const KEY = 'pv:promptOverrides:v1';
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} };
    return {
      get: (id) => (id in cache) ? cache[id] : null,
      set: (id, text) => { cache[id] = text; persist(); },
      del: (id) => { delete cache[id]; persist(); },
      _all: () => ({ ...cache })
    };
  })();

  async function loadPromptTextWithOverride(p) {
    // Prefer a local override (RO/ZIP sessions)
    const ov = PromptStore.get(p.id);
    if (ov !== null) return ov;

    // Otherwise, load from whatever handle we have
    const h = p.files?.prompt;
    if (!h) return '(No prompt.txt)';
    try {
      if ('getFile' in h) { const f = await h.getFile(); return f.text(); }     // FileSystemFileHandle
      if (typeof h.async === 'function') return h.async('string');              // JSZip entry
      if (typeof h.text  === 'function')  return h.text();                      // Blob/File
    } catch (e) {
      console.error('load prompt failed', e);
    }
    return '(Error loading prompt)';
  }

  async function savePromptText(p, text) {
    let wrote = false;

    // RW write to disk
    if (state.rw && p?.dirHandle) {
      try {
        const fh = await p.dirHandle.getFileHandle('prompt.txt', { create: true });
        const w  = await fh.createWritable();
        await w.write(text);
        await w.close();
        wrote = true;
        PromptStore.del(p.id); // clear any RO override
      } catch (e) {
        console.warn('Failed to write prompt.txt, keeping local override', e);
      }
    }

    // RO/ZIP fallback — persist locally
    if (!wrote) {
      PromptStore.set(p.id, text);
    }

    // keep search/snippet fresh
    const snippet = (text || '').slice(0, 2000);
    p._snippet = snippet;
    const master = PV.state.all.find(x => x.id === p.id);
    if (master) master._snippet = snippet;

    return wrote;
  }

  // Make #detailPromptText contenteditable and auto-save on blur
  function mountPromptEditor(p) {
    const box = document.getElementById('detailPromptText');
    if (!box) return;

    // Use plaintext rendering (no HTML tags)
    box.textContent = box.textContent || '';

    box.setAttribute('contenteditable', 'true');
    box.setAttribute('spellcheck', 'false');

    // Avoid HTML paste
    const onPaste = (e) => {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      document.execCommand('insertText', false, t);
    };

    // Auto-save exactly on blur (same UX as title editing)
    const onBlur = async () => {
      const txt = box.textContent || '';
      await savePromptText(p, txt);
    };

    // Cleanup previous listeners (re-entering detail view)
    box._pvCleanup?.forEach(fn => fn());
    box._pvCleanup = [];

    box.addEventListener('paste', onPaste);
    box.addEventListener('blur', onBlur);

    box._pvCleanup.push(() => box.removeEventListener('paste', onPaste));
    box._pvCleanup.push(() => box.removeEventListener('blur', onBlur));
  }

  // Expose API
  PV.PromptStore = PromptStore;
  PV.loadPromptTextWithOverride = loadPromptTextWithOverride;
  PV.savePromptText = savePromptText;
  PV.mountPromptEditor = mountPromptEditor;
})();
