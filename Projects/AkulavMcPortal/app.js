const AGENT_URL = 'ws://localhost:8081';

const allModpacks = [
  { "ID": "gera", "Name": "GoldenEra - Rebooted", "Version": "1.3.1", "API": "neoforge-21.1.128", "URL": "https://www.dropbox.com/scl/fi/ep78cxpdda2mdg2vkx3hi/gera.zip?rlkey=jbhjvcj3mdf35tkaryydjgyi0&st=mf07m3zj&dl=1", "Image": "gera.jpg", "Description": "Classic vibes, modern NeoForge engine." },
  { "ID": "rera", "Name": "RelaxEra", "Version": "3.0.0", "API": "1.20.1-forge-47.4.6", "URL": "https://www.dropbox.com/scl/fi/i2aqjwxiydjogyrhse9r8/rera.zip?rlkey=e60i2dn00iw1xpoi2repa6xze&st=8e84lxdz&dl=1", "Image": "rera.png", "Description": "Hardcore Industrialization, in a chill landscape." }
];

let socket, localData = { installed: {}, settings: { Username: "Player", AllocatedRam: 4096 }, isGameRunning: false };
let consoleVisible = false;

function init() { renderGrid(); connectAgent(); }

function connectAgent() {
    socket = new WebSocket(AGENT_URL);
    socket.onopen = () => { const b = document.getElementById('agent-status'); b.innerText = "AGENT ONLINE"; b.style.background = "#00ffa3"; b.style.color = "black"; };
    socket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "init_sync") { 
            localData = data.payload; 
            const rI = document.getElementById('ram-f'), uI = document.getElementById('user-f');
            if(rI && !rI.matches(':focus')) rI.value = localData.settings.AllocatedRam;
            if(uI && !uI.matches(':focus')) uI.value = localData.settings.Username;
            renderGrid(); updateLaunchBtn(); 
        }
        if (data.type === "status") updateStatus(data);
    };
    socket.onclose = () => { const b = document.getElementById('agent-status'); b.innerText = "AGENT OFFLINE"; b.style.background = "#ef4444"; b.style.color = "white"; setTimeout(connectAgent, 3000); };
}

function updateStatus(data) {
    const s = document.getElementById('status-summary'), c = document.getElementById('console'), b = document.getElementById('p-bar');
    if (s) s.innerText = data.msg;
    if (c) { const l = document.createElement('div'); l.innerText = `[${new Date().toLocaleTimeString()}] ${data.msg}`; c.appendChild(l); c.scrollTop = c.scrollHeight; }
    if (b && data.perc !== -1) b.style.width = data.perc + "%";
}

function toggleConsole() { consoleVisible = !consoleVisible; document.getElementById('console').style.display = consoleVisible ? 'block' : 'none'; }

function renderGrid() {
    const cont = document.getElementById('pack-grid'); if(!cont) return;
    cont.innerHTML = allModpacks.map(p => `<div class="pack-card" onclick="showDetails('${p.ID}')"><img src="${p.Image}"><div class="pack-card-info"><h3>${p.Name} ${localData.installed[p.ID] ? '✅' : ''}</h3><p>Version ${p.Version}</p></div></div>`).join('');
}

function showDetails(id) {
    const p = allModpacks.find(x => x.ID === id), local = localData.installed[id], needsUp = local && local.version !== p.Version;
    document.getElementById('main-view').style.display = 'none';
    const detail = document.getElementById('detail-view'); detail.style.display = 'block';
    detail.innerHTML = `
        <button onclick="goBack()" class="secondary-btn" style="margin-bottom:20px;">← Back</button>
        <div class="detail-container">
            <img src="${p.Image}" class="detail-img">
            <div class="controls">
                <h1>${p.Name}</h1>
                <input type="text" id="user-f" value="${localData.settings.Username}" onchange="saveSettings()">
                <input type="number" id="ram-f" value="${localData.settings.AllocatedRam}" min="4096" step="512" onchange="saveSettings()">
                <div id="status-summary" style="color:var(--accent); font-size:13px; margin-top:10px;">Agent Standby</div>
                <div style="height:8px; background:#000; border-radius:10px; overflow:hidden;"><div id="p-bar" style="height:100%; width:0%; background:var(--accent); transition:0.3s;"></div></div>
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <button id="launch-btn" class="primary-btn" onclick="launch('${id}')" style="flex:2">${needsUp ? 'UPDATE' : local ? 'LAUNCH' : 'INSTALL'}</button>
                    ${local ? `<button id="repair-btn" class="secondary-btn" onclick="launch('${id}', true)">REPAIR</button>` : ''}
                    <button id="kill-btn" class="secondary-btn" style="background:#ff4b4b; display:none;" onclick="killGame()">FORCE KILL</button>
                </div>
                <button onclick="toggleConsole()" class="secondary-btn" style="margin-top:10px; font-size:10px; opacity:0.5;">TOGGLE ADVANCED LOGS</button>
                <div id="console" style="display:none;"></div>
            </div>
        </div>`;
    updateLaunchBtn();
}

function updateLaunchBtn() {
    const lb = document.getElementById('launch-btn'), kb = document.getElementById('kill-btn'), rb = document.getElementById('repair-btn');
    if (!lb) return;
    if (localData.isGameRunning) { lb.disabled = true; lb.innerText = "GAME RUNNING"; lb.style.opacity = "0.5"; if(kb) kb.style.display = "block"; if(rb) rb.style.display = "none"; }
    else { lb.disabled = false; if(kb) kb.style.display = "none"; if(rb) rb.style.display = "block"; }
}

function saveSettings() {
    const u = document.getElementById('user-f')?.value, r = parseInt(document.getElementById('ram-f')?.value);
    if (!u || u === "undefined" || isNaN(r)) return;
    socket.send(JSON.stringify({ Type: "save_settings", Username: u, Ram: r }));
}

function launch(id, f = false) { if (localData.isGameRunning) return; saveSettings(); const p = allModpacks.find(x => x.ID === id); socket.send(JSON.stringify({ Type: "launch", PackID: id, Name: p.Name, URL: p.URL, API: p.API, Version: p.Version, Username: document.getElementById('user-f').value, Ram: parseInt(document.getElementById('ram-f').value), Force: f })); }
function killGame() { socket.send(JSON.stringify({ Type: "kill_game" })); }
function goBack() { document.getElementById('main-view').style.display = 'block'; document.getElementById('detail-view').style.display = 'none'; renderGrid(); }
init();