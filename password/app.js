(function(){
  const qs = sel => document.querySelector(sel);
  const byId = id => document.getElementById(id);
  const $out = byId('output');
  const $meter = byId('meter');
  const $entropy = byId('entropy');
  const $entropyLabel = byId('entropyLabel');
  const $status = byId('status');
  const $download = byId('downloadTxt');
  const $warnings = byId('warnings');

  const els = {
    length: byId('length'),
    lengthNum: byId('lengthNum'),
    lower: byId('lower'), upper: byId('upper'), digits: byId('digits'), symbols: byId('symbols'),
    noSimilar: byId('noSimilar'), requireEach: byId('requireEach'),
    exclude: byId('exclude'), custom: byId('custom'),
    generate: byId('generate'), copy: byId('copy'), regen: byId('regen'), clear: byId('clear'),
    form: byId('form')
  };

  const SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
  };
  const SIMILAR = new Set(['O','0','o','l','1','I','|']);

  // Local storage restore
  const STORAGE_KEY = 'pwgen.settings.v1';
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) {
      Object.keys(saved).forEach(k => {
        if (k in els) {
          const el = els[k];
          if (typeof saved[k] === 'boolean') el.checked = saved[k];
          else el.value = saved[k];
        }
      });
    }
  } catch {}

  function syncLen(from){
    return function(){
      const v = clamp(parseInt(from.value||0,10), parseInt(els.length.min,10), parseInt(els.lengthNum.max,10));
      els.length.value = String(v);
      els.lengthNum.value = String(v);
      updateEntropyUI();
      validate();
    }
  }
  els.length.addEventListener('input', syncLen(els.length));
  els.lengthNum.addEventListener('input', syncLen(els.lengthNum));

  function buildPool(){
    const excludeSet = new Set([...els.exclude.value]);
    const custom = [...els.custom.value].filter(ch => !excludeSet.has(ch));
    const poolBySet = {};
    let pool = [];

    const add = (key) => {
      const enabled = els[key].checked;
      let chars = enabled ? [...SETS[key]] : [];
      if (els.noSimilar.checked) chars = chars.filter(ch => !SIMILAR.has(ch));
      chars = chars.filter(ch => !excludeSet.has(ch));
      poolBySet[key] = chars;
      if (enabled) pool.push(...chars);
    };
    add('lower'); add('upper'); add('digits'); add('symbols');
    pool.push(...custom);
    pool = [...new Set(pool)];
    return {pool, poolBySet};
  }

  function clamp(n, min, max){ return Math.min(Math.max(n, min), max); }

  function entropyBits(length, alphabetSize){
    if (length <= 0 || alphabetSize <= 1) return 0;
    return Math.round(length * (Math.log(alphabetSize) / Math.LN2)); // L * log2(N)
  }

  function strengthLabel(bits){
    if (bits < 100) return 'Weak';
    if (bits >= 100 && bits < 250) return 'Okay';
    if (bits < 750 && bits >= 250) return 'Strong';
    if (bits <= 1750 && bits >= 750) return 'Excellent';
  }

  // Crypto-safe random int in [0, maxExclusive)
  function randInt(max){
    if (max <= 0) return 0;
    const maxUint32 = 0xFFFFFFFF;
    const limit = Math.floor(maxUint32 / max) * max;
    const buf = new Uint32Array(1);
    let r;
    do { crypto.getRandomValues(buf); r = buf[0]; } while (r >= limit);
    return r % max;
  }

  function shuffle(arr){
    for (let i = arr.length - 1; i > 0; i--){
      const j = randInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function generatePassword(){
    const L = clamp(parseInt(els.length.value,10) || 16, 4, 256);
    const {pool, poolBySet} = buildPool();

    if (pool.length === 0){
      throw new Error('Your character pool is empty. Add or enable at least one set.');
    }
    const selectedSets = Object.keys(poolBySet).filter(k => els[k]?.checked);
    const requiredSets = els.requireEach.checked ? selectedSets.filter(k => poolBySet[k].length > 0) : [];
    if (els.requireEach.checked && requiredSets.length === 0){
      throw new Error('All selected sets were excluded. Adjust your options.');
    }
    if (els.requireEach.checked && requiredSets.length > L){
      throw new Error('Length too small to include one from each selected set.');
    }

    const chars = [];
    if (els.requireEach.checked){
      for (const key of requiredSets){
        const set = poolBySet[key];
        chars.push(set[randInt(set.length)]);
      }
    }
    while (chars.length < L){
      chars.push(pool[randInt(pool.length)]);
    }
    shuffle(chars);
    return chars.join('');
  }

    function validate(){
    const {poolBySet} = buildPool();
    const warnings = [];
    const selected = Object.keys(poolBySet).filter(k => els[k]?.checked);
    for (const k of selected){
      if (poolBySet[k].length === 0){
        warnings.push(`Selected set <b>${k}</b> has no usable characters after exclusions.`);
      }
    }
    $warnings.innerHTML = warnings.length ? `<div class="warn">${warnings.join('<br>')}</div>` : '';
    updateEntropyUI();
  }

  function updateEntropyUI(){
    const L = clamp(parseInt(els.length.value,10) || 16, 4, 256);
    const {pool} = buildPool();
    const bits = entropyBits(L, pool.length);
    $entropy.textContent = String(bits);
    const label = strengthLabel(bits);
    $entropyLabel.textContent = `• ${label}`;
    const pct = clamp(bits / 256 * 100, 0, 100);
    $meter.style.width = pct + '%';
    $status.textContent = `Alphabet: ${pool.length} chars • Length: ${L} • ${label}`;
    els.generate.disabled = pool.length === 0;
    els.regen.disabled = ($out.textContent || '') === '—' || pool.length === 0;
    els.copy.disabled = ($out.textContent || '') === '—';
    $download.style.pointerEvents = ($out.textContent || '') === '—' ? 'none' : 'auto';
    $download.style.opacity = ($out.textContent || '') === '—' ? .5 : 1;
  }

  function copyOut(){
    const txt = $out.textContent || '';
    if (!txt || txt === '—') return;
    if (navigator.clipboard && window.isSecureContext){
      navigator.clipboard.writeText(txt).then(()=>toast('Copied to clipboard.')).catch(()=>fallback());
    } else fallback();
    function fallback(){
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied to clipboard.'); }
      catch { toast('Press Ctrl/Cmd+C to copy.', true); }
      finally { ta.remove(); }
    }
  }

  function toast(msg, warn){
    $status.textContent = msg;
    $status.style.color = warn ? 'var(--danger)' : 'var(--muted)';
    setTimeout(updateEntropyUI, 1400);
  }

  ['lower','upper','digits','symbols','noSimilar','requireEach','exclude','custom'].forEach(id=>{
    const el = els[id];
    el.addEventListener('input', ()=>{
      validate();
      try {
        const data = {
          length: parseInt(els.length.value,10), lengthNum: parseInt(els.lengthNum.value,10),
          lower: els.lower.checked, upper: els.upper.checked, digits: els.digits.checked, symbols: els.symbols.checked,
          noSimilar: els.noSimilar.checked, requireEach: els.requireEach.checked,
          exclude: els.exclude.value, custom: els.custom.value
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {}
    });
  });

  els.generate.addEventListener('click', (e)=>{
    e.preventDefault();
    try { $out.textContent = generatePassword(); toast('New password generated.'); }
    catch(err){ $status.textContent = err.message; $status.style.color = 'var(--danger)'; }
    updateEntropyUI();
  });
  els.regen.addEventListener('click', (e)=>{ e.preventDefault(); els.generate.click(); });
  els.copy.addEventListener('click', (e)=>{ e.preventDefault(); copyOut(); });
  els.clear.addEventListener('click', (e)=>{ e.preventDefault(); $out.textContent = '—'; updateEntropyUI(); });

  $download.addEventListener('click', (e)=>{
    const txt = $out.textContent || '';
    if (!txt || txt === '—'){ e.preventDefault(); return; }
    const blob = new Blob([txt+"\n"], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    $download.href = url;
    $download.download = 'password.txt';
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  });

  

  validate(); //to prevent null errors #fffffffffff
  updateEntropyUI();
})();
