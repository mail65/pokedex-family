/* PokéDex Family — App Logic v4
   - Kamera entfernt (kommt später mit Google Vision)
   - Firebase Realtime DB für Geräte-übergreifende Sammlung
   - Robuste API-Suche ohne Rate-Limit-Probleme
   - Schöne Sammlungsansicht mit Gesamtwert
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

// ---- DEUTSCH → ENGLISCH ÜBERSETZUNG ----
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

// ---- API SUCHE ----
function fetchWithTimeout(url, ms = 10000) {
  return Promise.race([
    fetch(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), ms))
  ]);
}

async function searchCards(query) {
  // Deutschen Namen übersetzen falls vorhanden
  const translated = translateName(query);
  const clean = translated.trim().replace(/[^a-zA-ZäöüÄÖÜß0-9\s\-]/g, '').trim();
  if (!clean) throw new Error('Leere Suche');

  const words = clean.split(/\s+/);
  const firstWord = encodeURIComponent(words[0]);

  // Strategie: immer erstes Wort + Wildcard — funktioniert für alle Namen
  // ("Slither Wing" → name:Slither* → findet Slither Wing ✅)
  let url = `https://api.pokemontcg.io/v2/cards?q=name:${firstWord}*&pageSize=30`;
  let res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  let cards = data.data || [];

  // Wenn mehrteiliger Name: clientseitig filtern
  if (words.length > 1) {
    const lc = clean.toLowerCase();
    const filtered = cards.filter(c => c.name.toLowerCase().includes(lc));
    // Nur filtern wenn Treffer vorhanden, sonst alle zurückgeben
    if (filtered.length) cards = filtered;
  }

  return cards;
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
    kate:  { name: "Kate's PokéDex",  avatar: '🌸' }
  };
  document.getElementById('header-name').textContent   = info[profile].name;
  document.getElementById('header-avatar').textContent = info[profile].avatar;
  document.getElementById('detail-avatar').textContent = info[profile].avatar;
  showScreen('screen-main');
  showTab('search');
  await updateCounts();
}

async function updateCounts() {
  for (const p of ['franz', 'kate']) {
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
      <img src="${esc(card.images?.small || '')}" alt="${esc(card.name)}" loading="lazy">
      <div class="rc-info">
        <div class="rc-name">${esc(card.name)}</div>
        <div class="rc-set">${esc(card.set?.name || '')}</div>
        <div class="rc-price">${fmtPrice(p)}</div>
      </div>
    </div>`;
  }).join('');

  // Event Listener statt inline onclick
  grid.querySelectorAll('.result-card').forEach(el => {
    el.addEventListener('click', () => openDetail(parseInt(el.dataset.idx)));
  });
}

// ---- DETAIL ----
async function openDetail(idx) {
  const card = window._searchResults[idx];
  currentCard = card;
  const p = getBestPrice(card);

  document.getElementById('detail-img').src = card.images?.large || card.images?.small || '';
  document.getElementById('detail-name').textContent = card.name;
  document.getElementById('detail-set').textContent  =
    (card.set?.name || '') + (card.set?.series ? ' · ' + card.set.series : '');
  document.getElementById('price-label').textContent = p?.label || 'Preis';
  document.getElementById('price-value').textContent = fmtPrice(p);
  document.getElementById('price-date').textContent  =
    card.cardmarket?.updatedAt ? 'Stand: ' + card.cardmarket.updatedAt : '';

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
  const p = getBestPrice(currentCard);
  const cardData = {
    id:    currentCard.id,
    name:  currentCard.name,
    set:   currentCard.set?.name || '',
    type:  currentCard.types?.[0] || '',
    image: currentCard.images?.small || '',
    price: p?.v || 0,
    sym:   p?.sym || '€',
    addedAt: new Date().toISOString()
  };

  const btn = document.getElementById('btn-add');
  btn.textContent = '⏳ Speichern…';
  btn.disabled = true;

  await saveCard(currentProfile, cardData);
  toast('🎉 ' + currentCard.name + ' hinzugefügt!');
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

async function openDetailFromCollection(cardId) {
  // Karte aus Firebase laden und Detail-Screen öffnen
  setLoader(true, 'Lade Karte…');
  try {
    const res = await fetchWithTimeout(`https://api.pokemontcg.io/v2/cards/${cardId}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    // Simuliere Suchergebnis damit openDetail() funktioniert
    window._searchResults = [data.data];
    await openDetail(0);
  } catch {
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
    img.src = c.image; img.alt = c.name;

    const info = document.createElement('div');
    info.className = 'col-item-info';
    const typeTag = c.type ? `<span class="col-type-badge">${esc(c.type)}</span>` : '';
    info.innerHTML = `
      <div class="col-item-name">${esc(c.name)}</div>
      <div class="col-item-set">${esc(c.set)} ${typeTag}</div>
      <div class="col-item-price">${esc(c.sym)}${(c.price||0).toFixed(2)}</div>`;

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
    info.innerHTML = `
      <div class="col-item-name">${esc(c.name)}</div>
      <div class="col-item-set">${esc(c.set)} ${typeBadge}</div>
      <div class="col-item-price">${esc(c.sym)}${(c.price||0).toFixed(2)}</div>`;

    // Anklickbar → Detail
    item.style.cursor = 'pointer';
    item.addEventListener('click', e => {
      if (e.target.closest('.btn-remove')) return;
      openDetailFromCollection(c.id);
    });

    const btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = '🗑️';
    btn.addEventListener('click', e => { e.stopPropagation(); removeCard(c.id, c.name); });

    item.appendChild(img);
    item.appendChild(info);
    item.appendChild(btn);
    list.appendChild(item);
  });
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
  const translated = translateName(q);

  // Debounce: 600ms nach letzter Eingabe
  clearTimeout(acTimer);
  acTimer = setTimeout(async () => {
    try {
      if (acAbort) acAbort.abort();
      acAbort = new AbortController();

      const firstWord = encodeURIComponent(translated.split(' ')[0]);
      const res = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=name:${firstWord}*&pageSize=8`,
        { signal: acAbort.signal }
      );
      if (!res.ok) return;
      const data = await res.json();
      const cards = data.data || [];

      // Clientseitig filtern falls mehrere Wörter
      const lc = q.toLowerCase();
      const filtered = cards.filter(c => c.name.toLowerCase().startsWith(lc));
      const show = filtered.length ? filtered : cards;

      // Duplikate nach Name entfernen
      const seen = new Set();
      const unique = show.filter(c => {
        if (seen.has(c.name)) return false;
        seen.add(c.name); return true;
      });

      renderAutocomplete(unique);
    } catch(e) {
      if (e.name !== 'AbortError') closeAutocomplete();
    }
  }, 350);
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
  document.getElementById('btn-back').addEventListener('click',        async () => { await updateCounts(); showScreen('screen-profile'); });
  document.getElementById('btn-back-detail').addEventListener('click', () => showScreen('screen-main'));
  document.getElementById('tab-search').addEventListener('click',      () => showTab('search'));
  document.getElementById('tab-col').addEventListener('click',         () => showTab('collection'));
  document.getElementById('btn-add').addEventListener('click',         addCard);
  document.getElementById('btn-cm').addEventListener('click',          openCardmarket);

  // Schnellsuche
  document.getElementById('qs-pikachu').addEventListener('click',   () => quickSearch('Pikachu'));
  document.getElementById('qs-charizard').addEventListener('click', () => quickSearch('Charizard'));
  document.getElementById('qs-mewtwo').addEventListener('click',    () => quickSearch('Mewtwo'));
  document.getElementById('qs-eevee').addEventListener('click',     () => quickSearch('Eevee'));

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
