
(function(){
  function $(s,el=document){ return el.querySelector(s); }
  const view = $("#newPromptView");
  const back = $("#newPromptBack");
  const trigger = $("#newPromptBtn");
  const form = view && view.querySelector('form');

  if (!view) return;

  function openView(){
    const legacy = document.getElementById('newPromptModal'); if (legacy){ legacy.classList.add('hidden'); legacy.setAttribute('aria-hidden','true'); }
    document.body.classList.add("new-prompt-active","no-scroll");
    view.setAttribute("aria-hidden","false");
    view.style.display = "grid";
    // focus first meaningful input if present
    const first = $("#newPromptTitle") || $("#newPromptText") || $("#newImages");
    first && first.focus && first.focus();
  }
  function closeView(){
    const legacy = document.getElementById('newPromptModal'); if (legacy){ legacy.classList.add('hidden'); legacy.setAttribute('aria-hidden','true'); }
    view.setAttribute("aria-hidden","true");
    view.style.display = "none";
    document.body.classList.remove("new-prompt-active","no-scroll");
  }

  trigger && trigger.addEventListener("click", (e)=>{ e.preventDefault(); e.stopImmediatePropagation(); openView(); });
  form && form.addEventListener('submit', saveFromForm);
  back && back.addEventListener("click", (e)=>{ e.preventDefault(); closeView(); });


  /* SAVE HANDLER */
  async function saveFromForm(e){
    e && e.preventDefault && e.preventDefault();
    const state = PV.state || {};
    if (!state.rw || !state.rootHandle) { alert('Read/Write access is required to save new prompts.'); return; }

    const within = view; // scope queries to this virtual page
    const titleEl  = within.querySelector('#newPromptTitle') || within.querySelector('#npvTitle');
    const tagsEl   = within.querySelector('#newPromptTags')  || within.querySelector('#npvTags');
    const textEl   = within.querySelector('#newPromptText')   || within.querySelector('#npvText');
    const filesEl  = within.querySelector('#newImages')       || within.querySelector('#npvImages');
    const msgEl    = within.querySelector('#newPromptMsg');

    const title = (titleEl && titleEl.value || '').trim();
    const tags  = (tagsEl && tagsEl.value || '').split(',').map(t=>t.trim()).filter(Boolean);
    const promptText = (textEl && textEl.value) || '';
    const images = (filesEl && filesEl.files) ? filesEl.files : [];

    if (!title){ msgEl && (msgEl.textContent='Error: Title is required.'); return; }
    const folderName = title.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/--+/g,'-');

    try{
      msgEl && (msgEl.textContent='Saving...');
      const promptsDir = state.promptsHandle || await state.rootHandle.getDirectoryHandle('prompts', {create:true});
      const newDirHandle = await promptsDir.getDirectoryHandle(folderName, {create:true});

      // tags.json
      const tagsFile = await newDirHandle.getFileHandle('tags.json', {create:true});
      let w = await tagsFile.createWritable();
      await w.write(JSON.stringify({title, tags}, null, 2)); await w.close();

      // prompt.txt
      if (promptText){
        const pf = await newDirHandle.getFileHandle('prompt.txt',{create:true});
        w = await pf.createWritable(); await w.write(promptText); await w.close();
      }

      // images
      for (const imageFile of images){
        const fh = await newDirHandle.getFileHandle(imageFile.name, {create:true});
        const ws = await fh.createWritable();
        await ws.write(imageFile); await ws.close();
      }

      msgEl && (msgEl.textContent='Success! Reloading library...');
      setTimeout(async ()=>{ closeView(); await PV.reloadLibrary?.(); }, 600);
    }catch(err){
      console.error('New Prompt save failed', err);
      msgEl && (msgEl.textContent = 'Error: ' + (err && err.message || err));
    }
  }

  // Esc to exit
  document.addEventListener("keydown", (e)=>{
    if (e.key === "Escape" && document.body.classList.contains("new-prompt-active")) closeView();
  });

  // Expose to PV if needed
  window.PV = window.PV || {};
  window.PV.openNewPromptView = openView;
  window.PV.closeNewPromptView = closeView;
})();
