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
    
    const titleEl = document.getElementById('editTitle');
    if (titleEl) titleEl.value = col.tags.title || col.name;
    
    // Update Favorite Button State
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
        alert("Preview Updated & Saved to Disk");
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
document.getElementById('editTitle').addEventListener('blur', async (e) => {
    if (activeIdx === null) return;
    const col = engine.collections[activeIdx];
    col.tags.title = e.target.value;
    
    await engine.save(activeIdx);
    render(engine.collections); // Refresh main grid
});

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
    const all = engine.collections.flatMap(c => c.images);
    
    // Hide the sidebar (AI Prompt/Fav bar) for global view
    
    renderImgs(all);
    document.getElementById('editTitle').value = "GLOBAL MOSAIC";
    document.getElementById('detailModal').classList.remove('hidden');
    document.querySelector('.modal-layout').scrollTop = 0; // Resets scroll to top
    document.body.style.overflow = 'hidden'; // Ensure main page doesn't scroll
};

function closeAll() {
    document.getElementById('detailModal').classList.add('hidden');
    document.getElementById('lightbox').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

document.querySelectorAll('.close-trigger').forEach(b => b.onclick = closeAll);
document.getElementById('reloadBtn').onclick = async () => {
    // Check if a folder has actually been opened yet
    if (engine.rootHandle) {
        document.getElementById('statsText').innerText = "RESCANNING VAULT...";
        
        // Use the saved handle to get fresh data
        const freshData = await engine.scan(engine.rootHandle);
        render(freshData);
        
        // Visual feedback that reload is done
        setTimeout(() => {
            document.getElementById('statsText').innerText = `VAULT: ${freshData.length} COLLECTIONS`;
        }, 500);
    } else {
        // If no folder is open, just refresh the page as a fallback
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