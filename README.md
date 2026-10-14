# ProzessPilot

Prozess erzählen, Knopf drücken, BPMN-Modell bekommen. Arbeitstitel im Repo: ProcessAI.

Erster Entwurf (Version 0.1):

- Prozess einsprechen (Spracherkennung im Browser, Chrome) oder eintippen
- KI erzeugt ein BPMN-2.0-Modell nach dem Regelwerk von Wissen & Werkzeug (`docs/bpmn-regelwerk.md`)
- Automatischer Regelcheck, bei Regelverstößen eine Korrekturrunde durch die KI
- Automatische Anordnung mit Pools und Schwimmbahnen
- Bearbeiten im Editor (aus bpmndesk übernommen, Modi Easy, Basis, Vollständig)
- Name und Beschreibung (Arbeitshilfe) je Element, gespeichert im BPMN-Feld `documentation`
- Speichern mit Versionen in der Datenbank, Öffnen und Export als `.bpmn` und SVG
- Einfacher Zugangsschutz per Passwort

## Betrieb auf Coolify

1. Neue Ressource aus diesem GitHub-Repo, Build-Pack **Dockerfile**.
2. Domain: `https://prozesspilot.wissen-und-werkzeug.de`, Port **3000**.
3. Umgebungsvariablen:

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `APP_PASSWORD` | ja | Passwort für die Anmeldung |
| `OPENROUTER_API_KEY` | ja | Schlüssel für OpenRouter |
| `SESSION_SECRET` | empfohlen | beliebige lange Zeichenfolge; sonst nach jedem Neustart neu anmelden |
| `MISTRAL_API_KEY` | nein | erst nötig, wenn Mistral direkt angebunden wird |
| `MODELS_JSON` | nein | eigene Modellliste, siehe `server/config.js` |

4. Persistenter Speicher: Volume auf **`/data`** einhängen. Dort liegt die Datenbank `prozesspilot.db`.
5. Deployen.

## Lokal

```bash
npm install
APP_PASSWORD=test OPENROUTER_API_KEY=... npm start
# http://localhost:3000
npm test
```

## Aufbau

Siehe `CLAUDE.md`, `docs/planung.md` und `docs/datenmodell.md`.

## Lizenz

MIT. `bpmn-js` steht unter der Lizenz von bpmn.io: https://bpmn.io/license/
