
(function(){

  function getTitleField(){
    const view = $("#newPromptView");
    if (!view) return null;
    // try common selectors
    let el = view.querySelector("#newPromptTitle")
          || view.querySelector("#newTitle")
          || view.querySelector("[name='title']")
          || view.querySelector("input[type='text'][placeholder*='Title' i]");
    // if still not found, insert a field at top of the form
    if (!el){
      const form = view.querySelector("form") || view;
      const wrap = document.createElement("div");
      wrap.className = "form-group";
      const lab = document.createElement("label"); lab.textContent = "Title";
      const inp = document.createElement("input");
      inp.type = "text"; inp.id = "newPromptTitle"; inp.placeholder = "Enter title…";
      wrap.appendChild(lab); wrap.appendChild(inp);
      form.insertBefore(wrap, form.firstChild);
      el = inp;
    }
    return el;
  }

  const $ = (s,el=document)=>el.querySelector(s);

  async function doSave(e){
    try{
      e && e.preventDefault && e.preventDefault();
      const view = $("#newPromptView");
      if (!view) { console.warn("[NPV] view missing"); return; }

      const state = (window.PV && PV.state) ? PV.state : {};
      const msgEl = view.querySelector("#newPromptMsg");
      const titleEl = getTitleField();
      const tagsEl  = view.querySelector("#newPromptTags");
      const textEl  = view.querySelector("#newPromptText");
      const filesEl = view.querySelector("#newImages");

      if (!state.rw || !state.rootHandle){
        console.warn("[NPV] R/W not enabled or missing rootHandle", state);
        alert("Read/Write access is required to save new prompts.");
        return;
      }

      const title = (titleEl && titleEl.value || "").trim();
      const tags  = (tagsEl && tagsEl.value || "").split(",").map(t=>t.trim()).filter(Boolean);
      const text  = (textEl && textEl.value) || "";
      const files = (filesEl && filesEl.files) ? filesEl.files : [];

      if (!title){ msgEl && (msgEl.textContent = "Error: Title is required."); console.warn("[NPV] Title empty"); if (titleEl){ titleEl.classList.add("input-error"); titleEl.focus(); titleEl.scrollIntoView({block:"center"}); setTimeout(()=> titleEl.classList.remove("input-error"), 1200); } return; }
      const folderName = title.toLowerCase().replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-").replace(/--+/g,"-");

      msgEl && (msgEl.textContent = "Saving...");
      console.log("[NPV] Saving to folder:", folderName);

      const promptsDir = state.promptsHandle || await state.rootHandle.getDirectoryHandle("prompts", {create:true});
      const newDirHandle = await promptsDir.getDirectoryHandle(folderName, {create:true});

      // tags.json
      const tagsFile = await newDirHandle.getFileHandle("tags.json", {create:true});
      let w = await tagsFile.createWritable();
      await w.write(JSON.stringify({title, tags}, null, 2)); await w.close();

      // prompt.txt
      if (text){
        const pf = await newDirHandle.getFileHandle("prompt.txt", {create:true});
        w = await pf.createWritable(); await w.write(text); await w.close();
      }

      // images
      for (const f of files){
        const fh = await newDirHandle.getFileHandle(f.name, {create:true});
        const ws = await fh.createWritable(); await ws.write(f); await ws.close();
      }

      msgEl && (msgEl.textContent = "Success! Reloading library...");
      console.log("[NPV] Save success, reloading library");
      setTimeout(async ()=>{
        if (window.PV && PV.closeNewPromptView) PV.closeNewPromptView();
        if (window.PV && PV.reloadLibrary) await PV.reloadLibrary();
      }, 600);
    }catch(err){
      console.error("[NPV] Save failed:", err);
      const msgEl = document.querySelector("#newPromptView #newPromptMsg");
      if (msgEl) msgEl.textContent = "Error: " + (err && err.message || err);
      else alert("New Prompt save failed: " + (err && err.message || err));
    }
  }

  function wireOnce(){
    const view = $("#newPromptView");
    if (!view) return;
    if (!document.__npv_guard){
      document.__npv_guard = true;

      // 1) Capture submit on the specific form in the virtual page
      document.addEventListener("submit", (e)=>{
        const form = e.target;
        if (!form) return;
        const inView = view.contains(form);
        const isNP = form.id === "newPromptForm" || inView;
        if (isNP){ doSave(e); }
      }, {capture:true});

      // 2) Capture click on the Save button
      document.addEventListener("click", (e)=>{
        const btn = e.target.closest("#newPromptView #newPromptSave");
        if (btn){ e.preventDefault(); e.stopPropagation(); doSave(e); }
      }, {capture:true});

      console.log("[NPV] Event guard wired");
    }
  }

  // Keep wiring if DOM changes (hot reloads, modal rebuilds, etc.)
  const mo = new MutationObserver(()=> wireOnce());
  mo.observe(document.documentElement, {childList:true, subtree:true});

  document.addEventListener("DOMContentLoaded", wireOnce);
  window.addEventListener("pv:data", wireOnce);
  // Try immediate in case DOM is already ready
  wireOnce();
})();
