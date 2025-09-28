(function () {
  const $ = (s) => document.querySelector(s);
  const grid = $('#grid');
  const q = $('#q');
  const status = $('#status');

  const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  const setStatus = (msg, show = true) => {
    status.textContent = msg;
    status.classList.toggle('hidden', !show);
  };

  function linkFor(folder) {
    // RELATIVE link so it works from file:// and when hosted
    return `./${folder}/index.html`;
  }

  function makeCard(site) {
    const folder = site.folder;
    const title = site.title || titleCase(folder);
    const desc = site.desc || `./${folder}/index.html`;
    const icon = site.icon || title.slice(0, 1).toUpperCase();

    const a = document.createElement('a');
    a.className = 'card';
    a.href = linkFor(folder);
    a.dataset.name = `${folder} ${title}`.toLowerCase();
    a.innerHTML = `
      <div class="icon" aria-hidden="true">${icon}</div>
      <div class="title">${title}</div>
      <div class="desc">${desc}</div>
      <div class="meta">
        <span class="tag">${folder}</span>
        <span class="tag">index.html</span>
      </div>
    `;
    return a;
  }

  function applyFilter() {
    const term = (q?.value || '').trim().toLowerCase();
    const cards = grid.querySelectorAll('.card');
    let visible = 0;
    cards.forEach((c) => {
      const show = !term || c.dataset.name.includes(term);
      c.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    setStatus(visible ? '' : 'No matches.', visible === 0);
  }

  function readInlineJSON() {
    const el = document.getElementById('sites-data');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch {
      return null;
    }
  }

  (function init() {
    const sites = readInlineJSON() || window.SITES || null;
    if (!Array.isArray(sites) || sites.length === 0) {
      setStatus('No sites defined. Add entries to the inline JSON (id="sites-data") or define window.SITES.', true);
      return;
    }
    grid.innerHTML = '';
    sites.forEach((s) => {
      if (!s || !s.folder) return;
      grid.appendChild(makeCard(s));
    });
    setStatus('', false);
    applyFilter();
  })();

  q && q.addEventListener('input', applyFilter);
})();
