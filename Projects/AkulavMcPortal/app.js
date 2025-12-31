const MANIFEST_URL = 'https://raw.githubusercontent.com/Akulav/akulav.github.io/refs/heads/main/Projects/AkulavMcPortal/modpacks/modpacks.json';
const AGENT_URL = 'ws://localhost:8081';

let allModpacks = [];
let socket, localData = { installed: {}, settings: { Username: "Player", AllocatedRam: 4096 }, isGameRunning: false };
let consoleVisible = false;

async function init() {
    try {
        const response = await fetch(MANIFEST_URL);
        allModpacks = await response.json();
        renderGrid();
        connectAgent();
    } catch (err) {
        console.error("Failed to fetch modpack manifest:", err);
    }
}

function connectAgent() {
    socket = new WebSocket(AGENT_URL);
    socket.onopen = () => { 
        const status = document.getElementById('agent-status');
        status.innerText = "Agent Connected"; 
        status.style.color = "var(--accent)"; 
    };
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
    socket.onclose = () => { 
        const status = document.getElementById('agent-status');
        status.innerText = "Agent Offline"; 
        status.style.color = "#ff4b4b"; 
        setTimeout(connectAgent, 3000); 
    };
}

function updateUI(data) {
    const s = document.getElementById('status-summary'), c = document.getElementById('console'), b = document.getElementById('p-bar');
    if (s) s.innerText = data.msg;
    if (c) { 
        const l = document.createElement('div'); 
        l.innerText = `> ${data.msg}`; 
        c.appendChild(l); 
        c.scrollTop = c.scrollHeight; 
    }
    // Progress Bar mapping: perc is provided by the C# agent
    if (b && data.perc !== -1) {
        b.style.width = data.perc + "%";
        b.style.height = "100%";
        b.style.background = "var(--accent)";
    }
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
    detail.style.flexDirection = "column";

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
                <div style="height:8px; background:rgba(0,0,0,0.5); border-radius:10px; overflow:hidden;"><div id="p-bar" style="height:100%; width:0%; transition: 0.3s ease;"></div></div>
                <div style="display:flex; gap:10px;">
                    <button id="launch-btn" class="primary-btn" style="flex:2" onclick="launch('${id}')">${local ? 'LAUNCH' : 'INSTALL'}</button>
                    ${local ? `<button class="secondary-btn" onclick="launch('${id}', true)">REPAIR</button>` : ''}
                    <button id="kill-btn" class="secondary-btn" style="background:#ff4b4b; display:none;" onclick="kill()">STOP</button>
                </div>
                <button onclick="toggleConsole()" style="background:transparent; color:var(--text-dim); font-size:10px; text-align:left; padding:0; border:none; cursor:pointer;">[ Technical Logs ]</button>
                <div id="console" style="display:none;"></div>
            </div>
        </div>`;
    updateBtns();
}

function toggleConsole() { 
    consoleVisible = !consoleVisible; 
    const el = document.getElementById('console');
    if(el) el.style.display = consoleVisible ? 'block' : 'none'; 
}

function saveSettings() { 
    socket.send(JSON.stringify({
        Type:"save_settings", 
        Username:document.getElementById('user-f').value, 
        Ram:parseInt(document.getElementById('ram-f').value)
    })); 
}

function launch(id, f=false) { 
    saveSettings(); 
    const p = allModpacks.find(x => x.ID === id); 
    socket.send(JSON.stringify({
        Type:"launch", 
        PackID:id, 
        URL:p.URL, 
        API:p.API, 
        Version:p.Version, 
        Force:f, 
        Username:document.getElementById('user-f').value, 
        Ram:parseInt(document.getElementById('ram-f').value)
    })); 
}

function kill() { socket.send(JSON.stringify({Type:"kill_game"})); }

function updateBtns() { 
    const lb = document.getElementById('launch-btn'), kb = document.getElementById('kill-btn'); 
    if(lb && localData.isGameRunning) { 
        lb.disabled = true; 
        lb.innerText = "Running"; 
        if(kb) kb.style.display = "block"; 
    } else if(lb) { 
        lb.disabled = false; 
        if(kb) kb.style.display = "none"; 
    } 
}

function goBack() { 
    document.getElementById('main-view').style.display = 'flex'; 
    document.getElementById('detail-view').style.display = 'none'; 
    renderGrid(); 
}

init();