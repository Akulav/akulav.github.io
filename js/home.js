import { loadJSON } from './site.js';


(async function(){
try{
const data = await loadJSON('data/gallery.json');
const el = document.getElementById('gallery');
data.photos.forEach(p => {
const fig = document.createElement('figure');
const img = document.createElement('img');
img.src = p.src; img.alt = p.alt || '';
img.loading = 'lazy';
fig.appendChild(img);
if(p.caption){
const cap = document.createElement('figcaption');
cap.textContent = p.caption;
fig.appendChild(cap);
}
el.appendChild(fig);
});
}catch(err){
console.error(err);
}
})();