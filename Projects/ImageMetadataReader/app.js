const els = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    metaBody: document.getElementById('metaBody'),
    fileName: document.getElementById('statFileName'),
    fileType: document.getElementById('statType'),
    log: document.getElementById('convLog'),
    preview: document.getElementById('previewArea'),
    img: document.getElementById('imgPreview'),
    btnScrub: document.getElementById('btnScrub'),
    btnRandom: document.getElementById('btnRandom'),
    btnDownload: document.getElementById('btnDownload')
};

let currentFile = null;
let currentImageData = null;

// Event Bindings
els.dropZone.onclick = () => els.fileInput.click();
els.fileInput.onchange = (e) => handleFile(e.target.files[0]);

function log(msg) {
    const entry = document.createElement('div');
    entry.textContent = `> ${msg}`;
    els.log.appendChild(entry);
    els.log.scrollTop = els.log.scrollHeight;
}

function handleFile(file) {
    if (!file) return;
    currentFile = file;
    els.fileName.textContent = file.name.toUpperCase();
    els.fileType.textContent = file.type.split('/')[1].toUpperCase();
    
    log(`Mounting: ${file.name} (${file.type})`);

    const reader = new FileReader();
    reader.onload = (e) => {
        currentImageData = e.target.result;
        els.img.src = currentImageData;
        els.preview.style.display = 'flex';
        
        // Universal Metadata Read
        extractMetadata(file);
        
        els.btnScrub.disabled = false;
        els.btnDownload.disabled = false;
        // Randomization is technically complex for non-JPGs in pure JS, 
        // so we enable it only for JPEGs.
        els.btnRandom.disabled = (file.type !== "image/jpeg");
    };
    reader.readAsDataURL(file);
}

function extractMetadata(file) {
    els.metaBody.innerHTML = '';
    EXIF.getData(file, function() {
        const allMetadata = EXIF.getAllTags(this);
        const entries = Object.entries(allMetadata);
        
        if (entries.length === 0) {
            els.metaBody.innerHTML = '<tr><td colspan="2" class="muted">No EXIF chunks detected.</td></tr>';
            log("Telemetry: No standard EXIF data found.");
            return;
        }

        entries.forEach(([tag, val]) => {
            if (typeof val === 'object') val = JSON.stringify(val);
            const row = `<tr><td>${tag}</td><td>${val}</td></tr>`;
            els.metaBody.innerHTML += row;
        });
        log(`Success: Extracted ${entries.length} metadata tags.`);
    });
}

// SCRUB ACTION: Universal (Canvas Method)
els.btnScrub.onclick = () => {
    log("Executing Global Scrub Protocol...");
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = els.img.naturalWidth;
    canvas.height = els.img.naturalHeight;
    ctx.drawImage(els.img, 0, 0);

    // Re-encoding to DataURL strips all metadata headers
    const cleanData = canvas.toDataURL(currentFile.type, 0.95);
    currentImageData = cleanData;
    els.img.src = cleanData;
    
    els.metaBody.innerHTML = '<tr><td colspan="2" class="primary-text">SYSTEM CLEAN: HEADERS PURGED</td></tr>';
    log("Sanitization complete. Binary headers reconstructed.");
};

// RANDOMIZE ACTION: JPEG Only (Piexif Method)
els.btnRandom.onclick = () => {
    log("Executing JPEG Spoofing...");
    try {
        const spoofExif = {
            "0th": {
                [piexif.ImageIFD.Make]: "AKULAV-OS",
                [piexif.ImageIFD.Model]: "FORGE-PRO-NODE",
                [piexif.ImageIFD.Software]: "META-FORGE-v2"
            },
            "GPS": { [piexif.GPSIFD.GPSStatus]: "V" } // Void GPS
        };
        const exifStr = piexif.dump(spoofExif);
        const newJump = piexif.insert(exifStr, currentImageData);
        currentImageData = newJump;
        els.img.src = newJump;
        log("Success: Spoof tags injected into JPEG header.");
    } catch (e) {
        log("Error: Spoof protocol failed.");
    }
};

// DOWNLOAD ACTION
els.btnDownload.onclick = () => {
    const link = document.createElement('a');
    link.href = currentImageData;
    link.download = `FORGED_${els.fileName.textContent}`;
    link.click();
    log("Export Complete.");
};