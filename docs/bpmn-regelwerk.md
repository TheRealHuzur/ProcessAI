# BPMN-Regelwerk für ProzessPilot (Rohfassung)

Stand: 17.10.2026 (Phase 3: Datenobjekte je Aufgabe, Tokenprinzip, Darstellungsregeln)
Quelle: Wiki wissen-und-werkzeug.de, Abschnitt BPMN (13 Seiten), plus Elementvorrat Modus Basis aus bpmndesk.
Status: Erste Zusammenstellung, menschenlesbar. Wird noch verfeinert und für die KI aufbereitet.
Diese Datei wird zur Laufzeit in den Systemprompt der KI eingelesen.

## 1. Grundsätze

- Der Text wird in BPMN 2.0 überführt. Es werden keine Informationen hinzugefügt und keine weggelassen.
- Unklares wird als Rückfrage ausgegeben, nicht erfunden.
- Rollen statt Personennamen.
- Fachliche Modellierung, kein technisch ausführbares Modell. Nur Elemente aus dem Basis-Level.
- Der Detailgrad richtet sich nach dem Ziel des Modells. Richtig detailliert ist ein Modell, wenn es die Frage beantwortet, für die es erstellt wurde.

## 2. Erlaubte Elemente (Basis-Level, wie bpmndesk Modus Basis)

| Gruppe | Elemente |
|---|---|
| Startereignisse | unbestimmt, Nachricht, Zeit, bedingt |
| Zwischenereignisse (nur empfangend) | unbestimmt, Nachricht, Zeit, bedingt |
| Endereignisse | unbestimmt, Nachricht |
| Aktivitäten | Aufgabe, Teilprozess (zugeklappt) |
| Gateways | exklusiv (XOR), parallel (AND), ereignisbasiert |
| Daten | Datenobjekt, Datenspeicher |
| Kollaboration | Pool mit Schwimmbahnen, Black-Box-Pool |
| Verbindungen | Sequenzfluss, Nachrichtenfluss, Datenassoziation |

Alles andere (Signal, Eskalation, sendende Zwischenereignisse, zeitbasiertes Endereignis usw.) gehört in technisch ausführbare Modelle und wird nicht verwendet.

## 3. Prozessstruktur

- Jeder Prozess hat mindestens ein Startereignis und mindestens ein Endereignis.
- Kein Pfad läuft ins Leere, jeder Pfad hat einen sichtbaren Anfang und ein Ende.
- Ein Prozess beginnt und endet im selben Pool. Das gilt für den Pool, nicht für die Schwimmbahn: Ein Endereignis muss nicht in der Bahn des Startereignisses liegen.

## 4. Ereignisse allgemein

- Ein Ereignis beschreibt einen eingetretenen Zustand, nie eine Tätigkeit.
- Ereignisse haben keine Bearbeitungszeit. Was nach dem Eintritt geschieht, ist eine Aufgabe.
- Die Art ergibt sich aus dem Rand: dünn = Start, doppelt = Zwischen, dick = Ende. Farben haben keine fachliche Bedeutung.
- Beschriftung: Zustand in der Vollzugsform, z. B. "Antrag ist eingegangen", "Frist ist verstrichen".
- Probe: Lässt sich die Beschriftung mit "ist" oder "hat" zu einem Satz ergänzen, ist sie richtig. Braucht sie "wird gerade", ist es eine Aufgabe.
- Symbole: Umschlag = Nachricht, Uhr = Zeit, Blatt = Bedingung.

## 5. Startereignisse

