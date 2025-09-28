import { loadJSON, copy } from './site.js';


const grid = document.getElementById('poiGrid');
const search = document.getElementById('search');
const tagFilter = document.getElementById('tagFilter');
const copyAll = document.getElementById('copyAll');
const tpl = document.getElementById('poi-card');


let POIS = [];


function render(list){
grid.innerHTML = '';
list.forEach(p => {
const node = tpl.content.cloneNode(true);
const img = node.querySelector('.card-img');
const title = node.querySelector('.card-title');
const desc = node.querySelector('.desc');
const coord = node.querySelector('.coord');
const open = node.querySelector('.open');
const copyBtn = node.querySelector('.copy');
const tags = node.querySelector('.tags');


img.src = p.image; img.alt = p.name;
title.textContent = p.name;
desc.textContent = p.description;


const cmd = `/tp ${p.coords.x} ${p.coords.y ?? 64} ${p.coords.z}`;
coord.textContent = `${p.coords.x}, ${p.coords.y ?? 64}, ${p.coords.z}`;
copyBtn.addEventListener('click', ()=> copy(cmd));


open.href = p.image;


tags.innerHTML = (p.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('');


grid.appendChild(node);
});
}


function applyFilters(){
const q = (search.value || '').toLowerCase().trim();
const tag = tagFilter.value;
const filtered = POIS.filter(p => {
const hay = `${p.name} ${(p.tags||[]).join(' ')} ${p.description}`.toLowerCase();
const okQ = !q || hay.includes(q);
const okT = !tag || (p.tags||[]).includes(tag);
return okQ && okT;
});
render(filtered);
}


(async function(){
try{
const data = await loadJSON('data/pois.json');
POIS = data.pois || [];


// Populate tag select
const tags = [...new Set(POIS.flatMap(p => p.tags || []))].sort();
tags.forEach(t => {
const opt = document.createElement('option');
opt.value = t; opt.textContent = t; tagFilter.appendChild(opt);
});


render(POIS);


search.addEventListener('input', applyFilters);
tagFilter.addEventListener('change', applyFilters);


copyAll.addEventListener('click', () => {
const cmds = [...grid.querySelectorAll('.coord')]
.map(c => `/tp ${c.textContent.replaceAll(' ', '')}`)
.join('\n');
navigator.clipboard.writeText(cmds);
});
}catch(err){
console.error(err);
}
})();