class VaultEngine {
    constructor() {
        this.collections = [];
        this.rootHandle = null; 
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

            this.rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            return await this.scan(this.rootHandle);
        } catch (err) {
            console.error("Access Denied:", err);
            return [];
        }
    }

    async scan(handle) {
        let results = [];
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

        for await (const entry of handle.values()) {
            if (entry.kind === 'directory') {
                const col = await this.buildCollection(entry);
                
                // Sort images inside collection horizontally A-Z
                col.images.sort((a, b) => collator.compare(a.name, b.name));
                
                results.push(col);
            }
        }

        // Strict Horizontal Alphabetical Sort
        results.sort((a, b) => {
            const titleA = a.tags.title || a.name;
            const titleB = b.tags.title || b.name;
            return collator.compare(titleA, titleB);
        });

        this.collections = results;
        return results;
    }

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
        
        const savedPreview = col.images.find(i => i.name === col.tags.preview);
        col.avatar = savedPreview ? savedPreview.url : (col.images[0]?.url || '');
        
        return col;
    }

    async unzip(file) {
        const zip = await JSZip.loadAsync(file);
        const folders = {};

        for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;

            const parts = path.split('/');
            // Skip files in the root or hidden files
            if (parts.length < 2 || parts[parts.length - 1].startsWith('.')) continue;

            // The parent folder name is the collection name
            const colName = parts[parts.length - 2];
            if (!folders[colName]) folders[colName] = { name: colName, images: [], tags: { title: colName, fav: false } };

            if (path.endsWith('.json')) {
                const text = await entry.async("string");
                try { folders[colName].tags = JSON.parse(text); } catch (e) {}
            } else if (path.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
                const blob = await entry.async("blob");
                folders[colName].images.push({
                    name: parts[parts.length - 1],
                    url: URL.createObjectURL(blob),
                    blob: blob
                });
            }
        }

        this.collections = Object.values(folders).map(f => ({
            ...f,
            fav: f.tags.fav || false,
            avatar: f.images.length > 0 ? f.images[0].url : ""
        }));

        return this.collections;
    }

    async deleteImage(idx, fileName) {
        if (this.isMobile) return;
        const col = this.collections[idx];
        try {
            await col.handle.removeEntry(fileName);
            col.images = col.images.filter(img => img.name !== fileName);
            if (col.tags.preview === fileName) {
                col.tags.preview = col.images[0]?.name || "";
                const firstImg = col.images[0];
                col.avatar = firstImg ? firstImg.url : "";
                await this.save(idx);
            }
            return true;
        } catch (e) {
            alert("Disk error: Could not delete image.");
            return false;
        }
    }

    async addImagesToCollection(idx, fileList) {
        if (this.isMobile || !this.collections[idx]) return;
        const col = this.collections[idx];
        for (const file of fileList) {
            try {
                const fileHandle = await col.handle.getFileHandle(file.name, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(file);
                await writable.close();
                col.images.push({
                    name: file.name,
                    url: URL.createObjectURL(file),
                    size: (file.size / 1024 / 1024).toFixed(2) + 'MB',
                    format: file.name.split('.').pop().toUpperCase(),
                    handle: fileHandle
                });
            } catch (e) { console.error(e); }
        }
        return col.images;
    }

    async createCollection(name) {
        if (this.isMobile || !this.rootHandle) return null;
        try {
            const newFolder = await this.rootHandle.getDirectoryHandle(name, { create: true });
            const tagsHandle = await newFolder.getFileHandle('tags.json', { create: true });
            const tw = await tagsHandle.createWritable();
            await tw.write(JSON.stringify({ title: name, fav: false, preview: "" }, null, 2));
            await tw.close();
            
            // Re-scan and sort everything
            return await this.scan(this.rootHandle);
        } catch (e) {
            alert("Could not create collection.");
            return null;
        }
    }

    async save(idx) {
        if (this.isMobile) return;
        const col = this.collections[idx];
        try {
            col.tags.fav = col.fav;
            const t = await col.handle.getFileHandle('tags.json', { create: true });
            const p = await col.handle.getFileHandle('prompt.txt', { create: true });
            const tw = await t.createWritable(); 
            await tw.write(JSON.stringify(col.tags, null, 2)); 
            await tw.close();
            const pw = await p.createWritable(); 
            await pw.write(col.prompt); 
            await pw.close();
        } catch (e) { console.error(e); }
    }
}