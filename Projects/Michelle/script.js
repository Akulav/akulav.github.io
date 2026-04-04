// --- 1. MODULAR DATA CONFIGURATION ---
const siteData = {
    // 50 RANDOM SASSY QUOTES (Line 1 is the setup, Line 2 is the punchline)
    quotes: [
        ["Your boyfriend is looking at me behind your back.", "And YES, I am prettier and smarter than you."],
        ["You're aiming to live off dividends by 2035.", "I'm already the ultimate high-yield asset."],
        ["You flex your CS2 inventory.", "I flex my actual existence."],
        ["You need console commands to beat Games.", "I naturally live in God Mode."],
        ["I am fluent in dealing with absolute chaos.", "And I still look better than you on your wedding day."],
        ["You're stressing over the energy crisis.", "Darling, I *am* the power source."],
        ["You try to optimize your database queries.", "I am already perfectly optimized."],
        ["You're trying to set up local AI models.", "I am already the ultimate supreme intelligence."],
        ["You hit the gym and hit the vape.", "I breathe pure, unadulterated luxury."],
        ["You brew beer in your garage.", "I sip first-class champagne at 35,000 feet."],
        ["You build peer-to-peer chat apps.", "I just leave people on read in real life."],
        ["You're setting up custom Minecraft launchers.", "I'm launching literal flying taxis."],
        ["I have a passport thicker than the Lord of the Rings trilogy.", "Your biggest trip was to the grocery store."],
        ["I survive 14-hour international flights.", "You need a nap after sending two emails."],
        ["My aura is so bright,", "You might need SPF 50 just to look at this website."],
        ["You play Dota 2 in the mud with your teammates.", "I could solo-carry your lobby with my eyes closed."],
        ["I've seen empires rise and fall.", "And I still look better than all of them."],
        ["I am an actual, certified model.", "You are a cautionary tale."],
        ["I own shares in the military-industrial complex.", "You can't even manage your own sleep schedule."],
        ["I am a professional tennis player.", "The only thing you serve is disappointment."],
        ["My beauty routine is classified.", "Your beauty routine is a cry for help."],
        ["I walk into the airport lounge like I own the runway.", "Because technically, I do."],
        ["Gravity applies to you.", "I only experience it when I feel like touching down."],
        ["I don't compete for attention.", "I monopolize it."],
        ["You're taking notes.", "I'm giving the masterclass."],
        ["I invest in worldwide energy and beverages.", "You invest your time in people who don't text back."],
        ["I am a degree-holding master of aviation.", "You struggle to fold a paper airplane."],
        ["My existence is a luxury brand.", "Yours is in the clearance bin."],
        ["I cross time zones faster than you process thoughts.", "Try to keep up."],
        ["You have a good angle.", "I am geometrically flawless."],
        ["The sky is the limit for you.", "The sky is my office."],
        ["They told me to humble myself.", "But I couldn't figure out how to downgrade."],
        ["My smile fixes turbulence.", "Your smile causes it."],
        ["I don't have bad hair days.", "The wind just rearranges it into a new masterpiece."],
        ["You wait for the weekend.", "I make every day a global event."],
        ["You have a bucket list.", "I have a completed itinerary."],
        ["My presence is a privilege.", "Your presence is mandatory attendance."],
        ["They invented first class because I was tired of walking.", "You're lucky to get a middle seat."],
        ["I speak multiple languages.", "And I'm breathtaking in all of them."],
        ["You look for validation.", "I grant it."],
        ["My standards are so high,", "They suffer from altitude sickness."],
        ["I'm not saying I'm perfect.", "Wait, yes I am. Never mind."],
        ["You follow trends.", "I set the cruising altitude."],
        ["I don't do drama.", "I do highly choreographed international incidents."],
        ["You take vacations.", "I go on international conquests."],
        ["My reflection asked me for an autograph.", "I declined. Too busy."],
        ["You hope for a good day.", "I command the day to be excellent."],
        ["If looking this good was a crime,", "I'd have diplomatic immunity."],
        ["I am Michelle.", "And you are welcome."],
        ["Can we talk later? Your boyfriend is writing me..."]
    ],
    countries: [
        { name: "Moldova", flag: "🇲🇩", x: 56, y: 28, desc: "Gracing her home region with unparalleled elegance." },
        { name: "Romania", flag: "🇷🇴", x: 55, y: 28, desc: "Leaving a trail of broken hearts across the Carpathians." },
        { name: "Germany", flag: "🇩🇪", x: 51, y: 24, desc: "Even their engineering pales in comparison to her flawless aesthetic." },
        { name: "United Arab Emirates", flag: "🇦🇪", x: 64, y: 42, desc: "Where the gold standard looks at her to take notes." },
        { name: "Thailand", flag: "🇹🇭", x: 76, y: 46, desc: "The land of smiles, mostly from people admiring her." },
        { name: "Japan", flag: "🇯🇵", x: 86, y: 31, desc: "A futuristic society that finally met a woman ahead of her time." },
        { name: "China", flag: "🇨🇳", x: 78, y: 34, desc: "A history spanning millennia, yet she remains the most stunning phenomenon." },
        { name: "South Korea", flag: "🇰🇷", x: 83, y: 31, desc: "K-Beauty routines rewritten just to mimic her natural glow." },
        { name: "United States", flag: "🇺🇸", x: 22, y: 32, desc: "Conquering the land of the free, one first-class lounge at a time." },
        { name: "Australia", flag: "🇦🇺", x: 85, y: 74, desc: "Even the dangerous wildlife knows better than to mess with a queen." },
        { name: "Cyprus", flag: "🇨🇾", x: 57, y: 33, desc: "Aphrodite's birthplace? Please. The goddess of beauty has a new name." },
        { name: "Turkey", flag: "🇹🇷", x: 58, y: 31, desc: "Empires rose and fell here, but her reign is eternal." },
        { name: "Morocco", flag: "🇲🇦", x: 45, y: 37, desc: "Bringing her own heat to the Sahara." },
        { name: "Hungary", flag: "🇭🇺", x: 53, y: 26, desc: "The thermal baths aren't the only thing radiating pure luxury." },
        { name: "Czechia", flag: "🇨🇿", x: 52, y: 25, desc: "Bohemian rhapsody, but make it first-class." },
        { name: "Spain", flag: "🇪🇸", x: 46, y: 31, desc: "Making the Mediterranean look dull by comparison." },
        { name: "France", flag: "🇫🇷", x: 48, y: 27, desc: "Paris is the city of love, mostly directed at her." },
        { name: "United Kingdom", flag: "🇬🇧", x: 47, y: 23, desc: "Royalty bowed when she landed at Heathrow." },
        { name: "Portugal", flag: "🇵🇹", x: 45, y: 32, desc: "Setting the standard for beauty on the Iberian coast." },
        { name: "Indonesia", flag: "🇮🇩", x: 81, y: 58, desc: "Bali wishes it was as breathtaking as her." },
        { name: "Philippines", flag: "🇵🇭", x: 83, y: 47, desc: "7,000 islands, and she outshines them all." },
        { name: "Mauritius", flag: "🇲🇺", x: 66, y: 68, desc: "Tropical perfection, yet she remains the main attraction." },
        { name: "Ghana", flag: "🇬🇭", x: 47, y: 53, desc: "Redefining Gold Coast glamour." },
        { name: "South Africa", flag: "🇿🇦", x: 53, y: 75, desc: "A diamond-producing nation humbled by her brilliance." },
        { name: "New Zealand", flag: "🇳🇿", x: 92, y: 82, desc: "Middle Earth magic, but she is the true Lord of the Skies." }
    ],
    achievements: [
        {
            icon: "🌍",
            title: "Global Dominance",
            desc: "A worldwide investor spanning from energy and beverages to the military-industrial complex. My portfolio is as aggressive as my beauty.",
            size: "normal" // Row 1, Col 1
        },
        {
            icon: "✈️",
            title: "Aviation Royalty",
            desc: "Holding a Degree in Aviation. I rule the skies natively, you just rent a seat in them.",
            size: "normal" // Row 1, Col 2
        },
        {
            icon: "📸",
            title: "Certified Model",
            desc: "An actual, literal model. The camera loves me, and frankly, who can blame it?",
            size: "tall", // Row 1 & 2, Col 3
            image: "model-pic.jpg" 
        },
        {
            icon: "🚁",
            title: "Pioneering Tech",
            desc: "Shareholder of bleeding-edge technologies like flying taxis. I am funding the future while you're stuck in traffic.",
            size: "wide", // Row 2, Col 1 & 2 (Image on Left)
            image: "tech-bg.jpg" 
        },
        {
            icon: "🎾",
            title: "Court Commander",
            desc: "Professional tennis player. I serve flawless aces while you serve absolute mediocrity.",
            size: "normal" // Row 3, Col 1
        },
        {
            icon: "🎮",
            title: "Apex Predator",
            desc: "Yes, I play video games. And YES, I AM SO MUCH BETTER THAN YOU. It's not a lobby, it's a slaughter.",
            size: "wide" // Removed 'reverse' and the image line
        },
        {
            icon: "👑",
            title: "Absolute Perfection",
            desc: "I am perfection incarnate. End of discussion.",
            size: "full-width highlight-card" // Row 4, Spans all 3 Cols
        }
    ],
    gallery: [
        { src: "photo1.jpg", desc: "Just an unfiltered reminder that the universe definitely has favorites." },
        { src: "photo2.jpg", desc: "My camera roll belongs in the Louvre. Yours belongs in the recently deleted folder." },
        { src: "photo3.jpg", desc: "Lighting is everything, but it helps when you are the actual source of the glow." },
        { src: "photo4.jpg", desc: "Proof that the absolute pinnacle of human evolution was reached right here." },
        { src: "photo5.jpg", desc: "I don't need a golden hour. Every hour I exist is golden." },
        { src: "photo6.jpg", desc: "Your money doesn't impress me. It is your money what is impressed by me." },
        { src: "photo7.jpg", desc: "Looking this good is technically a war crime, but good luck finding a judge who won't just stare." },
        { src: "photo8.jpg", desc: "Some people invest in the market. The smart money invests in looking at me." },
        { src: "photo9.jpg", desc: "This is what happens when perfect genetics meet an absolutely flawless aura." },
        { src: "photo10.jpg", desc: "They say nobody is perfect, which is a cute theory for people who haven't met me." },
        { src: "photo11.jpg", desc: "My face card alone yields higher annual returns than your entire stock portfolio." },
    ],
    detector: {
        title: "Peasant Detector System",
        scanSteps: [
            "Initializing biometric scan...",
            "Analyzing facial symmetry...",
            "Checking bank account routing numbers...",
            "Calculating projected dividend yield... (Pathetic)",
            "Scanning CS2 inventory value...",
            "Evaluating matchmaking MMR...",
            "Checking for severe brain damage...",
            "Cross-referencing aura with global database...",
            "Finalizing inferiority metrics..."
        ],
        verdicts: [
            "🚨 WARNING: PEASANT DETECTED. NOW BOW. 🚨",
            "⚠️ CRITICAL ERROR: NET WORTH TOO LOW TO VIEW THIS PAGE. ⚠️",
            "🛑 AURA CHECK FAILED. 🛑",
            "📉 DIAGNOSIS: TERMINALLY POOR. 📉",
            "🗑️ ALERT: FINANCIAL AND GENETIC MEDIOCRITY DETECTED. 🗑️",
            "⛔ ACCESS DENIED: INSUFFICIENT FUNDS AND BONE STRUCTURE. ⛔",
            "🤡 SCAN COMPLETE: YOU ARE DEFINITELY AN NPC. 🤡",
            "💀 FATAL FLAW: PORTFOLIO LACKS AMBITION. 💀",
            "🤡 ALERT: IN-GAME RANK REFLECTS REAL LIFE SUCCESS. 🤡",
            "🚫 SECURITY BREACH: UNAUTHORIZED COMMONER ON PREMISES. 🚫"
        ],
        content: `
            <div class="detector-container">
                <button id="scan-btn" onclick="runScanner()">Initiate Scan</button>
                <div id="scan-results" class="hidden">
                    <div class="radar"></div>
                    <div class="terminal-box">
                        <p id="scan-progress" class="terminal-text">AWAITING TARGET...</p>
                    </div>
                    <p id="final-verdict" class="hidden final-verdict"></p>
                </div>
            </div>
        `
    }
};

