# Datenmodell

Datenbank: SQLite (in Node eingebaut, `node:sqlite`), Datei unter `DATA_DIR` (Standard `./data`, im Container `/data`).

## Grundprinzip

- Das BPMN-Modell wird als XML gespeichert. Die Arbeitshilfen stehen im BPMN-Feld `documentation` und reisen damit beim Export mit.
- Weitere Angaben an Aktivitäten (Dokumente, Ansprechpersonen, Rechtsgrundlagen) stehen ebenfalls im XML, als Erweiterung im Element (siehe unten). Dafür gibt es keine eigene Tabelle.
- Jedes BPMN-Element hat eine feste ID (z. B. `Task_AntragPruefen`). Spätere Tabellen hängen über `element_id` an einem Prozessschritt.
- Jede Speicherung erzeugt eine neue Version. Nichts wird überschrieben.

## Version 1 (gebaut)

### prozesse

| Spalte | Typ | Bedeutung |
|---|---|---|
| id | TEXT | UUID |
| name | TEXT | Prozessname |
| erstellt | TEXT | ISO-Zeitstempel |
| geaendert | TEXT | ISO-Zeitstempel der letzten Version |

### prozess_versionen

| Spalte | Typ | Bedeutung |
|---|---|---|
| id | TEXT | UUID |
| prozess_id | TEXT | Verweis auf prozesse.id |
| version | INTEGER | fortlaufend je Prozess |
| bpmn_xml | TEXT | vollständiges BPMN-2.0-XML |
| quelltext | TEXT | eingesprochener bzw. eingegebener Text |
| ki_modell | TEXT | verwendetes KI-Modell, leer bei Handbearbeitung |
| ki_json | TEXT | Zwischenergebnis der KI (JSON), zur Nachvollziehbarkeit |
| pruefung_json | TEXT | Ergebnis des Regelchecks |
| notiz | TEXT | optional |
| erstellt | TEXT | ISO-Zeitstempel |

### Weitere Angaben am Schritt (im BPMN-XML)

Namensraum `pp` = `https://prozesspilot.wissen-und-werkzeug.de/schema/wissen`, Beschreibung in `public/wissen.js` (gilt für Editor und Server).

```xml
<bpmn:task id="Task_RechnungPruefen" name="Rechnung prüfen">
  <bpmn:documentation>Arbeitshilfe als Fließtext</bpmn:documentation>
  <bpmn:extensionElements>
    <pp:wissen>
      <pp:dokument>Prüfvermerk, Vorlage V3</pp:dokument>
      <pp:ansprechperson>Kassenleitung</pp:ansprechperson>
      <pp:rechtsgrundlage>§ 33 GemHVO</pp:rechtsgrundlage>
    </pp:wissen>
  </bpmn:extensionElements>
</bpmn:task>
```

Im KI-JSON heißt das Feld `wissen` (`dokumente`, `ansprechpersonen`, `rechtsgrundlagen`, je eine Liste). Es geht nie an die KI und wird bei Änderungen über die id übernommen.

## Vorgesehen für Version 2 und 3 (noch nicht angelegt)

Alle hängen über `prozess_id` und, wo sinnvoll, `element_id` am Prozess.

| Tabelle | Zweck |
|---|---|
| kommentare | Kommentare und Ergänzungsvorschläge am Schritt, mit Status (offen, freigegeben, abgelehnt) und kuratierender Rolle |
| fragen | Fragen an den Chatbot, die nicht beantwortet werden konnten (Wissenslücken); kommt mit dem Chatbot (aus Version 1 verschoben am 18.10.2026) |
| vorgaenge | konkrete Vorgänge, die per Checkliste durch einen Prozess laufen |
| vorgang_schritte | Zeitstempel je Vorgang und Schritt (Heatmap, Durchlaufzeiten) |
| nutzung | Aufrufe von Arbeitshilfen (Nutzungsauswertung) |
| interviews | Interviews beim Ausscheiden, Rohtext und übernommene Inhalte |

Neue Tabellen werden in `server/db.js` als weitere Migration ergänzt (`user_version` von SQLite).
