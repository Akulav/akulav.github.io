// Shared site utilities: header/footer injection, active nav, theme toggle, JSON loader
const nav = `
<nav class="nav" role="navigation" aria-label="Primary">
<div class="left">
<a class="logo" href="index.html"><img src="assets/favicon.png" alt="Logo"><span>MC Server</span></a>
<a data-nav href="index.html">Home</a>
<a data-nav href="poi.html">POIs</a>
<a data-nav href="trains.html">Trains</a>
</div>
<div class="right">
<button class="theme" id="themeToggle" aria-label="Toggle theme">🌗 Theme</button>
</div>
</nav>`;


const footer = `
<div>Made with ❤️ by our crew · <a href="https://github.com/" target="_blank" rel="noopener">GitHub Pages</a></div>
`;


document.getElementById('site-header').innerHTML = nav;
document.getElementById('site-footer').innerHTML = footer;


// Highlight current nav
const here = location.pathname.split('/').pop() || 'index.html';
[...document.querySelectorAll('[data-nav]')].forEach(a => {
const match = a.getAttribute('href') === here;
if (match) a.classList.add('active');
});


// Theme toggle (prefers-color-scheme + localStorage)
const key = 'mc-theme';
const themeBtn = document.getElementById('themeToggle');
const stored = localStorage.getItem(key);
if (stored) document.documentElement.dataset.theme = stored;


themeBtn?.addEventListener('click', () => {
const cur = document.documentElement.dataset.theme;
const next = cur === 'light' ? 'dark' : cur === 'dark' ? '' : 'light';
if (next) localStorage.setItem(key, next); else localStorage.removeItem(key);
document.documentElement.dataset.theme = next;
});


export async function loadJSON(path){
const res = await fetch(path, {cache:'no-store'});
if(!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
return res.json();
}


export function copy(text){
navigator.clipboard.writeText(text).then(()=>{
const btn = document.activeElement;
if(btn){ const old = btn.textContent; btn.textContent = 'Copied!'; setTimeout(()=>btn.textContent = old, 900); }
});
}