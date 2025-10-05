(function () {
  async function loadObjectURL(handle) {
    if (!handle) return '';
    try {
      if ('getFile' in handle) {
        const file = await handle.getFile();
        return URL.createObjectURL(file);
      }
      if (handle instanceof Blob) return URL.createObjectURL(handle);
      if (typeof handle.async === 'function') {
        const blob = await handle.async('blob');
        return URL.createObjectURL(blob);
      }
      return '';
    } catch(e) { console.error("Could not create object URL from handle", handle, e); return ''; }
  }

  async function loadPromptText(p) {
    const handle = p.files?.prompt;
    if (!handle) return '(No prompt.txt)';
    try {
      if ('getFile' in handle) {
        const file = await handle.getFile();
        return file.text();
      }
      if (typeof handle.async === 'function') return handle.async('string');
      if (typeof handle.text  === 'function')  return handle.text();
      return '(Could not load prompt)';
    } catch(e) { console.error("Could not load prompt text", p, e); return '(Error loading prompt)'; }
  }

  // NEW: unify getting a Blob from any kind of handle (FS/File/JSZip)
  async function getBlobFromHandle(handle) {
    try {
      if (!handle) return null;
      if ('getFile' in handle) return await handle.getFile();          // FileSystemFileHandle
      if (typeof handle.async === 'function') return await handle.async('blob'); // JSZip file
      if (handle instanceof Blob) return handle;                       // File/Blob
      return null;
    } catch (e) {
      console.error('getBlobFromHandle failed', e);
      return null;
    }
  }

  PV.loadObjectURL = loadObjectURL;
  PV.loadPromptText = loadPromptText;
  PV.getBlobFromHandle = getBlobFromHandle;
})();
