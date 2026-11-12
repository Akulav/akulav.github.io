// ---------- project data ----------
const GH = "https://github.com/Akulav/";

const LANG_COLORS = {
  JavaScript: "#f7df1e",
  Python: "#3b8eea",
  Rust: "#ff7a3d",
};

const ALL3 = "Windows · Linux · macOS";

// Desktop apps (`release: true`) ship one file per system that installs and updates itself:
// the card links straight to the latest release.
const pinned = [
  {
    repo: "t212-ai-dashboard",
    title: "Aura Portfolio",
    icon: "📈",
    lang: "Rust",
    platforms: ALL3,
    accent: "#2dd4bf",
    release: true,
    desc: "Your Trading212 portfolio, analysed by an AI that never leaves your computer. Holdings, dividends and tax withheld, SEC fundamentals behind a transparent score, and a zero-config llama.cpp analyst.",
    features: ["Holdings, dividends & tax", "Buy-opportunity screen", "Local llama.cpp analyst", "Keys in the OS keychain", "Branded PDF reports"],
  },
  {
    repo: "local-ai-ui",
    title: "Lumen",
    icon: "✨",
    lang: "Rust",
    platforms: ALL3,
    accent: "#ff7a3d",
    release: true,
    desc: "Chat with local AI models on your own computer. Sets up llama.cpp for you, with no Python, no Docker and no cloud, and adds web search, deep research and RAG over your own project folders.",
    features: ["Deep research", "Hybrid RAG (BM25 + vectors)", "Diff cards with undo", "Model manager", "Live tokens/s & VRAM"],
  },
  {
    repo: "ai-lawyer-moldova",
    title: "Avocat AI Moldova",
    icon: "⚖️",
    lang: "Python",
    platforms: ALL3,
    accent: "#7c5cff",
    release: true,
    desc: "Answers questions about the laws of the Republic of Moldova in plain language. Every answer cites the articles it relies on and links to the official sources. The model, legal index and chats all stay on your computer.",
    features: ["Cited, verified answers", "Legal-branch tree routing", "Repeal & status tracking", "Diacritic-aware search", "Romanian & English"],
  },
  {
    repo: "ai-security-modeler",
    title: "Security Modeler",
    icon: "🛡️",
    lang: "Python",
    platforms: ALL3,
    accent: "#34d399",
    release: true,
    desc: "Map your accounts, devices, network and data as one interactive graph. See exactly what breaks when one of them is lost or hacked, and fix the weak spots first, with a local AI explaining the findings.",
    features: ["Lost vs. hacked blast radius", "34 node types", "14 ready-made questions", "PDF report & score", "Breach checks"],
  },
  {
    repo: "hytale-minecraft-server-orchestrator",
    title: "Hyve",
    icon: "🐝",
    lang: "Rust",
    platforms: ALL3,
    accent: "#f5c451",
    release: true,
    desc: "Run and manage Hytale and Minecraft servers from one place: a desktop app on your PC, the same app as a web panel on your headless server.",
    features: ["Hytale & Minecraft Java", "1-click updates with backups", "Desktop or headless", "Versions up or down", "Everything in one folder"],
  },
  {
    repo: "akulav-mc-launcher",
    title: "Akulav Launcher",
    icon: "⛏️",
    lang: "Rust",
    platforms: ALL3,
    accent: "#ff5a5f",
    release: true,
    desc: "A fast, lightweight Minecraft modpack launcher in one native program. Installs mod loaders and Java for you, keeps your saves across pack updates, and updates itself. No spyware, no telemetry, no bloat.",
    features: ["NeoForge, Forge, Fabric, Quilt", "Auto Java runtimes", "Shared libraries & assets", "Works offline", "One-click updates"],
  },
  {
    repo: "akulavbox",
    title: "AkulavBox",
    icon: "☁️",
    lang: "JavaScript",
    platforms: "Self-hosted",
    accent: "#00d4ff",
    desc: "Your files, your cloud. A self-hosted personal cloud for encrypted files, photos, music, videos and books, all from one Node.js server with a no-build frontend.",
    features: ["AES-256 encryption at rest", "50 GB chunked uploads", "Trash with undo", "Download from a link", "Multi-user quotas"],
  },
  {
    repo: "auto-node",
    title: "AutoNode",
    icon: "🚀",
    lang: "JavaScript",
    platforms: "Self-hosted · Linux",
    accent: "#a3e635",
    desc: "Host Node.js and Rust websites on your own Linux machine from a dashboard on your home network: domains, HTTPS, GitHub deploys, files, logs and live system stats. Plain Node.js, zero dependencies.",
    features: ["Cloudflare DNS + dynamic IP", "Built-in HTTPS proxy", "GitHub deploys & rollback", "Health checks & limits", "Cookie-free visitor stats"],
  },
];

