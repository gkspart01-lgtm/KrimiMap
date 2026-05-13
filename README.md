# KrimiMap

**Ein browserbasiertes Detektiv-Spiel mit großen Karten**  
KI-generierte Landschaften, Charaktere und Fälle + integrierter Level-Editor.

## Über das Projekt

KrimiMap ist ein **Mobile-First** Hidden-Object Deduktionsspiel.  
Spieler erkunden große, detaillierte 2D-Karten, suchen nach Charakteren, Spuren und zeitlichen Abläufen, um komplexe Kriminalfälle zu lösen.

### Kern-Features
- Große, zoom- und scrollbare 2D-Karten (Stadtviertel, Dörfer, Fantasy- oder Sci-Fi-Umgebungen)
- KI-generierte Landschaften, Charaktere, Objekte und komplette Kriminalfälle
- Vollwertiger **Level-Editor** mit Undo/Redo, Drag & Drop und KI-Unterstützung
- Progressive Web App (PWA) – direkt im Browser installierbar auf Smartphone & Tablet
- Touch-optimiert für Mobile
- Phaser 4 + Svelte 5

## Technologie-Stack

- **Game Engine**: Phaser 4 (WebGL)
- **UI Framework**: Svelte 5 (mit SvelteKit)
- **KI-Bilder**: Stable Diffusion (Flux / SD 3.5)
- **KI-Text**: LLM (Grok, Claude, OpenAI o.ä.)
- **Karten**: Tiled JSON + eigenes Entity-System
- **Build**: Vite
- **Speicher**: localStorage + später Supabase

## Warum Svelte + Phaser?

Diese Kombination ist **sehr empfehlenswert**:
- **Phaser** übernimmt den gesamten Canvas/Game-Bereich (Rendering, Zoom, Pan, Interaktion mit Objekten)
- **Svelte** kümmert sich um alle UI-Elemente außerhalb des Canvas (Toolbar, Properties Panel, Menüs, Editor-Settings, File-Browser etc.)
- Sehr gute Performance und Developer Experience
- Einfach Phaser in eine Svelte-Komponente einzubetten

## Projektstatus

- [ ] MVP (Basis-Spiel + eine spielbare Karte)
- [ ] Level-Editor mit Undo/Redo & Drag & Drop
- [ ] KI-Integration (Bilder + Story)
- [ ] Mobile PWA-Optimierung
- [ ] Mehrere fertige Fälle

## Ordnerstruktur

```
/KrimiMap
├── src/
│   ├── lib/           # Svelte Components (UI)
│   ├── game/          # Phaser Szenen, Entities, Editor-Logik
│   ├── editor/        # Level-Editor Svelte-Komponenten
│   └── utils/         # Command Pattern, Helpers
├── public/            # Statische Assets
├── docs/
├── LASTENHEFT.md
└── README.md
```

## Nächste Schritte

1. SvelteKit + Phaser Boilerplate aufsetzen
2. Zoom/Pan Kamera Prototyp
3. Tilemap-Import (Tiled JSON)
4. Command-Pattern für Undo/Redo
5. Erste KI-generierte Testkarte

---

**Lizenz**: MIT

**Made with ❤️ for detective game fans**