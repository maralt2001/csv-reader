# CSV Reader — Projektkontext

## Projektbeschreibung
Lokale CSV-Reader-App, geschrieben ausschließlich in **HTML, CSS und JavaScript** (kein Build-Prozess, kein Framework, kein Node.js).

## Dateistruktur
```
csv_reader/
├── index.html          # Markup
├── css/
│   └── style.css       # Alle Styles
├── js/
│   └── app.js          # Gesamte Logik
└── test/
    ├── test.csv        # Testdaten mit JSON-Werten in Zellen
    └── engineering.csv # Weitere Testdaten
```

## Design
- **Dark Mode** mit Cyan-Akzenten (`#22d3ee`)
- CSS-Variablen-System orientiert an: https://github.com/maralt2001/json-compare
- Farbpalette: bg `#111827`, surface `#1f2937`, border `#374151`, text `#e5e7eb`
- Violet (`#8b5cf6`) für JSON-Badges
- Fonts: `"Segoe UI"` (sans), `"SF Mono"/"Fira Code"` (mono)
- Keine externen CSS-Frameworks

## Features
- **Drag & Drop** Upload (+ Datei-Dialog)
- **Automatische Delimiter-Erkennung** (`,` `;` `Tab` `|`)
- **Tabelle** mit sticky Header, sortierbaren Spalten (numerisch-bewusst)
- **Suche** über alle Spalten mit optionalem **Regex-Modus** (Checkbox `.*`)
- **Spalten ein-/ausblenden** per Toggle-Panel
- **JSON-Werte in Zellen** werden automatisch erkannt und als aufklappbare Vorschau dargestellt
- **Export** als CSV (originaler Delimiter) oder JSON (JSON-Strings werden zu echten Objekten)
- **Statuszeile** mit Zeilen-/Spaltenanzahl

## Wichtige Implementierungsdetails

### JSON-Wert-Erkennung
`tryParseJSON(str)` prüft ob ein Zellwert ein JSON-Objekt `{}` oder Array `[]` ist und parst ihn.

### Regex-Suche in JSON-Zellen
JSON-Werte werden für die Suche mit `searchableText()` + `collectParts()` in einzelne Zeilen aufgeteilt (Schlüssel und Leaf-Werte je eine Zeile). Der Regex läuft mit den Flags `im` (case-insensitive + multiline), damit `^`/`$` pro Wert greifen.

Beispiel: `["python","typescript"]` wird zu:
```
python
typescript
```
→ `^python` matcht korrekt.

### CSV-Parser
RFC-4180-konform: quoted fields mit `""` als Escape, automatische Delimiter-Erkennung anhand der ersten Zeile.

## Benutzersprache
Deutsch (UI und Kommunikation auf Deutsch).