const more = [
  { repo: "local-anime", title: "Tsukimi", icon: "🌙", lang: "Rust", release: true, desc: "A fast, native desktop anime player. Finds a working source, starts playback right away and keeps what you download." },
  { repo: "ai-girlfriend", title: "GirlfriendAI", icon: "💬", lang: "Python", release: true, desc: "A Telegram companion you design and run on your own computer, with a personality, a long memory and photos of her own. Nothing leaves your machine." },
  { repo: "offline-password-manager", title: "SeePass", icon: "🔐", lang: "Rust", release: true, desc: "Your passwords in one encrypted file on your own disk. Argon2id + XChaCha20, no cloud, no accounts, no network." },
  { repo: "fast-file-recovery", title: "Fast File Recovery", icon: "🧲", lang: "Rust", release: true, desc: "Get deleted files back, fast. Reads the raw disk and never writes a byte to the disk you're saving." },
  { repo: "fast-disk-eraser", title: "Fast Disk Eraser", icon: "🧹", lang: "Rust", release: true, desc: "Securely erase files, folders and free disk space at full disk speed, from one random pass to DoD and Schneier." },
  { repo: "ip-change-logger", title: "IPTrail", icon: "🛰️", lang: "Rust", release: true, desc: "Watches your public IP, logs every change and flags VPN, proxy, Tor and abuse-list hits. No accounts, no API keys." },
  { repo: "github-tracker", title: "Akulav Tracker", icon: "📊", lang: "Rust", release: true, desc: "Every GitHub repository you own at a glance: commits, streaks, a contribution calendar, and which repos need you." },
  { repo: "document-manager", title: "e-Management ANSC", icon: "🗂️", lang: "JavaScript", desc: "An internal document-management web app for a public agency: chained signing, org chart, audit log and full backups." },
];

// ---------- render ----------
const pinnedGrid = document.getElementById("pinned-grid");
const moreGrid = document.getElementById("more-grid");

pinned.forEach((p, i) => {
  const el = document.createElement("article");
  el.className = "card pinned reveal tilt";
  el.style.setProperty("--accent", p.accent);
  el.style.transitionDelay = `${i * 90}ms`;
  el.innerHTML = `
    <a class="stretched" href="${GH}${p.repo}" target="_blank" rel="noopener" aria-label="${p.title} on GitHub"></a>
    <div class="top"><span class="icon">${p.icon}</span><span class="pin">★ featured</span></div>
    <h3>${p.title}</h3>
    <div class="repo">akulav/${p.repo}</div>
    <p class="desc">${p.desc}</p>
    <ul class="features">${p.features.map((f) => `<li>${f}</li>`).join("")}</ul>
    <div class="card-foot">
      <span class="lang"><i></i>${p.lang}<span class="plat">${p.platforms}</span></span>
      ${p.release ? `<a class="dl" href="${GH}${p.repo}/releases/latest" target="_blank" rel="noopener">Download ↓</a>` : ""}
      <span class="view">View repo <span class="arrow">↗</span></span>
    </div>`;
  pinnedGrid.appendChild(el);
});

more.forEach((p, i) => {
  const el = document.createElement("article");
  el.className = "card mini reveal tilt";
  el.style.setProperty("--accent", LANG_COLORS[p.lang] || "#7c5cff");
  el.style.transitionDelay = `${i * 70}ms`;
  el.innerHTML = `
    <a class="stretched" href="${GH}${p.repo}" target="_blank" rel="noopener" aria-label="${p.title} on GitHub"></a>
    <h3><span class="emoji">${p.icon}</span>${p.title}</h3>
    <div class="repo">akulav/${p.repo}</div>
    <p>${p.desc}</p>
    <div class="card-foot">
      <span class="lang"><i></i>${p.lang}</span>
      ${p.release ? `<a class="dl" href="${GH}${p.repo}/releases/latest" target="_blank" rel="noopener">Download ↓</a>` : ""}
      <span class="view"><span class="arrow">↗</span></span>
    </div>`;
  moreGrid.appendChild(el);
});

