(function () {
  const { $, state } = PV;
  const { readJSONFile, readJSONHandle, hideOverlay } = PV;
  const { TitleStore } = PV;

  async function scanPromptsRW(promptsDir) {
    // remember how we loaded
    state.source = { type: 'rw', zipFile: null, files: null };

    const items = [];
    for await (const [entryName, entryHandle] of promptsDir.entries()) {
      if (entryHandle.kind !== 'directory') continue;

      const folder = `prompts/${entryName}`;
      const p = {
        id: folder.replace(/\s+/g, '-').toLowerCase(),
        title: entryName,
        folder,
        files: { prompt: null, previews: [] },
        dirHandle: entryHandle,
        favorite: false,
        rootHandle: state.rootHandle,
      };

      // Walk children and read title from tags.json (title only)
      for await (const [childName, child] of entryHandle.entries()) {
        const lower = childName.toLowerCase();
        if (child.kind !== 'file') continue;

        if (lower === 'prompt.txt') {
          p.files.prompt = child;
        } else if (lower === 'tags.json') {
          // title (if present), ignore any other fields
          try {
            const meta = await readJSONHandle(child).catch(() => null);
            if (meta?.title) p.title = meta.title;
          } catch {}
        } else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(lower)) {
          p.files.previews.push(child);
        } else if (lower === 'favorites.json') {
          const data = await readJSONHandle(child).catch(() => null);
          if (data?.favorite === true) p.favorite = true;
        }
      }

      // Require prompt.txt
      if (!p.files.prompt) continue;

      // Cover-first sort
      p.files.previews.sort((a, b) => {
        const aIsCover = a.name.startsWith('_');
        const bIsCover = b.name.startsWith('_');
        if (aIsCover && !bIsCover) return -1;
        if (!aIsCover && bIsCover) return 1;
        return a.name.localeCompare(b.name);
      });

      items.push(p);
    }

    items.sort((a, b) => a.title.localeCompare(b.title));
    return { items };
  }

  async function handleZipFile(file){
    if (!file) return;
    state.source = { type: 'zip', zipFile: file, files: null }; // remember source

    const libMsg = $('#libMsg');
    if (!/\.zip$/i.test(file.name)) { libMsg.textContent = 'Please choose a .zip file.'; return; }
    if (!window.JSZip) { libMsg.textContent = 'ZIP support not loaded.'; return; }

    try {
      libMsg.textContent = 'Reading ZIP…';
      const ab  = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(ab, { createFolders: false });
      const fileEntries = Object.values(zip.files).filter(zf => !zf.dir);

      // Group by prompt folder
      const groups = new Map();
      for (const zf of fileEntries) {
        const rel = (zf.name || '').replace(/^[\/]+/, '');
        const parts = rel.split('/').filter(Boolean);

        let folderKey;
        const pIdx = parts.indexOf('prompts');
        if (pIdx >= 0) {
          if (parts.length < pIdx + 2) continue;
          folderKey = parts.slice(0, pIdx + 2).join('/');
        } else {
          if (parts.length < 2) continue;
          folderKey = `prompts/${parts[0]}`;
        }

        let g = groups.get(folderKey);
        if (!g) {
          g = { folder: folderKey, prompt: null, tagsFile: null, previews: [], favFile: null };
          groups.set(folderKey, g);
        }

        const base = parts[parts.length - 1].toLowerCase();
        if (base === 'prompt.txt') g.prompt = zf;
        else if (base === 'tags.json') g.tagsFile = zf; // used only for title
        else if (base === 'favorites.json') g.favFile = zf;
        else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(base)) g.previews.push(zf);
      }

      const all = [];
      for (const g of groups.values()) {
        if (!g.prompt) continue;
        let title = g.folder.split('/').at(-1);

        // Title from tags.json (ignore any other fields)
        if (g.tagsFile) {
          try {
            const meta = JSON.parse(await g.tagsFile.async('string'));
            if (meta?.title) title = meta.title;
          } catch {}
        }

        const id = g.folder.replace(/\s+/g, '-').toLowerCase();

        let favorite = false;
        if (g.favFile) {
          try {
            const favObj = JSON.parse(await g.favFile.async('string'));
            favorite = !!favObj?.favorite;
          } catch {}
        }

        g.previews.sort((a, b) => a.name.localeCompare(b.name));

        // No p.tags, no files.tags — keep only prompt & previews
        all.push({
          id,
          title,
          folder: g.folder,
          files: { prompt: g.prompt, previews: g.previews },
          favorite
        });
      }

      if (!all.length) { libMsg.textContent = 'No prompts detected in ZIP.'; return; }

      await finalizeLibrary(all);
    } catch (err) {
      console.error('ZIP parse failed:', err);
      libMsg.textContent = 'Failed to read ZIP.';
    }
  }

  async function buildFromLooseFiles(files){
    state.source = { type: 'files', zipFile: null, files: files }; // remember source

    const libMsg = $('#libMsg');
    libMsg.textContent = 'Indexing files…';

    // Group by prompt folder
    const groups = new Map();
    for (const f of files) {
      const rel = (f.webkitRelativePath || f.name).replace(/^[\/]*/, '');
      const parts = rel.split('/');

      let folderKey;
      const pIdx = parts.indexOf('prompts');
      if (pIdx >= 0) {
        if (parts.length >= pIdx + 2) folderKey = parts.slice(0, pIdx + 2).join('/');
      } else {
        if (parts.length >= 2) folderKey = `prompts/${parts[0]}`;
      }
      if (!folderKey) continue;

      let g = groups.get(folderKey);
      if (!g) {
        g = { folder: folderKey, promptFile: null, tagsFile: null, previews: [], favFile: null };
        groups.set(folderKey, g);
      }

      const base = parts[parts.length - 1].toLowerCase();
      if (base === 'prompt.txt') g.promptFile = f;
      else if (base === 'tags.json') g.tagsFile = f; // used only for title
      else if (base === 'favorites.json') g.favFile = f;
      else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(base)) g.previews.push(f);
    }

    // Build items
    const all = [];
    for (const [folder, g] of groups.entries()) {
      if (!g.promptFile) continue;

      let title = folder.split('/').at(-1);
      if (g.tagsFile) {
        const meta = await readJSONFile(g.tagsFile).catch(() => null);
        if (meta?.title) title = meta.title;
      }

      const id = folder.replace(/\s+/g, '-').toLowerCase();

      let favorite = false;
      if (g.favFile) {
        const favObj = await readJSONFile(g.favFile).catch(() => null);
        favorite = !!favObj?.favorite;
      }

      g.previews.sort((a, b) => a.name.localeCompare(b.name));

      // No p.tags, no files.tags — keep only prompt & previews
      all.push({
        id,
        title,
        folder,
        files: { prompt: g.promptFile, previews: g.previews },
        favorite
      });
    }

    if (!all.length) {
      libMsg.textContent = 'No prompts detected. Select your /prompts with prompt.txt files.';
      return;
    }

    await finalizeLibrary(all);
  }

  async function finalizeLibrary(all){
    // Apply local title overrides
    all.forEach(p => { const t = TitleStore.get(p.id); if (t) p.title = t; });
    state.all = all;

    const newPromptBtn     = document.getElementById('newPromptBtn');
    const reloadLibraryBtn = document.getElementById('reloadLibraryBtn');
    if (state.rw) {
      if (newPromptBtn) newPromptBtn.style.display = 'inline-block';
      if (reloadLibraryBtn) reloadLibraryBtn.style.display = 'inline-block';
    } else {
      if (newPromptBtn) newPromptBtn.style.display = 'none';
      // keep reload visible even in RO to rehydrate current view if desired
      if (reloadLibraryBtn) reloadLibraryBtn.style.display = 'inline-block';
    }

    // No tags rendering, no badges
    await preloadSnippets(all);

    window.__pv_applyFilters?.();
    document.body.classList.remove('boot-gate');
    hideOverlay();
  }

  async function preloadSnippets(list){
    let work = list;
    if (PV.isMobile) work = list.slice(0, 24);
    const BATCH = 20;
    for (let i = 0; i < work.length; i += BATCH){
      const slice = work.slice(i, i + BATCH);
      await Promise.all(slice.map(async (p) => {
        try { p._snippet = (await PV.loadPromptText(p)).toString().slice(0, 2000); }
        catch { p._snippet = ''; }
      }));
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // One-click reload — uses state.source
  async function reloadLibrary(){
    const src = state.source || {};
    try {
      if (src.type === 'rw' && state.rootHandle) {
        let promptsDir;
        try { promptsDir = await state.rootHandle.getDirectoryHandle('prompts'); }
        catch (e) {
          if (state.rootHandle.name?.toLowerCase() === 'prompts') promptsDir = state.rootHandle;
          else throw new Error('Could not find "prompts" directory in the previously selected folder.');
        }
        const { items } = await scanPromptsRW(promptsDir);
        await finalizeLibrary(items);
      } else if (src.type === 'zip' && src.zipFile) {
        await handleZipFile(src.zipFile);
      } else if (src.type === 'files' && Array.isArray(src.files)) {
        await buildFromLooseFiles(src.files);
      } else {
        // fallback: just re-render current filter
        window.__pv_applyFilters?.();
      }
    } catch (err) {
      alert('Reload failed. You may need to re-open the library.');
      console.error('reloadLibrary', err);
    }
  }

  // Export currently filtered items into a zip (title-only tags.json)
  async function exportZipOfCurrentFilter(){
    if (!window.JSZip) { alert('ZIP support not loaded.'); return; }
    const zip = new JSZip();

    for (const p of (state._lastRenderedItems || [])) {
      const folderPath = p.folder || (`prompts/${p.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-')}`);
      const zf = zip.folder(folderPath);

      // prompt.txt
      try {
        const txt = await PV.loadPromptText(p);
        zf.file('prompt.txt', txt || '');
      } catch {}

      // tags.json — write only title
      try {
        const meta = { title: p.title || 'Untitled' };
        zf.file('tags.json', JSON.stringify(meta, null, 2));
      } catch {}

      // previews
      for (const ph of (p.files?.previews || [])) {
        try {
          const imgBlob = await PV.getBlobFromHandle(ph);
          if (imgBlob) zf.file(ph.name, imgBlob);
        } catch {}
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    const dt = new Date();
    const stamp = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    a.href = URL.createObjectURL(blob);
    a.download = `prompts-export-${stamp}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  PV.scanPromptsRW = scanPromptsRW;
  PV.handleZipFile = handleZipFile;
  PV.buildFromLooseFiles = buildFromLooseFiles;
  PV.finalizeLibrary = finalizeLibrary;
  PV.reloadLibrary = reloadLibrary;
  PV.exportZipOfCurrentFilter = exportZipOfCurrentFilter;
})();
