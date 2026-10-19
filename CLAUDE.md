# ProzessPilot (Repo: ProcessAI)

Prozess in normaler Sprache einsprechen oder eintippen, Knopf drücken, BPMN-2.0-Modell bekommen, im Editor weiterbearbeiten. Im zweiten Schritt kommt prozessbasiertes Wissensmanagement dazu.

## Zuerst lesen

Die führende Projektdoku liegt außerhalb des Repos im eigenen Storage-Ordner `/srv/wuw-storage/50_coding/prozesspilot` (Patrick liest sie in Obsidian).

- Bei neuem Chat zuerst `/srv/wuw-storage/50_coding/prozesspilot/00_ProzessPilot_START_HERE.md` lesen und seiner Leselogik folgen. Dort stehen die verbindlichen Regeln für die Programmierung, die Dokumentationspflicht und die Definition of Done.
- `ProzessPilot-Masterplan.md` im selben Ordner ist die Planungsdatei und der Stand des Projekts. Bei jeder Arbeit am Repo mitpflegen: Schritte abhaken, wenn sie umgesetzt sind, Phasenstatus und `stand` aktualisieren.
- Nach jeder Änderung die Projektdoku dort nachziehen (mindestens Masterplan und `01_ProzessPilot_STATUS.md`).
- Keine Kopie des Masterplans oder der Projektdoku im Repo. Diese Doku hier und `docs/` sind technisch ergänzend; `docs/planung.md` ist die Ideen- und Detailsammlung.

## Harte Regeln (Kurzfassung, vollständig im Start Here)

- **Eigenständiges Projekt.** Keine Abhängigkeiten, Verweise, Pfade oder gemeinsame Konfiguration mit anderen Projekten auf dem Server. Erlaubt sind nur dieses Repo und der eigene Storage-Ordner. Einzige Ausnahme: der gemeinsame Whisper-Dienst für die Spracherkennung, nur über `WHISPER_BASE_URL` (Entscheidung 19.10.2026).
- **bpmndesk (github.com/TheRealHuzur/bpmndesk) wird niemals verändert.** Keine Commits, keine Branches, keine Pull Requests, kein Verschieben dort. Erlaubt ist nur, daraus in dieses Repo zu kopieren.
- **Nichts löschen ohne Rückfrage.**
- **Git-Aktionen und Deployments nur nach Freigabe.**
- **API-Schlüssel nie im Code oder Repo.** Nur über Umgebungsvariablen (Vorlage: `.env.example`). Inhalte von `.env` nie ausgeben.
- **Rollen statt Personennamen**, **nichts erfinden**, nur Elemente des Basis-Levels (`docs/bpmn-regelwerk.md`).
- **Über OpenRouter und die Browser-Spracherkennung nur Testprozesse**, keine echten Kundendaten.

## Lokal starten und testen

```bash
npm install
cp .env.example .env   # Werte eintragen
node --env-file=.env --no-warnings=ExperimentalWarning server/index.js
npm test
```

Die App braucht Node ab 22.13. Auf dem Server (Node 18) im Container testen, Befehl in `03_ProzessPilot_BETRIEB.md`.
