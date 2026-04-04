(function () {
  function guessMimeFromName(name = "") {
    const ext = name.split(".").pop()?.toLowerCase();
    if (!ext) return "";
    if (["jpg","jpeg"].includes(ext)) return "image/jpeg";
    if (ext === "png")  return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "avif") return "image/avif";
    if (ext === "txt")  return "text/plain; charset=utf-8";
    return "";
  }

  async function loadObjectURL(handle) {
    if (!handle) return "";
    try {
      // FileSystemFileHandle
      if ("getFile" in handle) {
        const file = await handle.getFile();
        return URL.createObjectURL(file);
      }
      // JSZip file
      if (typeof handle.async === "function") {
        const blob = await handle.async("blob");
        return URL.createObjectURL(blob);
      }
      // Blob/File
      if (handle instanceof Blob) {
        return URL.createObjectURL(handle);
      }
      return "";
    } catch (e) {
      console.error("Could not create object URL from handle", handle, e);
      return "";
    }
  }

  async function loadPromptText(p) {
    const handle = p?.files?.prompt;
    if (!handle) return "(No prompt.txt)";
    try {
      if ("getFile" in handle) {
        const file = await handle.getFile();
        return await file.text();
      }
      if (typeof handle.async === "function") {
        return await handle.async("string");
      }
      if (typeof handle.text === "function") {
        return await handle.text();
      }
      return "(Could not load prompt)";
    } catch (e) {
      console.error("Could not load prompt text", p, e);
      return "(Error loading prompt)";
    }
  }

  // Unifies getting a Blob from any supported handle
  async function getBlobFromHandle(handle) {
    try {
      if (!handle) return null;

      // FileSystemFileHandle → File (Blob)
      if ("getFile" in handle) {
        const f = await handle.getFile();
        return f;
      }

      // JSZip file → Blob
      if (typeof handle.async === "function") {
        return await handle.async("blob");
      }

      // Already a Blob/File
      if (handle instanceof Blob) return handle;

      // If someone passed a {name, data} object, try to wrap (non-standard, best-effort)
      if (handle?.data instanceof ArrayBuffer || ArrayBuffer.isView(handle?.data)) {
        const type = handle.type || guessMimeFromName(handle.name) || "";
        return new Blob([handle.data], { type });
      }

      return null;
    } catch (e) {
      console.error("getBlobFromHandle failed", e);
      return null;
    }
  }

  PV.loadObjectURL    = loadObjectURL;
  PV.loadPromptText   = loadPromptText;
  PV.getBlobFromHandle = getBlobFromHandle;
})();
