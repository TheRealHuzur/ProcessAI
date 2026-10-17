# ProzessPilot

Prozess erzählen, Knopf drücken, BPMN-Modell bekommen. Arbeitstitel im Repo: ProcessAI.

Version 0.1 kann:

- Prozess einsprechen (Spracherkennung im Browser, Chrome) oder eintippen
- BPMN-2.0-Modell per KI erzeugen, nach dem Regelwerk in `docs/bpmn-regelwerk.md`
- automatischer Regelcheck, bei Verstößen eine Korrekturrunde durch die KI
- automatische Anordnung mit Pools und Schwimmbahnen
- Bearbeiten im Editor (aus bpmndesk übernommen, Modi Easy, Basis, Vollständig)
- Beschreibung (Arbeitshilfe) je Element im BPMN-Feld `documentation`
- Speichern mit Versionen, Öffnen und Export als `.bpmn` und SVG
- einfacher Zugangsschutz per Passwort

## Lokal

```bash
npm install
cp .env.example .env   # Werte eintragen
node --env-file=.env --no-warnings=ExperimentalWarning server/index.js
# http://localhost:3000
npm test
```

## Betrieb auf Coolify

Build-Pack **Dockerfile**, Port **3000**, Domain `https://prozesspilot.wissen-und-werkzeug.de`, Volume auf **`/data`** (Datenbank `prozesspilot.db`).

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `APP_PASSWORD` | ja | Passwort für die Anmeldung |
| `OPENROUTER_API_KEY` | ja | Schlüssel für OpenRouter |
| `SESSION_SECRET` | empfohlen | lange Zeichenfolge; sonst nach jedem Neustart neu anmelden |
| `MISTRAL_API_KEY` | nein | schaltet "Mistral Small (direkt bei Mistral, EU)" frei |
| `MYRA_BASE_URL` | nein | Myra-Adresse mit Mandant und Gateway, z. B. `https://ai.myra.eu/v1/<mandant>/<gateway>/compat` |
| `MYRA_API_KEY` | nein | Gateway-Token von Myra (`myra_…`); mit `MYRA_BASE_URL` erscheinen die Myra-Modelle |
| `MYRA_MODELLE` | nein | am Myra-Gateway freigeschaltete Modelle, kommagetrennt, z. B. `claude-haiku-4-5`; ohne Angabe die EU-Flotte |
| `MODELS_JSON` | nein | eigene Modellliste, siehe `server/config.js` |

## Mehr

`CLAUDE.md` (Regeln und Aufbau), `docs/planung.md`, `docs/datenmodell.md`.

## Lizenz

MIT. `bpmn-js` steht unter der Lizenz von bpmn.io: https://bpmn.io/license/
