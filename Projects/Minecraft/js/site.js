// Shared site utilities: header/footer injection, active nav, JSON loader, helpers
// (Dark theme only — no toggle)

const nav = `
  <nav class="nav" role="navigation" aria-label="Primary">
    <div class="left">
      <a class="logo" href="index.html">
        <img src="assets/favicon.png" alt="Logo"><span>MC Server</span>
      </a>
      <a data-nav href="index.html">Home</a>
      <a data-nav href="poi.html">POIs</a>
      <a data-nav href="trains.html">Trains</a>
    </div>
  </nav>
`;


const headerEl = document.getElementById('site-header');
if (headerEl) headerEl.innerHTML = nav;
const footerEl = document.getElementById('site-footer');
if (footerEl) footerEl.innerHTML = footer;

// Highlight current nav item
const here = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('[data-nav]').forEach(a => {
  if (a.getAttribute('href') === here) a.classList.add('active');
});

// JSON loader (works on GitHub Pages)
export async function loadJSON(path){
  const res = await fetch(path, { cache: 'no-store' });
  if(!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// Clipboard helper
export function copy(text){
  navigator.clipboard.writeText(text).then(()=>{
    const el = document.activeElement;
    if (el) {
      const old = el.textContent;
      el.textContent = 'Copied!';
      setTimeout(()=> el.textContent = old, 900);
    }
  });
}
