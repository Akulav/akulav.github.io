(function () {
  const { $, $$, state, debounced } = PV;

  async function handleOpenRW(){
    try {
      const root = await window.showDirectoryPicker({ mode: 'readwrite' });
      let promptsDir;
      let rootForManifest = root;
      try { promptsDir = await rootForManifest.getDirectoryHandle('prompts'); }
      catch (e) {
        if (rootForManifest.name.toLowerCase() === 'prompts') promptsDir = rootForManifest;
        else { alert('Could not find a "prompts" directory within the selected folder.'); return; }
      }
      state.rw = true;
      state.rootHandle = rootForManifest;
      const { items, tagSet } = await PV.scanPromptsRW(promptsDir);

      try {
        const fh = await rootForManifest.getFileHandle('_favorites.json', { create:false });
        const f  = await fh.getFile();
        const j  = JSON.parse(await f.text());
        const s  = new Set(j?.ids || []);
        for (const p of items) if (!p.favorite && s.has(p.id)) p.favorite = true;
      } catch {}

      await PV.finalizeLibrary(items, tagSet);
    } catch (err) {
      console.warn("R/W Picker cancelled or failed.", err);
    }
  }
  window.__pv_handleOpenRW = handleOpenRW;

  document.addEventListener('DOMContentLoaded', () => {
    PV.configureOverlayForEnv();
    PV.showOverlay();

    const libZipBtn = $('#libZip');
    const zipInput  = $('#zipInput');
    libZipBtn?.addEventListener('click', () => zipInput?.click());
    zipInput?.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) PV.handleZipFile(f); e.target.value = ''; });

    $('#newPromptBtn')?.addEventListener('click', () => { $('#newPromptModal')?.classList.remove('hidden'); $('#newPromptModal')?.setAttribute('aria-hidden','false'); $('#newPromptForm')?.reset(); $('#newPromptMsg').textContent = ''; });
    $('#newPromptClose')?.addEventListener('click', () => { $('#newPromptModal')?.classList.add('hidden');  $('#newPromptModal')?.setAttribute('aria-hidden','true'); });

    $('#newPromptForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.rw || !state.rootHandle) { alert('Read/Write access is required to save new prompts.'); return; }
      const saveBtn = $('#newPromptSave');
      const msgEl   = $('#newPromptMsg');
      saveBtn.disabled = true; msgEl.textContent = 'Saving...';
      try {
        const title      = $('#newTitle').value.trim();
        const tags       = $('#newTags').value.split(',').map(t => t.trim()).filter(Boolean);
        const promptText = $('#newPromptText').value;
        const images     = $('#newImages').files;
        if (!title) throw new Error('Title is required.');
        const folderName = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-');
        if (!folderName) throw new Error('Could not generate a valid folder name from the title.');
        const promptsDir = await state.rootHandle.getDirectoryHandle('prompts', { create: true });
        const newDirHandle = await promptsDir.getDirectoryHandle(folderName, { create: true });

        const tagsMeta = { title, tags };
        const tagsFileHandle = await newDirHandle.getFileHandle('tags.json', { create: true });
        let writable = await tagsFileHandle.createWritable();
        await writable.write(JSON.stringify(tagsMeta, null, 2));
        await writable.close();

        if (promptText) {
          const promptFileHandle = await newDirHandle.getFileHandle('prompt.txt', { create: true });
          writable = await promptFileHandle.createWritable();
          await writable.write(promptText);
          await writable.close();
        }

        for (const imageFile of images) {
          const imageFileHandle = await newDirHandle.getFileHandle(imageFile.name, { create: true });
          writable = await imageFileHandle.createWritable();
          await writable.write(imageFile);
          await writable.close();
        }
        msgEl.textContent = 'Success! Reloading library...';
        setTimeout(async () => {
          $('#newPromptModal')?.classList.add('hidden'); $('#newPromptModal')?.setAttribute('aria-hidden','true');
          await PV.reloadLibrary(); // re-scan with new content
        }, 800);
      } catch (err) {
        msgEl.textContent = `Error: ${err.message}`; console.error('Failed to save new prompt:', err);
      } finally {
        saveBtn.disabled = false;
      }
    });

    // RELOAD now uses last source (no picker)
    $('#reloadLibraryBtn')?.addEventListener('click', PV.reloadLibrary);

    // Overlay & pickers
    $('#openRW')?.addEventListener('click', PV.showOverlay);
    $('#libClose')?.addEventListener('click', PV.hideOverlay);
    $('#libRW')?.addEventListener('click', handleOpenRW);
    $('#libFolder')?.addEventListener('click', () => document.getElementById('dirInput')?.click());
    $('#dirInput')?.addEventListener('change', async e => { const files = Array.from(e.target.files || []); if (!files.length) return; await PV.buildFromLooseFiles(files); });
    $('#empty')?.addEventListener('click', PV.showOverlay);

    const dropZone = document.getElementById('dropZone');
    dropZone?.addEventListener('click', async () => {
      try { await PV.openBestPicker(); } catch { await handleOpenRW(); }
    });
    dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dz-over'); });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dz-over'));
    dropZone?.addEventListener('drop', async e => {
      e.preventDefault(); dropZone.classList.remove('dz-over');
      const items = e.dataTransfer?.items;
      if (items && items.length > 0) {
        const all = await PV.entriesToFiles(items);
        await PV.buildFromLooseFiles(all);
      }
    });

    // Search & mode
    const searchBox = $('#searchBox');
    const triggerSearch = PV.debounced(() => PV.applyFilters(), 160);
    searchBox?.addEventListener('input', () => { state.q = searchBox.value || ''; triggerSearch(); });

    PV.$$('input[name="mode"]').forEach(r => r.addEventListener('change', (e) => {
      state.mode = e.target.value || 'AND'; PV.applyFilters();
    }));

    // TOPBAR FAVORITES (now works)
    $('#toggleFavs')?.addEventListener('click', () => {
      PV.setOnlyFavs(!state.onlyFavs);
    });

    // TOPBAR CLEAR (now works)
    $('#clearFilters')?.addEventListener('click', () => {
      // clear search
      state.q = '';
      if (searchBox) searchBox.value = '';
      // clear chips
      state.sel.clear();
      PV.$$('#tagChips .chip').forEach(c => c.classList.remove('active'));
      // reset mode? (keep current AND/OR setting)
      PV.applyFilters();
    });

    // Gallery
    $('#openGallery')?.addEventListener('click', PV.openGallery);
  });
})();
