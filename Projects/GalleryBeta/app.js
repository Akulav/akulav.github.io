const engine = new VaultEngine(); // Matches the class name in fs.js
let activeIdx = null;
let favOnly = false;

// Elements
const loadBtn = document.getElementById('loadBtn');
const mainGrid = document.getElementById('mainGrid');
const searchInput = document.getElementById('searchInput');

loadBtn.addEventListener('click', async () => {
    const data = await engine.boot();
    if (data && data.length > 0) render(data);
});

function render(data) {
    mainGrid.innerHTML = '';
    const visible = favOnly ? data.filter(c => c.fav) : data;
    document.getElementById('statsText').innerText = `VAULT: ${visible.length} COLLECTIONS`;

    visible.forEach((col) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-media">
                <img src="${col.avatar}" loading="lazy">
                ${col.fav ? '<div class="fav-badge"><i class="fa-solid fa-star"></i></div>' : ''}
            </div>
            <div class="card-info">
                <div class="card-tag" style="font-size:0.75rem; color:var(--accent); margin-bottom:5px; font-weight:700; letter-spacing:1px;">
                    ${col.images.length} HIGH-RES ASSETS
                </div>
                <h3 style="margin:0; font-size:1.3rem; letter-spacing:1px; font-weight:900;">
                    ${col.tags.title || col.name}
                </h3>
            </div>
        `;
        // Corrected property name to 'collections'
        const originalIndex = engine.collections.findIndex(c => c.name === col.name);
        card.onclick = () => openCol(originalIndex);
        mainGrid.appendChild(card);
    });
}

function openCol(idx) {
    activeIdx = idx;
    const col = engine.collections[idx];
    
    // Show management tools for specific collection
    toggleManagementTools(true);
    
    const titleEl = document.getElementById('editTitle');
    if (titleEl) titleEl.value = col.tags.title || col.name;
    
    const favBtn = document.getElementById('modalFavBtn');
    if (favBtn) {
        if (col.fav) favBtn.classList.add('is-fav');
        else favBtn.classList.remove('is-fav');
    }
    
    renderImgs(col.images);
    
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.classList.remove('hidden');
        const layout = document.querySelector('.modal-layout');
        if (layout) layout.scrollTop = 0;
    }
    document.body.style.overflow = 'hidden';
}

function renderImgs(imgs) {
    const grid = document.getElementById('imageGrid');
    grid.innerHTML = '';
    
    imgs.forEach(img => {
        const i = document.createElement('img');
        i.src = img.url;
        i.loading = "lazy";
        i.onclick = () => openLightbox(img);
        grid.appendChild(i);
    });

    // Automatically scroll the modal back to the top when content changes
    const layout = document.querySelector('.modal-layout');
    if (layout) layout.scrollTop = 0;
}

function openLightbox(img) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lbImg');
    lbImg.src = img.url;
    
    const i = new Image();
    i.src = img.url;
    i.onload = () => {
        // Changed 'lbInfo' to 'lbMeta' to match HTML
        const metaEl = document.getElementById('lbMeta');
        if (metaEl) {
            metaEl.innerHTML = `
                <span>${i.naturalWidth} x ${i.naturalHeight}</span> • 
                <span>${img.format || 'IMG'}</span> • 
                <span>${img.size || ''}</span>
            `;
        }
    };
    
    // Safety check for buttons to prevent the 'null' crash
    document.getElementById('setAvatarBtn').onclick = async () => {
        const col = engine.collections[activeIdx];
        
        // Update local UI state
        col.avatar = img.url;
        
        // Update persistent data (save the filename, not the temporary URL)
        col.tags.preview = img.name;
        
        // Auto-commit to disk
        await engine.save(activeIdx);
        
        render(engine.collections); // Refresh main grid
    };

    const dlBtn = document.getElementById('downloadBtn');
    if (dlBtn) {
        dlBtn.onclick = () => {
            const a = document.createElement('a'); 
            a.href = img.url; 
            a.download = img.name; 
            a.click();
        };
    }

    const delBtn = document.getElementById('deleteImgBtn');
    if (delBtn) {
        delBtn.onclick = async () => {
            if (confirm(`PERMANENTLY DELETE ${img.name} FROM DISK?`)) {
                const success = await engine.deleteImage(activeIdx, img.name);
                if (success) {
                    closeAll(); // Close lightbox
                    openCol(activeIdx); // Refresh the collection grid
                    render(engine.collections); // Refresh main view
                }
            }
        };
    }

    lb.classList.remove('hidden');
}

// Global Controls
searchInput.oninput = (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = engine.collections.filter(c => 
        (c.tags.title || "").toLowerCase().includes(q) || 
        (c.prompt || "").toLowerCase().includes(q)
    );
    render(filtered);
};

// --- AUTO-COMMIT LOGIC ---

// Save title change automatically when user stops typing/clicks away
document.getElementById('editTitle').onblur = async (e) => {
    if (activeIdx === null) return;
    engine.collections[activeIdx].tags.title = e.target.value;
    await engine.save(activeIdx);
    
    // RE-SORT after title change so it moves to the right spot
    await engine.scan(engine.rootHandle); 
    render(engine.collections); 
};

// Favorite Toggle Logic with Auto-Save
document.getElementById('modalFavBtn').onclick = async function() {
    if (activeIdx === null) return;
    const col = engine.collections[activeIdx];
    
    // Toggle state
    col.fav = !col.fav;
    
    // Update UI
    this.classList.toggle('is-fav');
    
    // Auto-save to disk
    await engine.save(activeIdx);
    render(engine.collections); // Refresh main grid
};

document.getElementById('shuffleBtn').onclick = () => {
    engine.collections[activeIdx].images.sort(() => Math.random() - 0.5);
    renderImgs(engine.collections[activeIdx].images);
};

document.getElementById('favToggleBtn').onclick = () => {
    favOnly = !favOnly;
    document.getElementById('favToggleBtn').classList.toggle('active-fav');
    render(engine.collections);
};

document.getElementById('galleryBtn').onclick = () => {
const all = engine.collections
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .flatMap(c => c.images);    activeIdx = null; // No active collection in mosaic view

    // HIDE the buttons for global mosaic view
    toggleManagementTools(false);
    
    renderImgs(all);
    document.getElementById('editTitle').value = "GLOBAL MOSAIC";
    document.getElementById('detailModal').classList.remove('hidden');
    document.querySelector('.modal-layout').scrollTop = 0;
    document.body.style.overflow = 'hidden';
};

function closeAll() {
    // Hide all possible overlays
    const elements = [
        document.getElementById('detailModal'),
        document.getElementById('lightbox'),
        document.getElementById('promptDrawer'),
        document.getElementById('createModal')
    ];
    
    elements.forEach(el => {
        if (el) el.classList.add('hidden');
    });

    // Reset scroll and show main navbar buttons again
    document.body.style.overflow = 'auto';
    const createBtn = document.getElementById('createColBtn');
    if (createBtn) createBtn.classList.remove('hidden');
}

document.querySelectorAll('.close-trigger').forEach(b => b.onclick = closeAll);
document.getElementById('reloadBtn').onclick = async () => {
    if (engine.rootHandle) {
        document.getElementById('statsText').innerText = "RE-INDEXING DATABASE...";
        
        // This scan now includes the new sorting logic
        const freshData = await engine.scan(engine.rootHandle);
        
        // Re-render the main grid in alphabetical order
        render(freshData);
        
        document.getElementById('statsText').innerText = `VAULT: ${freshData.length} COLLECTIONS`;
    } else {
        location.reload();
    }
};
// --- Navigation & Keyboard Logic ---

// Close everything on Escape key
window.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        closeAll();
    }
});

// Standard close function
function closeAll() {
    const modal = document.getElementById('detailModal');
    const lightbox = document.getElementById('lightbox');
    
    if (modal) modal.classList.add('hidden');
    if (lightbox) lightbox.classList.add('hidden');
    
    // Only restore scroll if both are closed
    if (modal.classList.contains('hidden') && lightbox.classList.contains('hidden')) {
        document.body.style.overflow = 'auto';
    }
}

// Ensure all elements with .close-trigger call closeAll
document.querySelectorAll('.close-trigger').forEach(btn => {
    btn.onclick = (e) => {
        e.stopPropagation();
        closeAll();
    };
});


// --- PROMPT DRAWER LOGIC ---

function togglePrompt() {
    const drawer = document.getElementById('promptDrawer');
    const textarea = document.getElementById('promptTextarea');
    
    if (activeIdx === null) return;
    const col = engine.collections[activeIdx];
    
    // Set text from collection
    textarea.value = col.prompt || "";
    
    drawer.classList.toggle('hidden');
}

// Bind buttons
document.getElementById('modalPromptBtn').onclick = togglePrompt;
document.getElementById('lbPromptBtn').onclick = togglePrompt;
document.getElementById('closePrompt').onclick = () => document.getElementById('promptDrawer').classList.add('hidden');

// Auto-Save Prompt on input (typing)
document.getElementById('promptTextarea').addEventListener('input', async (e) => {
    if (activeIdx === null) return;
    const col = engine.collections[activeIdx];
    
    // Update local data
    col.prompt = e.target.value;
    
    // Auto-commit to prompt.txt on disk
    await engine.save(activeIdx);
});

// Hide drawer when closing modals
const originalCloseAll = closeAll;
closeAll = function() {
    document.getElementById('promptDrawer').classList.add('hidden');
    originalCloseAll();
};

// --- CREATE COLLECTION LOGIC ---

document.getElementById('createColBtn').onclick = () => {
    if (!engine.rootHandle) return alert("Please OPEN VAULT first.");
    document.getElementById('createModal').classList.remove('hidden');
    document.getElementById('newColName').focus();
};

document.getElementById('confirmCreateBtn').onclick = async () => {
    const nameInput = document.getElementById('newColName');
    const name = nameInput.value.trim();
    
    if (!name) return alert("Name cannot be empty.");
    
    document.getElementById('statsText').innerText = "GENERATING DIRECTORY...";
    
    const updatedData = await engine.createCollection(name);
    if (updatedData) {
        render(updatedData);
        nameInput.value = "";
        closeAll();
        document.getElementById('statsText').innerText = `VAULT: ${updatedData.length} COLLECTIONS`;
    }
};

// Update closeAll to include the createModal
const oldCloseAllForCreate = closeAll;
closeAll = function() {
    const createModal = document.getElementById('createModal');
    if (createModal) createModal.classList.add('hidden');
    oldCloseAllForCreate();
};

// --- ADD ASSETS LOGIC ---
document.getElementById('addAssetsBtn').onclick = async () => {
    if (activeIdx === null) return;
    
    // 1. Open Browser File Picker (Multiple Images)
    const fileHandles = await window.showOpenFilePicker({
        multiple: true,
        types: [{
            description: 'Images',
            accept: { 'image/*': ['.png', '.gif', '.jpeg', '.jpg', '.webp'] }
        }]
    });

    if (fileHandles.length > 0) {
        document.getElementById('statsText').innerText = "COMMITTING ASSETS TO DISK...";
        
        // Convert handles to actual File objects
        const files = await Promise.all(fileHandles.map(h => h.getFile()));
        
        // 2. Commit to Disk
        await engine.addImagesToCollection(activeIdx, files);
        
        // 3. UI Refresh
        renderImgs(engine.collections[activeIdx].images);
        render(engine.collections);
        document.getElementById('statsText').innerText = "SYNC COMPLETE";
    }
};

function toggleManagementTools(show) {
    const tools = [
        document.getElementById('createColBtn'),    // New Collection
        document.getElementById('shuffleBtn'),      // Shuffle
        document.getElementById('addAssetsBtn'),    // Add Images
        document.getElementById('modalPromptBtn'),  // Prompt Toggle
        document.getElementById('modalFavBtn')      // Favorite Toggle
    ];

    tools.forEach(btn => {
        if (btn) {
            if (show) btn.classList.remove('hidden');
            else btn.classList.add('hidden');
        }
    });
}