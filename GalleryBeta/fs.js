class VaultEngine {
    constructor() {
        this.collections = [];
        this.isMobile = /iPad|iPhone|iPod/.test(navigator.userAgent);
    }

    async boot() {
        try {
            if (this.isMobile) {
                document.getElementById('zipInput').click();
                return new Promise(r => {
                    document.getElementById('zipInput').onchange = async (e) => {
                        if (!e.target.files[0]) return;
                        r(await this.unzip(e.target.files[0]));
                    };
                });
            }

            if (!window.showDirectoryPicker) {
                alert("Use a modern browser (Chrome/Edge) on HTTPS/Localhost.");
                return [];
            }

            // Store the handle globally in the engine for reloading
            this.rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            return await this.scan(this.rootHandle);
        } catch (err) {
            console.error("Access Denied:", err);
            return [];
        }
    }

    // Renamed to 'save' to match app.js and added to engine
    async buildCollection(handle) {
        let col = { 
            handle, 
            name: handle.name, 
            images: [], 
            tags: { title: handle.name, nsfw: false, tags: [] }, 
            prompt: "", 
            fav: false 
        };

        for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                if (entry.name === 'tags.json') {
                    try { 
                        col.tags = JSON.parse(await file.text()); 
                        col.fav = col.tags.fav || false;
                    } catch(e) {}
                } else if (entry.name === 'prompt.txt') {
                    col.prompt = await file.text();
                } else if (entry.name.match(/\.(png|jpe?g|webp|gif|bmp)$/i)) {
                    col.images.push({ 
                        name: entry.name, 
                        url: URL.createObjectURL(file), 
                        size: (file.size / 1024 / 1024).toFixed(2) + 'MB',
                        format: entry.name.split('.').pop().toUpperCase(),
                        handle: entry
                    });
                }
            }
        }
        
        // Priority: 1. Saved preview from JSON, 2. First image in folder
        const savedPreview = col.images.find(i => i.name === col.tags.preview);
        col.avatar = savedPreview ? savedPreview.url : (col.images[0]?.url || '');
        
        return col;
    }

    async deleteImage(idx, fileName) {
        if (this.isMobile) return;
        const col = this.collections[idx];
        try {
            // Delete from physical disk
            await col.handle.removeEntry(fileName);
            
            // Remove from local data array
            col.images = col.images.filter(img => img.name !== fileName);
            
            // If the deleted image was the avatar, reset it
            if (col.tags.preview === fileName) {
                col.tags.preview = col.images[0]?.name || "";
                const firstImg = col.images[0];
                col.avatar = firstImg ? firstImg.url : "";
                await this.save(idx);
            }
            return true;
        } catch (e) {
            alert("Disk error: Could not delete image. It might be in use.");
            return false;
        }
    }

    async save(idx) {
        if (this.isMobile) return;
        const col = this.collections[idx];
        try {
            // Update the tags object with favorite state before saving
            col.tags.fav = col.fav;
            
            const t = await col.handle.getFileHandle('tags.json', { create: true });
            const p = await col.handle.getFileHandle('prompt.txt', { create: true });
            const tw = await t.createWritable(); 
            await tw.write(JSON.stringify(col.tags, null, 2)); 
            await tw.close();
            
            const pw = await p.createWritable(); 
            await pw.write(col.prompt); 
            await pw.close();
        } catch (e) {
            console.error("Auto-commit failed:", e);
        }
    }

    async scan(handle) {
        let results = [];
        for await (const entry of handle.values()) {
            if (entry.kind === 'directory') {
                const col = await this.buildCollection(entry);
                results.push(col);
            }
        }
        this.collections = results;
        return results;
    }

    

    async unzip(file) {
        const zip = await JSZip.loadAsync(file);
        let map = {};
        for (let path in zip.files) {
            const parts = path.split('/');
            if (parts.length < 2) continue;
            const dir = parts[0];
            if (!map[dir]) map[dir] = { name: dir, images: [], tags: {title: dir}, prompt: "", fav: false };
            
            const entry = zip.files[path];
            if (path.endsWith('tags.json')) map[dir].tags = JSON.parse(await entry.async("string"));
            else if (path.endsWith('prompt.txt')) map[dir].prompt = await entry.async("string");
            else if (path.match(/\.(png|jpe?g|webp)$/i)) {
                const b = await entry.async("blob");
                map[dir].images.push({ name: parts.pop(), url: URL.createObjectURL(b), size: 'N/A', format: 'IMG' });
            }
        }
        this.collections = Object.values(map);
        this.collections.forEach(c => c.avatar = c.images[0]?.url || '');
        return this.collections;
    }

}