(function () {
  const { state } = PV;
  const { loadPromptText } = PV;

  // --------------------------------------------------------------------------
  // 0) Stopwords / Blocklist / Allowlist strategy
  // --------------------------------------------------------------------------
  //  - We keep only:
  //    * Namespaced tokens: pose:, cam:, framing:, light:, scene:, hair:, accessory:, clothes:,
  //      hands:, boobs:, ass:, face:, exp:
  //    * A tight allowlist of non-namespaced tokens (key concepts)
  //
  //  - Everything else is removed as "noise" (generic or near-duplicate).
  //
  //  This crushes nonsense like: angle, bed, classroom, covered, equipment, etc.

  const NAMESPACE_ALLOW = [
    'pose', 'cam', 'framing', 'light', 'scene',
    'hair', 'accessory', 'clothes', 'hands',
    'boobs', 'ass', 'face', 'exp'
  ];

  // Very tight list of bare (non-namespaced) tokens we allow
  const BARE_ALLOW = new Set([
    // anatomy / actions
    'ass','boobs','nipple','pussy','panties','lingerie',
    'fingering','orgasm','wet','shiny',
    // composition / subject
    'duo','solo_female','portrait'
  ]);

  // Generic boilerplate and filler that the screenshot shows as noise
  const STOP = new Set([
    // boilerplate / quality tokens
    'masterpiece','best','quality','ultra-detailed','ultradetailed','highres','high-res','hires',
    'detailed','realistic','cinematic','composition',
    'lighting','light','soft','warm','glow','cozy','atmosphere',
    'background','scene','setting','focus','framing','centered','centred',
    'with','and','or','either','the','a','an','in','on','at','of','to','for','by','from',
    'over','under','front','back','low','high','very','more','less','no',
    'while','visibly','visible','slight','slightly','own','forward','both','down','long','but',
    'only','one','together','between','still','clearly','completely',
    'options','option','open','off','above','below','near','upper','edge','frame',
    'view','viewer','camera','looking','looking at viewer','looking at camera',
    // screenshot junk / generic nouns
    'all','angle','bed','behind','bending','bent','blind','blouse','book','bouncing','bra',
    'bracing','cabinet','chain','chair','chalkboard','choker','classroom','close','colored',
    'counter','covered','covering','cube','daylight','desk','equipment','except','each',
    'embarrassed','emphasized','erotic','fluid','four','fully','gentle','glass','gripping',
    'gym','hair','highlighting','hip','holding','ice','inviting','it','kitchen','knee',
    'laughing','leaning','left','legs','lifted','light:soft_warm','light:sunset_glow', // namespaced handled separately
    'look_back','lying','maiden','mini','mischievous','moaning','nazi','nude','office','outlined',
    'pajama','pant','parl','peeking','petal','photography','playful','playing','pool','pooling',
    'portrait','pose','pressing','purple','raised','read','relaxed','relaxing','remove','removed',
    'reveal','right','romantic','room','running','satisfied','sauna','school','scissoring',
    'seductive','see-through','set','sex','shiny','shirt','shoulder','shower','shrine','shy','shyly',
    'silk','sitting','skin','skirt','slipping','smile','spreading','squeeze','squished','steam',
    'straight-on','stretching','sunbathing','sunglasses','surprised','sweat','sweaty','swimming',
    'table','tease','teasing','thigh','tied','toilet','tongue','top-down','towel','unbuttoned',
    'under-view','uniform','use','water','waterline','wet','white','yoga'
  ]);

  // Hard block specific nonsense even if not in STOP
  const BLOCKLIST = new Set([
    'spotlight','object','thing','surface','cloth','clothes','clothing','outfit',
  ]);

  // NSFW helpers
  const NSFW_HARD = ['pussy','vagina','clitoris','labia','areola','nipples','boobs','breast','penis','cum','semen','cock','vulva'];
  const NSFW_SOFT = ['nude','naked','nsfw','lewd','panties','wet','saliva','fluids','underboob','underwear','lingerie','spread','spread_pussy','pussy_spread','panties_pulled_aside'];

  // --------------------------------------------------------------------------
  // 1) Canonicalization (tight, explicit)
  // --------------------------------------------------------------------------
  const EQUIV = [
    { canon:'playful',        forms:['playfully'] },
    { canon:'wet',            forms:['wetly','wetness','drenched','soaked','soaking','dripping','glistening'] },
    { canon:'shiny',          forms:['shine','shining','glossy','sheen'] },
    { canon:'smile',          forms:['smiling','smiled'] },
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
    // anatomy canonicalization
    { canon:'boobs',          forms:['breast','breasts','boob','tits'] },
    { canon:'nipple',         forms:['nipples'] },
    { canon:'pussy',          forms:['vagina','vulva','pussies'] },
    { canon:'ass',            forms:['butt','buttocks','booty'] },
    // wearables
    { canon:'panties',        forms:['panty'] },
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
  // 2) Phrase pass (maps multi-word to concise namespaced tags)
  // --------------------------------------------------------------------------
  const PHRASES = [
    { re:/\b(2\s*girls?|two\s+girls?|lesbians?)\b/i,    tags:['duo'], strip:true },
    { re:/\bdoggy\s*style\b/i,                          tags:['pose:doggy'], strip:true },
    { re:/\bkneeling on bed\b/i,                        tags:['kneeling','scene:bedroom'], strip:true },
    { re:/\blegs?\s+spread\b/i,                         tags:['legs_spread'], strip:true },
    { re:/\bhead turned back\b/i,                       tags:['look_back'], strip:true },
    { re:/\bsitting on (?:the )?edge of bed\b/i,        tags:['sitting','scene:bedroom'], strip:true },
    { re:/\blow front perspective\b/i,                  tags:['cam:low_front'], strip:true },
    { re:/\bangle (?:very )?low\b/i,                    tags:['cam:low_angle'], strip:true },
    { re:/\bcenter(?:ed)? composition\b/i,              tags:['framing:centered'], strip:true },

    { re:/\bsoft warm (?:bedroom )?lighting\b/i,        tags:['light:soft_warm'], strip:true },
    { re:/\bwarm sunset glow\b/i,                       tags:['light:sunset_glow'], strip:true },

    { re:/\bflushed(?: cheeks)?\b/i,                    tags:['face:flushed'], strip:true },
    { re:/\b(inviting|seductive) expression\b/i,        tags:['exp:seductive'], strip:true },

    { re:/\bpony(?:\s|-)?tail\b/i,                      tags:['hair:ponytail'], strip:true },
    { re:/\bcolored hair\b/i,                           tags:['hair:colored'], strip:true },

    { re:/\b(earrings?)\b/i,                            tags:['accessory:earrings'], strip:true },
    { re:/\bleg warmers?\b/i,                           tags:['accessory:leg_warmers'], strip:true },

    { re:/\bcrop top\b/i,                               tags:['clothes:crop_top'], strip:true },
    { re:/\bloose slipping t-?shirt\b/i,                tags:['clothes:loose_tshirt'], strip:true },

    { re:/\bpanties pulled aside\b/i,                   tags:['panties_pulled_aside'], strip:true },
    { re:/\bwet panties\b/i,                            tags:['panties_wet'], strip:true },
    { re:/\bspread pussy\b/i,                           tags:['pussy_spread'], strip:true },

    { re:/\bsqueez(?:ing|e) (?:her )?own boob\b/i,      tags:['hands:on_boobs'], strip:true },
    { re:/\bfingering\b/i,                              tags:['fingering'], strip:true },
    { re:/\bpressing down on (?:her )?own ass\b/i,      tags:['hands:on_ass'], strip:true },

    { re:/\bbreasts (?:either )?pressed against bed\b/i,tags:['boobs:pressed'], strip:true },
    { re:/\bbreasts? hanging naturally\b/i,             tags:['boobs:hanging'], strip:true },
    { re:/\bass raised high\b/i,                        tags:['ass:raised'], strip:true },

    { re:/\bbedroom\b/i,                                tags:['scene:bedroom'], strip:false },
  ];

  // --------------------------------------------------------------------------
  // 3) Helpers (no aggressive stemming)
  // --------------------------------------------------------------------------
  function normalize(s){
    return String(s || '')
      .replace(/[{}]/g, ', ')
      .replace(/[()]/g, ' ')
      .replace(/:[0-9.]+/g, '')     // (tag:1.2) → tag
      .replace(/[,/|]+/g, ',')      // unify separators
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(s){
    return s
      .toLowerCase()
      .split(/[,\s]+/)
      .map(w => w.replace(/[^a-z0-9:_-]/g,'')) // keep namespace chars
      .filter(Boolean);
  }

  function singularize(tok){
    if (tok === 'panties' || tok === 'boobs' || tok === 'ass') return tok;
    if (tok.endsWith('ies') && tok.length > 4) return tok.slice(0,-3) + 'y'; // pussies→pussy
    if (/(sses|zzes)$/.test(tok)) return tok.slice(0,-2);
    if (tok.endsWith('es') && tok.length > 4) {
      const root = tok.slice(0,-2);
      if (/(s|x|z|ch|sh)$/.test(root)) return root;
    }
    if (tok.endsWith('s') && tok.length > 3 && !tok.endsWith('ss')) return tok.slice(0,-1);
    if (tok === 'panti') return 'panty';
    return tok;
  }

  function isNamespaced(tok){
    return /^[a-z]+:[a-z0-9_-]+$/.test(tok);
  }

  function isAllowedNamespace(tok){
    const i = tok.indexOf(':');
    if (i < 0) return false;
    const ns = tok.slice(0, i);
    return NAMESPACE_ALLOW.includes(ns);
  }

  function isNoise(tok){
    if (!tok) return true;
    if (STOP.has(tok)) return true;
    if (BLOCKLIST.has(tok)) return true;

    // Drop bare (non-namespaced) unless in explicit allowlist
    if (!isNamespaced(tok) && !BARE_ALLOW.has(tok)) return true;

    // Single letters / numeric-only are noise unless namespaced
    if (!isNamespaced(tok) && (tok.length < 3 || /^[0-9:_-]+$/.test(tok))) return true;

    // namespaced but namespace not allowed → drop
    if (isNamespaced(tok) && !isAllowedNamespace(tok)) return true;

    return false;
  }

  function canon(tok){
    if (!tok) return '';
    if (isNamespaced(tok)) return tok; // keep namespaced as-is (namespace already filtered)
    const typos = { invinting:'inviting', focu:'focus', clothe:'clothes', mischievou:'mischievous' };
    let t = tok.toLowerCase();
    if (typos[t]) t = typos[t];
    t = singularize(t);
    if (CANON.has(t)) t = CANON.get(t);
    if (BLOCKLIST.has(t)) return '';
    return t;
  }

  function scoreToken(tok){
    if (/^(pose:|cam:|framing:|light:|scene:|hair:|accessory:|clothes:|hands:|boobs:|ass:|face:|exp:)/.test(tok)) return 6.0;
    if (BARE_ALLOW.has(tok)) return 5.0;
    return 0; // we should not reach here due to isNoise, but keep strict
  }

  function postProcess(bag){
    // NSFW flag tag if relevant
    const hasHard = NSFW_HARD.some(w => bag.has(w));
    const hasSoft = NSFW_SOFT.some(w => bag.has(w));
    if (hasHard || hasSoft) bag.set('nsfw', (bag.get('nsfw')||0) + (hasHard ? 7 : 5));

    // De-duplication / dominance rules
    if (bag.has('vulva') && bag.has('pussy')) bag.delete('vulva');
    if (bag.has('boob')) { bag.set('boobs', Math.max(bag.get('boobs')||0, bag.get('boob'))); bag.delete('boob'); }
    if (bag.has('panties_wet') && bag.has('wet')) bag.delete('wet');

    // Remove top-level category tokens if both category and namespaced exist
    // e.g., keep accessory:earrings but drop plain "accessory"
    for (const ns of ['accessory','clothes','light','scene','hair','hands','boobs','ass','face','exp','pose','cam','framing']){
      if (bag.has(ns)) bag.delete(ns);
    }

    return bag;
  }

  const bagToSortedArray = (bag, limit = 28) =>
    [...bag.entries()].sort((a,b)=> b[1]-a[1]).slice(0,limit).map(([t])=>t);

  // --------------------------------------------------------------------------
  // 4) Public API
  // --------------------------------------------------------------------------
  function extract(rawText){
    if (!rawText || typeof rawText !== 'string') return [];
    let text = rawText;

    // phrase pass (adds namespaced tags, strips phrases)
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
      if (!tok) continue;
      if (STOP.has(tok)) continue;

      tok = canon(tok);
      if (!tok || isNoise(tok)) continue;

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
            // respect existing title if present
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
