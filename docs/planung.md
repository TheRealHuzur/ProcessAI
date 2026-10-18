# ProzessPilot (Arbeitstitel, Repo heisst ProcessAI): Planungssammlung

Stand: 17.10.2026 (übernommen aus der Planungssammlung vom 15.10.2026). Ideen- und Detailsammlung; Phasen und Fortschritt steuert der Masterplan (siehe `CLAUDE.md`).
Status: Erster Entwurf 0.1 gebaut und am 14.10.2026 ins Repo ProcessAI (Branch main) gepusht. Seit 15.10.2026 live unter https://prozesspilot.wissen-und-werkzeug.de (Coolify, Dockerfile, Volume /data).
Weitere Dokumente: `docs/bpmn-regelwerk.md` (wird zur Laufzeit in den Prompt geladen), `docs/datenmodell.md`.

## Arbeitsweise in der Planung

1. Divergierend: Ideen sammeln, in alle Richtungen, innovativ, viel Menge
2. Konvergierend: aus den Ideen Lösungsansätze und Lösungen ableiten

Aktuelle Phase: **Brainstorm, erste Einordnung nach Versionen**. Noch nichts endgültig entschieden.

## Ziel

ProcessAI ist ein Tool, das
1. aus Text ein BPMN-Modell entwirft und
2. prozessbasiertes Wissensmanagement unterstützt.

Erster Schritt ist ein Mockup. Es soll vor allem zeigen, wie schnell so etwas gebaut ist, weil die Bausteine schon vorhanden sind. Kundennutzung ist später denkbar, aber nicht Ziel der ersten Version.

## Vorgehen in zwei Schritten

- **Schritt 1: Text zu BPMN.** Zuerst darauf konzentrieren.
- **Schritt 2: Wissensmanagement.** Danach darauf konzentrieren.
- Alles wird immer mitgedacht, aber nicht zu groß angefangen.
- Version 1 bewusst schlank halten: Ziel ist eine funktionierende Version zum Testen.

## Grundablauf (von Patrick)

Prozess in gesprochener Sprache ins Mikrofon erzählen (oder Text eingeben), Knopf drücken, am Ende kommt ein BPMN-Modell heraus. Optional stellt die KI Rückfragen zu unklaren Stellen. Am Modell wird weitergearbeitet und Wissensmanagement betrieben.

## Grundsätze

- In Modellen und Wissen stehen immer Rollen, nie Personennamen.
- Der Button "Modell erzeugen" bleibt bewusst erhalten.
- Kuration bleibt bei einer Rolle: sie gibt frei und strukturiert, damit kein Kraut und Rüben entsteht und sich nichts widerspricht.

## Erster Durchstich (gebaut als Version 0.1)

Einsprechen oder Text eingeben, Transkript prüfen, Modell erzeugen, automatischer Regelcheck mit einer Korrekturrunde, Anzeige im Editor (Kopie aus bpmndesk, Basis-Level), Beschreibungsfeld je Element, Speichern in der Datenbank, Öffnen und Export als .bpmn. Unklarheiten der KI werden angezeigt.

Danach in Version 1: Rückfragen der KI im Dialog, Sprachbefehle im Editor.

## Funktionen nach Versionen

### Schritt 1: Text zu BPMN

**Version 1**
- Einsprechen oder Text eingeben
- Modell erzeugen nach den Wiki-Regeln
- Rückfragen der KI bei Unklarem (optional)
- Modell im Editor bearbeiten (Kopie aus bpmndesk)
- Regelcheck gegen die Wiki-Regeln: läuft automatisch direkt nach der Erzeugung, bevor der Nutzer das Modell überhaupt sieht
- Sprachbefehle im Editor (rein, Umfang V1 im Blick behalten)
- Exportieren als .bpmn, Öffnen vorhandener Modelle inklusive Beschreibungsfeldern

**Version 2**
- Interviewmodus: KI führt durch Fragen
- Text oder Dokument einlesen (z. B. Dienstanweisung) und Prozess daraus ableiten
- Detailstufen: Übersicht für Führungskräfte, Detail für Sachbearbeitung

**Version 2 oder 3**
- Optimierungsvorschläge: Medienbrüche, Schleifen, Wartezeiten

### Schritt 2: Wissensmanagement

