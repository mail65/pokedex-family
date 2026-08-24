/* PokéDex Family — App Logic v5
   - TCGdex als primäre API (nativ deutsch!)
   - pokemontcg.io als Fallback (englische Namen, Preise)
   - Firebase Realtime DB für Geräte-übergreifende Sammlung
   - Robuste API-Suche ohne Rate-Limit-Probleme
*/

// ---- FIREBASE CONFIG ----
// Kostenloser Spark Plan — keine Kreditkarte nötig
const FIREBASE_URL = 'https://pokemon-efef7-default-rtdb.europe-west1.firebasedatabase.app';

// ---- STATE ----
let currentProfile = null;
let currentCard = null;
let currentTab = 'search';

// ---- XSS ----
function esc(text) {
  return (text || '').replace(/[&<>"']/g, m =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m])
  );
}

// ---- PRICE ----
function getBestPrice(card) {
  const cm = card.cardmarket?.prices;
  if (cm?.averageSellPrice) return { v: cm.averageSellPrice, label: 'Cardmarket Ø', sym: '€' };
  if (cm?.trendPrice)       return { v: cm.trendPrice,       label: 'CM Trend',     sym: '€' };
  const tcp = card.tcgplayer?.prices;
  if (tcp) {
    const variant = tcp.holofoil || tcp.normal || tcp.reverseHolofoil || Object.values(tcp)[0];
    if (variant?.market) return { v: variant.market, label: 'TCGPlayer', sym: '$' };
    if (variant?.mid)    return { v: variant.mid,    label: 'TCGPlayer Mid', sym: '$' };
  }
  return null;
}
function fmtPrice(p) { return p ? p.sym + p.v.toFixed(2) : 'k.A.'; }

// ---- FIREBASE COLLECTION SYNC ----
async function loadCollection(profile) {
  try {
    const res = await fetch(`${FIREBASE_URL}/collections/${profile}.json`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data ? Object.values(data) : [];
  } catch {
    // Fallback: localStorage
    try { return JSON.parse(localStorage.getItem('col_' + profile) || '[]'); }
    catch { return []; }
  }
}

async function saveCard(profile, card) {
  // Firebase: PUT mit Card-ID als Key (überschreibt Duplikate)
  try {
    await fetch(`${FIREBASE_URL}/collections/${profile}/${card.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card)
    });
  } catch {
    // Fallback localStorage
    const col = JSON.parse(localStorage.getItem('col_' + profile) || '[]');
    if (!col.find(c => c.id === card.id)) {
      col.push(card);
      localStorage.setItem('col_' + profile, JSON.stringify(col));
    }
  }
}

async function deleteCard(profile, cardId) {
  try {
    await fetch(`${FIREBASE_URL}/collections/${profile}/${cardId}.json`, { method: 'DELETE' });
  } catch {
    const col = JSON.parse(localStorage.getItem('col_' + profile) || '[]')
      .filter(c => c.id !== cardId);
    localStorage.setItem('col_' + profile, JSON.stringify(col));
  }
}

// ---- TCGDEX API (primär, nativ deutsch) ----
const TCGDEX_BASE = 'https://api.tcgdex.net/v2/de';

// Set-Map: setId → asset base URL (einmalig beim Start geladen)
let _setMap = null;
async function getSetMap() {
  if (_setMap) return _setMap;
  try {
    const res = await fetchWithTimeout('https://api.tcgdex.net/v2/en/sets', 8000);
    if (!res.ok) throw new Error();
    const sets = await res.json();
    _setMap = {};
    sets.forEach(s => {
      if (s.logo) _setMap[s.id] = s.logo.replace('/logo', '');
    });
  } catch { _setMap = {}; }
  return _setMap;
}

// Bild-URL direkt aus Card-ID + Set-Map konstruieren (kein Extra-Request!)
// ID-Format: 'base1-4', 'sv03.5-004', 'pl4-1'
function cardImageUrl(cardId, setMap, size = 'low') {
  const parts = cardId.split('-');
  const localId = parts.pop();
  const setId   = parts.join('-');
  const base    = setMap?.[setId];
  if (!base) return null;
  return base + '/' + localId + '/' + size + '.webp';
}

// TCGdex Karten-Liste suchen
async function tcgdexSearch(query) {
  const q = query.trim();

  // Basisname = erstes Wort (z.B. "Pikachu" aus "Pikachu-ex" oder "Pikachu V")
  const baseName = q.split(/[-\s]/)[0];
  const useBase  = baseName.length >= 3 && baseName.toLowerCase() !== q.toLowerCase();

  // Immer beide parallel starten: exakter Name + Basisname
  const reqs = [
    fetchWithTimeout(TCGDEX_BASE + '/cards?name=' + encodeURIComponent(q), 10000)
      .then(r => r.ok ? r.json() : []).catch(() => [])
  ];
  if (useBase) {
    reqs.push(
      fetchWithTimeout(TCGDEX_BASE + '/cards?name=' + encodeURIComponent(baseName), 10000)
        .then(r => r.ok ? r.json() : []).catch(() => [])
    );
  }

  const [exact, base] = await Promise.all(reqs);
  const exactArr = Array.isArray(exact) ? exact : [];
  const baseArr  = Array.isArray(base)  ? base  : [];

  // Merge: exakte Treffer zuerst, dann Basisname-Varianten (Duplikate per ID entfernen)
  const seen = new Set(exactArr.map(c => c.id));
  const extras = baseArr.filter(c => !seen.has(c.id));
  return [...exactArr, ...extras];
}

// TCGdex-Karte in internes Format (aus Listenansicht + setMap, kein Detail nötig)
function normalizeTcgdexCard(card, setMap) {
  const imgBase = card.image || cardImageUrl(card.id, setMap);
  let imgSmall = null, imgLarge = null;
  if (imgBase) {
    const base = imgBase.replace(/\/(low|high)\.webp$/, '');
    imgSmall = base + '/low.webp';
    imgLarge = base + '/high.webp';
  }
  return {
    id:         card.id,
    name:       card.name,
    hp:         null,
    types:      [],
    rarity:     null,
    images:     imgSmall ? { small: imgSmall, large: imgLarge } : {},
    set:        { name: card.set?.name || '', series: '' },
    _source:    'tcgdex',
    _needsImg:  !imgSmall   // Flag: Bild fehlt → pokemontcg.io Fallback nötig
  };
}

// Konvertiert TCGdex ID → pokemontcg.io ID (Punkte entfernen: sm7.5 → sm75)
function tcgdexIdToPokemontcg(id) {
  return id.replace(/\.(?=\d)/g, '');
}

// Für Karten ohne Bild: pokemontcg.io Bilder nachladen (batch)
async function fillMissingImages(cards) {
  const missing = cards.filter(c => c._needsImg);
  if (!missing.length) return cards;

  // Batch: alle fehlenden IDs in EINEM Request holen
  const ids = missing.map(c => tcgdexIdToPokemontcg(c.id));
  const q = ids.map(id => 'id:' + id).join(' OR ');
  try {
    const res = await fetchWithTimeout(
      'https://api.pokemontcg.io/v2/cards?q=' + encodeURIComponent(q) + '&pageSize=20&select=id,images',
      8000
    );
    if (res.ok) {
      const data = await res.json();
      const imgMap = {};
      (data.data || []).forEach(c => { imgMap[c.id] = c.images; });
      cards.forEach(c => {
        if (c._needsImg) {
          const tcgId = tcgdexIdToPokemontcg(c.id);
          if (imgMap[tcgId]) {
            c.images = imgMap[tcgId];
            delete c._needsImg;
          }
        }
      });
    }
  } catch(e) {
    console.warn('Bild-Fallback fehlgeschlagen:', e);
  }
  return cards;
}

// TCGdex Detail in internes Format (für Detailansicht — HP, Typ, Preis)
function normalizeTcgdexDetail(card, setMap) {
  const imgBase = card.image || cardImageUrl(card.id, setMap);
  let imgSmall = null, imgLarge = null;
  if (imgBase) {
    const base = imgBase.replace(/\/(low|high)\.webp$/, '');
    imgSmall = base + '/low.webp';
    imgLarge = base + '/high.webp';
  }
  let cmPrice = null, tcgPrice = null;
  const vd = card.variants_detailed;
  if (vd && vd.length) {
    const p = vd[0].pricing;
    if (p?.cardmarket) {
      cmPrice = {
        averageSellPrice: p.cardmarket.avg   || null,
        trendPrice:       p.cardmarket.trend || null,
        lowPrice:         p.cardmarket.low   || null,
        updatedAt:        p.cardmarket.updated ? p.cardmarket.updated.slice(0,10) : null
      };
    }
    if (p?.tcgplayer) {
      const v = p.tcgplayer.holofoil || p.tcgplayer.normal ||
        Object.values(p.tcgplayer).find(x => x?.marketPrice);
      if (v) tcgPrice = { holofoil: { market: v.marketPrice, low: v.lowPrice, mid: v.midPrice, high: v.highPrice } };
    }
  }
  return {
    id:         card.id,
    name:       card.name,
    hp:         card.hp ? String(card.hp) : null,
    types:      card.types || [],
    rarity:     card.rarity || null,
    images:     imgSmall ? { small: imgSmall, large: imgLarge } : {},
    set:        { name: card.set?.name || '', series: card.set?.id || '' },
    cardmarket: cmPrice  ? { prices: cmPrice, updatedAt: cmPrice.updatedAt } : undefined,
    tcgplayer:  tcgPrice ? { prices: tcgPrice } : undefined,
    _source:    'tcgdex'
  };
}

// ---- DEUTSCH → ENGLISCH ÜBERSETZUNG (nur noch für pokemontcg.io Fallback) ----
const DE_TO_EN = {
  // Starter & Klassiker
  'glumanda': 'charmander', 'glutexo': 'charmeleon', 'glurak': 'charizard',
  'schiggy': 'squirtle', 'schillok': 'wartortle', 'turtok': 'blastoise',
  'bisasam': 'bulbasaur', 'bisaknosp': 'ivysaur', 'bisaflor': 'venusaur',
  'raupy': 'caterpie', 'safcon': 'metapod', 'smettbo': 'butterfree',
  'hornliu': 'weedle', 'kokuna': 'kakuna', 'bibor': 'beedrill',
  'taubsi': 'pidgey', 'tauboga': 'pidgeotto', 'tauboss': 'pidgeot',
  'rattfratz': 'rattata', 'rattikarl': 'raticate',
  'habitak': 'spearow', 'ibitak': 'fearow',
  'rettan': 'ekans', 'arbok': 'arbok',
  'pikachu': 'pikachu', 'raichu': 'raichu',
  'sandan': 'sandshrew', 'sandamer': 'sandslash',
  'nidoran': 'nidoran', 'nidorina': 'nidorina', 'nidoqueen': 'nidoqueen',
  'nidorino': 'nidorino', 'nidoking': 'nidoking',
  'piepi': 'clefairy', 'pixi': 'clefable',
  'vulpix': 'vulpix', 'vulnona': 'ninetales',
  'jiggly': 'jigglypuff', 'wigglytuff': 'wigglytuff',
  'zubat': 'zubat', 'golbat': 'golbat',
  'myrapla': 'oddish', 'duflor': 'gloom', 'blubella': 'vileplume',
  'paras': 'paras', 'parasek': 'parasect',
  'bluzuk': 'venonat', 'omot': 'venomoth',
  'digda': 'diglett', 'digdri': 'dugtrio',
  'mauzi': 'meowth', 'snobilikat': 'persian',
  'enton': 'psyduck', 'entoron': 'golduck',
  'menki': 'mankey', 'rasaff': 'primeape',
  'fukano': 'growlithe', 'arkani': 'arcanine',
  'quapsel': 'poliwag', 'quaputzi': 'poliwhirl', 'quappo': 'poliwrath',
  'kadabra': 'kadabra', 'abra': 'abra', 'simsala': 'alakazam',
  'machollo': 'machop', 'maschock': 'machoke', 'machomei': 'machamp',
  'knofensa': 'bellsprout', 'ultrigaria': 'weepinbell', 'sarzenia': 'victreebel',
  'tentacha': 'tentacool', 'tentoxa': 'tentacruel',
  'geodude': 'geodude', 'georok': 'graveler', 'geowaz': 'golem',
  'ponita': 'ponyta', 'gallopa': 'rapidash',
  'flegmon': 'slowpoke', 'gelatroppo': 'slowbro',
  'magnetilo': 'magnemite', 'magneton': 'magneton',
  'porenta': 'farfetchd',
  'dodu': 'doduo', 'dodri': 'dodrio',
  'jurob': 'seel', 'jugong': 'dewgong',
  'sleima': 'grimer', 'sleimok': 'muk',
  'muschas': 'shellder', 'austos': 'cloyster',
  'gastly': 'gastly', 'haunter': 'haunter', 'gengar': 'gengar',
  'onix': 'onix',
  'traumato': 'drowzee', 'hypno': 'hypno',
  'krabby': 'krabby', 'kingler': 'kingler',
  'voltobal': 'voltorb', 'lektrobal': 'electrode',
  'owei': 'exeggcute', 'kokowei': 'exeggutor',
  'knogga': 'cubone', 'tragosso': 'marowak',
  'kicklee': 'hitmonlee', 'nockchan': 'hitmonchan',
  'lugia': 'lugia', 'ho-oh': 'ho-oh',
  'lippus': 'lickitung',
  'smogon': 'koffing', 'smogmog': 'weezing',
  'rihorn': 'rhyhorn', 'rizeros': 'rhydon',
  'chaneira': 'chansey',
  'tangela': 'tangela',
  'kangama': 'kangaskhan',
  'seeper': 'horsea', 'seemon': 'seadra',
  'goldini': 'goldeen', 'golking': 'seaking',
  'sterndu': 'staryu', 'starmie': 'starmie',
  'pantimos': 'mr. mime',
  'sichlor': 'scyther',
  'electabuzz': 'electabuzz',
  'magmar': 'magmar',
  'pinsir': 'pinsir',
  'tauros': 'tauros',
  'karpador': 'magikarp', 'garados': 'gyarados',
  'lapras': 'lapras',
  'ditto': 'ditto',
  'evoli': 'eevee', 'aquali': 'vaporeon', 'blitza': 'jolteon', 'flamara': 'flareon',
  'porygon': 'porygon',
  'amonitas': 'omanyte', 'amoroso': 'omastar',
  'kabuto': 'kabuto', 'kabutops': 'kabutops',
  'aerodactyl': 'aerodactyl',
  'relaxo': 'snorlax',
  'arktos': 'articuno', 'zapdos': 'zapdos', 'lavados': 'moltres',
  'dratini': 'dratini', 'dragonir': 'dragonair', 'dragoran': 'dragonite',
  'mewtu': 'mewtwo', 'mew': 'mew',
  // Gen 2
  'endivie': 'chikorita', 'lorblatt': 'bayleef', 'meganie': 'meganium',
  'feurigel': 'cyndaquil', 'igelavar': 'quilava', 'tornupto': 'typhlosion',
  'karnimani': 'totodile', 'tyracroc': 'croconaw', 'impergator': 'feraligatr',
  'hoothoot': 'hoothoot', 'noctuh': 'noctowl',
  'ledyba': 'ledyba', 'ledian': 'ledian',
  'webarak': 'spinarak', 'ariados': 'ariados',
  'crobat': 'crobat',
  'marill': 'marill', 'azumarill': 'azumarill',
  'mogelbaum': 'sudowoodo',
  'politoed': 'politoed',
  'hopspross': 'hoppip', 'hubelupf': 'skiploom', 'papungha': 'jumpluff',
  'aipom': 'aipom',
  'sonnkern': 'sunkern', 'sonnflora': 'sunflora',
  'yanma': 'yanma',
  'felino': 'wooper', 'quagsire': 'quagsire',
  'psiana': 'espeon', 'nachtara': 'umbreon',
  'kramurx': 'murkrow',
  'laschoking': 'slowking',
  'traunfugil': 'misdreavus',
  'unown': 'unown',
  'woingenau': 'wobbuffet',
  'kikugi': 'girafarig',
  'forstellka': 'pineco', 'forretress': 'forretress',
  'dummisel': 'dunsparce',
  'skorgla': 'gligar',
  'stahlos': 'steelix',
  'snubbull': 'snubbull', 'granbull': 'granbull',
  'skaraborn': 'scizor',
  'shuckle': 'shuckle',
  'skaralos': 'heracross',
  'sneasel': 'sneasel',
  'teddiursa': 'teddiursa', 'ursaring': 'ursaring',
  'magcargo': 'magcargo',
  'quiekel': 'swinub', 'piloswine': 'piloswine',
  'corasonn': 'corsola',
  'remoraid': 'remoraid', 'octillery': 'octillery',
  'dewgong': 'dewgong',
  'panzaeron': 'delibird',
  'mantax': 'mantine',
  'magbrant': 'magby',
  'larvitar': 'larvitar', 'pupitar': 'pupitar', 'despotar': 'tyranitar',
  'suicune': 'suicune', 'raikou': 'raikou', 'entei': 'entei',
  'celebi': 'celebi',
  // Gen 3+
  'geckarbor': 'treecko', 'reptain': 'grovyle', 'gewaldro': 'sceptile',
  'flemmli': 'torchic', 'jungglut': 'combusken', 'lohgock': 'blaziken',
  'hydropi': 'mudkip', 'moorabbel': 'marshtomp', 'sumpex': 'swampert',
  'kirlia': 'kirlia', 'guardevoir': 'gardevoir', 'ralts': 'ralts',
  'milotic': 'milotic', 'feebas': 'feebas',
  'salakling': 'bagon', 'draschel': 'shelgon', 'brutalanda': 'salamence',
  'latias': 'latias', 'latios': 'latios',
  'groudon': 'groudon', 'kyogre': 'kyogre', 'rayquaza': 'rayquaza',
  'jirachi': 'jirachi', 'deoxys': 'deoxys',
  // Gen 4+
  'plinfa': 'piplup', 'goldini': 'prinplup', 'impoleon': 'empoleon',
  'infernape': 'infernape', 'torterra': 'torterra',
  'lucario': 'lucario', 'riolu': 'riolu',
  'roserade': 'roserade',
  'staralili': 'starly', 'staravia': 'staravia', 'staraptor': 'staraptor',
  'dialga': 'dialga', 'palkia': 'palkia', 'giratina': 'giratina',
  'arktos': 'articuno',
  // Gen 5+
  'serpifeu': 'snivy', 'ibisor': 'servine', 'serpiroyal': 'serperior',
  'floink': 'tepig', 'ferkelator': 'pignite', 'flambirex': 'emboar',
  'ottaro': 'oshawott', 'zwottronk': 'dewott', 'admurai': 'samurott',
  'galar': 'galarian',
  // Gen 6+
  'igamaro': 'chespin', 'igastarnish': 'quilladin', 'brigaron': 'chesnaught',
  'fynx': 'fennekin', 'futifeu': 'braixen', 'fukano': 'delphox',
  'froxy': 'froakie', 'charoder': 'frogadier', 'quajutsu': 'greninja',
  'zygarde': 'zygarde', 'xerneas': 'xerneas', 'yveltal': 'yveltal',
  // Sonstige häufige
  'glumanda': 'charmander',
};

function translateName(query) {
  const lower = query.toLowerCase().trim();
  return DE_TO_EN[lower] || query;
}

// Gibt true zurück wenn query ein bekannter dt. Pokémon-Name ist
function isGermanName(query) {
  return query.toLowerCase().trim() in DE_TO_EN;
}

// ---- API SUCHE ----
async function fetchWithTimeout(url, ms = 10000) {
  return Promise.race([
    fetch(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), ms))
  ]);
}

// Automatisches Retry: 3 Versuche mit wachsender Pause
async function fetchWithRetry(url, retries = 3, ms = 10000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchWithTimeout(url, ms);
      if (res.ok) return res;
      // Bei Rate-Limit (429) oder Server-Fehler (5xx): warten und nochmal
      if (res.status === 429 || res.status >= 500) {
        if (i < retries - 1) {
          const wait = (i + 1) * 1500;
          setLoader(true, `Verbindung... Versuch ${i + 2} von ${retries}`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
      }
      return res;
    } catch(e) {
      if (i < retries - 1) {
        const wait = (i + 1) * 1500;
        setLoader(true, `Nochmal versuchen... (${i + 2}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }
}

async function searchCards(query) {
  const q = query.trim();
  if (!q) throw new Error('Leere Suche');

  // ── 1. Versuch: TCGdex (nativ deutsch) ──────────────────────────────────
  try {
    // Set-Map und Suche parallel — kein Detail-Request pro Karte!
    const [setMap, results] = await Promise.all([
      getSetMap(),
      tcgdexSearch(q)
    ]);

    if (results.length > 0) {
      // Maximal 20 nehmen (exakter Name zuerst)
      const exact = results.filter(c => c.name.toLowerCase() === q.toLowerCase());
      const rest  = results.filter(c => c.name.toLowerCase() !== q.toLowerCase());
      const top20 = [...exact, ...rest].slice(0, 20);

      // Normalisieren — Bilder aus Set-Map, KEIN Detail-Request!
      let cards = top20.map(c => normalizeTcgdexCard(c, setMap));
      // Fehlende Bilder via pokemontcg.io nachladen (EIN Batch-Request)
      cards = await fillMissingImages(cards);
      if (cards.length > 0) return cards;
    }
  } catch(e) {
    console.warn('TCGdex Fehler, versuche Fallback:', e);
  }

  // ── 2. Fallback: pokemontcg.io (englisch) ────────────────────────────────
  setLoader(true, 'TCGdex leer — suche englisch…');
  const translated = translateName(q);
  const clean = translated.trim().replace(/[^a-zA-ZäöüÄÖÜß0-9\s\-]/g, '').trim();
  if (!clean) throw new Error('Leere Suche');

  const words = clean.split(/\s+/);
  const firstWord = encodeURIComponent(words[0]);
  const url = `https://api.pokemontcg.io/v2/cards?q=name:${firstWord}*&pageSize=30`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  let cards = data.data || [];

  if (words.length > 1) {
    const lc = clean.toLowerCase();
    const filtered = cards.filter(c => c.name.toLowerCase().includes(lc));
    if (filtered.length) cards = filtered;
  }
  return cards;
}



// ---- ZUSTAND / CONDITION ----
const CONDITIONS = {
  mint:      { label: '💎 Mint',      mult: 1.00 },
  nearmint:  { label: '✨ Near Mint', mult: 0.75 },
  excellent: { label: '👍 Excellent', mult: 0.50 },
  good:      { label: '📦 Good',      mult: 0.25 },
};

function adjustedPrice(basePrice, condition) {
  const c = CONDITIONS[condition] || CONDITIONS.mint;
  return basePrice * c.mult;
}

// Zeigt das Zustand-Modal und gibt Promise<conditionKey|null> zurück
function askCondition() {
  return new Promise(resolve => {
    const modal = document.getElementById('condition-modal');
    modal.style.display = 'flex';

    const handler = (e) => {
      const btn = e.target.closest('.cond-btn');
      if (btn) {
        cleanup();
        resolve(btn.dataset.cond);
      }
    };
    const cancel = () => { cleanup(); resolve(null); };

    modal.addEventListener('click', handler);
    document.getElementById('modal-cancel').addEventListener('click', cancel);

    function cleanup() {
      modal.style.display = 'none';
      modal.removeEventListener('click', handler);
    }
  });
}

// ---- PREIS-SCHÄTZUNG ----
// Holt echten oder geschätzten Preis für eine Karte (TCGdex Detail → pokemontcg.io Fallback)
async function fetchCardPrice(cardId) {
  // Versuch 1: TCGdex Detail (hat Cardmarket-Preise für viele Karten)
  try {
    const res = await fetchWithTimeout(TCGDEX_BASE + '/cards/' + cardId, 6000);
    if (res.ok) {
      const d = await res.json();
      const vd = d.variants_detailed;
      if (vd && vd.length) {
        const p = vd[0].pricing;
        if (p?.cardmarket?.avg && p.cardmarket.avg > 0) {
          return {
            cardmarket: {
              prices: {
                averageSellPrice: p.cardmarket.avg,
                trendPrice:       p.cardmarket.trend || null,
                lowPrice:         p.cardmarket.low   || null,
                updatedAt:        p.cardmarket.updated ? p.cardmarket.updated.slice(0,10) : null
              },
              updatedAt: p.cardmarket.updated ? p.cardmarket.updated.slice(0,10) : null
            },
            _priceSource: 'tcgdex'
          };
        }
      }
    }
  } catch(e) {}

  // Versuch 2: pokemontcg.io — nur für IDs die kompatibel sind (base1, sv, swsh etc.)
  // TCGdex-spezifische IDs (mep-, me01-, me02- etc.) sind inkompatibel → überspringen
  const pokemontcgCompatible = /^(base|jungle|fossil|team|gym|neo|ex|dp|hgss|bw|xy|sm|swsh|sv|cel|pl|pop|tk|mcd)/i.test(cardId);
  if (pokemontcgCompatible) {
    try {
      const tcgId = cardId.replace(/\.(?=\d)/g, '');
      const res = await fetchWithTimeout(
        'https://api.pokemontcg.io/v2/cards/' + tcgId + '?select=id,cardmarket,tcgplayer',
        6000
      );
      if (res.ok) {
        const d = await res.json();
        if (d.data?.cardmarket || d.data?.tcgplayer) {
          return {
            cardmarket: d.data.cardmarket,
            tcgplayer:  d.data.tcgplayer,
            _priceSource: 'pokemontcg'
          };
        }
      }
    } catch(e) {}
  }

  return null;
}

// Für alle Sammlungskarten ohne Preis: Preise via TCGdex Detail nachladen
async function enrichCollectionPrices(profile) {
  const col = await loadCollection(profile);
  const unpriced = col.filter(c => !c.price || c.price === 0);
  if (!unpriced.length) return;

  let updated = 0;
  for (const card of unpriced) {
    try {
      // TCGdex Detail hat Cardmarket-Preise direkt
      const res = await fetchWithTimeout(TCGDEX_BASE + '/cards/' + card.id, 6000);
      if (!res.ok) continue;
      const d = await res.json();
      const vd = d.variants_detailed;
      if (!vd || !vd.length) continue;

      // Besten verfügbaren Preis nehmen
      let price = null, sym = '€';
      for (const variant of vd) {
        const cm = variant.pricing?.cardmarket;
        const tcp = variant.pricing?.tcgplayer;
        if (cm?.avg && cm.avg > 0)   { price = cm.avg;  sym = '€'; break; }
        if (cm?.trend && cm.trend > 0) { price = cm.trend; sym = '€'; break; }
        if (tcp) {
          const tv = tcp.holofoil || tcp.normal || Object.values(tcp).find(v => v?.marketPrice);
          if (tv?.marketPrice > 0) { price = tv.marketPrice; sym = '$'; break; }
        }
      }

      if (price) {
        card.price = price;
        card.sym   = sym;
        await saveCard(profile, card);
        updated++;
      }
      // Kurze Pause zwischen Requests (Rate-Limit)
      await new Promise(r => setTimeout(r, 80));
    } catch(e) {}
  }
  if (updated) console.log('Preise aktualisiert für', updated, 'Karten');
}

// ---- SCREEN ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ---- TOAST ----
function toast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = 'toast', duration);
}

// ---- PROFIL ----
async function selectProfile(profile) {
  currentProfile = profile;
  const info = {
    franz: { name: "Franz's PokéDex", avatar: '🦊' },
    kate:  { name: "Kate's PokéDex",  avatar: '🌸' },
    nil:   { name: "Nil's PokéDex",   avatar: '🐉' },
    jelle: { name: "Jelle's PokéDex", avatar: '⚡' }
  };
  document.getElementById('header-name').textContent   = info[profile].name;
  document.getElementById('header-avatar').textContent = info[profile].avatar;
  document.getElementById('detail-avatar').textContent = info[profile].avatar;
  showScreen('screen-main');
  showTab('search');
  await updateCounts();
}

async function updateCounts() {
  for (const p of ['franz', 'kate', 'nil', 'jelle']) {
    const el = document.getElementById('count-' + p);
    if (el) {
      const col = await loadCollection(p);
      el.textContent = col.length + ' Karten';
    }
  }
}

// ---- TABS ----
function showTab(tab) {
  currentTab = tab;
  document.getElementById('content-search').style.display     = tab === 'search'     ? 'block' : 'none';
  document.getElementById('content-collection').style.display = tab === 'collection' ? 'block' : 'none';
  document.getElementById('tab-search').className = 'nav-btn' + (tab === 'search'     ? ' active' : '');
  document.getElementById('tab-col').className    = 'nav-btn' + (tab === 'collection' ? ' active' : '');
  if (tab === 'collection') renderCollection();
}

// ---- SEARCH ----
function quickSearch(name) {
  document.getElementById('search-input').value = name;
  doSearch(name);
}

async function doSearch(query) {
  const q = query || document.getElementById('search-input').value.trim();
  if (!q) { toast('Bitte Namen eingeben!'); return; }

  setLoader(true, 'Suche nach ' + q + '…');
  document.getElementById('no-results').style.display = 'none';
  document.getElementById('results-grid').innerHTML = '';

  try {
    const cards = await searchCards(q);
    renderResults(cards, q);
  } catch(e) {
    console.error(e);
    toast(e.message === 'Timeout'
      ? '⏱️ Zeitüberschreitung — nochmal versuchen'
      : '⚠️ Verbindungsfehler — nochmal versuchen');
  } finally {
    setLoader(false);
  }
}

function setLoader(show, text) {
  document.getElementById('loader').style.display = show ? 'flex' : 'none';
  if (text) document.getElementById('loader-text').textContent = text;
}

function renderResults(cards, query) {
  const grid = document.getElementById('results-grid');
  if (!cards.length) {
    document.getElementById('no-results').style.display = 'block';
    const el = document.getElementById('no-results-name');
    if (el) el.textContent = query || '';
    return;
  }
  window._searchResults = cards;
  grid.innerHTML = cards.map((card, i) => {
    const p = getBestPrice(card);
    return `<div class="result-card" data-idx="${i}">
      <img src="${esc(card.images?.small || '')}" alt="${esc(card.name)}" loading="lazy" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=\'card-no-img\'>🃏</div>')">
      <div class="rc-info">
        <div class="rc-name">${esc(card.name)}</div>
        <div class="rc-set">${esc(card.set?.name || '')}</div>
        <div class="rc-price" id="price-${i}">${fmtPrice(p) !== 'k.A.' ? fmtPrice(p) : '⏳'}</div>
      </div>
    </div>`;
  }).join('');

  // Event Listener statt inline onclick
  grid.querySelectorAll('.result-card').forEach(el => {
    el.addEventListener('click', () => openDetail(parseInt(el.dataset.idx)));
  });

  // Preise im Hintergrund nachladen für Karten ohne Preis
  cards.forEach((card, i) => {
    if (getBestPrice(card)) return; // schon vorhanden
    fetchCardPrice(card.id).then(priceData => {
      if (!priceData) {
        const el = document.getElementById('price-' + i);
        if (el) el.textContent = 'k.A.';
        return;
      }
      if (priceData.cardmarket) card.cardmarket = priceData.cardmarket;
      if (priceData.tcgplayer)  card.tcgplayer  = priceData.tcgplayer;
      const p = getBestPrice(card);
      const el = document.getElementById('price-' + i);
      if (el && p) el.textContent = fmtPrice(p);
    });
  });
}

// ---- DETAIL ----
async function openDetail(idx) {
  const card = window._searchResults[idx];
  currentCard = card;
  let p = getBestPrice(card);

  document.getElementById('detail-img').src = card.images?.large || card.images?.small || '';
  document.getElementById('detail-name').textContent = card.name;
  document.getElementById('detail-set').textContent  =
    (card.set?.name || '') + (card.set?.series ? ' · ' + card.set.series : '');
  document.getElementById('price-label').textContent = p?.label || 'Preis';
  document.getElementById('price-value').textContent = fmtPrice(p) || '⏳';
  document.getElementById('price-date').textContent  =
    card.cardmarket?.updatedAt ? 'Stand: ' + card.cardmarket.updatedAt : '';

  // Wenn kein Preis: im Hintergrund nachladen
  if (!p) {
    fetchCardPrice(card.id).then(priceData => {
      if (!priceData) return;
      // Karte aktualisieren
      if (priceData.cardmarket) card.cardmarket = priceData.cardmarket;
      if (priceData.tcgplayer)  card.tcgplayer  = priceData.tcgplayer;
      const p2 = getBestPrice(card);
      if (!p2) return;
      document.getElementById('price-label').textContent = p2.label + ' ~';
      document.getElementById('price-value').textContent = fmtPrice(p2);
      document.getElementById('price-date').textContent  =
        card.cardmarket?.updatedAt ? 'Stand: ' + card.cardmarket.updatedAt : '';
      // Preis-Rows updaten
      const cm = card.cardmarket?.prices;
      const tcp = card.tcgplayer?.prices;
      let rows = '';
      if (cm?.averageSellPrice) rows += priceRow('CM Ø Verkauf',  '€' + cm.averageSellPrice.toFixed(2));
      if (cm?.trendPrice)       rows += priceRow('CM Trend',      '€' + cm.trendPrice.toFixed(2));
      if (cm?.lowPrice)         rows += priceRow('CM Niedrig',    '€' + cm.lowPrice.toFixed(2));
      if (tcp) {
        const v = tcp.holofoil || tcp.normal || Object.values(tcp)[0];
        if (v?.low)    rows += priceRow('TCG Niedrig', '$' + v.low.toFixed(2));
        if (v?.market) rows += priceRow('TCG Markt',   '$' + v.market.toFixed(2));
        if (v?.high)   rows += priceRow('TCG Hoch',    '$' + v.high.toFixed(2));
      }
      document.getElementById('price-rows').innerHTML = rows;
    });
  }

  const TYPE_DE = {
    'Fire':'🔥 Feuer', 'Water':'💧 Wasser', 'Grass':'🌿 Pflanze',
    'Electric':'⚡ Elektro', 'Lightning':'⚡ Elektro', 'Psychic':'🔮 Psycho',
    'Fighting':'🥊 Kampf', 'Darkness':'🌑 Unlicht', 'Metal':'⚙️ Stahl',
    'Dragon':'🐉 Drache', 'Colorless':'⭐ Normal', 'Fairy':'🧚 Fee'
  };
  let badges = '';
  if (card.rarity)     badges += `<span class="badge b-rarity">⭐ ${esc(card.rarity)}</span>`;
  if (card.types?.[0]) badges += `<span class="badge b-type">${esc(TYPE_DE[card.types[0]] || card.types[0])}</span>`;
  if (card.hp)         badges += `<span class="badge b-hp">❤️ ${esc(card.hp)} HP</span>`;
  document.getElementById('detail-badges').innerHTML = badges;

  const cm  = card.cardmarket?.prices;
  const tcp = card.tcgplayer?.prices;
  let rows = '';
  if (cm?.averageSellPrice) rows += priceRow('CM Ø Verkauf',  '€' + cm.averageSellPrice.toFixed(2));
  if (cm?.trendPrice)       rows += priceRow('CM Trend',      '€' + cm.trendPrice.toFixed(2));
  if (cm?.lowPrice)         rows += priceRow('CM Niedrig',    '€' + cm.lowPrice.toFixed(2));
  if (tcp) {
    const v = tcp.holofoil || tcp.normal || Object.values(tcp)[0];
    if (v?.low)    rows += priceRow('TCG Niedrig', '$' + v.low.toFixed(2));
    if (v?.market) rows += priceRow('TCG Markt',   '$' + v.market.toFixed(2));
    if (v?.high)   rows += priceRow('TCG Hoch',    '$' + v.high.toFixed(2));
  }
  document.getElementById('price-rows').innerHTML = rows;

  document.getElementById('grading-text').innerHTML =
    '💎 <b>Mint (M):</b> Perfekt — höchster Wert<br>' +
    '✨ <b>Near Mint (NM):</b> Kaum gespielt<br>' +
    '👍 <b>Excellent (EX):</b> Leichte Gebrauchsspuren<br>' +
    '📦 <b>Good (GD):</b> Sichtbare Spuren — weniger wert' +
    (card.rarity?.toLowerCase().includes('rare') ? '<br><br>⭐ Seltene Karte — Zustand besonders wichtig!' : '');

  // Sammlung-Button Status
  const col = await loadCollection(currentProfile);
  const btn = document.getElementById('btn-add');
  if (col.some(c => c.id === card.id)) {
    btn.textContent = '✅ In Sammlung';
    btn.classList.add('added');
  } else {
    btn.textContent = '⭐ Zur Sammlung hinzufügen';
    btn.classList.remove('added');
  }

  showScreen('screen-detail');
}

function priceRow(label, value) {
  return `<div class="price-row"><span>${label}</span><span>${value}</span></div>`;
}

// ---- SAMMLUNG ----
async function addCard() {
  if (!currentCard) return;

  // Zustand abfragen
  const condition = await askCondition();
  if (!condition) return; // abgebrochen

  const p = getBestPrice(currentCard);
  const basePrice = p?.v || 0;
  const adjPrice  = adjustedPrice(basePrice, condition);
  const cInfo     = CONDITIONS[condition];

  const cardData = {
    id:        currentCard.id,
    name:      currentCard.name,
    set:       currentCard.set?.name || '',
    type:      currentCard.types?.[0] || '',
    image:     currentCard.images?.small || '',
    price:     adjPrice,
    basePrice: basePrice,
    sym:       p?.sym || '€',
    condition: condition,
    addedAt:   new Date().toISOString()
  };

  const btn = document.getElementById('btn-add');
  btn.textContent = '⏳ Speichern…';
  btn.disabled = true;

  await saveCard(currentProfile, cardData);
  toast('🎉 ' + currentCard.name + ' (' + cInfo.label + ') hinzugefügt!');
  btn.textContent = '✅ In Sammlung';
  btn.classList.add('added');
  btn.disabled = false;
  await updateCounts();
}

async function removeCard(id, name) {
  if (!confirm(`"${name}" wirklich aus der Sammlung entfernen?`)) return;
  await deleteCard(currentProfile, id);
  toast('🗑️ ' + name + ' entfernt');
  await updateCounts();
  renderCollection();
}

async function openDetailFromCollection(cardId, savedCard) {
  setLoader(true, 'Lade Karte…');
  try {
    // Erst Set-Map laden für Bild-URL
    const setMap = await getSetMap();

    // TCGdex Detail laden (funktioniert mit allen TCGdex-IDs)
    const res = await fetchWithTimeout(TCGDEX_BASE + '/cards/' + cardId, 8000);
    if (!res.ok) throw new Error('TCGdex ' + res.status);
    const d = await res.json();
    const card = normalizeTcgdexDetail(d, setMap);

    // Bild aus Set-Map wenn TCGdex keins hat
    if (!card.images?.small) {
      const imgBase = cardImageUrl(cardId, setMap);
      if (imgBase) {
        card.images = { small: imgBase + '/low.webp', large: imgBase + '/high.webp' };
      }
    }

    // Zustand aus gespeicherter Karte übernehmen (für Detail-Anzeige)
    if (savedCard?.condition) card._condition = savedCard.condition;

    window._searchResults = [card];
    await openDetail(0);
  } catch(e) {
    console.error('openDetailFromCollection:', e);
    toast('⚠️ Karte konnte nicht geladen werden');
  } finally {
    setLoader(false);
  }
}

let colSortMode = 'price'; // 'price' | 'name' | 'type'

async function renderCollection() {
  document.getElementById('col-empty').style.display = 'block';
  document.getElementById('col-header').style.display = 'none';
  document.getElementById('col-list').innerHTML = '<div style="text-align:center;padding:20px;color:#999">Lade…</div>';

  // Erst Preise nachladen (updated Firebase), dann frisch aus Firebase laden und rendern
  await enrichCollectionPrices(currentProfile);

  const col = await loadCollection(currentProfile);
  const list = document.getElementById('col-list');
  list.innerHTML = '';

  if (!col.length) {
    document.getElementById('col-empty').style.display = 'block';
    return;
  }

  document.getElementById('col-empty').style.display = 'none';
  document.getElementById('col-header').style.display = 'block';

  const total = col.reduce((s, c) => s + (c.price || 0), 0);
  const best  = col.reduce((a, b) => (b.price||0) > (a.price||0) ? b : a, col[0]);

  document.getElementById('col-total').textContent = '€' + total.toFixed(2);
  document.getElementById('col-count').textContent = col.length + ' Karte' + (col.length !== 1 ? 'n' : '');
  document.getElementById('col-best').textContent  = best ? '👑 ' + best.name + ' (€' + (best.price||0).toFixed(2) + ')' : '';

  // Sortierung
  let sorted = [...col];
  if (colSortMode === 'price') sorted.sort((a,b) => (b.price||0) - (a.price||0));
  if (colSortMode === 'name')  sorted.sort((a,b) => a.name.localeCompare(b.name));
  if (colSortMode === 'type')  sorted.sort((a,b) => (a.type||'').localeCompare(b.type||''));

  // Sortier-Buttons updaten
  document.querySelectorAll('.sort-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.sort === colSortMode);
  });

  sorted.forEach(c => {
    const item = document.createElement('div');
    item.className = 'col-item';

    const img = document.createElement('img');
    img.src = c.image || '';
    img.alt = c.name;
    img.onerror = function() {
      this.style.display = 'none';
      const ph = document.createElement('div');
      ph.className = 'card-no-img';
      ph.textContent = '🃏';
      this.parentNode.insertBefore(ph, this.nextSibling);
    };

    const info = document.createElement('div');
    info.className = 'col-item-info';
    // Typ-Badge
    const typeMap = {
      'Fire':      { de: '🔥 Feuer',    color: '#FF9A3C' },
      'Water':     { de: '💧 Wasser',   color: '#4FC3F7' },
      'Grass':     { de: '🌿 Pflanze',  color: '#66BB6A' },
      'Electric':  { de: '⚡ Elektro',  color: '#FFD54F' },
      'Psychic':   { de: '🔮 Psycho',   color: '#F48FB1' },
      'Fighting':  { de: '🥊 Kampf',    color: '#EF9A9A' },
      'Darkness':  { de: '🌑 Unlicht',  color: '#7E57C2' },
      'Metal':     { de: '⚙️ Stahl',    color: '#90A4AE' },
      'Dragon':    { de: '🐉 Drache',   color: '#5C6BC0' },
      'Colorless': { de: '⭐ Normal',   color: '#BDBDBD' },
      'Fairy':     { de: '🧚 Fee',      color: '#F8BBD9' },
      'Lightning': { de: '⚡ Elektro',  color: '#FFD54F' },
    };
    const typeInfo = typeMap[c.type];
    const typeBadge = typeInfo
      ? `<span class="col-type-badge" style="background:${typeInfo.color}">${typeInfo.de}</span>`
      : '';
    const condInfo = c.condition ? CONDITIONS[c.condition] : null;
    const condBadge = condInfo
      ? `<span class="col-cond-badge">${condInfo.label}</span>`
      : '';
    const displayPrice = c.price || 0;
    const basePriceStr = c.basePrice && c.condition && c.condition !== 'mint'
      ? ` <span class="col-base-price">(${esc(c.sym || '€')}${c.basePrice.toFixed(2)} Listenpreis)</span>`
      : '';
    info.innerHTML = `
      <div class="col-item-name">${esc(c.name)}</div>
      <div class="col-item-set">${esc(c.set)} ${typeBadge} ${condBadge}</div>
      <div class="col-item-price">${esc(c.sym || '€')}${displayPrice.toFixed(2)}${basePriceStr}</div>`;

    // Anklickbar → Detail
    item.style.cursor = 'pointer';
    item.addEventListener('click', e => {
      if (e.target.closest('.btn-remove') || e.target.closest('.btn-edit')) return;
      openDetailFromCollection(c.id, c);
    });

    const btnActions = document.createElement('div');
    btnActions.className = 'col-item-actions';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-edit';
    btnEdit.textContent = '✏️';
    btnEdit.title = 'Zustand ändern';
    btnEdit.addEventListener('click', e => { e.stopPropagation(); changeCondition(c); });

    const btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = '🗑️';
    btn.addEventListener('click', e => { e.stopPropagation(); removeCard(c.id, c.name); });

    btnActions.appendChild(btnEdit);
    btnActions.appendChild(btn);

    item.appendChild(img);
    item.appendChild(info);
    item.appendChild(btnActions);
    list.appendChild(item);
  });
}


// Zustand einer Sammlungskarte nachträglich ändern
async function changeCondition(card) {
  const condition = await askCondition();
  if (!condition) return;

  const cInfo = CONDITIONS[condition];
  const basePrice = card.basePrice || card.price || 0;
  const adjPrice  = adjustedPrice(basePrice, condition);

  card.condition = condition;
  card.basePrice = basePrice;
  card.price     = adjPrice;

  await saveCard(currentProfile, card);
  toast('✅ Zustand geändert: ' + cInfo.label);
  renderCollection();
}

// ---- CARDMARKET ----
function openCardmarket() {
  if (!currentCard) return;
  window.open(
    'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=' +
    encodeURIComponent(currentCard.name), '_blank'
  );
}

// ---- AUTOSUGGEST ----
let acTimer = null;
let acAbort = null;

function closeAutocomplete() {
  document.getElementById('autocomplete-list').classList.remove('open');
  document.getElementById('autocomplete-list').innerHTML = '';
}

async function fetchSuggestions(q) {
  if (q.length < 2) { closeAutocomplete(); return; }

  clearTimeout(acTimer);
  acTimer = setTimeout(async () => {
    try {
      if (acAbort) acAbort.abort();
      acAbort = new AbortController();

      // ── TCGdex Autosuggest (deutsch) ──
      let cards = [];
      try {
        const encoded = encodeURIComponent(q.trim());
        const res = await fetch(`${TCGDEX_BASE}/cards?name=${encoded}`, { signal: acAbort.signal });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            // Duplikate nach Name entfernen, max 8
            const seen = new Set();
            cards = data
              .filter(c => { if (seen.has(c.name)) return false; seen.add(c.name); return true; })
              .slice(0, 8)
              .map(c => ({
                name: c.name,
                id:   c.id,
                images: c.image ? { small: c.image + '/low.webp' } : {},
                set:    { name: '' }
              }));
          }
        }
      } catch(e) { if (e.name === 'AbortError') return; }

      // ── Fallback: pokemontcg.io wenn TCGdex nichts liefert ──
      if (!cards.length) {
        const translated = translateName(q);
        const firstWord = encodeURIComponent(translated.split(' ')[0]);
        const res2 = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=name:${firstWord}*&pageSize=8`,
          { signal: acAbort.signal }
        );
        if (res2.ok) {
          const data2 = await res2.json();
          const raw = data2.data || [];
          const lc = q.toLowerCase();
          const filtered = raw.filter(c => c.name.toLowerCase().startsWith(lc));
          const seen = new Set();
          cards = (filtered.length ? filtered : raw)
            .filter(c => { if (seen.has(c.name)) return false; seen.add(c.name); return true; });
        }
      }

      renderAutocomplete(cards);
    } catch(e) {
      if (e.name !== 'AbortError') closeAutocomplete();
    }
  }, 600);
}

function renderAutocomplete(cards) {
  const list = document.getElementById('autocomplete-list');
  if (!cards.length) { closeAutocomplete(); return; }

  list.innerHTML = '';
  cards.forEach(card => {
    const item = document.createElement('div');
    item.className = 'ac-item';

    const img = document.createElement('img');
    img.className = 'ac-img';
    img.src = card.images?.small || '';
    img.alt = card.name;
    img.onerror = () => { img.style.display = 'none'; };

    const info = document.createElement('div');
    info.innerHTML = `<div class="ac-name">${esc(card.name)}</div><div class="ac-set">${esc(card.set?.name || '')}</div>`;

    item.appendChild(img);
    item.appendChild(info);
    item.addEventListener('click', () => {
      document.getElementById('search-input').value = card.name;
      closeAutocomplete();
      doSearch(card.name);
    });
    list.appendChild(item);
  });
  list.classList.add('open');
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  await updateCounts();

  document.getElementById('btn-franz').addEventListener('click',       () => selectProfile('franz'));
  document.getElementById('btn-kate').addEventListener('click',        () => selectProfile('kate'));
  document.getElementById('btn-nil').addEventListener('click',         () => selectProfile('nil'));
  document.getElementById('btn-jelle').addEventListener('click',       () => selectProfile('jelle'));
  document.getElementById('btn-back').addEventListener('click',        async () => { await updateCounts(); showScreen('screen-profile'); });
  document.getElementById('btn-back-detail').addEventListener('click', () => showScreen('screen-main'));
  document.getElementById('tab-search').addEventListener('click',      () => showTab('search'));
  document.getElementById('tab-col').addEventListener('click',         () => showTab('collection'));
  document.getElementById('btn-add').addEventListener('click',         addCard);
  document.getElementById('btn-cm').addEventListener('click',          openCardmarket);

  // Schnellsuche — alles Deutsch, Übersetzung passiert automatisch
  document.getElementById('qs-pikachu').addEventListener('click',   () => quickSearch('Pikachu'));
  document.getElementById('qs-charizard').addEventListener('click', () => quickSearch('Glurak'));
  document.getElementById('qs-mewtwo').addEventListener('click',    () => quickSearch('Mewtu'));
  document.getElementById('qs-eevee').addEventListener('click',     () => quickSearch('Evoli'));

  // Suche
  document.getElementById('btn-search').addEventListener('click', () => { closeAutocomplete(); doSearch(); });

  const input = document.getElementById('search-input');
  input.addEventListener('input', e => fetchSuggestions(e.target.value.trim()));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { closeAutocomplete(); doSearch(); }
    if (e.key === 'Escape') closeAutocomplete();
  });

  // Klick außerhalb schließt Autosuggest
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) closeAutocomplete();
  });

  // Sortier-Buttons
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      colSortMode = btn.dataset.sort;
      renderCollection();
    });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
