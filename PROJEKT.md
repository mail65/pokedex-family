# 🎮 PokéDex Family — Projektdoku

> Erstellt: 22.08.2026 | Entwickler: Felix (AI) | Auftraggeber: Tobias

---

## 📱 Was ist das?

Eine PWA (Progressive Web App) für Franz 🦊 und Kate 🌸 — Pokémon-Karten scannen, Marktwert checken, Sammlung aufbauen.

**Live-URL:** https://mail65.github.io/pokedex-family/
**GitHub Repo:** https://github.com/mail65/pokedex-family (Account: mail65)
**Lokal:** http://localhost:8765 (python3 -m http.server 8765 im pokemon-app Ordner)

---

## ✅ Was ist fertig (Stand 22.08.2026)

- Profil-Auswahl: Franz 🦊 und Kate 🌸 — je eigene Sammlung (localStorage)
- Karten-Suche via Pokémon TCG API (kostenlos, kein API-Key nötig)
- Kamerascan mit 📷-Button (getUserMedia + manueller Namenseingabe)
- Detailansicht: Kartenbild, Rarity, HP, Cardmarket-Preis, TCGPlayer-Preis
- Grading-Hinweise (Mint / Near Mint / Excellent / Good)
- Cardmarket-Link 🛒 direkt zur Karte
- Sammlung speichern + Gesamtwert der Sammlung
- Pokémon-Design: Rot/Gelb, Pokéball-Animation, Press Start 2P Font
- PWA-fähig: auf iPhone als App installierbar (Safari → "Zum Homescreen")
- Service Worker für Offline-Basis

---

## 🛠️ Dateistruktur

```
pokemon-app/
├── index.html       — Alle 3 Screens (Profil / Suche / Detail)
├── app.js           — Komplette App-Logik
├── style.css        — Pokémon-Design, Mobile-First
├── manifest.json    — PWA-Manifest
├── sw.js            — Service Worker (Network-First, v3)
├── icons/
│   ├── pokeball.svg
│   ├── pokeball-192.png
│   └── pokeball-512.png
└── PROJEKT.md       — Diese Datei
```

---

## 💡 Noch offen / Ideen für später

- [ ] Echte OCR-Kartenerkennung (z.B. via Google Vision API oder Roboflow)
- [ ] Preisverlauf als Chart (Chart.js)
- [ ] Karten-Filter nach Set, Typ, Seltenheit
- [ ] Mehrere Exemplare einer Karte (Anzahl)
- [ ] Karten-Export als PDF / CSV
- [ ] Dark Mode
- [ ] Push-Notifications wenn Kartenwert steigt
- [ ] iOS-Installation Hinweis beim ersten Start

---

## ⚠️ Bekannte Issues

- **Service Worker Cache**: Beim ersten Laden nach Deploy kann der SW alte Version ausliefern.
  Fix: Safari-Cache leeren (Einstellungen → Safari → Verlauf löschen) oder Hard-Reload.
- **Kamerascan**: Kein echtes OCR — nur Foto + manuelle Namenseingabe als Prompt.
  Funktioniert aber gut als UX-Flow.

---

## 🔧 Deployment

```bash
cd /Users/felix/.openclaw/workspace/pokemon-app
git add -A
git commit -m "beschreibung"
git push
# → GitHub Pages deployed automatisch nach ~1-2 Min
```

---

## 📡 APIs

- **Pokémon TCG API:** https://api.pokemontcg.io/v2/ — kostenlos, kein Key
  - Suche: `GET /cards?q=name:"Pikachu"&pageSize=20`
  - Preise in `card.cardmarket.prices` (€) und `card.tcgplayer.prices` ($)
- **Cardmarket:** https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=NAME
