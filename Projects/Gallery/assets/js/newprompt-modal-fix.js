
(function(){
  function $(s,el=document){ return el.querySelector(s); }
  const modal = $("#newPromptModal");
  if (!modal) return;

  // Guarantee overlay classes
  modal.classList.add("lib-overlay","hidden");
  modal.setAttribute("role","dialog");
  modal.setAttribute("aria-modal","true");
  if (!modal.hasAttribute("aria-hidden")) modal.setAttribute("aria-hidden","true");

  const openBtn  = $("#newPromptBtn");
  const closeBtn = $("#newPromptClose");
  const form     = $("#newPromptForm");
  const msgEl    = $("#newPromptMsg");

  function open(){
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden","false");
    document.body.classList.add("no-scroll");
    // focus first input if present
    const firstField = $("#newPromptTitle") || $("#newPromptText") || $("#newImages");
    firstField && firstField.focus && firstField.focus();
  }
  function close(){
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden","true");
    document.body.classList.remove("no-scroll");
  }

  openBtn && openBtn.addEventListener("click", (e)=>{ e.preventDefault(); open(); });
  closeBtn && closeBtn.addEventListener("click", (e)=>{ e.preventDefault(); close(); });

  // Click backdrop closes
  modal.addEventListener("click", (e)=>{ if (e.target === modal) close(); });

  // ESC closes
  document.addEventListener("keydown", (e)=>{
    if (e.key === "Escape" && !modal.classList.contains("hidden")) close();
  });

  // Optional: Clear message on open
  if (msgEl) {
    modal.addEventListener("transitionend", ()=>{ if (!modal.classList.contains("hidden")) msgEl.textContent = ""; });
  }

  // Expose helpers (non-breaking)
  window.PV = window.PV || {};
  window.PV.openNewPromptModal = open;
  window.PV.closeNewPromptModal = close;
})();
