import { loadJSON } from './site.js';
const seq = line.stops.map(id => stations.find(s=>s.id===id));
ctx.beginPath();
seq.forEach((s, i)=>{
const p = toXY(s.coords.x, s.coords.z);
if(i===0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
});
ctx.stroke();


// Direction arrows
ctx.strokeStyle = color; ctx.lineWidth = 2;
for(let i=1;i<seq.length;i++){
const a = toXY(seq[i-1].coords.x, seq[i-1].coords.z);
const b = toXY(seq[i].coords.x, seq[i].coords.z);
const ang = Math.atan2(b.y-a.y, b.x-a.x);
const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
ctx.beginPath();
ctx.moveTo(mx, my);
ctx.lineTo(mx - 8*Math.cos(ang - Math.PI/6), my - 8*Math.sin(ang - Math.PI/6));
ctx.moveTo(mx, my);
ctx.lineTo(mx - 8*Math.cos(ang + Math.PI/6), my - 8*Math.sin(ang + Math.PI/6));
ctx.stroke();
}
});


// Draw stations on top
stations.forEach(s => {
const p = toXY(s.coords.x, s.coords.z);
ctx.fillStyle = '#111827cc';
ctx.strokeStyle = '#ffffffaa';
ctx.lineWidth = 2;


// outer stroke
ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI*2); ctx.fill();
ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI*2); ctx.stroke();


// label
ctx.font = '14px Urbanist, system-ui';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#e5e7eb';
ctx.fillText(s.name, p.x + 10, p.y);
});
}


function renderLists(data){
// Stations
stationList.innerHTML = '';
data.stations.forEach(s => {
const el = document.createElement('div');
el.className = 'pill';
const y = s.coords.y ?? 64;
el.innerHTML = `<span>${s.name}</span><code>${s.coords.x}, ${y}, ${s.coords.z}</code>`;
el.addEventListener('click', ()=>{
navigator.clipboard.writeText(`/tp ${s.coords.x} ${y} ${s.coords.z}`);
});
stationList.appendChild(el);
});


// Lines
lineList.innerHTML = '';
legend.innerHTML = '';
data.lines.forEach(line => {
const color = line.color || randColor(line.id);
const pill = document.createElement('div');
pill.className = 'pill';
pill.innerHTML = `<span><strong>${line.name}</strong> · ${line.direction}</span><span>${line.stops.length} stops</span>`;
lineList.appendChild(pill);


const leg = document.createElement('div');
leg.className = 'pill';
leg.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${color}"></span>${line.name}`;
legend.appendChild(leg);
});
}


(async function(){
try{
const data = await loadJSON('data/trains.json');
drawNetwork(data);
renderLists(data);
}catch(err){
console.error(err);
}
})();