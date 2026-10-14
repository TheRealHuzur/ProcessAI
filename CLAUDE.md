# ProzessPilot (Repo: ProcessAI)

Prozess in normaler Sprache einsprechen oder eintippen, Knopf drücken, BPMN-2.0-Modell bekommen, im Editor weiterbearbeiten. Später kommt prozessbasiertes Wissensmanagement dazu.

## Harte Regeln

- **bpmndesk (github.com/TheRealHuzur/bpmndesk) wird niemals verändert.** Keine Commits, keine Branches, keine Pull Requests dort. Erlaubt ist nur, daraus in dieses Repo zu kopieren.
- **Einfach halten, kein Overengineering.** Wenig Abhängigkeiten, Vanilla JavaScript im Browser, Express im Backend, SQLite (eingebaut in Node) als Datenbank.
- **API-Schlüssel nie im Code oder Repo.** Nur über Umgebungsvariablen.
- **Rollen statt Personennamen** in Modellen und Wissen.
- **Nichts erfinden:** Die KI fügt keine Informationen hinzu und lässt keine weg. Unklares wird als Unklarheit ausgegeben.
- Texte in der Oberfläche auf Deutsch, Alltagssprache, keine Gedankenstriche.

## Aufbau

- `server/` Backend (Express): Login, Datenbank, KI-Pipeline
  - `pipeline.js` Ablauf: KI liefert JSON-Prozessmodell, Prüfung, ggf. eine Korrekturrunde, Anordnung, BPMN-XML
  - `prompt.js` Systemprompt, liest `docs/bpmn-regelwerk.md` zur Laufzeit ein
  - `regelcheck.js` deterministische Prüfung gegen das Regelwerk
  - `layout.js` automatische Anordnung (Spalten nach Ablauf, Zeilen nach Rolle)
  - `bpmn-xml.js` erzeugt BPMN-XML mit Diagramm-Informationen
  - `llm.js` Anbindung an OpenAI-kompatible Schnittstellen (OpenRouter, später Mistral direkt)
  - `config.js` alle Einstellungen und die Modellliste
- `public/` Oberfläche; Editor-Module aus bpmndesk kopiert (`public/editor.js`), bpmn-js unter `public/vendor/`
- `docs/` Planung, Regelwerk, Datenmodell
- `test/` Tests mit `node --test`

## Wichtige Konventionen

- Erlaubte BPMN-Elemente: Basis-Level wie in bpmndesk (siehe `docs/bpmn-regelwerk.md`, Abschnitt 2).
- Jedes BPMN-Element hat eine feste ID. Daran hängen später Kommentare, Vorgänge und Auswertungen.
- Die Arbeitshilfe zu einem Schritt steht im BPMN-Feld `documentation`.
- Anbieter und Modelle nur in `server/config.js` bzw. über `MODELS_JSON`.

## Lokal starten

```bash
npm install
APP_PASSWORD=test OPENROUTER_API_KEY=... npm start
npm test
```
