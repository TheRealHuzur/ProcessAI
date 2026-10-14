# ProzessPilot (Arbeitstitel, Repo heisst ProcessAI): Planungssammlung

Kopie vom 14.10.2026. Die führende Fassung liegt in Patricks Storage unter `50_coding/processai/ProcessAI-Planung.md`.

## Ziel

ProzessPilot ist ein Tool, das
1. aus Text ein BPMN-Modell entwirft und
2. prozessbasiertes Wissensmanagement unterstützt.

Erster Schritt ist ein Mockup. Es soll vor allem zeigen, wie schnell so etwas gebaut ist, weil die Bausteine schon vorhanden sind. Kundennutzung ist später denkbar, aber nicht Ziel der ersten Version.

## Vorgehen in zwei Schritten

- **Schritt 1: Text zu BPMN.** Zuerst darauf konzentrieren.
- **Schritt 2: Wissensmanagement.** Danach darauf konzentrieren.
- Alles wird immer mitgedacht, aber nicht zu groß angefangen.
- Version 1 bewusst schlank halten: Ziel ist eine funktionierende Version zum Testen.

## Grundablauf

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
- Arbeitshilfe pro Prozessschritt als Prosatext im BPMN-Beschreibungsfeld
- Handbuch-Export als PDF, auch zum Ausdrucken; für Einarbeitung, Rechnungsprüfung und Nachschlagen
- Fragen als Signal: Jede Frage an den Chatbot, die nicht beantwortet werden kann, landet sofort auf einer Liste (Wissenslücke)

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
- Checkliste als Sensor (Modell gegen Wirklichkeit): Checklisten der Vorgänge über den Prozess legen; Heatmap, an welchem Schritt gerade die meisten Vorgänge stehen; Auswertung im Stil von Process Mining. Hinweis: in der Praxis Thema für den Personalrat

## Anforderungen aus der Kopfstandmethode (Auszug)

- Ein klarer Einstieg: ein großer Button zum Einsprechen
- Durchgehend deutsche Alltagssprache
- Freies Erzählen erlaubt, KI sortiert und filtert Füllwörter und Selbstkorrekturen
- Text wird laufend gesichert, Transkript ist sichtbar und korrigierbar
- Saubere automatische Anordnung
- KI bleibt beim Erzählten; Annahmen werden als Unklarheit ausgegeben
- Möglichst stabile Ergebnisse durch feste Regeln
- Klar kommuniziert: KI entwirft, der Mensch prüft und gibt frei
- Export jederzeit als Standard-BPMN inklusive Beschreibungsfeldern

## Ideenspeicher und Verworfenes

Siehe führende Fassung im Storage.

## Repositories

| Repo | Rolle | Regel |
|---|---|---|
| https://github.com/TheRealHuzur/ProcessAI | Zielrepo | |
| https://github.com/TheRealHuzur/bpmndesk | Vorlage für den BPMN-Editor | **wird niemals verändert, nur herauskopiert** |

## KI-Anbindung

- Zunächst über OpenRouter, um verschiedene Modelle testen zu können
- Später API zu einem DSGVO-konformen Modell, z. B. Mistral direkt
- Anbieter und Modell nur über Konfiguration
- Start-Modelle: DeepSeek V4 Flash (`deepseek/deepseek-v4-flash`) und Mistral Small 4 (`mistralai/mistral-small-2603`)
- Über OpenRouter nur Testprozesse, keine echten Kundendaten

## Spracherkennung

- Zunächst Spracherkennung im Browser (Chrome), vorerst nur für Patrick selbst
- Austauschbar bauen; Texteingabe bleibt immer als Alternative

## Speicherort und Betrieb

- Datenbank auf Patricks Server, schlank, aber vorbereitet für Version 2 und 3 (siehe `datenmodell.md`)
- Zugangsschutz: einfaches Passwort
- Betrieb über Coolify unter prozesspilot.wissen-und-werkzeug.de

## Regeln für die KI

- Grundlage: `bpmn-regelwerk.md` (aus dem Wiki zusammengestellt, wird noch verfeinert)
- Ausgabe der KI als JSON-Prozessmodell; Anordnung und BPMN-XML erzeugt die App selbst
- Nur Elemente des Basis-Levels aus bpmndesk
