/* ============================================================
   PokéDex Family — Pokémon Karten-Wert-Checker
   Vanilla JS, keine Frameworks. localStorage für Sammlungen.
   ============================================================ */

'use strict';

/* ============ KONSTANTEN & STATE ============ */
const API_BASE = 'https://api.pokemontcg.io/v2/cards';

// Profile-Definitionen
const PROFILES = {
  franz: { name: 'Franz', avatar: '🦊', emoji: 'fox' },
  kate:   { name: 'Kate',   avatar: '🌸', emoji: 'flower' }
};

const state = {
  profile: null,          // aktuelles Profil ('franz' | 'kate')
  view: 'search',         // aktive Ansicht
  currentCard: null,      // aktuell angezeigte Karte
  selectedCards: [],      // Suchergebnisse
  collections: {},        // { franz: [...], kate: [...] }
  cameraStream: null,     // aktiver Kamera-Stream
  lastPhoto: null         // letztes Foto (DataURL)
};

/* ============ DOM REFERENZEN ============ */
const $ = (id) => document.getElementById(id);

/* ============ INITIALISIERUNG ============ */
function init() {
  loadCollections();
  bindEvents();
  updateProfileCounts();
  registerServiceWorker();
}

/* ============ SAMMLUNG (localStorage) ============ */
const STORAGE_KEY = 'pokefam_collections_v1';

function loadCollections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.collections = raw ? JSON.parse(raw) : { franz: [], kate: [] };
  } catch (e) {
    console.warn('Sammlung konnte nicht geladen werden:', e);
    state.collections = { franz: [], kate: [] };
  }
  if (!state.collections.franz) state.collections.franz = [];
  if (!state.collections.kate) state.collections.kate = [];
}

function saveCollections() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.collections));
  } catch (e) {
    console.warn('Sammlung konnte nicht gespeichert werden:', e);
    showToast('⚠️ Speicher voll!');
  }
}

function getCollection() {
  return state.profile ? state.collections[state.profile] : [];
}

function updateProfileCounts() {
  $('count-franz').textContent = `${state.collections.franz.length} Karte${state.collections.franz.length === 1 ? '' : 'n'}`;
  $('count-kate').textContent = `${state.collections.kate.length} Karte${state.collections.kate.length === 1 ? '' : 'n'}`;
}

/* ============ EVENT BINDING ============ */
function bindEvents() {
  // Profil-Auswahl
  document.querySelectorAll('.profile-btn').forEach(btn => {
    btn.addEventListener('click', () => selectProfile(btn.dataset.profile));
  });

  // Top-Bar
  $('btn-back-to-profile').addEventListener('click', () => {
    stopCamera();
    showScreen('profile');
  });
  $('btn-collection').addEventListener('click', () => switchView('collection'));

  // Suche
  $('btn-search').addEventListener('click', doSearch);
  $('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  // Kamera
  $('btn-camera').addEventListener('click', openCamera);
  $('btn-camera-close').addEventListener('click', closeCamera);
  $('btn-shutter').addEventListener('click', capturePhoto);

  // Kamera-Modal
  $('modal-shutter').addEventListener('click', captureModalPhoto);
  $('modal-close').addEventListener('click', closeCameraModal);

  // Bestätigen-Modal
  $('confirm-ok').addEventListener('click', confirmSearch);
  $('confirm-cancel').addEventListener('click', closeConfirmModal);
  $('confirm-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSearch();
  });

  // Bottom-Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

/* ============ PROFIL ============ */
function selectProfile(profile) {
  state.profile = profile;
  const p = PROFILES[profile];
  $('top-profile-name').textContent = p.name;
  $('top-profile-avatar').textContent = p.avatar;
  showScreen('main');
  switchView('search');
  showToast(`Hallo ${p.name}! 🎉`);
}

/* ============ SCREEN / VIEW MANAGEMENT ============ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function switchView(view) {
  state.view = view;
  // Buttons aktualisieren
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  // Bereiche umschalten
  $('results').hidden = true;
  $('detail').hidden = true;
  $('collection').hidden = true;
  $('camera-view').hidden = true;

  if (view === 'search') {
    $('search-card').hidden = false;
    if (state.currentCard) showDetail(state.currentCard);
  } else if (view === 'collection') {
    $('search-card').hidden = true;
    renderCollection();
  }
}

/* ============ SUCHE ============ */
async function doSearch() {
  const query = $('search-input').value.trim();
  if (!query) {
    showError('Bitte gib einen Kartennamen ein! ✏️');
    return;
  }
  hideError();
  $('results').hidden = true;
  $('detail').hidden = true;
  showLoading('Suche Karte…');

  try {
    const cards = await searchCards(query);
    hideLoading();
    if (cards.length === 0) {
      showError(`Keine Karte "${query}" gefunden. Prüfe die Schreibweise! 🤔`);
      return;
    }
    state.selectedCards = cards;
    renderResults(cards);
  } catch (err) {
    hideLoading();
    showError('Ups, das hat nicht geklappt. Bist du online? 📡');
    console.error('Suchfehler:', err);
  }
}

async function searchCards(query) {
  const url = `${API_BASE}?q=name:${encodeURIComponent(query)}&pageSize=12&orderBy=set.releaseDate`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API Fehler: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

/* ============ ERGEBNISSE ANZEIGEN ============ */
function renderResults(cards) {
  hideError();
  $('detail').hidden = true;
  const container = $('results');
  container.hidden = false;
  container.innerHTML = `
    <p class="results-title">${cards.length} Ergebnis${cards.length === 1 ? '' : 'se'}</p>
    ${cards.map(card => `
      <div class="card-list-item" data-id="${card.id}">
        <img class="card-list-img" src="${card.images && card.images.small}" alt="${card.name}" loading="lazy" onerror="this.style.opacity=0.3">
        <div class="card-list-info">
          <span class="card-list-name">${escapeHTML(card.name)}</span>
          <span class="card-list-set">${escapeHTML(card.set ? card.set.name : '')} · ${escapeHTML(card.rarity || '')}</span>
          <span class="card-list-price ${card.price ? '' : 'no-price'}">${card.price ? formatPrice(card.price) : 'Preis unbekannt'}</span>
        </div>
      </div>
    `).join('')}
  `;
  container.querySelectorAll('.card-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const card = cards.find(c => c.id === item.dataset.id);
      if (card) showDetail(card);
    });
  });
}

