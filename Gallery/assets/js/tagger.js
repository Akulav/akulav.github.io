(function () {
  const { state } = PV;
  const { loadPromptText } = PV;

  // --------------------------------------------------------------------------
  // 0) Stopwords / Blocklist / NSFW
  // --------------------------------------------------------------------------
  const STOP = new Set([
    // boilerplate / quality tokens
    'masterpiece','best','quality','ultra-detailed','ultradetailed','highres','high-res','hires',
    'full','body','uncropped','centered','composition','solo','1girl','girl','female','woman',
    'detailed','realistic','cinematic','shading','lighting','light','soft','warm','glow','cozy',
    'atmosphere','background','intimate','bedroom','sheets','silky','detailed','with','and','or',
    'either','showing','naturally','options','option','either','the','a','an','in','on','at','of',
    'to','for','by','from','over','under','front','back','low','high','very','more','less','no',
    'neck','half','out','other','wrist','while','visibly','visible','looking','looking at viewer',
    'looking at camera','pretending','head','herself','her','surface','view','viewer','camera',
    'slight','slightly','own','forward','both','down','cheek','long','look','link','but','support',
    'onto','only','one','through','optional','other','above','below','near','upper','edge','frame',
    'focus','scene','setting','open','off','together','between','still','clearly','completely',
    'poking','them','tea','up','turn','tugging','tight','toned','stare','side',
    // generic anatomy/objects we don't want as standalone tags
    'hand','hands','arm','arms','leg','legs','fabric','cloth','clothes','clothing','outfit',
    'spotlight','object','thing'
  ]);

  const BLOCKLIST = new Set([
    // hard block nonsense/generic tokens even if they slip past STOP
    'spotlight','hand','hands','fabric','cloth','clothing','outfit','surface','object','thing',
    'composition','centered','lighting','shading','background','atmosphere'
  ]);

  const NSFW_HARD = ['pussy','vagina','clitoris','labia','areola','nipples','boobs','breast','penis','cum','semen','cock','vulva'];
  const NSFW_SOFT = ['nude','naked','nsfw','lewd','panties','wet','saliva','fluids','underboob','underwear','lingerie','spread','spread_pussy','pussy_spread','panties_pulled_aside'];

  // --------------------------------------------------------------------------
  // 1) Explicit canonicalization (NO generic stemming)
  // --------------------------------------------------------------------------
  // Equivalence groups (explicit only; we do not do -ing/-ed chopping)
  const EQUIV = [
    { canon:'playful',        forms:['playfully'] },
    { canon:'wet',            forms:['wetly','wetness','drenched','soaked','soaking','dripping','drippin','puddling','puddle','drenching'] },
    { canon:'shiny',          forms:['shine','shining','glistening','glossy','sheen'] },
    { canon:'smile',          forms:['smiling','smiled'] },
    { canon:'kiss',           forms:['kissing','kissed'] },
    { canon:'peeking',        forms:['peek','peeks','peeked'] },
    { canon:'orgasm',         forms:['orgasmic'] },
    { canon:'masturbation',   forms:['masturbating','masturbate','self_pleasure','self-stimulation'] },
    { canon:'pressing',       forms:['pressed','press'] },
    { canon:'squeeze',        forms:['squeezing','squeezed','grabbing'] },
    { canon:'arching',        forms:['arched','arch'] },
    { canon:'blushing',       forms:['blush','blushed'] },
    { canon:'tied',           forms:['tie','tying'] },
    { canon:'straddling',     forms:['straddle'] },
    { canon:'standing',       forms:['stand','stood'] },
    { canon:'sitting',        forms:['sit','sat'] },
    { canon:'lying',          forms:['laying','lie','lied','lay'] },
    { canon:'sunglasses',     forms:['sunglass'] },
    { canon:'sunlight',       forms:['sun light','sun-light'] },

    // anatomy canonicalization (your preference)
    // breasts-family -> boobs
    { canon:'boobs',          forms:['breast','breasts','boob','tits'] },
    // nipples -> nipple
    { canon:'nipple',         forms:['nipples'] },
    // pussy-family -> pussy (singular)
    { canon:'pussy',          forms:['vagina','vulva','pussies'] },
    // butt-family -> ass
    { canon:'ass',            forms:['butt','buttocks','booty'] },

    // wearables
    { canon:'panties',        forms:['panty'] }, // keep plural "panties" as canonical
    { canon:'lingerie',       forms:['underwear'] },

    // face
    { canon:'portrait',       forms:['face'] },

    // hair
    { canon:'ponytail',       forms:['pony-tail','pony tail'] },
    { canon:'colored_hair',   forms:['colored hair','dyed hair','colorful hair'] },

    // SD common
    { canon:'solo_female',    forms:['1girl','solo'] },
  ];

  const CANON = new Map();
  for (const g of EQUIV) {
    const base = g.canon.toLowerCase();
    CANON.set(base, base);
    (g.forms || []).forEach(f => CANON.set(String(f).toLowerCase(), base));
  }

  // --------------------------------------------------------------------------
  // 2) Phrase pass (multi-word → semantic tags)
  // --------------------------------------------------------------------------
  const PHRASES = [
    // --- Duo detection (2 girls / lesbian -> duo) ---
    { re:/\b(2\s*girls?|two\s+girls?)\b/i, tags:['duo'], strip:true },
    { re:/\blesbians?\b/i,                 tags:['duo'], strip:true },
    { re:/\b(doggy\s*style)\b/i, tags:['pose:doggy'], strip:true },
    { re:/\bkneeling on bed\b/i, tags:['kneeling','bed'], strip:true },
    { re:/\blegs?\s+spread\b/i, tags:['legs_spread'], strip:true },
    { re:/\bhead turned back\b/i, tags:['look_back'], strip:true },
    { re:/\bsitting on (?:the )?edge of bed\b/i, tags:['sitting','bed_edge'], strip:true },
    { re:/\blow front perspective\b/i, tags:['cam:low_front'], strip:true },
    { re:/\bangle (?:very )?low\b/i, tags:['cam:low_angle'], strip:true },
    { re:/\bcenter(?:ed)? composition\b/i, tags:['framing:centered'], strip:true },

    { re:/\bsoft warm (?:bedroom )?lighting\b/i, tags:['light:soft_warm'], strip:true },
    { re:/\bwarm sunset glow\b/i, tags:['light:sunset_glow'], strip:true },

    { re:/\bflushed(?: cheeks)?\b/i, tags:['face:flushed'], strip:true },
    { re:/\b(inviting|seductive) expression\b/i, tags:['exp:seductive'], strip:true },

    { re:/\bpony(?:\s|-)?tail\b/i, tags:['hair:ponytail'], strip:true },
    { re:/\bcolored hair\b/i, tags:['hair:colored'], strip:true },

    { re:/\b(earrings?)\b/i, tags:['accessory:earrings'], strip:true },
    { re:/\bleg warmers?\b/i, tags:['accessory:leg_warmers'], strip:true },

    { re:/\bcrop top\b/i, tags:['clothes:crop_top'], strip:true },
    { re:/\bloose slipping t-?shirt\b/i, tags:['clothes:loose_tshirt'], strip:true },

    { re:/\bpanties pulled aside\b/i, tags:['panties_pulled_aside'], strip:true },
    { re:/\bwet panties\b/i, tags:['panties_wet'], strip:true },
    { re:/\bspread pussy\b/i, tags:['pussy_spread'], strip:true },

    { re:/\bsqueez(?:ing|e) (?:her )?own boob\b/i, tags:['hands:on_boobs'], strip:true },
    { re:/\bfingering\b/i, tags:['fingering'], strip:true },
    { re:/\bpressing down on (?:her )?own ass(?: cheek)?\b/i, tags:['hands:on_ass'], strip:true },

    // canonicalized anatomy namespaces
    { re:/\bbreasts (?:either )?pressed against bed\b/i, tags:['boobs:pressed'], strip:true },
    { re:/\bbreasts? hanging naturally\b/i, tags:['boobs:hanging'], strip:true },
    { re:/\bass raised high\b/i, tags:['ass:raised'], strip:true },

    // backdrop (kept generic, but "bedroom" still useful scene)
    { re:/\bbed(?:room)?\b/i, tags:['scene:bedroom'], strip:false },
  ];

  // --------------------------------------------------------------------------
  // 3) Helpers (no -ing/-ed stemming!)
  // --------------------------------------------------------------------------
  function normalize(s){
    return String(s || '')
      .replace(/[{}]/g, ', ')
      .replace(/[()]/g, ' ')
      .replace(/:[0-9.]+/g, '')    // (tag:1.2) → tag
      .replace(/[,/|]+/g, ',')     // unify separators
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(s){
    return s
      .toLowerCase()
      .split(/[,\s]+/)
      .map(w => w.replace(/[^a-z0-9:_-]/g,'')) // allow digits for ratios (kept out later if noise)
      .filter(Boolean);
  }

  // Plural → singular (conservative). No -ing/-ed handling here.
  function singularize(tok){
    // preserve canonical plural "panties" and "boobs", and "ass" form
    if (tok === 'panties' || tok === 'boobs' || tok === 'ass') return tok;

    if (tok.endsWith('ies') && tok.length > 4) return tok.slice(0,-3) + 'y'; // pussies→pussy
    if (/(sses|zzes)$/.test(tok)) return tok.slice(0,-2);
    if (tok.endsWith('es') && tok.length > 4) {
      const root = tok.slice(0,-2);
      if (/(s|x|z|ch|sh)$/.test(root)) return root; // boxes→box, kisses→kiss
    }
    if (tok.endsWith('s') && tok.length > 3 && !tok.endsWith('ss')) return tok.slice(0,-1);
    // historical typo safety
    if (tok === 'panti') return 'panty';
    return tok;
  }

  function isNoise(tok){
    if (!tok) return true;
    if (STOP.has(tok)) return true;
    if (BLOCKLIST.has(tok)) return true;
    // single letters / numeric only unless namespaced (cam: etc.)
    if (tok.length < 2 && !tok.includes(':')) return true;
    if (!tok.includes(':') && /^[0-9:_-]+$/.test(tok)) return true;
    return false;
  }

  // Canonicalizer: explicit maps only (no stemming). Namespace tokens pass.
  function canon(tok){
    if (!tok) return '';
    if (/^[a-z]+:[a-z0-9_-]+$/.test(tok)) return tok; // keep namespaced as-is

    // typos that show up sometimes
    const typos = { invinting:'inviting', focu:'focus', clothe:'clothes', mischievou:'mischievous' };
    let t = tok.toLowerCase();
    if (typos[t]) t = typos[t];

    // conservative plural handling
    t = singularize(t);

    // explicit equivalence map
    if (CANON.has(t)) t = CANON.get(t);

    // drop if explicitly blocked
    if (BLOCKLIST.has(t)) return '';

    return t;
  }

  function scoreToken(tok){
    if (/^(pose:|cam:|hands:|boobs:|ass:|face:|exp:)/.test(tok)) return 6;
    if (/^(light:|scene:|framing:|hair:|accessory:|clothes:)/.test(tok)) return 4.5;
    if (['boobs','nipple','ass','pussy','clitoris','panties'].includes(tok)) return 5.5;
    if (tok.length <= 2) return 1;
    return 2.5;
  }

  function postProcess(bag){
    // NSFW flag tag
    const hasHard = NSFW_HARD.some(w => bag.has(w));
    const hasSoft = NSFW_SOFT.some(w => bag.has(w));
    if (hasHard || hasSoft) bag.set('nsfw', (bag.get('nsfw')||0) + (hasHard ? 7 : 5));

    // redundancy cleanups
    if (bag.has('vulva') && bag.has('pussy')) bag.delete('vulva');
    if (bag.has('boob')) {
      bag.set('boobs', Math.max(bag.get('boobs')||0, bag.get('boob')));
      bag.delete('boob');
    }
    if (bag.has('panties_wet') && bag.has('wet')) bag.delete('wet');

    return bag;
  }

  const bagToSortedArray = (bag, limit = 32) =>
    [...bag.entries()].sort((a,b)=> b[1]-a[1]).slice(0,limit).map(([t])=>t);

  // --------------------------------------------------------------------------
  // 4) Public API
  // --------------------------------------------------------------------------
  function extract(rawText){
    if (!rawText || typeof rawText !== 'string') return [];
    let text = rawText;

    // phrase pass
    const emitted = new Set();
    PHRASES.forEach(p => {
      if (p.re.test(text)) {
        p.tags.forEach(t => emitted.add(t));
        if (p.strip) text = text.replace(p.re, ' ');
      }
    });

    // tokenize & bag
    text = normalize(text);
    const tokens = tokenize(text);
    const bag = new Map();

    for (let tok of tokens){
      if (!tok || STOP.has(tok)) continue;
      tok = canon(tok);
      if (!tok || isNoise(tok)) continue;

      // normalize SD common alias after canon
      if (tok === '1girl' || tok === 'solo') tok = 'solo_female';

      const sc = scoreToken(tok);
      if (sc <= 0) continue;
      bag.set(tok, (bag.get(tok)||0) + sc);
    }

    // merge phrase-emitted tags with high weight
    emitted.forEach(t => bag.set(t, (bag.get(t)||0) + 7));

    postProcess(bag);
    return bagToSortedArray(bag);
  }

  async function tagPrompts(list, { writeBack = false } = {}){
    if (!Array.isArray(list)) return list;
    const BATCH = 24;

    for (let i = 0; i < list.length; i += BATCH){
      const slice = list.slice(i, i+BATCH);
      await Promise.all(slice.map(async (p) => {
        try{
          const txt = await PV.loadPromptText(p);
          const tags = extract(txt);
          p.tags = tags;

          if (writeBack && PV.state?.rw && p.dirHandle){
            // keep title if already present in tags.json
            let title = p.title || 'Untitled';
            try {
              const fh0 = await p.dirHandle.getFileHandle('tags.json', { create:false }).catch(()=>null);
              if (fh0) {
                const f = await fh0.getFile();
                const j = JSON.parse(await f.text());
                if (j && j.title) title = j.title;
              }
            } catch {}

            const fh = await p.dirHandle.getFileHandle('tags.json', { create:true });
            const w = await fh.createWritable();
            await w.write(new Blob([JSON.stringify({ title, tags }, null, 2)], { type:'application/json' }));
            await w.close();
          }
        } catch (e) {
          console.warn('Tagging failed for', p?.id, e);
          p.tags = [];
        }
      }));
      await new Promise(r => setTimeout(r, 0));
    }
    return list;
  }

  PV.Tagger = { extract, tagPrompts };
})();