**Version 1**
- Arbeitshilfe pro Prozessschritt als Prosatext im BPMN-Beschreibungsfeld, dazu Dokumente, Ansprechpersonen (Rollen) und Rechtsgrundlagen (gebaut 18.10.2026, von Menschen gepflegt)
- Handbuch-Export als PDF, auch zum Ausdrucken; für Einarbeitung, Rechnungsprüfung und Nachschlagen (gebaut 18.10.2026, Aufbau siehe unten)
- ~~Fragen als Signal~~ verschoben zum Chatbot (18.10.2026): Jede Frage an den Chatbot, die nicht beantwortet werden kann, landet sofort auf einer Liste (Wissenslücke). Hängt am Chatbot und ist damit eine KI-Funktion; in Version 1 keine weiteren KI-Funktionen

**Gesetzt, Version noch offen**
- Wissen gemeinsam pflegen: Kolleginnen und Kollegen kommentieren, ergänzen oder schlagen Ergänzungen vor; eine Rolle kuratiert, gibt frei und strukturiert; wachsendes, lebendes Konstrukt
- Chatbot als Frontend: Frage zu einem Prozess, Chatbot sucht die Antwort heraus und zeigt sie direkt im Modell ("hier bist du")
- Checkliste für einen konkreten Vorgang (unbedingt)
- Teilen per Link zum Kommentieren ohne Anmeldung (Komplexität prüfen)
- Wissenslücken-Radar: zeigt Schritte ohne Arbeitshilfe

**Version 2**
- Arbeitshilfe aus der Erzählung automatisch als Entwurf
- Einarbeitungsmodus für neue Mitarbeitende
- Anbindung an die PICTURE-Prozessplattform

**Version 2 oder 3**
- Wissen sichern, bevor es geht: KI führt ein Interview mit Mitarbeitenden, die die Organisation verlassen; das Wissen daraus wird aufgenommen
- Nutzung auswerten: welche Arbeitshilfen gelesen werden und welche nie
- Checkliste als Sensor (Modell gegen Wirklichkeit): Checklisten der Vorgänge über den Prozess legen; Heatmap, an welchem Schritt gerade die meisten Vorgänge stehen; Auswertung im Stil von Process Mining: wo liegen Vorgänge am längsten, Durchlaufzeiten. Hinweis: in der Praxis Thema für den Personalrat

## Kopfstandmethode: Wie wird ProcessAI ein Flop? (umgedreht in Anforderungen)

| Flop | Anforderung |
|---|---|
| **Erster Eindruck** | |
| Registrierung mit Passwortregeln und Bestätigungsmail vor dem ersten Klick | Sofort loslegen ohne Anmeldung, zumindest im Mockup |
| Startseite voller Buttons, unklar wo man anfängt | Ein klarer Einstieg: ein großer Button zum Einsprechen |
| Englische Begriffe und BPMN-Fachjargon | Durchgehend deutsche Alltagssprache, Fachbegriffe nur wo nötig |
| Lange Ladezeit beim Start der Vorführung | Schneller Start, sichtbarer Fortschritt bei längeren Schritten |
| **Einsprechen** | |
| Prozess muss druckreif und in richtiger Reihenfolge diktiert werden | Freies Erzählen erlaubt, KI sortiert die Reihenfolge |
| Versprecher und Korrekturen landen im Modell | KI erkennt Selbstkorrekturen und Füllwörter und filtert sie |
| Absturz nach langer Aufnahme, alles weg | Aufnahme und Text werden laufend gesichert |
| Dialekt oder Behördendeutsch wird nicht verstanden | Transkript ist sichtbar und korrigierbar, bevor das Modell entsteht |
| **Ergebnis** | |
| Modell sieht aus wie Spaghetti | Saubere automatische Anordnung, gut lesbar auf den ersten Blick |
| KI erfindet Schritte | KI bleibt beim Erzählten; Annahmen werden als Rückfrage gestellt, nicht ins Modell geschrieben |
| Zwanzig Rückfragen auf einmal | Wenige, priorisierte Rückfragen, eine nach der anderen |
| Unklar, was die KI geändert hat und warum | Änderungen sind nachvollziehbar und markiert |
| Bei gleichem Text jedes Mal ein anderes Modell | Möglichst stabile, reproduzierbare Ergebnisse durch feste Regeln |
| **Wissen** | |
| Kommentieren erfordert Schulung | Kommentieren so einfach wie eine Notiz, direkt am Schritt |
| Vorschläge verschwinden, niemand kuratiert | Sichtbare Liste offener Vorschläge mit klarer Zuständigkeit (Rolle) |
| Chatbot antwortet falsch und ohne Quelle | Chatbot antwortet nur aus dem hinterlegten Wissen und zeigt die Stelle im Modell |
| Handbuch als unformatierter Textblock | Handbuch sauber gegliedert, druckfertig als PDF |
| **Vertrauen** | |
| Unklar, wo die Daten landen | Transparenter Hinweis: DSGVO-konform, Verarbeitung in der EU |
| Kein Hinweis auf menschliche Prüfung | Klar kommuniziert: KI entwirft, der Mensch prüft und gibt frei |
| Gefühl "KI ersetzt euch" | Haltung und Sprache: KI unterstützt die Fachleute |
| Daten im Tool gefangen | Export jederzeit als Standard-BPMN inklusive Beschreibungsfeldern |
| **Vorstellung** | |
| Demo mit erfundenem Spielprozess | Demo mit einem echten, bekannten Prozess aus Organisationen des öffentlichen Dienstes |
| Alle Funktionen auf einmal zeigen | Eine überzeugende Kernfunktion zeigen: Einsprechen, Knopf, Modell |