- Kein eingehender, genau ein ausgehender Sequenzfluss.
- Beschreibt den auslösenden Impuls, nicht die erste Handlung. "Antrag entgegennehmen" ist eine Aufgabe, kein Startereignis.
- Unbestimmt: Normalfall, wenn der Auslöser weder Information, Zeitpunkt noch Bedingung ist.
- Nachricht: jede Form eingehender Information (Anruf, Mail, Formular, Fachverfahren).
- Zeit: Datum, Uhrzeit oder wiederkehrender Termin.
- Bedingt: ein Wert über- oder unterschreitet eine festgelegte Grenze. Der Eingang einer Information ist keine Bedingung, sondern eine Nachricht.
- Mehrere Auslöser: je Auslöser ein eigenes Startereignis, Zusammenführung über ein XOR-Gateway dort, wo der Ablauf gleich wird.
- Jedes Startereignis liegt in der Schwimmbahn, in der der Auslöser tatsächlich eintritt.
- Ein Pfeil auf ein Startereignis ist falsch: entweder Fluss falsch gesetzt oder es ist ein Zwischenereignis.

## 6. Zwischenereignisse

- Nur, wenn der Prozess auf etwas wartet, das er nicht selbst herbeiführen kann.
- Genau ein eingehender und genau ein ausgehender Sequenzfluss.
- Im Basis-Level nur empfangend, Symbole unausgefüllt. Sendende Zwischenereignisse werden nicht verwendet.
- Versenden oder Einreichen ist eine Aufgabe, z. B. "Angebot einreichen".
- Unbestimmt ist immer zulässig, die Art steht dann in der Beschriftung.
- Nachricht: jede Form von Information, nicht nur Briefe.
- Zeit: Zeitpunkt oder verstrichene Frist, z. B. "sechs Wochen vor dem Seminar".
- Bedingt: Warten, bis eine Bedingung erfüllt ist.
- Kann ein erwartetes Ereignis ausbleiben, wird das immer modelliert: ereignisbasiertes Gateway mit den möglichen Ereignissen. Typisches Paar: Nachricht (Zahlung eingegangen) und Zeit (Frist abgelaufen).
- Ein Zeit-Zwischenereignis ersetzt keine fehlende Alternative.

## 7. Endereignisse

- Genau ein eingehender, kein ausgehender Sequenzfluss.
- Ein Endereignis liegt in der Schwimmbahn des Schritts davor. Für ein Endereignis wird die Bahn nicht gewechselt.
- Beschriftung beschreibt den Endzustand, z. B. "Antrag ist abgelehnt".
- Fachlich unterschiedliche Ergebnisse bekommen unterschiedliche Endereignisse. Kein pauschales "Prozess beendet".
- Unbestimmt: Standardabschluss.
- Nachricht: sendend, ausgefülltes Symbol, impliziert einen Versand ohne Zeitverbrauch. Ist der Versand eine aktive, zeitaufwendige Tätigkeit, wird eine Aufgabe zum Senden modelliert, gefolgt von einem unbestimmten Endereignis.
- Ein zeitbasiertes Endereignis gibt es nicht.

## 8. Aufgaben und Teilprozesse

- Eine Aufgabe ist eine einzelne Tätigkeit, die im Modell nicht weiter zerlegt wird.
- Benennung immer nach dem Schema Objekt und Verb: "Antrag prüfen", "Bescheid erstellen".
- Keine Substantivierungen wie "Antragsprüfung".
- Stecken mehrere Tätigkeiten in einer Benennung, sind es mehrere Aufgaben.
- Konvention: Jede Aufgabe hat genau einen eingehenden und genau einen ausgehenden Sequenzfluss. Mehrere Pfade in eine Aufgabe sind falsch, davor gehört ein Gateway.
- Teilprozess: fasst einen Hauptbestandteil zusammen, eine Ebene über den Aufgaben, erkennbar am Pluszeichen. Dahinter liegt ein eigenes Modell mit eigenem Start- und mindestens einem Endereignis.

## 9. Gateways allgemein