// footer marquee + year
const words = ["self-hosted", "local AI", "privacy first", "Rust", "Python", "JavaScript", "no telemetry", "one file per system", "updates itself"];
const track = document.getElementById("marquee");
track.innerHTML = [...words, ...words].map((w) => `<span>${w}</span><span>✦</span>`).join("");
document.getElementById("year").textContent = new Date().getFullYear();

// ---------- scroll reveal ----------
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add("in");
      io.unobserve(e.target);
      // drop the stagger delay once revealed so tilt stays snappy
      setTimeout(() => (e.target.style.transitionDelay = "0ms"), 1200);
    }
  }),
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// ---------- typing effect ----------
const phrases = ["local AI tools.", "self-hosted clouds.", "privacy-first apps.", "desktop apps for every OS.", "things that just work."];
const typedEl = document.getElementById("typed");
let pi = 0, ci = 0, deleting = false;
(function type() {
  const word = phrases[pi];
  typedEl.textContent = word.slice(0, ci);
  if (!deleting && ci < word.length) ci++;
  else if (deleting && ci > 0) ci--;
  else if (!deleting) { deleting = true; return setTimeout(type, 1600); }
  else { deleting = false; pi = (pi + 1) % phrases.length; }
  setTimeout(type, deleting ? 35 : 70);
})();

// ---------- card tilt + spotlight ----------
const canHover = matchMedia("(hover: hover)").matches;
document.querySelectorAll(".tilt").forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    card.style.setProperty("--mx", `${x}px`);
    card.style.setProperty("--my", `${y}px`);
    if (!canHover) return;
    const rx = (y / r.height - 0.5) * -8;
    const ry = (x / r.width - 0.5) * 8;
    card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
  });
  card.addEventListener("pointerleave", () => (card.style.transform = ""));
});

// ---------- cursor glow ----------
const glow = document.querySelector(".cursor-glow");
let gx = innerWidth / 2, gy = innerHeight / 3, tx = gx, ty = gy;
addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; });
(function follow() {
  gx += (tx - gx) * 0.08;
  gy += (ty - gy) * 0.08;
  glow.style.transform = `translate(${gx - 260}px, ${gy - 260}px)`;
  requestAnimationFrame(follow);
})();

// ---------- star constellation background ----------
const canvas = document.getElementById("stars");
const ctx = canvas.getContext("2d");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let W, H, DPR, nodes = [];
const mouse = { x: -9999, y: -9999 };

function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = canvas.width = innerWidth * DPR;
  H = canvas.height = innerHeight * DPR;
  const count = Math.min(140, Math.floor((innerWidth * innerHeight) / 11000));
  nodes = Array.from({ length: count }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.25 * DPR,
    vy: (Math.random() - 0.5) * 0.25 * DPR,
    r: (Math.random() * 1.4 + 0.4) * DPR,
    tw: Math.random() * Math.PI * 2,
  }));
}
addEventListener("resize", resize);
addEventListener("pointermove", (e) => { mouse.x = e.clientX * DPR; mouse.y = e.clientY * DPR; });
addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });
resize();

let scrollY0 = scrollY;
function draw(t) {
  ctx.clearRect(0, 0, W, H);
  const link = 130 * DPR;
  const parallax = (scrollY - scrollY0) * 0.15 * DPR;
  scrollY0 = scrollY;

  for (const n of nodes) {
    n.x += n.vx; n.y += n.vy - parallax;
    // gentle push away from the cursor
    const dx = n.x - mouse.x, dy = n.y - mouse.y, d = Math.hypot(dx, dy);
    if (d < 150 * DPR) { n.x += (dx / d) * 0.8; n.y += (dy / d) * 0.8; }
    if (n.x < 0) n.x += W; if (n.x > W) n.x -= W;
    if (n.y < 0) n.y += H; if (n.y > H) n.y -= H;
  }

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < link) {
        ctx.strokeStyle = `rgba(150, 140, 255, ${(1 - d / link) * 0.22})`;
        ctx.lineWidth = DPR * 0.6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    const md = Math.hypot(a.x - mouse.x, a.y - mouse.y);
    if (md < link * 1.4) {
      ctx.strokeStyle = `rgba(0, 212, 255, ${(1 - md / (link * 1.4)) * 0.45})`;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
    }
    const tw = 0.55 + Math.sin(t * 0.002 + a.tw) * 0.45;
    ctx.fillStyle = `rgba(230, 228, 255, ${tw})`;
    ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
  }
  if (!reduced) requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