// --- 2. RENDER ENGINE ---
const contentDiv = document.getElementById('app-content');
const navDiv = document.getElementById('nav-tabs');

const tabs = [
    { id: 'intro', label: 'The Truth', render: renderIntro },
    { id: 'achievements', label: 'Excellence', render: renderAchievements },
    { id: 'countries', label: 'Global Airspace', render: renderCountries },
    { id: 'gallery', label: 'Visual Proof', render: renderGallery },
    { id: 'detector', label: 'Peasant Detector', render: renderDetector }
];

// Initialize Navigation
tabs.forEach((tab, index) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (index === 0 ? ' active' : '');
    btn.innerText = tab.label;
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        contentDiv.className = 'fade-out';
        
        // Signal the typewriter to stop if it's currently running
        window.isTyping = false; 

        setTimeout(() => {
            tab.render();
            contentDiv.className = 'fade-in';
            window.scrollTo(0, 0); 
        }, 300);
    };
    navDiv.appendChild(btn);
});

// --- RENDER FUNCTIONS ---

async function renderIntro() {
    // Pick a random quote pair from the 50 quotes
    const randomQuote = siteData.quotes[Math.floor(Math.random() * siteData.quotes.length)];
    
    contentDiv.innerHTML = `
        <h2 class="section-title">The Truth.</h2>
        <div class="hero-split">
            <div class="hero-image-container" style="background: var(--bg-card); display: flex; align-items: center; justify-content: center; min-height: 500px;">
                <img src="main-portrait.jpg" alt="Michelle" class="hero-portrait" onerror="this.style.display='none'; this.parentElement.innerHTML='<h3 style=\\'color: var(--accent);\\'>Add main-portrait.jpg</h3>';">
            </div>
            
            <div class="hero-text-container">
                <div class="sassy-container">
                    <p class="sassy-text">"<span id="type-line-1"></span>"</p>
                    <p class="sassy-text highlight"><span id="type-line-2"></span><span id="typing-cursor" class="typing-cursor">|</span></p>
                    <p id="subtext-reveal" class="sassy-subtext hidden-opacity">— Michelle, stating absolute facts.</p>
                </div>
                
                <div id="stats-reveal" class="vital-stats hidden-opacity">
                    <div class="stat-box"><span class="stat-label">Status</span><span class="stat-value">Unbothered</span></div>
                    <div class="stat-box"><span class="stat-label">Aura</span><span class="stat-value">Immeasurable</span></div>
                    <div class="stat-box"><span class="stat-label">Altitude</span><span class="stat-value">Always Above You</span></div>
                </div>
            </div>
        </div>
    `;

    // Start robust typewriter
    window.isTyping = true;
    await typeText('type-line-1', randomQuote[0], 35);
    
    if (window.isTyping) {
        await new Promise(r => setTimeout(r, 400)); // Pause between lines
        await typeText('type-line-2', randomQuote[1], 35);
    }
    
    if (window.isTyping) {
        document.getElementById('subtext-reveal').classList.add('revealed-opacity');
        document.getElementById('stats-reveal').classList.add('revealed-opacity');
    }
}