/* ============ KARTEN-DETAIL ============ */
function showDetail(card) {
  state.currentCard = card;
  $('results').hidden = true;
  $('collection').hidden = true;
  $('camera-view').hidden = true;
  $('search-card').hidden = false;
  hideError();

  const inCollection = getCollection().some(c => c.id === card.id);
  const price = getBestPrice(card);
  const grading = getGradingNote(card);

  const container = $('detail');
  container.hidden = false;
  container.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-btns">
        <button class="icon-btn" id="btn-detail-add" aria-label="Zur Sammlung">${inCollection ? '✅' : '➕'}</button>
        <button class="icon-btn" id="btn-detail-close" aria-label="Schließen">✖</button>
      </div>
    </div>
    <div class="detail-body">
      <div class="detail-top">
        <img class="detail-img" src="${card.images && card.images.large}" alt="${card.name}" onerror="this.style.opacity=0.3">
        <div class="detail-meta">
          <div class="detail-name">${escapeHTML(card.name)}</div>
          <div class="detail-set">${escapeHTML(card.set ? card.set.name : '')}</div>
          <div class="detail-set">${escapeHTML(card.set ? card.set.ptcgoCode : '')} · ${escapeHTML(card.number || '')}</div>
          ${card.rarity ? `<span class="detail-rarity">${escapeHTML(card.rarity)}</span>` : ''}
        </div>
      </div>
      <div class="price-box">
        <div class="price-label">💎 Marktwert</div>
        <div class="price-value">${price ? formatPrice(price) : '—'}</div>
        <div class="price-note">${priceNote(card)}</div>
      </div>
      <div class="grading-box">
        <div class="grading-title">📋 Zustand (Grading)</div>
        <div class="grading-text">${grading}</div>
      </div>
      <div class="detail-actions">
        <button class="btn-add ${inCollection ? 'added' : ''}" id="btn-add-card">${inCollection ? '✅ In Sammlung' : '➕ Zur Sammlung'}</button>
        <a class="btn-link" href="${cardmarketUrl(card)}" target="_blank" rel="noopener">Cardmarket ↗</a>
      </div>
    </div>
  `;

  // Detail-Events
  $('btn-detail-close').addEventListener('click', () => {
    $('detail').hidden = true;
    if (state.selectedCards.length) renderResults(state.selectedCards);
  });
  $('btn-add-card').addEventListener('click', () => toggleInCollection(card));
  $('btn-detail-add').addEventListener('click', () => toggleInCollection(card));
}

/* ============ PREIS-LOGIK ============ */
function getBestPrice(card) {
  // Priorität: TCGPlayer Market > Cardmarket Average > TCGPlayer Mid
  if (card.tcgplayer && card.tcgplayer.prices) {
    const p = card.tcgplayer.prices;
    const keys = ['holofoil', 'normal', 'reverseHolofoil', '1stEditionHolofoil', 'unlimitedHolofoil'];
    for (const k of keys) {
      if (p[k] && typeof p[k].market === 'number' && p[k].market > 0) return p[k].market;
    }
    for (const k of keys) {
      if (p[k] && typeof p[k].mid === 'number' && p[k].mid > 0) return p[k].mid;
    }
  }
  if (card.cardmarket && card.cardmarket.prices) {
    const p = card.cardmarket.prices;
    if (typeof p.averageSellPrice === 'number' && p.averageSellPrice > 0) return p.averageSellPrice;
    if (typeof p.trendPrice === 'number' && p.trendPrice > 0) return p.trendPrice;
  }
  return null;
}

function priceNote(card) {
  const parts = [];
  if (card.tcgplayer && card.tcgplayer.prices) {
    const p = card.tcgplayer.prices;
    const holofoil = p.holofoil ? p.holofoil.market : null;
    const normal = p.normal ? p.normal.market : null;
    if (holofoil) parts.push(`Holo: ${formatPrice(holofoil)}`);
    if (normal) parts.push(`Normal: ${formatPrice(normal)}`);
  }
  if (card.cardmarket && card.cardmarket.prices) {
    const p = card.cardmarket.prices;
    if (typeof p.averageSellPrice === 'number') parts.push(`Cardmarket Ø: ${formatPrice(p.averageSellPrice)}`);
  }
  return parts.length ? parts.join(' · ') : 'Preis nicht verfügbar';
}

function formatPrice(value) {
  if (value === null || value === undefined) return '—';
  return '€ ' + Number(value).toFixed(2);
}

/* ============ GRADING-HINWEIS ============ */
function getGradingNote(card) {
  const price = getBestPrice(card);
  if (price === null) {
    return 'Der Wert hängt stark vom Zustand ab. Gut erhaltene Karten (Near Mint) sind meist mehr wert als abgenutzte.';
  }
  if (price > 50) {
    return 'Wow, eine wertvolle Karte! 🤑 Bei Sammlerkarten lohnt sich oft eine professionelle Bewertung (Grading), z.B. bei PSA oder BGS. Eine PSA 10 kann deutlich mehr wert sein als eine ungegradete Karte.';
  }
  if (price > 10) {
    return 'Schöner Fund! 💎 Der Wert gilt für Karten in gutem Zustand (Near Mint). Achte darauf, die Karte in einer Hülle zu schützen, damit der Wert erhalten bleibt.';
  }
  return 'Kleinere Karten sind trotzdem spannend! 💛 Der angezeigte Wert gilt für Karten in gutem Zustand (Near Mint). Karten mit Kratzern oder Knicken sind meist weniger wert.';
}

/* ============ CARDMARKET LINK ============ */
function cardmarketUrl(card) {
  const base = 'https://www.cardmarket.com/de/Pokemon';
  if (card.cardmarket && card.cardmarket.url) return card.cardmarket.url;
  // Fallback: Suche über den Namen
  return `${base}?searchString=${encodeURIComponent(card.name)}`;
}

/* ============ SAMMLUNG ============ */
function toggleInCollection(card) {
  const coll = getCollection();
  const idx = coll.findIndex(c => c.id === card.id);
  const btn = $('btn-add-card');
  const headerBtn = $('btn-detail-add');

  if (idx >= 0) {
    coll.splice(idx, 1);
    saveCollections();
    if (btn) { btn.textContent = '➕ Zur Sammlung'; btn.classList.remove('added'); }
    if (headerBtn) headerBtn.textContent = '➕';
    showToast('Karte entfernt 🗑️');
  } else {
    // Nur minimale Daten speichern
    coll.push({
      id: card.id,
      name: card.name,
      set: card.set ? card.set.name : '',
      rarity: card.rarity || '',
      image: card.images ? card.images.small : '',
      number: card.number || '',
      price: getBestPrice(card)
    });
    saveCollections();
    if (btn) { btn.textContent = '✅ In Sammlung'; btn.classList.add('added'); }
    if (headerBtn) headerBtn.textContent = '✅';
    showToast('Zur Sammlung hinzugefügt! 🎉');
  }
  updateProfileCounts();
}

function renderCollection() {
  const coll = getCollection();
  const container = $('collection');
  container.hidden = false;
  $('results').hidden = true;
  $('detail').hidden = true;
  $('camera-view').hidden = true;
  $('search-card').hidden = true;

  const total = coll.reduce((sum, c) => sum + (c.price || 0), 0);

  if (coll.length === 0) {
    container.innerHTML = `
      <div class="collection-empty">
        <span class="big">🎒</span>
        <p>Deine Sammlung ist noch leer!<br>Scanne oder suche deine erste Karte.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="collection-summary">
      <div class="collection-total-label">💰 Sammlungswert</div>
      <div class="collection-total-value">${formatPrice(total)}</div>
      <div class="collection-count">${coll.length} Karte${coll.length === 1 ? '' : 'n'}</div>
    </div>
    ${coll.map((c, i) => `
      <div class="collection-item">
        <img class="collection-item-img" src="${c.image}" alt="${c.name}" onerror="this.style.opacity=0.3">
        <div class="collection-item-info">
          <span class="collection-item-name">${escapeHTML(c.name)}</span>
          <span class="collection-item-set">${escapeHTML(c.set)} · ${escapeHTML(c.rarity || '')}</span>
          <span class="collection-item-price ${c.price ? '' : 'no-price'}">${c.price ? formatPrice(c.price) : 'Preis unbekannt'}</span>
        </div>
        <button class="collection-item-remove" data-idx="${i}" aria-label="Karte entfernen">🗑️</button>
      </div>
    `).join('')}
  `;

  container.querySelectorAll('.collection-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const removed = coll.splice(idx, 1)[0];
      saveCollections();
      updateProfileCounts();
      renderCollection();
      showToast(`${removed.name} entfernt 🗑️`);
    });
  });
}

/* ============ KAMERA ============ */
async function openCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('Kamera wird auf diesem Gerät nicht unterstützt. Bitte gib den Namen manuell ein. 📝');
    return;
  }
  hideError();
  $('camera-view').hidden = false;
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    const video = $('camera-video');
    video.srcObject = state.cameraStream;
    await video.play();
  } catch (err) {
    $('camera-view').hidden = true;
    showError('Kamera konnte nicht gestartet werden. Bitte gib den Namen manuell ein. 📝');
    console.error('Kamera-Fehler:', err);
  }
}

function closeCamera() {
  stopCamera();
  $('camera-view').hidden = true;
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
}

function capturePhoto() {
  const video = $('camera-video');
  if (!video.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  state.lastPhoto = canvas.toDataURL('image/jpeg', 0.8);
  closeCamera();
  openConfirmModal(state.lastPhoto);
}

/* ============ KAMERA MODAL (alternativer Weg) ============ */
async function openCameraModal() {
  $('modal-camera').hidden = false;
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    const video = $('modal-video');
    video.srcObject = state.cameraStream;
    await video.play();
  } catch (err) {
    closeCameraModal();
    showError('Kamera konnte nicht gestartet werden. 📝');
    console.error('Kamera-Modal-Fehler:', err);
  }
}

function closeCameraModal() {
  stopCamera();
  $('modal-camera').hidden = true;
}

function captureModalPhoto() {
  const video = $('modal-video');
  if (!video.videoWidth) return;
  const canvas = $('modal-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  state.lastPhoto = canvas.toDataURL('image/jpeg', 0.8);
  closeCameraModal();
  openConfirmModal(state.lastPhoto);
}

/* ============ BESTÄTIGEN-MODAL ============ */
function openConfirmModal(photoDataUrl) {
  $('confirm-image').src = photoDataUrl;
  $('confirm-name').value = '';
  $('modal-confirm').hidden = false;
  setTimeout(() => $('confirm-name').focus(), 300);
}

function closeConfirmModal() {
  $('modal-confirm').hidden = true;
  state.lastPhoto = null;
}

function confirmSearch() {
  const name = $('confirm-name').value.trim();
  closeConfirmModal();
  if (!name) {
    showError('Bitte gib einen Namen ein! ✏️');
    return;
  }
  $('search-input').value = name;
  doSearch();
}

/* ============ LOADING / FEHLER / TOAST ============ */
function showLoading(text) {
  $('loading').hidden = false;
  $('loading-text').textContent = text || 'Lädt…';
}
function hideLoading() { $('loading').hidden = true; }

function showError(msg) {
  const box = $('error-box');
  box.textContent = msg;
  box.hidden = false;
}
function hideError() { $('error-box').hidden = true; }

let toastTimer = null;
function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 300);
  }, 2500);
}

/* ============ HELPER ============ */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ============ SERVICE WORKER ============ */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('Service Worker Registrierung fehlgeschlagen:', err);
      });
    });
  }
}

/* ============ START ============ */
document.addEventListener('DOMContentLoaded', init);
