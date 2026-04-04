// Robust Save wiring for New Prompt virtual page (no-ops if elements missing)
// Tags removed: no reading tag input, tags.json contains only { title }
(function(){
  const $ = (s,el=document)=>el.querySelector(s);

  async function saveFromForm(e){
    try{
      e && e.preventDefault && e.preventDefault();
      const state = (window.PV && PV.state) ? PV.state : {};
      const view  = $("#newPromptView");
      if (!view) return;

      const titleEl = view.querySelector("#newPromptTitle");
      const textEl  = view.querySelector("#newPromptText");
      const filesEl = view.querySelector("#newImages");
      const msgEl   = view.querySelector("#newPromptMsg");

      if (!state.rw || !state.rootHandle){
        alert("Read/Write access is required to save new prompts.");
        return;
      }

      const title = (titleEl && titleEl.value || "").trim();
      const text  = (textEl && textEl.value) || "";
      const files = (filesEl && filesEl.files) ? filesEl.files : [];

      if (!title){
        if (msgEl) msgEl.textContent = "Error: Title is required.";
        return;
      }

      const folderName = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g,"")
        .replace(/\s+/g,"-")
        .replace(/--+/g,"-");

      if (msgEl) msgEl.textContent = "Saving...";

      const promptsDir  = state.promptsHandle || await state.rootHandle.getDirectoryHandle("prompts", {create:true});
      const newDirHandle = await promptsDir.getDirectoryHandle(folderName, {create:true});

      // tags.json — title only (no tags)
      {
        const tagsFile = await newDirHandle.getFileHandle("tags.json", {create:true});
        const w = await tagsFile.createWritable();
        await w.write(JSON.stringify({ title }, null, 2));
        await w.close();
      }

      // prompt.txt
      if (text){
        const pf = await newDirHandle.getFileHandle("prompt.txt", {create:true});
        const w = await pf.createWritable();
        await w.write(text);
        await w.close();
      }

      // images
      for (const f of files){
        const fh = await newDirHandle.getFileHandle(f.name, {create:true});
        const ws = await fh.createWritable();
        await ws.write(f);
        await ws.close();
      }

      if (msgEl) msgEl.textContent = "Success! Reloading library...";
      setTimeout(async ()=>{
        if (window.PV && PV.closeNewPromptView) PV.closeNewPromptView();
        if (window.PV && PV.reloadLibrary) await PV.reloadLibrary();
      }, 600);

    }catch(err){
      console.error("New Prompt save failed", err);
      const msgEl = $("#newPromptView #newPromptMsg");
      if (msgEl) msgEl.textContent = "Error: " + (err && err.message || err);
      else alert("New Prompt save failed: " + (err && err.message || err));
    }
  }

  function wire(){
    const view = $("#newPromptView");
    if (!view) return;
    const form = view.querySelector("form");
    const save = view.querySelector("#newPromptSave");
    if (form && !form.__npv_wired){
      form.addEventListener("submit", saveFromForm, {capture:true});
      form.__npv_wired = true;
    }
    if (save && !save.__npv_wired){
      save.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation(); saveFromForm(e); }, {capture:true});
      save.__npv_wired = true;
    }
  }

  document.addEventListener("DOMContentLoaded", wire);
  window.addEventListener("pv:data", wire);
  (function(){
    const trigger = document.getElementById("newPromptBtn");
    trigger && trigger.addEventListener("click", ()=> setTimeout(wire, 0), {capture:true});
  })();
})();