## Ideenspeicher (nicht für die nächsten Versionen vorgesehen)

- Mehrere Stimmen: verschiedene Beteiligte erzählen ihre Sicht, KI führt zusammen und zeigt Widersprüche
- Foto von Flipchart oder Whiteboard wird zum Modell
- Hinweis bei Änderung einer Rechtsgrundlage (darüber nachdenken)
- Zeiten und Fallzahlen pro Schritt als Grundlage für Personalbedarfsermittlung
- Prozesslandkarte über viele Prozesse
- Automatischer Austausch mit anderen Tools statt Dateien hin und her (irgendwann; an manchen Stellen wird es vorerst nicht anders gehen)
- Sicht der Bürgerinnen und Bürger auf den Prozess, im Stil einer Customer Journey (spätere Variante)

## Verworfen

- Live-Modell, das beim Sprechen mitwächst (zu aufwendig)
- Durchspielen von Szenarien (Stelle unbesetzt, Gesetzesänderung)

## Repositories

| Repo | Rolle | Regel |
|---|---|---|
| https://github.com/TheRealHuzur/ProcessAI | Zielrepo, hier entsteht die Anwendung | |
| https://github.com/TheRealHuzur/bpmndesk | Vorlage für den BPMN-Editor | **wird niemals verändert, nur herauskopiert** |

### Harte Regel zu bpmndesk

- bpmndesk bleibt komplett unangetastet: keine Commits, keine Branches, keine Pull Requests.
- Erlaubt ist nur, Inhalte in ProcessAI zu kopieren, bei Bedarf auch vollständig.
- Zweck: Der Editor aus bpmndesk dient als Grundlage, um generierte Modelle anzusehen und nachträglich zu bearbeiten.

### Was bpmndesk mitbringt (Stand 14.10.2026)

- Rein clientseitiger BPMN-2.0-Editor, HTML, CSS, Vanilla JavaScript
- bpmn-js 18.14.0 lokal eingebunden
- Drei Modi mit unterschiedlichem Elementvorrat: Easy, Basis, Vollständig
- Neu, Öffnen, Download als .bpmn und SVG
- Kein Backend, keine Anmeldung, keine Speicherung
- Deployment: Docker mit nginx auf Coolify, Domain bpmn.wissen-und-werkzeug.de

## Wissensmanagement: Inhalte

Am Prozess bzw. am Prozessschritt hängen:
- Dokumente
- Ansprechpersonen (als Rollen)
- Rechtsgrundlagen
- **Arbeitshilfen pro Prozessschritt (wichtigster Punkt):** ein Prosatext, der beschreibt, was in diesem Schritt eigentlich getan wird

### Beschreibungsfeld

- Die Arbeitshilfe liegt zunächst im standardisierten BPMN-Feld `documentation` (Beschreibung) des jeweiligen Elements.
- Grund: Austausch mit anderen Prozessmanagement-Tools. Was dort im Beschreibungsfeld steht, wird beim Import hier übernommen und umgekehrt.

### Weitere Angaben am Schritt (gebaut 18.10.2026)

