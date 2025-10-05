(function () {
  async function deleteImage(prompt, imageHandle) {
    if (!prompt.dirHandle || !confirm(`Delete ${imageHandle.name}? This cannot be undone.`)) return false;
    try {
      await prompt.dirHandle.removeEntry(imageHandle.name);
      await refreshPrompt(prompt);
      return true;
    } catch (err) {
      console.error(`Failed to delete ${imageHandle.name}:`, err);
      alert(`Error: Could not delete ${imageHandle.name}.`);
      return false;
    }
  }

  async function setCoverImage(prompt, newCoverHandle) {
    if (!prompt.dirHandle) return false;
    const prefix = '_';
    const ops = [];
    const currentCover = prompt.files.previews.find(h => h.name.startsWith(prefix));
    if (currentCover && currentCover.name !== newCoverHandle.name) {
      ops.push({ handle: currentCover, newName: currentCover.name.substring(prefix.length) });
    }
    if (!newCoverHandle.name.startsWith(prefix)) {
      ops.push({ handle: newCoverHandle, newName: prefix + newCoverHandle.name });
    }
    if (!ops.length) return true;

    try {
      for (const op of ops) {
        const file = await op.handle.getFile();
        const newHandle = await prompt.dirHandle.getFileHandle(op.newName, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(file);
        await writable.close();
        await prompt.dirHandle.removeEntry(op.handle.name);
      }
      await refreshPrompt(prompt);
      return true;
    } catch (err) {
      console.error('Failed to set cover image:', err);
      alert('Error setting cover image. Please reload the library.');
      return false;
    }
  }

  async function addImagesToPrompt(prompt, files) {
    if (!prompt.dirHandle || files.length === 0) return false;
    try {
      for (const file of files) {
        const newHandle = await prompt.dirHandle.getFileHandle(file.name, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(file);
        await writable.close();
      }
      await refreshPrompt(prompt);
      return true;
    } catch (err) {
      console.error('Failed to add images:', err);
      alert('Error adding images.');
      return false;
    }
  }

  async function refreshPrompt(prompt) {
    const updatedPreviews = [];
    for await (const [childName, child] of prompt.dirHandle.entries()) {
      if (child.kind === 'file' && /\.(jpg|jpeg|png|webp|avif)$/i.test(childName)) updatedPreviews.push(child);
    }
    updatedPreviews.sort((a, b) => {
      const aIsCover = a.name.startsWith('_');
      const bIsCover = b.name.startsWith('_');
      if (aIsCover && !bIsCover) return -1;
      if (!aIsCover && bIsCover) return 1;
      return a.name.localeCompare(b.name);
    });

    prompt.files.previews = updatedPreviews;
    const master = PV.state.all.find(x => x.id === prompt.id);
    if (master) master.files.previews = updatedPreviews;

    PV.openDetailView(prompt);
    PV.applyFilters();
  }

  PV.deleteImage = deleteImage;
  PV.setCoverImage = setCoverImage;
  PV.addImagesToPrompt = addImagesToPrompt;
  PV.refreshPrompt = refreshPrompt;
})();
