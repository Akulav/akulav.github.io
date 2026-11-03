// ---------- project data ----------
const GH = "https://github.com/akulav/";

const LANG_COLORS = {
  JavaScript: "#f7df1e",
  Python: "#3b8eea",
  Rust: "#ff7a3d",
  "C#": "#a179dc",
};

const pinned = [
  {
    repo: "akulavbox",
    title: "AkulavBox",
    icon: "☁️",
    lang: "JavaScript",
    accent: "#00d4ff",
    desc: "A self-hosted personal cloud: files, photo albums, music, videos, books and chat with voice/video calls, all from one Node.js server with a no-build frontend.",
    features: ["AES-256 encryption at rest", "50 GB chunked uploads", "WebRTC calls", "EPUB reader", "Multi-user quotas"],
  },
  {
    repo: "local-ai-ui",
    title: "Lumen",
    icon: "✨",
    lang: "Rust",
    accent: "#ff7a3d",
    desc: "Hassle-free local AI in a single Windows exe. Rust + Tauri app that sets up llama.cpp for you and chats with local LLMs, with web search, deep research and project RAG.",
    features: ["Deep research", "Hybrid RAG (BM25 + vectors)", "Diff cards with undo", "Model manager", "Live tokens/s & VRAM"],
  },
  {
    repo: "ai-lawyer-moldova",
    title: "Avocat AI Moldova",
    icon: "⚖️",
    lang: "Python",
    accent: "#7c5cff",
    desc: "A local AI legal information assistant for the laws of the Republic of Moldova. Ask in plain language and get answers with article references and source links. Everything stays on your computer.",
    features: ["Answers with citations", "Legal-branch tree routing", "Repeal & status tracking", "Diacritic-aware search", "Fully local"],
  },
  {
    repo: "ai-security-modeler",
    title: "Security Modeler",
    icon: "🛡️",
    lang: "Python",
    accent: "#ff4fd8",
    desc: "Map your devices, accounts, network and data as an interactive graph, then see exactly what breaks when one is lost or hacked, explained by a local AI.",
    features: ["Blast-radius analysis", "34 node types", "Takeover paths", "2FA weakness finder", "Local LLM insights"],
  },
];

const more = [
  { repo: "university-archive", icon: "🎓", lang: "C#", desc: "Projects, labs and coursework from university: algorithms, compilers, x86 bootloaders and game AIs." },
  { repo: "akulav-mc-launcher", icon: "⛏️", lang: "C#", desc: "A lightweight, open-source Minecraft launcher. No telemetry, no bloat, easy memory control." },
  { repo: "offline-password-manager", icon: "🔐", lang: "C#", desc: "An offline, encrypted password manager that never touches the network." },
  { repo: "ip-change-logger", icon: "🌐", lang: "C#", desc: "Logs IP changes when you're using a proxy or a VPN." },
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
    <div class="top"><span class="icon">${p.icon}</span><span class="pin">📌 pinned</span></div>
    <h3>${p.title}</h3>
    <div class="repo">akulav/${p.repo}</div>
    <p class="desc">${p.desc}</p>
    <ul class="features">${p.features.map((f) => `<li>${f}</li>`).join("")}</ul>
    <div class="card-foot">
      <span class="lang"><i></i>${p.lang}</span>
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
    <a class="stretched" href="${GH}${p.repo}" target="_blank" rel="noopener" aria-label="${p.repo} on GitHub"></a>
    <h3><span class="emoji">${p.icon}</span>${p.repo}</h3>
    <p>${p.desc}</p>
    <div class="card-foot">
      <span class="lang"><i></i>${p.lang}</span>
      <span class="view"><span class="arrow">↗</span></span>
    </div>`;
  moreGrid.appendChild(el);
});

// footer marquee + year
const words = ["self-hosted", "local AI", "privacy first", "Rust", "Python", "JavaScript", "C#", "no telemetry", "open source"];
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
const phrases = ["self-hosted clouds.", "local AI tools.", "privacy-first apps.", "things that just work."];
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
