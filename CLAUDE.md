# ProzessPilot (Repo: ProcessAI)

## Zweck

Prozess in normaler Sprache einsprechen oder eintippen, Knopf drücken, BPMN-2.0-Modell bekommen, im Editor weiterbearbeiten. Im zweiten Schritt kommt prozessbasiertes Wissensmanagement dazu (Arbeitshilfen je Prozessschritt, Handbuch, Wissenslücken). Zielgruppe sind Organisationen des öffentlichen Dienstes. Stand: Version 0.1, Mockup zum Testen.

## Harte Regeln

- **Eigenständiges Projekt.** Keine Abhängigkeiten, Verweise, Pfade oder gemeinsame Konfiguration mit anderen Projekten auf dem Server. Alles, was ProzessPilot braucht, liegt in diesem Repo.
- **bpmndesk (github.com/TheRealHuzur/bpmndesk) wird niemals verändert.** Keine Commits, keine Branches, keine Pull Requests, kein Verschieben dort. Erlaubt ist nur, daraus in dieses Repo zu kopieren.
- **Nichts löschen ohne Rückfrage.**
- **Einfach halten, kein Overengineering.** Wenig Abhängigkeiten, Vanilla JavaScript im Browser, Express im Backend, SQLite (eingebaut in Node) als Datenbank.
- **API-Schlüssel nie im Code oder Repo.** Nur über Umgebungsvariablen (Vorlage: `.env.example`). Inhalte von `.env` nie ausgeben.
- **Rollen statt Personennamen** in Modellen und Wissen.
- **Nichts erfinden:** Die KI fügt keine Informationen hinzu und lässt keine weg. Unklares wird als Unklarheit ausgegeben.
- **Über OpenRouter und die Browser-Spracherkennung nur Testprozesse**, keine echten Kundendaten.
- Texte in der Oberfläche auf Deutsch, Alltagssprache, keine Gedankenstriche.

## Aufbau

- `server/` Backend (Express): Login, Datenbank, KI-Pipeline
  - `index.js` Einstieg und Routen
  - `pipeline.js` Ablauf: KI liefert JSON-Prozessmodell, Prüfung, ggf. eine Korrekturrunde, Anordnung, BPMN-XML
  - `prompt.js` Systemprompt, liest `docs/bpmn-regelwerk.md` zur Laufzeit ein
  - `regelcheck.js` deterministische Prüfung gegen das Regelwerk
  - `layout.js` automatische Anordnung (Spalten nach Ablauf, Zeilen nach Rolle)
  - `bpmn-xml.js` erzeugt BPMN-XML mit Diagramm-Informationen
  - `llm.js` Anbindung an OpenAI-kompatible Schnittstellen (OpenRouter, Mistral direkt)
  - `config.js` alle Einstellungen und die Modellliste
  - `auth.js`, `db.js`, `modell.js` Anmeldung, Datenbank, Modellspeicher
- `public/` Oberfläche; Editor-Module aus bpmndesk kopiert (`public/editor.js`), bpmn-js unter `public/vendor/`
- `docs/` Planung (`planung.md`, führende Fassung), Regelwerk (`bpmn-regelwerk.md`, wird in den Prompt geladen), Datenmodell
- `examples/` Beispielmodelle zum Vorführen
- `test/` Tests mit `node --test`

## Wichtige Konventionen

- Erlaubte BPMN-Elemente: Basis-Level wie in bpmndesk (siehe `docs/bpmn-regelwerk.md`, Abschnitt 2).
- Jedes BPMN-Element hat eine feste ID. Daran hängen später Kommentare, Vorgänge und Auswertungen.
- Die Arbeitshilfe zu einem Schritt steht im BPMN-Feld `documentation`.
- Anbieter und Modelle nur in `server/config.js` bzw. über `MODELS_JSON`.
- Änderungen an `docs/bpmn-regelwerk.md` ändern das Verhalten der KI in der laufenden App.

## Arbeitsweise

- Erst lesen und prüfen, dann kleine, nachvollziehbare Änderungen.
- Vor jedem Commit `npm test`.
- Planung in `docs/planung.md` pflegen, wenn sich Entscheidungen ändern.
- Git-Aktionen (Commit, Push) nur nach Freigabe.
- Abschluss knapp berichten: was geändert, wie geprüft, was offen ist.

## Betrieb

- Coolify auf Patricks Server, Build aus diesem Repo per `Dockerfile`, Port 3000.
- Domain: https://prozesspilot.wissen-und-werkzeug.de
- Persistenter Speicher: Volume auf `/data` (Datenbank `prozesspilot.db`).
- Umgebungsvariablen siehe `.env.example` und `README.md`.

## Lokal starten

```bash
npm install
cp .env.example .env   # Werte eintragen
node --env-file=.env --no-warnings=ExperimentalWarning server/index.js
npm test
```
