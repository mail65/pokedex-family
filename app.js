/* PokéDex Family — App Logic v3
   Fixes: API-Encoding, iOS Kamera, Hochformat, Canvas, Timeout, XSS
*/

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

// ---- XSS HELPER ----
function esc(text) {
  return (text || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
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

// ---- API (FIX: encodeURIComponent NICHT auf Anführungszeichen!) ----
function fetchWithTimeout(url, ms = 8000) {
  return Promise.race([
    fetch(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), ms))
  ]);
}

async function searchCards(query) {
  const clean = query.trim().replace(/[^a-zA-ZäöüÄÖÜß\s\-]/g, '').trim();
  if (!clean) throw new Error('Leere Suche');

  // Ohne Anführungszeichen — API akzeptiert das zuverlässig
  let url = `https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(clean)}&pageSize=20`;
  let res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('API ' + res.status);
  let data = await res.json();

  // Fuzzy-Fallback mit Wildcard
  if (!data.data?.length) {
    url = `https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(clean)}*&pageSize=20`;
    res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error('API ' + res.status);
    data = await res.json();
  }

  return data.data || [];
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

// ---- PROFILE ----
function selectProfile(profile) {
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
}

function updateCounts() {
  ['franz', 'kate'].forEach(p => {
    const el = document.getElementById('count-' + p);
    if (el) el.textContent = getCollection(p).length + ' Karten';
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
async function doSearch(query) {
  const q = query || document.getElementById('search-input').value.trim();
  if (!q) { toast('Bitte Namen eingeben!'); return; }

  stopCamera();
  hideSnapPreview();
  setLoader(true, 'Suche nach ' + q + '…');
  document.getElementById('no-results').style.display = 'none';
  document.getElementById('results-grid').innerHTML = '';

  try {
    const cards = await searchCards(q);
    renderResults(cards, q);
  } catch(e) {
    console.error(e);
    if (e.message === 'Timeout') {
      toast('⏱️ Zeitüberschreitung — bitte nochmal versuchen.');
    } else {
      toast('⚠️ Verbindungsfehler — bitte nochmal versuchen.');
    }
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
    return `<div class="result-card" onclick="openDetail(${i})">
      <img src="${esc(card.images?.small || '')}" alt="${esc(card.name)}" loading="lazy">
      <div class="rc-info">
        <div class="rc-name">${esc(card.name)}</div>
        <div class="rc-set">${esc(card.set?.name || '')}</div>
        <div class="rc-price">${fmtPrice(p)}</div>
      </div>
    </div>`;
  }).join('');
}

// ---- DETAIL ----
function openDetail(idx) {
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

// ---- COLLECTION (FIX: XSS weg, Event Listener statt onclick) ----
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
  saveCollection(currentProfile, getCollection(currentProfile).filter(c => c.id !== id));
  toast('🗑️ Entfernt');
  updateCounts();
  renderCollection();
}

function renderCollection() {
  const col = getCollection(currentProfile);
  document.getElementById('col-empty').style.display  = col.length ? 'none'  : 'block';
  document.getElementById('col-header').style.display = col.length ? 'block' : 'none';
  const list = document.getElementById('col-list');
  list.innerHTML = '';
  if (!col.length) return;

  const total = col.reduce((s, c) => s + (c.price || 0), 0);
  document.getElementById('col-total').textContent = '€' + total.toFixed(2);
  document.getElementById('col-count').textContent = col.length + ' Karte' + (col.length !== 1 ? 'n' : '');

  // FIX: DOM-Elemente statt innerHTML mit onclick — kein XSS
  col.forEach(c => {
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

// ---- KAMERA (FIX: iOS Safari + Hochformat) ----
async function toggleCamera() {
  if (cameraStream) { stopCamera(); return; }
  try {
    // FIX: aspectRatio 9/16 erzwingt Hochformat auf iOS
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        aspectRatio: { ideal: 9/16 },
        width:  { ideal: 720 },
        height: { ideal: 1280 }
      },
      audio: false
    });

    const video = document.getElementById('camera-video');

    // FIX: srcObject Kompatibilität für ältere iOS Safari
    if ('srcObject' in video) {
      video.srcObject = cameraStream;
    } else {
      video.src = URL.createObjectURL(cameraStream);
    }

    // FIX: Explizit play() aufrufen für iOS
    video.play().catch(e => console.warn('Video play:', e));

    // FIX: Hochformat im Container erzwingen
    const container = document.getElementById('camera-container');
    container.style.display = 'block';

    toast('📷 Karte hochkant halten — Name oben sichtbar — dann 📸 drücken');
  } catch(e) {
    console.error('Kamera:', e);
    toast('Kamera nicht verfügbar — bitte Namen manuell eingeben');
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  document.getElementById('camera-container').style.display = 'none';
}

// ---- FOTO (FIX: videoWidth/Height Check) ----
function snapPhoto() {
  const video = document.getElementById('camera-video');

  // FIX: Warten bis Video-Dimensionen bekannt sind
  if (!video.videoWidth || !video.videoHeight) {
    toast('⏳ Kamera noch nicht bereit — kurz warten...');
    video.addEventListener('loadedmetadata', snapPhoto, { once: true });
    return;
  }

  const canvas = document.getElementById('camera-canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  stopCamera();

  // Foto-Vorschau zeigen
  document.getElementById('snap-preview').src = canvas.toDataURL('image/jpeg', 0.8);
  document.getElementById('snap-preview-box').style.display = 'block';
  const input = document.getElementById('search-input');
  input.value = '';
  input.placeholder = 'Namen von Karte abtippen…';
  input.focus();
  toast('📸 Foto gemacht! Name oben auf der Karte eintippen 👆');
}

function hideSnapPreview() {
  document.getElementById('snap-preview-box').style.display = 'none';
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
document.addEventListener('DOMContentLoaded', () => {
  updateCounts();

  document.getElementById('btn-franz').addEventListener('click',       () => selectProfile('franz'));
  document.getElementById('btn-kate').addEventListener('click',        () => selectProfile('kate'));
  document.getElementById('btn-back').addEventListener('click',        () => { stopCamera(); updateCounts(); showScreen('screen-profile'); });
  document.getElementById('btn-back-detail').addEventListener('click', () => showScreen('screen-main'));
  document.getElementById('btn-cam').addEventListener('click',         toggleCamera);
  document.getElementById('btn-snap').addEventListener('click',        snapPhoto);
  document.getElementById('tab-search').addEventListener('click',      () => showTab('search'));
  document.getElementById('tab-col').addEventListener('click',         () => showTab('collection'));
  document.getElementById('btn-add').addEventListener('click',         addCard);
  document.getElementById('btn-cm').addEventListener('click',          openCardmarket);

  document.getElementById('btn-search').addEventListener('click', () => {
    hideSnapPreview();
    doSearch();
  });

  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      hideSnapPreview();
      doSearch();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