// Bulletproof async typing function
async function typeText(elementId, text, speed) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    for (let i = 0; i < text.length; i++) {
        if (!window.isTyping || !document.getElementById(elementId)) return; // Instantly aborts if tab changes
        el.innerHTML += text.charAt(i);
        await new Promise(res => setTimeout(res, speed));
    }
}

function renderAchievements() {
    let html = `<h2 class="section-title">The Vault of Excellence</h2>`;
    html += `<div class="bento-grid">`;

    siteData.achievements.forEach((a, index) => {
        // Cascade animation delay so they don't all appear at the exact same millisecond
        const delay = index * 0.1; 
        
        // Only render the image wrapper if an image is provided in the data
        const imgHtml = a.image 
            ? `<div class="bento-img-wrapper">
                 <div class="bento-image" style="background-image: url('${a.image}');"></div>
                 <div class="bento-img-fallback" style="display:none; text-align:center; padding: 20px; color: var(--accent);">Missing ${a.image}</div>
               </div>` 
            : '';
        
        html += `
            <div class="bento-card ${a.size} hidden-reveal" style="transition-delay: ${delay}s">
                ${imgHtml}
                <div class="bento-content">
                    <span class="bento-icon">${a.icon}</span>
                    <h3 class="bento-title">${a.title}</h3>
                    <p class="bento-desc">${a.desc}</p>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    contentDiv.innerHTML = html;
    
    // Trigger scroll animations
    setTimeout(initScrollAnimations, 100);

    // Fallback script to hide missing images and show text instead of breaking the layout
    setTimeout(() => {
        document.querySelectorAll('.bento-image').forEach(img => {
            const bgImage = img.style.backgroundImage.slice(5, -2);
            const testImg = new Image();
            testImg.onerror = function() {
                img.style.display = 'none';
                img.nextElementSibling.style.display = 'block';
            };
            testImg.src = bgImage;
        });
    }, 200);
}

function renderGallery() {
    let html = `<h2 class="section-title">Flawless Evidence</h2><div class="lookbook-container">`;
    
    siteData.gallery.forEach((item, index) => {
        // Alternates the layout: Image on the left, then image on the right
        const alignment = index % 2 === 0 ? 'image-left' : 'image-right';
        
        html += `
            <div class="lookbook-row ${alignment} hidden-reveal">
                <div class="lookbook-photo-wrapper">
                    <img src="${item.src}" alt="Perfection" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'missing-iphone-pic\\'>Add ${item.src}</div>';">
                </div>
                <div class="lookbook-text-wrapper">
                    <p class="lookbook-caption">"${item.desc}"</p>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    contentDiv.innerHTML = html;
    
    // Trigger the smooth scroll reveal animations
    setTimeout(initScrollAnimations, 100);
}

// --- LIGHTBOX LOGIC ---
window.openLightbox = function(src, desc) {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox-caption').innerText = desc;
    
    const lb = document.getElementById('lightbox');
    lb.classList.remove('hidden');
    // Small delay to allow CSS display:block to register before fading in
    setTimeout(() => lb.classList.add('visible'), 10); 
}

window.closeLightbox = function(event) {
    // Prevent closing if she clicks directly on the image itself
    if (event && event.target.id === 'lightbox-img') return; 
    
    const lb = document.getElementById('lightbox');
    lb.classList.remove('visible');
    setTimeout(() => lb.classList.add('hidden'), 400); // Wait for fade out
}

function renderDetector() {
    contentDiv.innerHTML = `<h2 class="section-title">${siteData.detector.title}</h2>${siteData.detector.content}`;
}

function renderCountries() {
    let html = `<h2 class="section-title">Global Airspace Conquered</h2>`;
    
    html += `<div class="map-wrapper"><div class="map-container">
                <img src="world-map.svg" alt="World Map" class="base-map" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg'">`;
    siteData.countries.forEach(c => {
        html += `<div class="map-dot" style="left: ${c.x}%; top: ${c.y}%;" title="${c.name}"><div class="dot-pulse"></div></div>`;
    });
    html += `</div></div>`;

    html += `<div class="quick-glance-flags">`;
    siteData.countries.forEach(c => html += `<span class="glance-flag" title="${c.name}">${c.flag}</span>`);
    html += `</div>`;

    html += `<div class="staggered-timeline">`;
    siteData.countries.forEach((c, index) => {
        const alignment = index % 2 === 0 ? 'align-left' : 'align-right';
        html += `
            <div class="country-row ${alignment} hidden-reveal">
                <div class="country-flag-large">${c.flag}</div>
                <div class="country-details">
                    <h3 class="country-title">${c.name}</h3>
                    <div class="country-line"></div>
                    <p class="country-description">${c.desc}</p>
                </div>
            </div>`;
    });
    html += `</div>`;
    
    contentDiv.innerHTML = html;
    setTimeout(initScrollAnimations, 100);
}

// --- LOGIC FUNCTIONS ---
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('revealed');
        });
    }, { threshold: 0.2 });
    document.querySelectorAll('.hidden-reveal').forEach(el => observer.observe(el));
}

