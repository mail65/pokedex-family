/* PokéDex Family — App Logic v4
   - Kamera entfernt (kommt später mit Google Vision)
   - Firebase Realtime DB für Geräte-übergreifende Sammlung
   - Robuste API-Suche ohne Rate-Limit-Probleme
   - Schöne Sammlungsansicht mit Gesamtwert
*/

// ---- FIREBASE CONFIG ----
// Kostenloser Spark Plan — keine Kreditkarte nötig
const FIREBASE_URL = 'https://pokedex-family-default-rtdb.europe-west1.firebasedatabase.app';

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

// ---- API SUCHE ----
function fetchWithTimeout(url, ms = 10000) {
  return Promise.race([
    fetch(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), ms))
  ]);
}

async function searchCards(query) {
  const clean = query.trim().replace(/[^a-zA-ZäöüÄÖÜß0-9\s\-]/g, '').trim();
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

  let badges = '';
  if (card.rarity)     badges += `<span class="badge b-rarity">⭐ ${esc(card.rarity)}</span>`;
  if (card.types?.[0]) badges += `<span class="badge b-type">${esc(card.types[0])}</span>`;
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

async function removeCard(id) {
  await deleteCard(currentProfile, id);
  toast('🗑️ Entfernt');
  await updateCounts();
  renderCollection();
}

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
  document.getElementById('col-total').textContent = '€' + total.toFixed(2);
  document.getElementById('col-count').textContent = col.length + ' Karte' + (col.length !== 1 ? 'n' : '');

  // Sortiert: teuerste zuerst
  const sorted = [...col].sort((a, b) => (b.price || 0) - (a.price || 0));

  sorted.forEach(c => {
    const item = document.createElement('div');
    item.className = 'col-item';

    const img = document.createElement('img');
    img.src = c.image; img.alt = c.name;

    const info = document.createElement('div');
    info.className = 'col-item-info';
    info.innerHTML = `
      <div class="col-item-name">${esc(c.name)}</div>
      <div class="col-item-set">${esc(c.set)}</div>
      <div class="col-item-price">${esc(c.sym)}${(c.price||0).toFixed(2)}</div>`;

    const btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = '🗑️';
    btn.addEventListener('click', () => removeCard(c.id));

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

  document.getElementById('btn-search').addEventListener('click', () => doSearch());
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