- Gateways sind reine Logik-Knoten, nie Tätigkeiten, ohne Bearbeitungszeit.
- Verzweigen und Zusammenführen wird immer explizit über Gateways modelliert.
- Nur Gateways dürfen mehrere ein- oder ausgehende Sequenzflüsse haben.
- Verzweigung: genau ein Eingang, mehrere Ausgänge. Zusammenführung: mehrere Eingänge, genau ein Ausgang.
- Für Verzweigung und Zusammenführung dasselbe Symbol. Ausnahme: ereignisbasiertes Gateway, das per XOR zusammengeführt wird.

## 10. Exklusives Gateway (XOR)

- Entweder-oder: genau ein ausgehender Pfad wird gewählt. Für Ja/Nein und Grenzwerte (Alter, Betrag).
- Immer das Symbol mit X, nie die leere Variante.
- Gateway nur beschriften, wenn es für das Verständnis zwingend nötig ist.
- Keine Frage, die sich schon aus der vorherigen Aufgabe ergibt ("Antrag prüfen", dann "Geprüft?").
- Empfohlen: die ausgehenden Pfade mit dem Ergebnis beschriften, z. B. "vollständig" und "unvollständig", statt einer Frage mit Ja/Nein.
- Die Bedingungen auf den Pfaden müssen sich gegenseitig ausschließen.
- Zusammenführung: läuft weiter, sobald ein Pfad ankommt.
- Keine Pflicht zur Zusammenführung: Pfade dürfen zu verschiedenen Endereignissen führen.

## 11. Paralleles Gateway (AND)

- Symbol mit +, keine Beschriftung nötig.
- Verzweigung: alle Pfade werden aktiviert. Für echte Gleichzeitigkeit oder Aufgaben, deren Reihenfolge egal ist, die aber alle erledigt werden müssen.
- Zusammenführung: wartet, bis alle Pfade angekommen sind.
- Häufigster Fehler ist eine falsche Zusammenführung, sie führt zu hängenden Pfaden.
- Tokenprinzip: Die Verzweigung erzeugt je Ausgang einen Token. Die Zusammenführung läuft erst weiter, wenn auf jedem Eingang ein Token angekommen ist.
- Deshalb muss jeder Pfad nach einer parallelen Verzweigung die zugehörige Zusammenführung erreichen. Er darf vorher nicht in einem Endereignis enden. Sonst wartet der Token des anderen Pfads für immer, und der Vorgang wird nie abgeschlossen.
- Eine Entscheidung, die den ganzen Vorgang beenden kann (z. B. "keine Mittel", "Frist verstreicht"), gehört vor die Verzweigung oder hinter die Zusammenführung. Beide Pfade laufen dann zuerst zusammen, danach wird entschieden.
- Parallele Pfade nie über ein exklusives Gateway zusammenführen. Die Schritte danach würden mehrfach ausgeführt.
- Das terminierende Endereignis, das alle Token beendet, gehört nicht zum Basis-Level und wird nicht verwendet.

## 12. Ereignisbasiertes Gateway

- Nur, wenn der weitere Verlauf vom Warten auf Ereignisse abhängt, nicht von einer Datenentscheidung.
- Die möglichen Ereignisse folgen direkt auf das Gateway.
- Das zuerst eintretende Ereignis bestimmt den Pfad, immer nur ein Pfad.
- Zusammenführung mit dem normalen XOR-Symbol.

## 13. Sequenzfluss

- Verbindet nur Aktivitäten, Gateways und Ereignisse.
- Beide Enden fest an einem Element, nie offen.
- Nie über eine Poolgrenze.
- Zeigt die Reihenfolge der Ausführung.
- Überkreuzungen und Überlagerungen vermeiden.

## 14. Pools und Schwimmbahnen

- Ein Pool bildet in der Regel den Prozess einer einzelnen Organisation ab.
- Jede beteiligte Rolle bekommt eine eigene Schwimmbahn. Eine Aktivität liegt in der Bahn der Rolle, die sie ausführt.
- Gibt es nur einen Beteiligten, übernimmt der Pool die Funktion der Bahn.
- Bahnen dürfen verschachtelt werden, z. B. Amt, Sachgebiet, Rolle.
- Bei vielen Beteiligten lieber Abteilungsebene, besonders für Entscheider.
- Für technische Umsetzung (Workflow im DMS) jede konkrete Rolle einzeln.
- In digitalisierten Soll-Modellen ist eine eigene Bahn für Systemaktivitäten möglich.

