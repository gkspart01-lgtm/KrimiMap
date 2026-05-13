# Lastenheft (Pflichtenheft) – KrimiMap

**Projektname:** KrimiMap  
**Version:** 1.0 (Planung)  
**Datum:** 13. Mai 2026

## 1. Projektübersicht

KrimiMap ist ein **browserbasiertes Detektiv-Spiel** mit Fokus auf Mobile-Geräten.  
Spieler erkunden große, detaillierte 2D-Karten, suchen versteckte Charaktere, Spuren und zeitliche Abläufe, um komplexe Kriminalfälle zu lösen.

**Ziel:** Ein unterhaltsames Hidden-Object + Deduktionsspiel mit starkem Creator-Aspekt durch KI-Unterstützung und integriertem Level-Editor.

**Zielgruppe:** Casual Gamer, Detektiv-Fans, Familien (altersgerechte Inhalte).

**Plattform:** Webbrowser (Progressive Web App – PWA) auf Smartphones, Tablets und Desktop.

## 2. Kern-Features

### 2.1 Spielermodus
- Große zoom- und scrollbare 2D-Karten (Stadtviertel, Dörfer, Fantasy- oder Sci-Fi-Umgebungen)
- Interaktive Elemente: Charaktere, Objekte, Spuren
- Zeitliche Abläufe (Bewegungen von Personen über mehrere „Zeitpunkte“)
- Fall-basierte Quest-Struktur mit Fragen und Deduktion
- Hinweis-System, Bewertung und Fortschritt

### 2.2 KI-Generierung
- Generierung von Landschaften/Hintergründen
- KI-generierte Charaktere, Objekte und Szenen
- Automatische Erstellung kompletter Kriminalfälle (Story, Motive, zeitliche Abläufe) via LLM
- Hybrid-Workflow: KI-Vorschlag + manuelle Nachbearbeitung

### 2.3 Level-Editor (Creator-Modus)
- Drag & Drop Platzierung von Objekten und Charakteren
- Layer-Management
- Zeitlinien-Editor für Bewegungsabläufe
- Prompt-basierte KI-Generierung direkt im Editor
- Undo/Redo-Funktionalität (Command Pattern)
- Speichern/Laden von Fällen als JSON
- Validierung der Lösbarkeit

### 2.4 Technische Anforderungen
- Mobile-First: Touch-optimiert, Pinch-to-Zoom, Responsive
- Gute Performance auf Mittelklasse-Smartphones
- PWA-Support (installierbar, Offline-fähig für fertige Fälle)
- Lokalisierung (mindestens Deutsch + Englisch)

## 3. Technologie-Stack

- **Game Engine:** Phaser 4
- **Rendering:** WebGL
- **KI-Bilder:** Stable Diffusion (Flux / SD 3.5)
- **KI-Text:** LLM (Grok, Claude, OpenAI o.ä.)
- **Karten:** Tiled JSON + eigenes Entity-System
- **Frontend-UI:** HTML/CSS Overlay + Phaser
- **Build-Tool:** Vite
- **Speicher:** localStorage + später Supabase

## 4. Nicht-funktionale Anforderungen

- Hohe Performance bei großen Karten (Chunk-Loading, Culling, Object Pooling)
- Undo/Redo-Mechanismus für komfortables Editieren
- Saubere Trennung zwischen statischen Tile-Layern und dynamischen Entities
- Skalierbare Architektur für zukünftige Erweiterungen

## 5. Nächste Schritte (MVP)

1. Phaser-Prototyp mit Zoom/Pan und großer Karte
2. Tilemap-Import (Tiled JSON)
3. Entity-System + Drag & Drop
4. Command-Pattern (Undo/Redo)
5. Erste KI-generierte Testkarte
6. Einfacher Fall mit Spielmechanik

---

**Lizenz:** MIT  
**Status:** Planung & Prototyp-Phase