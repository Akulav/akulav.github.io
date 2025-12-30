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
    socket.onopen = () => { document.getElementById('agent-status').innerText = "Agent Connected"; document.getElementById('agent-status').style.color = "var(--accent)"; };
    socket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "init_sync") { 
            localData = data.payload; 
            const rI = document.getElementById('ram-f'), uI = document.getElementById('user-f');
            if(rI && !rI.matches(':focus')) rI.value = localData.settings.AllocatedRam;
            if(uI && !uI.matches(':focus')) uI.value = localData.settings.Username;
            renderGrid(); updateBtns(); 
        }
        if (data.type === "status") updateUI(data);
    };
    socket.onclose = () => { document.getElementById('agent-status').innerText = "Agent Offline"; document.getElementById('agent-status').style.color = "#ff4b4b"; setTimeout(connectAgent, 3000); };
}

function updateUI(data) {
    const s = document.getElementById('status-summary'), c = document.getElementById('console'), b = document.getElementById('p-bar');
    if (s) s.innerText = data.msg;
    if (c) { const l = document.createElement('div'); l.innerText = `> ${data.msg}`; c.appendChild(l); c.scrollTop = c.scrollHeight; }
    if (b && data.perc !== -1) b.style.width = data.perc + "%";
}

function renderGrid() {
    const cont = document.getElementById('pack-grid'); if(!cont) return;
    cont.innerHTML = allModpacks.map(p => `
        <div class="pack-card" onclick="showDetails('${p.ID}')">
            <img src="${p.Image}">
            <div class="pack-card-info">
                <h3 style="margin:0">${p.Name} ${localData.installed[p.ID] ? '<span style="color:var(--accent); font-size:12px;">●</span>' : ''}</h3>
                <p style="color:var(--text-dim); margin: 5px 0 0 0; font-size:14px;">v${p.Version}</p>
            </div>
        </div>`).join('');
}

function showDetails(id) {
    const p = allModpacks.find(x => x.ID === id), local = localData.installed[id];
    document.getElementById('main-view').style.display = 'none';
    const detail = document.getElementById('detail-view'); detail.style.display = 'flex';
    detail.innerHTML = `
        <button onclick="goBack()" class="secondary-btn" style="align-self: flex-start; margin-bottom: 20px;">← Gallery</button>
        <div class="detail-container">
            <img src="${p.Image}" class="detail-img">
            <div class="controls">
                <h1 style="margin:0; font-size: 32px; font-weight: 800;">${p.Name}</h1>
                <p style="color:var(--text-dim); margin:0;">${p.Description}</p>
                <div style="display:flex; gap:15px;">
                    <div style="flex:1;"><label style="font-size:11px; color:var(--text-dim); text-transform:uppercase;">Username</label><input type="text" id="user-f" value="${localData.settings.Username}" onchange="saveSettings()"></div>
                    <div style="flex:1;"><label style="font-size:11px; color:var(--text-dim); text-transform:uppercase;">RAM (MB)</label><input type="number" id="ram-f" value="${localData.settings.AllocatedRam}" min="4096" step="512" onchange="saveSettings()"></div>
                </div>
                <div id="status-summary" style="font-size:13px; font-weight:700; color:var(--accent);">Ready</div>
                <div style="height:8px; background:rgba(0,0,0,0.5); border-radius:10px; overflow:hidden;"><div id="p-bar"></div></div>
                <div style="display:flex; gap:10px;">
                    <button id="launch-btn" class="primary-btn" style="flex:2" onclick="launch('${id}')">${local ? 'LAUNCH' : 'INSTALL'}</button>
                    ${local ? `<button class="secondary-btn" onclick="launch('${id}', true)">REPAIR</button>` : ''}
                    <button id="kill-btn" class="secondary-btn" style="background:#ff4b4b; display:none;" onclick="kill()">STOP</button>
                </div>
                <div id="console" style="display:none;"></div>
                <button onclick="toggleConsole()" style="background:transparent; color:var(--text-dim); font-size:10px; text-align:left; padding:0;">[ Technical Logs ]</button>
            </div>
        </div>`;
    updateBtns();
}

function toggleConsole() { consoleVisible = !consoleVisible; document.getElementById('console').style.display = consoleVisible ? 'block' : 'none'; }
function saveSettings() { socket.send(JSON.stringify({Type:"save_settings", Username:document.getElementById('user-f').value, Ram:parseInt(document.getElementById('ram-f').value)})); }
function launch(id, f=false) { saveSettings(); const p = allModpacks.find(x => x.ID === id); socket.send(JSON.stringify({Type:"launch", PackID:id, URL:p.URL, API:p.API, Version:p.Version, Force:f, Username:document.getElementById('user-f').value, Ram:parseInt(document.getElementById('ram-f').value)})); }
function kill() { socket.send(JSON.stringify({Type:"kill_game"})); }
function updateBtns() { const lb = document.getElementById('launch-btn'), kb = document.getElementById('kill-btn'); if(lb && localData.isGameRunning) { lb.disabled = true; lb.innerText = "Running"; if(kb) kb.style.display = "block"; } else if(lb) { lb.disabled = false; if(kb) kb.style.display = "none"; } }
function goBack() { document.getElementById('main-view').style.display = 'flex'; document.getElementById('detail-view').style.display = 'none'; renderGrid(); }
init();