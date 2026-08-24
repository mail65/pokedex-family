# PokéDex Family — Projektdokumentation
> Stand: 22.08.2026 | Entwickelt in einer Session mit Felix (OpenClaw)

---

## Links
- **Live-App:** https://mail65.github.io/pokedex-family/
- **GitHub Repo:** https://github.com/mail65/pokedex-family (Account: mail65)
- **Lokal:** `/Users/felix/.openclaw/workspace/pokemon-app/`

---

## Was ist das?
Eine PWA (Progressive Web App) für Franz & Kate zum Suchen, Entdecken und Sammeln von Pokémon-Karten. Läuft im Browser, kann wie eine echte App auf dem iPhone-Startbildschirm installiert werden.

---

## Features

### Suche
- Karten-Suche via pokemontcg.io API (kostenlos, kein Key nötig)
- **Deutsche Namen** werden automatisch übersetzt (Glurak → Charizard, Evoli → Eevee, Mewtu → Mewtwo, etc.) — 150+ Pokémon
- **Autosuggest** ab 2 Buchstaben mit Kartenbild und Set-Name
- Schnellsuche-Buttons: Pikachu, Glurak, Mewtu, Evoli
- **Automatisches Retry** bei Verbindungsfehler (3× mit Pause)
- Wildcard-Suche: "Slither Wing" → sucht "Slither*" + clientseitiger Filter

### Sammlung
- **Firebase Cloud-Sync** — geräteübergreifend, für immer gespeichert
- Gesamtwert der Sammlung angezeigt
- Wertvollste Karte hervorgehoben (👑)
- Karten in Sammlung anklickbar → öffnet Detail-Ansicht
- Typ-Badges auf Deutsch mit Emoji (🔥 Feuer, 💧 Wasser, ⚡ Elektro etc.)
- Sortierung nach Preis / Name / Typ
- Lösch-Bestätigung vor dem Entfernen einer Karte

### Detail-Ansicht
- Großes Kartenbild
- Marktwert (Cardmarket Ø in €, TCGPlayer in $)
- Preisübersicht (CM Niedrig, CM Trend, TCG Markt/Niedrig/Hoch)
- Rarity / Typ / HP Badges
- Grading-Erklärung (Mint, Near Mint, Excellent, Good)
- Link zu Cardmarket für Kauf/Verkauf
- "Zur Sammlung hinzufügen" Button

### Startbildschirm
- Fliegende Pokémon-Parade mit echten Sprites (PokeAPI)
- Glurak, Pikachu, Mewtu, Relaxo, Lugia, Rayquaza, Lucario, Dragoran etc.
- Bounce-Animation + horizontale Bewegung (2 Wrapper, keine Konflikt)
- Pokéball-Animation, Profil-Auswahl (🦊 Franz / 🌸 Kate)

### Technisches
- iOS Safe Area für alle Screens (Header nicht unter Statusleiste)
- Service Worker v4 (Network-First, Cache-Busting)
- Kein Framework — reines HTML + CSS + JS
- PWA-Manifest für Homescreen-Installation

---

## Firebase
- **URL:** `https://pokemon-efef7-default-rtdb.europe-west1.firebasedatabase.app`
- **Projekt:** "Pokemon" (ID: pokemon-efef7) — Tobias' bestehender Firebase-Account
- **Regeln:** `.read: true, .write: true` (öffentlich — für Kinder-App ausreichend)
- **Struktur:** `/collections/franz/{cardId}` und `/collections/kate/{cardId}`

---

## Was noch kommen soll (später)
- 📷 **Google Vision OCR** — Foto machen, obere 20% der Karte analysieren, Name automatisch erkennen
  - Plan: Google Cloud Account + API Key (~$1.50 pro 1.000 Scans)
  - Tobias erstellt Account wenn gewünscht
  - Das wird Franz' Geburtstagsüberraschung 🎁

---

## Installationsanleitung (für Weitergabe)

🎮 PokéDex Family — So installierst du die App

Öffne diesen Link auf deinem iPhone im Safari-Browser:
👉 https://mail65.github.io/pokedex-family/

Schritt 1: Unten in der Mitte auf das Teilen-Symbol tippen
(das Viereck mit dem Pfeil nach oben ↑)

Schritt 2: Im Menü runterscrollen und „Zum Home-Bildschirm" antippen

Schritt 3: Oben rechts auf „Hinzufügen" tippen

Fertig! 🎉 Die App erscheint jetzt wie eine echte App auf dem Startbildschirm — kein App Store, kein Download nötig.

---

## Bekannte API-Eigenheiten
- pokemontcg.io rate-limitet ohne API-Key bei vielen Anfragen hintereinander
- Namen mit Leerzeichen: firstWord+Wildcard-Strategie funktioniert zuverlässig
- API kennt nur englische Namen → Übersetzung passiert client-seitig

## Git Log (letzte Commits)
```
4a64063 fix: toten Code entfernt, Kamera-CSS weg, Schnellsuche auf Deutsch, Debounce 600ms
f0121c2 fix: Parade-Animation (Lane+Bounce getrennt), Autosuggest Debounce fix
73bcd8f feat: Auto-Retry bei Verbindungsfehler — 3× automatisch nochmal versuchen
07bc94a feat: Echte Pokémon-Sprites auf Startbildschirm
b3b7c50 feat: Typ-Badges auf Deutsch mit Emoji
7a90983 fix: iOS Safe Area für ALLE Screens
a3ef1a7 feat: dt. Namen, Sammlung anklickbar, Typ-Badges
5126b5f feat: Autosuggest + Firebase Cloud-Sync
2e83b7f feat: Firebase Cloud-Sync (pokemon-efef7)
```
