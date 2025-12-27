const projects = [
    { "folder": "Projects/PasswordGenerator", "title": "Cipher Key", "desc": "Client-side military-grade password generation protocols.", "icon": "🔒" },
    { "folder": "Projects/Gallery", "title": "Visual Cortex", "desc": "High-speed immersive media viewer and visual collection.", "icon": "🖼️" },
    { "folder": "Projects/Minecraft", "title": "Server Uplink", "desc": "Real-time status monitoring for the Minecraft instance.", "icon": "🌍" },
    { "folder": "Projects/ImageConvertor", "title": "Pixel Forge", "desc": "Browser-based rapid image processing and conversion.", "icon": "📸" },
    { "folder": "Projects/GalleryBeta", "title": "Cortex Beta", "desc": "Experimental features and unstable builds access.", "icon": "🧪" },
    { "folder": "Projects/ImageMetadataReader", "title": "Going Dark", "desc": "Image Scrubber.", "icon": "🧹" }
];

const grid = document.getElementById('projectGrid');

function init() {
    projects.forEach((proj, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'card-wrapper';
        // Stagger animation delay
        wrapper.style.animationDelay = `${index * 0.1}s`;
        
        wrapper.innerHTML = `
            <a href="./${proj.folder}/index.html" class="card">
                <div class="card-content-top">
                    <span class="folder-name">/${proj.folder}</span>
                    <h2>${proj.title}</h2>
                    <p>${proj.desc}</p>
                </div>
                <div class="card-footer">
                    <span class="icon">${proj.icon}</span>
                    <span class="btn-access">Initialize</span>
                </div>
            </a>
        `;
        
        const card = wrapper.querySelector('.card');
        
        // --- 3D TILT LOGIC ---
        // This calculates the mouse position relative to the center of the card
        // and rotates the card accordingly.
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Find center
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            // Calculate rotation intensity (divide by higher number for subtler effect)
            const rotateX = (y - centerY) / 15;
            const rotateY = (centerX - x) / 15;
            
            // Apply transformation
            // perspective(1000px) is crucial for the 3D effect
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });

        // Reset card on mouse leave
        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        });

        grid.appendChild(wrapper);
    });

    document.getElementById('year').textContent = new Date().getFullYear();
}

// Wait for everything to load before running
window.onload = init;