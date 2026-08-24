# QA-Report — PokéDex Family App

**Datum:** 2026-08-24
**Geprüfte Version:** v5 (Live: https://mail65.github.io/pokedex-family/ — HTTP 200, sw.js v5 live bestätigt)
**Code:** `/Users/felix/.openclaw/workspace/pokemon-app/`

---

## ✅ Was funktioniert

### 1. APIs & Bilder
- **TCGdex-Suche liefert Bilder** (nicht alle, aber ein Großteil):
  - "Pikachu": **155** Ergebnisse, **91** mit Bild (58,7%)
  - "Glurak": **111** Ergebnisse, **72** mit Bild (64,9%)
  - "Evoli": **87** Ergebnisse, **56** mit Bild (64,4%)
- **Set-Map:** 218 Sets geladen, **157 mit Logo** (72%), 61 ohne.
- **Bild-URL-Konstruktion via Set-Map funktioniert:** `cardImageUrl()` erzeugt korrekte URLs (z.B. `https://assets.tcgdex.net/en/pl/pl4/1/low.webp` → HTTP 200, `image/webp`). Set-ID-Splitting (Punkte + Bindestriche) verarbeitet `sv03.5-004` korrekt zu setId=`sv03.5`, localId=`004`.
- **Top 20 Glurak:** **18 von 20** haben ein Bild (via `card.image` ODER Set-Map-Konstruktion).
- **fillMissingImages Batch-Fallback:** funktioniert für pokemontcg.io-kompatible IDs. `sm7.5-3` → `sm75-3` wurde erfolgreich per Batch-Query nachgeladen.

### 2. Preise
- **TCGdex Detail liefert Preise für viele Karten:**
  - `base1-4` (Glurak Base): Cardmarket Ø **487,19 €** ✓
  - `pl4-1` (Glurak): Cardmarket Ø **69,58 €** ✓
  - `sv03.5-004` (Glumanda 151): Cardmarket Ø **0,10 €** ✓
- **`fetchCardPrice()` Logik korrekt:** gibt Preis-Objekt zurück wenn vorhanden, **`null`** wenn keiner (verifiziert: `basep-1`/`swsh1-25` ohne Preis → null). Fallback zu pokemontcg.io nur für kompatible IDs (Regex prüft Präfixe), inkompatible (z.B. `2024sv`) werden korrekt übersprungen.
- **`enrichCollectionPrices()`:** iteriert korrekt über ungepreiste Karten, holt TCGdex-Detail, wählt besten Preis (cm.avg → cm.trend → tcgplayer), speichert via `saveCard`, 80ms Pause gegen Rate-Limit. Logik sauber.
- **`getBestPrice()`:** verarbeitet korrekt das `normalizeTcgdexDetail`-Format (Cardmarket Ø → Trend → TCGPlayer). Verifiziert mit Testdaten.

### 3. Features im Code
- **Zustand-Modal:** im HTML vorhanden (`#condition-modal` mit class `modal-overlay`, Zeile 167). CSS für `.modal-overlay`, `.modal-box`, `.cond-btn`, `.modal-cancel` vorhanden (style.css Zeilen 435–470).
- **CONDITIONS-Objekt:** korrekt — mint 1.00, nearmint 0.75, excellent 0.50, good 0.25.
- **`addCard()`:** fragt `askCondition()` ab, bricht bei `null` (Abbrechen) ab, speichert `condition` + `basePrice` + angepassten `price`. ✓
- **`renderCollection()`:** zeigt `col-cond-badge` (Zustands-Label) und `col-base-price` (Listenpreis in Klammern, nur wenn condition ≠ mint). CSS vorhanden (style.css 477, 483). ✓
- **`openDetailFromCollection()`:** nutzt **TCGdex** (`TCGDEX_BASE + '/cards/' + cardId`), NICHT pokemontcg.io. ✓

### 4. Profile
- **Alle 4 Profile im HTML:** `btn-franz`, `btn-kate`, `btn-nil`, `btn-jelle` (index.html Zeilen 31–48) mit Emoji 🦊🌸🐉⚡. ✓
- **`selectProfile()`:** alle 4 mit Namen + Avatar (Franz's/Kate's/Nil's/Jelle's PokéDex). ✓
- **`updateCounts()`:** iteriert über alle 4 (`['franz','kate','nil','jelle']`). ✓
- **Event-Listener in DOMContentLoaded:** alle 4 Profile registriert. ✓

### 5. Suche & Varianten
- **`tcgdexSearch("Pikachu")`:** `baseName` = "pikachu", `useBase` = false (gleich) → nur exakte Suche, korrekt.
- **`tcgdexSearch("Pikachu-ex")`:** `baseName` = "pikachu" ≠ "pikachu-ex" → `useBase` = true → **paralleler** Fetch von exaktem Namen + Basisnamen. Merge: exakte zuerst, Duplikate per ID entfernt. ✓
- **Autosuggest:** TCGdex primär (deutsch), pokemontcg.io als Fallback wenn TCGdex leer. ✓

### 6. Service Worker
- **Version v5** bestätigt (CACHE_VERSION `pokefam-v5`, Header "Service Worker v5"). Live deployed. ✓
- **TCGdex Assets vom Cache ausgeschlossen:** `api.pokemontcg.io`, `api.tcgdex.net` UND `assets.tcgdex.net` alle excluded (nie gecacht). ✓

### 7. Code-Integrität
- **`node --check app.js`:** kein Syntax-Fehler. ✓
- **Alle `getElementById`-Referenzen existieren im HTML** (0 fehlende von 53 IDs). ✓
- **Alle aufgerufenen Funktionen sind definiert** (keine undefined-Referenzen). ✓
- HTML-Struktur valide (DOCTYPE, geschlossene Tags, korrekte Screen-Trennung).

---

## ⚠️ Was unklar/ungetestet / Hinweise

1. **`tcgdexDetail()` ist toter Code** — definiert aber nirgends aufgerufen. `openDetail` nutzt `fetchCardPrice`, `openDetailFromCollection` nutzt Inline-TCGdex-Fetch. Kein Bug, aber unnötiger Ballast. (Kann entfernt werden.)

2. **Bild-Abdeckung nicht 100%:** Von den 218 Sets haben 61 kein Logo in der Set-Map (Promo/Theme-Decks/Energie-Sets wie `miscp`, `wp`, `jumbo`, `tk-*`, `sve`, `2024sv` etc.). Karten aus diesen Sets haben im Such-Grid kein Bild, wenn sie auch kein `card.image`-Feld haben.

3. **`sv3pt5` vs `sv03.5`:** Die korrekte TCGdex-Set-ID ist `sv03.5` (mit führender Null). IDs mit `sv3pt5` sind ungültig (HTTP 404). Die App generiert aber korrekt `sv03.5-004` — nur bei manuellen Tests darauf achten.

4. **Rate-Limits & 404:** `fetchCardPrice`/`enrichCollectionPrices` fangen 404/Fehler still ab (leere catch-Blöcke) — kein Crash, aber auch kein Logging wenn Preise fehlen.

---

## ❌ Was kaputt ist + konkreter Fix

### 1. Karten aus dem Set `2024sv` (McDonald's Collection 2024) haben NIE ein Bild
- **Symptom:** `2024sv-1` (Glurak/Charizard) und `2024sv-2` (Pikachu) — beide unter den Top-20-Ergebnissen — haben weder `card.image` noch ein Set-Map-Logo, **und** die pokemontcg.io-Batch-Fallback findet sie nicht (ID `2024sv1` → HTTP 502). Das Bild bleibt leer.
- **Betroffen:** 2 von 20 Top-Glurak-Ergebnissen (10%).
- **Fix (Vorschlag):** Keine zuverlässige Quelle für dieses Promo-Set identifiziert. Optionen:
  a. **Akzeptieren** und in `normalizeTcgdexCard`/`renderResults` einen Platzhalter (Fallback-Emoji/Silhouette) für Karten ohne Bild anzeigen statt `<img src="">` (broken image icon).
  b. **Fallback auf `card.image` direkt** nutzen — TCGdex liefert für manche Karten das Bildfeld trotz fehlendem Set-Logo. Für `2024sv` gibt es aber keins.
  c. Prüfen ob Amazon/Scryfall eine Bildquelle hat (aufwändig, für Promo-Set vermutlich nicht lohnend).

### 2. (Klein) Fehlende Bilder bei Set-Map-Lücken generell
- **Symptom:** 61/218 Sets ohne Logo → Karten aus diesen Sets ohne `card.image` bleiben bildlos. `fillMissingImages` hilft nur bei pokemontcg.io-kompatiblen IDs; einige (Promo/Energie/Theme) fallen durch.
- **Fix (Vorschlag):** In `renderResults` (app.js) und `renderAutocomplete` einen einheitlichen Platzhalter einbauen:
  ```js
  const imgSrc = card.images?.small || 'data:image/svg+xml,...' // oder lokaler Platzhalter
  ```
  So wird nie ein kaputtes `<img>` angezeigt.

---

## Zusammenfassung

| Bereich | Status |
|---------|--------|
| API-Suche (TCGdex) | ✅ funktioniert, Bilder zu ~60–65% |
| Set-Map / Bild-Konstruktion | ✅ funktioniert (72% der Sets) |
| fillMissingImages | ✅ funktioniert (mit Lücke bei 2024sv) |
| Preise (Detail + Fallback) | ✅ funktioniert korrekt |
| Zustand-Modal / CONDITIONS | ✅ vollständig |
| addCard / renderCollection | ✅ vollständig |
| Profile (4) | ✅ vollständig |
| Suche / Varianten / Autosuggest | ✅ korrekt |
| Service Worker v5 | ✅ korrekt, TCGdex ausgeschlossen |
| Code-Integrität | ✅ keine Syntax-/Referenzfehler |
| **Bild-Lücke 2024sv** | ❌ **1 echter Bug** (Platzhalter fehlt) |

**Gesamturteil:** Die App ist funktional solide. Der einzige echte Fehler ist die fehlende Bild-Anzeige für das McDonald's-2024-Promo-Set (und generell der fehlende Bild-Platzhalter bei Set-Map-Lücken). Empfehlung: Platzhalter einbauen; `tcgdexDetail` als toten Code entfernen.