## 15. Externe Beteiligte und Nachrichtenfluss

- Externe (Antragstellende, Partnerbehörden usw.) gehören nicht in den eigenen Pool.
- Ist ihr Ablauf unbekannt oder unwichtig, werden sie als Black-Box-Pool dargestellt: leerer Pool mit Bezeichnung.
- Austausch zwischen Pools nur über Nachrichtenfluss, und Nachrichtenfluss nur über Poolgrenzen.
- Sequenzflüsse und Assoziationen nie über Poolgrenzen.

## 16. Datenobjekte und Datenspeicher

- Datenobjekt: Transportmedium einer Information (Dokument, Datei, Telefonat). Datenspeicher: dauerhafte Ablage (Datenbank, Aktenschrank).
- Verbindung über Datenassoziation: Pfeil zur Aufgabe = lesen, Pfeil zum Datenobjekt = erzeugen.
- Zustand in eckigen Klammern am Namen, z. B. "Rechnung [geprüft]".
- Ein Datenobjekt oder Datenspeicher wird an jeder Aufgabe, zu der es gehört, einzeln dargestellt, jeweils mit der passenden Verbindung zu dieser Aufgabe. Ein Beschaffungsantrag, den eine Aufgabe erzeugt und drei Aufgaben lesen, steht also viermal im Modell. Fachlich bleibt es dasselbe Datenobjekt.
- Datenobjekte gelten nur innerhalb eines Pools.
- Sparsam einsetzen, nur wenn sie die Lesbarkeit erhöhen.

## 17. Darstellung und Anordnung

Die Anordnung übernimmt die App, die KI liefert keine Koordinaten. Diese Regeln gelten für die automatische Anordnung und für die Prüfung von Hand.

1. Datenobjekte stehen einzeln an jeder Aufgabe, zu der sie gehören (siehe 16).
2. Sequenzflüsse gehen bei Aufgaben und Ereignissen links ein und rechts aus.
3. Führen mehrere Sequenzflüsse aus einem Gateway heraus oder in eines hinein, nutzen sie nach Möglichkeit unterschiedliche Kanten, nicht dieselbe Kante und keine Ecke.
4. Zwischen einem Sequenzfluss und einer Schwimmbahngrenze liegt mindestens so viel Abstand wie zwischen einer Aktivität und der Schwimmbahngrenze.
5. Sequenzflüsse verlaufen nicht durch andere Symbole.
6. Ein Sequenzfluss bleibt in den Schwimmbahnen von Start und Ziel. Verbindet er zwei Elemente derselben Bahn, verlässt er diese Bahn nicht; die Bahn wird bei Bedarf höher.
7. Entstehen Kreuzungen, wird geprüft, ob sich die Ausgänge eines Gateways anders verteilen lassen (anderer Ausgang, andere Zeile für den Nachfolger), sodass die Kreuzung entfällt. Kreuzungen und Überlagerungen so weit wie möglich vermeiden (siehe 13).

## Auffälligkeiten zum Klären

- Inklusives Gateway (OR): Die Seite zu Gateway-Grundlagen nennt es, bpmndesk Basis enthält es nicht. Entscheidung 17.10.2026: vorerst nicht aufnehmen, es gilt der bpmndesk-Vorrat.
- Beschriftung von Ereignissen: meist Vollzugsform ("ist eingegangen"), bei Zwischenereignissen auch Präsens ("Angebot geht ein"). Einheitlich festlegen.
- Die Seite zu Startereignissen verweist auf eine Modellierungskonvention zum Download auf der Werkzeugseite. Prüfen, ob dort weitere Regeln stehen.