window.runScanner = async function() {
    document.getElementById('scan-btn').style.display = 'none';
    const results = document.getElementById('scan-results');
    const progressText = document.getElementById('scan-progress');
    const verdictEl = document.getElementById('final-verdict');
    
    // Reset from previous scans
    results.classList.remove('hidden');
    verdictEl.classList.add('hidden');
    verdictEl.classList.remove('pop-in');

    const steps = siteData.detector.scanSteps;
    const verdicts = siteData.detector.verdicts;

    // Loop through the scanning steps with elegant fading
    for (let i = 0; i < steps.length; i++) {
        if (!document.getElementById('scan-progress')) return; 
        
        // 1. Fade the text out
        progressText.style.opacity = 0;
        
        // Wait 300ms for the fade-out animation to finish
        await new Promise(res => setTimeout(res, 300)); 
        if (!document.getElementById('scan-progress')) return;

        // 2. Change the text while it is invisible
        progressText.innerText = steps[i];
        
        // 3. Fade the text back in
        progressText.style.opacity = 1;

        // 4. Hold the text on screen longer (1.2 seconds) for elegance
        await new Promise(res => setTimeout(res, 1200)); 
    }

    // Pick a random savage verdict
    const randomVerdict = verdicts[Math.floor(Math.random() * verdicts.length)];
    
    // Display the final verdict with the same elegance
    if (document.getElementById('scan-progress')) {
        progressText.style.opacity = 0;
        
        setTimeout(() => {
            progressText.innerText = "SCAN COMPLETE.";
            progressText.style.opacity = 1;
            
            verdictEl.innerText = randomVerdict;
            verdictEl.classList.remove('hidden');
            verdictEl.classList.add('pop-in'); 
        }, 300);
        
        // Bring the button back after 5 seconds to scan again
        setTimeout(() => {
            if(document.getElementById('scan-btn')) {
                document.getElementById('scan-btn').style.display = 'inline-block';
                document.getElementById('scan-btn').innerText = "Scan Another Peasant";
            }
        }, 5000);
    }
}

// Load first tab
renderIntro();