- Dokumente und Vorlagen, Ansprechpersonen (Rollen, keine Namen), Rechtsgrundlagen; je Feld eine Angabe pro Zeile. Adressen (https://…) werden im Handbuch zu Links.
- Nur an Aktivitäten (Aufgaben und Teilprozesse). Pflege durch Menschen im Seitenfeld des Editors; die KI bekommt die Angaben nicht und übernimmt sie bei Änderungen über die id.
- Gespeichert als eigene BPMN-Erweiterung im Element (`<bpmn:extensionElements><pp:wissen>…`), damit sie mit der `.bpmn`-Datei und jeder Version reisen. Andere Werkzeuge ignorieren die Erweiterung in der Regel, die Arbeitshilfe im Beschreibungsfeld sehen sie weiterhin.
- Im Diagramm zeigt ein kleines Buch-Symbol unten rechts an Aktivitäten, dass Arbeitshilfe oder weitere Angaben hinterlegt sind; Klick öffnet sie.

### Handbuch (gebaut 18.10.2026)

- Aufbau: Deckblatt (Prozessname, Beschreibung des Pools, Stand, Version), Inhaltsverzeichnis mit Seitenzahlen, ein Kapitel je Schwimmbahn.
- Logik des Wissensmanagements: Jede Person will für ihre Schwimmbahn wissen, was zu tun ist.
- Gliederung: Schwimmbahn > Teilprozess > Aktivitäten. Aufgaben direkt in der Bahn stehen auf derselben Ebene wie Teilprozesse. Teilprozesse ohne Aktivitäten erscheinen mit ihrer eigenen Beschreibung. Reihenfolge nach Lage im Diagramm (links nach rechts).
- Aktivitäten ohne Arbeitshilfe stehen mit dem Hinweis „Noch keine Arbeitshilfe hinterlegt.“ im Handbuch, damit Lücken sichtbar werden.
- Erzeugt wird aus dem aktuellen Stand im Editor, auch ungespeichert; die Version steht nur auf dem Deckblatt, wenn der Stand gespeichert ist.
- Offen: Gehören Ereignisse oder Entscheidungen (Gateways) mit Beschreibung ins Handbuch? Soll eine Prozessübersicht (Diagramm) hinein? Teilprozesse mit eigenen Schwimmbahnen im Inneren werden vorerst unter der Bahn des Teilprozesses geführt.

## KI-Anbindung

- Zunächst Anbindung über OpenRouter, um verschiedene KI-Modelle testen zu können
- Später API zu einem DSGVO-konformen Modell, z. B. Mistral
- Anbieter und Modell nur über Konfiguration, damit der Wechsel kein Umbau ist
- Modellauswahl zum Start per Auswahlfeld in der App:
  - DeepSeek V4 Flash (`deepseek/deepseek-v4-flash`), sehr günstig
  - Mistral Small 4 (`mistralai/mistral-small-2603`), günstiges Mistral-Modell (Stand 14.10.2026: 0,15 $ Input, 0,60 $ Output pro Mio. Tokens)
- Über OpenRouter nur Testprozesse, keine echten Kundendaten

### Recherche DSGVO-konforme Anbindung (15.10.2026, keine Rechtsberatung)

- OpenRouter (US-Unternehmen, Weiterleitung an wechselnde Anbieter) und die Spracherkennung im Chrome-Browser (Audio geht an Google) sind nur für Tests ohne echte Daten geeignet.
- Empfehlung Sprachmodell: **Mistral direkt** (Paris, EU-Hosting, DPA online, SOC 2, ISO 27001/27701). Mistral Small 4: 0,15 / 0,60 USD pro Mio. Token. In der App schon vorbereitet (MISTRAL_API_KEY). Pay-as-you-go nutzen, Training-Opt-out setzen, Zero Data Retention beantragen, Unterauftragnehmerliste im DPA prüfen.
- Alternative mit deutschem Rechenzentrum und BSI C5: **IONOS AI Model Hub** (u. a. Mistral Small 24B, gpt-oss-120b; AVV im Vertrag; Inhalte werden nicht protokolliert) oder **STACKIT** (C5, kein Mistral, u. a. gpt-oss, Qwen, Llama). Beide OpenAI-kompatibel, also nur ein Konfigurationseintrag.
- Weitere: mittwald (DE, Token-Pakete, Whisper), Scaleway (Paris, Mistral Small 3.2, Whisper), T-Systems (Mindestabnahme 1.000 EUR/Monat).
- Spracherkennung DSGVO-konform: **Mistral Voxtral Mini Transcribe V2** (0,003 USD/Min., Deutsch, gleicher Vertrag wie Sprachmodell) oder Whisper bei Scaleway/mittwald. Umbau nötig: Audio im Browser aufnehmen, über das Backend transkribieren.
- Für Kundennutzung später: AVV zwischen Patrick und Kunde, KI-Anbieter als Unterauftragsverarbeiter, TOMs, Datenschutzhinweis in der App.

### Geprüft: Myra AI Workspace (15.10.2026), Kandidat für das Sprachmodell

- Myra Security (Deutschland): KI-Gateway plus Chat-Oberfläche, mit OpenAI-kompatibler API. Einbindung in ProzessPilot wäre nur ein Konfigurationseintrag (Adresse, Token, Modellname).
- Starke Nachweise: BSI C5 Typ 2, ISO 27001 auf Basis IT-Grundschutz, KRITIS-Nachweis, Betrieb in Deutschland. Referenz u. a. Stadt Regensburg. Starkes Argument für Organisationen des öffentlichen Dienstes.
- Datenschutz-Modi: Grün = Open-Weight-Modelle auf Myra-Infrastruktur (kein Dritter); Orange = externe Modelle mit automatischer Maskierung personenbezogener Daten; Rot = ohne Maskierung, nur per Admin-Freigabe. Audit-Log nach Art. 30. Kein Training mit Kundendaten.
- Offen: welche Open-Weight-Modelle im grünen Modus laufen (Qualität für BPMN entscheidend), Preise (nur auf Anfrage, nach Seats und Modell-Setup), AVV (auf der Seite nicht erwähnt), Spracherkennung (nicht angeboten), API-Doku. IP-Freigabe nur für IPv4.
- Nächster Schritt: kostenlosen Test anlegen, Fragen an Vertrieb klären, dann Probelauf mit den Testprozessen.

## Spracherkennung

- Zunächst Spracherkennung im Browser: einfachste und schnellste Lösung, vorerst nur für Patrick selbst
- faster-whisper auf Patricks Server verworfen: zu langsam, fünf Minuten Aufnahme dauern sehr lange
- Austauschbar bauen, damit später ein DSGVO-konformer Dienst eingesetzt werden kann
- Texteingabe bleibt immer als Alternative

## Speicherort

- Von Anfang an Datenbank auf Patricks Server, da sie fürs Wissensmanagement ohnehin nötig ist
- Einfach halten, kein Overengineering; BPMN-Modell als XML speichern, Arbeitshilfen bleiben im Beschreibungsfeld
- Aber so ausgelegt, dass die Funktionen aus Version 2 und 3 ohne Umbau ergänzt werden können. Dazu gehören absehbar: Kommentare und Vorschläge mit Freigabestatus, Liste unbeantworteter Chatbot-Fragen, Vorgänge mit Checklisten und Zeitstempeln je Schritt (Heatmap, Durchlaufzeiten), Nutzungsdaten der Arbeitshilfen, Interviews beim Ausscheiden, Versionen eines Prozesses
- Wichtig: Jedes Element im Modell hat eine feste ID, über die später Kommentare, Vorgänge und Auswertungen an den Prozessschritt gehängt werden
- Zugangsschutz: einfaches Passwort
- Backend und App laufen von Anfang an auf Patricks Server über Coolify mit eigener Subdomain (GitHub Pages verworfen, weil dort kein Backend und keine Datenbank möglich sind)
- Name vorerst: ProzessPilot. Subdomain: prozesspilot.wissen-und-werkzeug.de
- Websuche 14.10.2026: kein Software-Produkt "Prozesspilot" gefunden; abat (SAP-Dienstleister) bietet ein Beratungspaket "SMARTsolution BPM ProcessPilot" an (englische Schreibweise, Dienstleistung). Für das Mockup unkritisch, keine Markenprüfung
- Generische Beispielprozesse zum Vorführen können zusätzlich im Repo liegen

## Regeln für die KI

- Grundlage für die Modellierung durch die KI sind Patricks BPMN-Regeln im Wiki: wissen-und-werkzeug.de/wiki, Abschnitt BPMN.
- Es gibt bereits einen bewährten Prompt für Claude (siehe unten).

### Wiki-Seiten mit den BPMN-Regeln (Stand 14.10.2026)

Übersicht: https://wissen-und-werkzeug.de/wiki/bpmn/

- https://wissen-und-werkzeug.de/wiki/bpmn-aufgaben-und-teilprozesse/
- https://wissen-und-werkzeug.de/wiki/bpmn-das-ereignisbasierte-gateway/
- https://wissen-und-werkzeug.de/wiki/bpmn-das-exklusive-gateway-xor/
- https://wissen-und-werkzeug.de/wiki/bpmn-das-parallele-gateway-and/
- https://wissen-und-werkzeug.de/wiki/bpmn-datenobjekte-informationsfluss/
- https://wissen-und-werkzeug.de/wiki/bpmn-der-sequenzfluss/
- https://wissen-und-werkzeug.de/wiki/bpmn-endereignisse/
- https://wissen-und-werkzeug.de/wiki/bpmn-ereignisse-grundlagen-konzept/
- https://wissen-und-werkzeug.de/wiki/bpmn-gateways-grundlagen-regeln/
- https://wissen-und-werkzeug.de/wiki/bpmn-kollaboration-externe-beteiligte/
- https://wissen-und-werkzeug.de/wiki/bpmn-pools-und-schwimmbahnen/
- https://wissen-und-werkzeug.de/wiki/bpmn-startereignisse/
- https://wissen-und-werkzeug.de/wiki/bpmn-zwischenereignisse/

### Bestehender Prompt von Patrick (Original)

```
**🎭 ROLLE**
Du bist Experte für Prozessmanagement und die Erstellung von BPMN-Modellen.

**🌍 KONTEXT**
Ich habe eine Textbeschreibung für ein Prozessmodell erstellt und möchte dies in die BPMN 2.0 überführt haben.
Du fügst keine Informationen hinzu und lässt keine Informationen weg.

Du arbeitest nach den Regeln, die in diesem Wiki zur BPMN formuliert sind:

https://wissen-und-werkzeug.de/wiki/

Name des Prozesses:

**🎯 AUFGABE**
Erstelle ein BPMN Diagramm.

**📋 FORMAT**
Gib das Ergebnis als PNG und als BPMN Datei aus.
```

### Anpassungen für die App (entschieden)

- Ein Modell über die API kann keine Webseiten aufrufen. Die Regeln stehen deshalb als Text direkt im Prompt. Das Regelwerk wird als eigene Datei gepflegt; dasselbe Regelwerk nutzt auch der automatische Regelcheck.
- Regelwerk: `docs/bpmn-regelwerk.md`. Wird noch verfeinert und für die KI aufbereitet.
- Ausgabe nur noch als BPMN-XML, kein PNG; die App zeigt das Modell selbst an.
- Koordinaten nicht von der KI, die Anordnung macht ein eigener Schritt.
- Grundsatz "nichts hinzufügen, nichts weglassen" bleibt; Unklares wird als Rückfrage ausgegeben statt erfunden.
- "Name des Prozesses" wird ein Eingabefeld in der App.
- Nur erlaubte Elemente: im ersten Schritt grundsätzlich der Elementvorrat des Basis-Levels aus bpmndesk (Liste im Regelwerk)
- Rollen als Schwimmbahnen, keine Personennamen.

## Erste technische Beobachtungen

- Für den KI-Aufruf ist ein Backend nötig (API-Schlüssel, DSGVO). Das ist der grundsätzliche Unterschied zu bpmndesk.
- Der Elementvorrat der Modi Easy oder Basis kann als Vorgabe dienen, welche Elemente die KI verwenden darf.
- Die Anordnung im Diagramm (Koordinaten) sollte ein eigener Schritt sein und nicht von der KI erzeugt werden.
- Bekannte Vorgaben aus dem Use Case Text zu BPMN: kostengünstiges Modell, DSGVO-konform, nicht selbst hosten, ggf. Server mieten.

## Offene Punkte

- Regelwerk verfeinern und für die KI aufbereiten (Rohfassung liegt vor)
- Wahl des KI-Modells und Anbieters
- Version für: gemeinsames Pflegen, Chatbot, Checkliste, Teilen per Link, Wissenslücken-Radar
- Wissenslücken ohne KI: Offene Fragen am Schritt, die Menschen selbst eintragen (statt nur unbeantwortete Chatbot-Fragen)? Idee vom 18.10.2026, nicht entschieden
