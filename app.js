/* PokéDex Family — App Logic */

// ---- STATE ----
let currentProfile = null;
let currentCard = null;
let cameraStream = null;
let currentTab = 'search';

// ---- STORAGE ----
function getCollection(profile) {
  try { return JSON.parse(localStorage.getItem('col_' + profile) || '[]'); }
  catch { return []; }
}
function saveCollection(profile, cards) {
  localStorage.setItem('col_' + profile, JSON.stringify(cards));
}
function isInCollection(profile, id) {
  return getCollection(profile).some(c => c.id === id);
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
  }
  return null;
}
function fmtPrice(p) { return p ? p.sym + p.v.toFixed(2) : 'k.A.'; }

// ---- API ----
async function searchCards(query) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(query)}"&pageSize=20`);
  if (!res.ok) throw new Error('API ' + res.status);
  return (await res.json()).data || [];
}

// ---- SCREEN SWITCHING ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ---- TOAST ----
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show';
  setTimeout(() => t.className = 'toast', 2500);
}

// ---- PROFILE ----
function selectProfile(profile) {
  currentProfile = profile;
  const info = { franz: { name: "Franz's PokéDex", avatar: '🦊' }, kate: { name: "Kate's PokéDex", avatar: '🌸' } };
  document.getElementById('header-name').textContent   = info[profile].name;
  document.getElementById('header-avatar').textContent = info[profile].avatar;
  document.getElementById('detail-avatar').textContent = info[profile].avatar;
  showScreen('screen-main');
  showTab('search');
}

function updateCounts() {
  ['franz', 'kate'].forEach(p => {
    const n = getCollection(p).length;
    document.getElementById('count-' + p).textContent = n + ' Karten';
  });
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
async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) { toast('Bitte Namen eingeben!'); return; }
  stopCamera();
  document.getElementById('loader').style.display = 'flex';
  document.getElementById('no-results').style.display = 'none';
  document.getElementById('results-grid').innerHTML = '';
  try {
    const cards = await searchCards(q);
    renderResults(cards);
  } catch(e) {
    toast('⚠️ Fehler – bitte nochmal versuchen.');
  } finally {
    document.getElementById('loader').style.display = 'none';
  }
}

function renderResults(cards) {
  const grid = document.getElementById('results-grid');
  if (!cards.length) { document.getElementById('no-results').style.display = 'block'; return; }
  grid.innerHTML = cards.map((card, i) => {
    const p = getBestPrice(card);
    return `<div class="result-card" onclick="openDetail(${i})">
      <img src="${card.images?.small || ''}" alt="${card.name}" loading="lazy">
      <div class="rc-info">
        <div class="rc-name">${card.name}</div>
        <div class="rc-set">${card.set?.name || ''}</div>
        <div class="rc-price">${fmtPrice(p)}</div>
      </div>
    </div>`;
  }).join('');
  // Store cards globally for onclick
  window._searchResults = cards;
}

// ---- DETAIL ----
function openDetail(idx) {
  const card = window._searchResults[idx];
  currentCard = card;
  const p = getBestPrice(card);

  document.getElementById('detail-img').src = card.images?.large || card.images?.small || '';
  document.getElementById('detail-name').textContent = card.name;
  document.getElementById('detail-set').textContent  = (card.set?.name || '') + (card.set?.series ? ' · ' + card.set.series : '');
  document.getElementById('price-label').textContent = p?.label || 'Preis';
  document.getElementById('price-value').textContent = fmtPrice(p);
  document.getElementById('price-date').textContent  = card.cardmarket?.updatedAt ? 'Stand: ' + card.cardmarket.updatedAt : '';

  // Badges
  let badges = '';
  if (card.rarity)    badges += `<span class="badge b-rarity">⭐ ${card.rarity}</span>`;
  if (card.types?.[0]) badges += `<span class="badge b-type">${card.types[0]}</span>`;
  if (card.hp)        badges += `<span class="badge b-hp">❤️ ${card.hp} HP</span>`;
  document.getElementById('detail-badges').innerHTML = badges;

  // Price rows
  const cm = card.cardmarket?.prices;
  const tcp = card.tcgplayer?.prices;
  let rows = '';
  if (cm?.averageSellPrice) rows += priceRow('CM Ø Verkauf',   '€' + cm.averageSellPrice.toFixed(2));
  if (cm?.trendPrice)       rows += priceRow('CM Trend',       '€' + cm.trendPrice.toFixed(2));
  if (cm?.lowPrice)         rows += priceRow('CM Niedrig',     '€' + cm.lowPrice.toFixed(2));
  if (tcp) {
    const v = tcp.holofoil || tcp.normal || Object.values(tcp)[0];
    if (v?.low)    rows += priceRow('TCG Niedrig', '$' + v.low.toFixed(2));
    if (v?.market) rows += priceRow('TCG Markt',   '$' + v.market.toFixed(2));
    if (v?.high)   rows += priceRow('TCG Hoch',    '$' + v.high.toFixed(2));
  }
  document.getElementById('price-rows').innerHTML = rows;

  // Grading
  document.getElementById('grading-text').innerHTML =
    '💎 <b>Mint (M):</b> Perfekt — höchster Wert<br>' +
    '✨ <b>Near Mint (NM):</b> Kaum gespielt<br>' +
    '👍 <b>Excellent (EX):</b> Leichte Gebrauchsspuren<br>' +
    '📦 <b>Good (GD):</b> Sichtbare Spuren — weniger wert' +
    (card.rarity?.includes('Rare') ? '<br><br>⭐ Seltene Karte — Zustand besonders wichtig!' : '');

  // Add-Button
  const btn = document.getElementById('btn-add');
  if (isInCollection(currentProfile, card.id)) {
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

// ---- COLLECTION ----
function addCard() {
  if (!currentCard) return;
  const p = getBestPrice(currentCard);
  const col = getCollection(currentProfile);
  if (col.find(c => c.id === currentCard.id)) { toast('Bereits in der Sammlung!'); return; }
  col.push({
    id: currentCard.id,
    name: currentCard.name,
    set: currentCard.set?.name || '',
    image: currentCard.images?.small || '',
    price: p?.v || 0,
    sym: p?.sym || '€'
  });
  saveCollection(currentProfile, col);
  toast('🎉 ' + currentCard.name + ' hinzugefügt!');
  document.getElementById('btn-add').textContent = '✅ In Sammlung';
  document.getElementById('btn-add').classList.add('added');
  updateCounts();
}

function removeCard(id) {
  const col = getCollection(currentProfile).filter(c => c.id !== id);
  saveCollection(currentProfile, col);
  toast('🗑️ Entfernt');
  updateCounts();
  renderCollection();
}

function renderCollection() {
  const col = getCollection(currentProfile);
  document.getElementById('col-empty').style.display  = col.length ? 'none' : 'block';
  document.getElementById('col-header').style.display = col.length ? 'block' : 'none';
  if (!col.length) { document.getElementById('col-list').innerHTML = ''; return; }
  const total = col.reduce((s, c) => s + (c.price || 0), 0);
  document.getElementById('col-total').textContent = '€' + total.toFixed(2);
  document.getElementById('col-count').textContent = col.length + ' Karten';
  document.getElementById('col-list').innerHTML = col.map(c => `
    <div class="col-item">
      <img src="${c.image}" alt="${c.name}">
      <div class="col-item-info">
        <div class="col-item-name">${c.name}</div>
        <div class="col-item-set">${c.set}</div>
        <div class="col-item-price">${c.sym}${(c.price||0).toFixed(2)}</div>
      </div>
      <button class="btn-remove" onclick="removeCard('${c.id}')">🗑️</button>
    </div>`).join('');
}

// ---- CAMERA ----
async function toggleCamera() {
  if (cameraStream) { stopCamera(); return; }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('camera-video').srcObject = cameraStream;
    document.getElementById('camera-container').style.display = 'block';
    toast('📷 Karte in den Rahmen halten, dann 📸 drücken');
  } catch(e) {
    toast('Kamera nicht verfügbar — bitte manuell suchen');
  }
}
function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  document.getElementById('camera-container').style.display = 'none';
}
function snapPhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  stopCamera();
  const name = prompt('Kartenname eingeben (steht oben auf der Karte):');
  if (name?.trim()) { document.getElementById('search-input').value = name.trim(); doSearch(); }
}

// ---- CARDMARKET ----
function openCardmarket() {
  if (!currentCard) return;
  window.open('https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=' + encodeURIComponent(currentCard.name), '_blank');
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  updateCounts();

  document.getElementById('btn-franz').addEventListener('click', () => selectProfile('franz'));
  document.getElementById('btn-kate').addEventListener('click',  () => selectProfile('kate'));
  document.getElementById('btn-back').addEventListener('click',  () => { stopCamera(); updateCounts(); showScreen('screen-profile'); });
  document.getElementById('btn-back-detail').addEventListener('click', () => showScreen('screen-main'));
  document.getElementById('btn-search').addEventListener('click', doSearch);
  document.getElementById('btn-cam').addEventListener('click', toggleCamera);
  document.getElementById('btn-snap').addEventListener('click', snapPhoto);
  document.getElementById('tab-search').addEventListener('click', () => showTab('search'));
  document.getElementById('tab-col').addEventListener('click',    () => showTab('collection'));
  document.getElementById('btn-add').addEventListener('click', addCard);
  document.getElementById('btn-cm').addEventListener('click', openCardmarket);
  document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
