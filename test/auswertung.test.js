// Auswertung im Kundenportal: Zeiträume nach deutscher Zeit, Nutzung aus dem Protokoll, Logbuch
// (Wiederholungen, Abbrüche, Herkunft, Fehler, Reife, Rückmeldungen) und Bestandteile hochgeladener Dateien.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { oeffnePortalDatenbank } from "../portal/db.js";
import { MODULE } from "../portal/module/index.js";
import { portalAuswertung } from "../portal/auswertung.js";
import { auswertung, herkunftName } from "../portal/module/handbuch/auswertung.js";
import { werkzeugAus } from "../portal/module/handbuch/modul.js";
import { zeitraumAus, tagBerlin, imZeitraum } from "../portal/zeit.js";
import { bestandteile } from "../kern/handbuch/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JETZT = new Date("2026-11-25T12:00:00Z");
let tmp;
let db;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auswertung-"));
  db = oeffnePortalDatenbank(tmp, MODULE);
  const mandant = db.prepare("INSERT INTO mandanten (id, name, benutzername, passwort_hash, aktiv, angelegt, geaendert) VALUES (?, ?, ?, 'x', ?, '2026-09-01T00:00:00Z', 'z')");
  mandant.run("A", "Stadt A", "a", 1);
  mandant.run("B", "Kreis B", "b", 1);
  mandant.run("C", "Amt C", "c", 1);
  mandant.run("D", "Amt D", "d", 0);
  mandant.run("E", "Amt E", "e", 1);
  const p = db.prepare("INSERT INTO protokoll (zeit, mandant_id, modul_id, aktion, ergebnis) VALUES (?, ?, ?, ?, ?)");
  p.run("2026-10-01T08:00:00Z", "E", "", "anmelden", "ok");
  p.run("2026-11-01T09:00:00Z", "A", "", "anmelden", "ok");
  p.run("2026-11-01T10:00:00Z", "A", "handbuch", "handbuch erstellt", "ok");
  p.run("2026-11-20T08:00:00Z", "A", "", "besuch", "ok");
  p.run("2026-11-20T09:55:00Z", "A", "handbuch", "seite", "ok");
  p.run("2026-11-22T09:00:00Z", "A", "handbuch", "seite", "ok");
  p.run("2026-11-24T07:00:00Z", "A", "", "anmelden", "fehler");
  p.run("2026-11-25T08:00:00Z", "A", "", "besuch", "ok");
  p.run("2026-11-25T11:45:00Z", "B", "handbuch", "seite", "ok");
  p.run("2026-11-25T09:00:00Z", "A", "", "verwaltung: geaendert", "ok");

  const hb = db.prepare(`INSERT INTO hb_handbuecher (vorgang, mandant_id, titel, dateien, werkzeug, status, meldung, schritte, mit_arbeitshilfe,
                           mit_angaben, fehlende_unterdiagramme, arbeitshilfe_zeichen, bestandteile, erstellt) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const up = db.prepare("INSERT INTO hb_uploads (id, vorgang, mandant_id, dateiname, titel, datei, groesse, status, hochgeladen, inhalt_hash) VALUES (?, ?, ?, ?, '', 'd', 1, 'ok', '', ?)");
  const PIC = "PICTURE Prozessplattform 3.0.0";
  const teile = JSON.stringify({ felder: { "PICTURE: X / Y": 2 }, ungenutzt: { "bpmn:DataObject": 1 }, warnungen: 1 });
  const ok = (v, m, titel, zeit, werkzeug, t = "") => hb.run(v, m, titel, werkzeug, "ok", "", 10, 5, 1, 2, 500, t, zeit);
  const fehler = (v, m, titel, zeit, werkzeug, meldung) => hb.run(v, m, titel, werkzeug, "fehler", meldung, null, null, null, null, null, "", zeit);
  ok("h7", "A", "Alt", "2026-10-10T08:00:00Z", PIC);
  ok("h1", "A", "T1", "2026-11-20T10:00:00Z", PIC, teile);
  ok("h2", "A", "T1", "2026-11-20T10:10:00Z", PIC);
  fehler("h3", "A", "T1", "2026-11-20T10:20:00Z", PIC, "kaputt");
  ok("h4", "A", "T2", "2026-11-20T10:50:00Z", PIC);
  fehler("h6", "B", "B1", "2026-11-24T08:00:00Z", "", "leer");
  fehler("h5", "B", "B2", "2026-11-25T11:30:00Z", "", "kaputt");
  up.run("u1", "h1", "A", "a.bpmn", "x");
  up.run("u2", "h2", "A", "a.bpmn", "x");
  up.run("u3", "h3", "A", "a.bpmn", "y");
  up.run("u4", "h4", "A", "b.bpmn", "z");
  const rm = db.prepare("INSERT INTO hb_rueckmeldungen (vorgang, mandant_id, passt, text, zeit) VALUES (?, 'A', ?, ?, ?)");
  rm.run("h1", 1, "", "2026-11-20T10:01:00Z");
  rm.run("h1", 0, "zu lang", "2026-11-20T10:02:00Z");
  rm.run("h4", 1, "", "2026-11-20T10:55:00Z");
});

after(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Zeitraum in ganzen Tagen nach deutscher Zeit, mit gleich langem Vorzeitraum", () => {
  assert.equal(tagBerlin("2026-11-24T23:30:00Z"), "2026-11-25");
  assert.equal(tagBerlin("2026-07-01T22:30:00Z"), "2026-07-02");
  const z = zeitraumAus("7", JETZT);
  assert.deepEqual([z.von, z.bis, z.vergleich_von, z.vergleich_bis], ["2026-11-19", "2026-11-25", "2026-11-12", "2026-11-18"]);
  assert.ok(imZeitraum("2026-11-18T23:30:00Z", z), "nach deutscher Zeit schon der 19.");
  assert.ok(!imZeitraum("2026-11-18T22:30:00Z", z));
  assert.equal(zeitraumAus("unsinn", JETZT).schluessel, "30");
  assert.deepEqual([zeitraumAus("alle", JETZT).von, zeitraumAus("alle", JETZT).vergleich_von], [null, null]);
});

test("Nutzung: aktive Organisationen, Sitzungen und Verlauf je Organisation", () => {
  const a = portalAuswertung(db, { zeitraum: "30", jetzt: JETZT });
  // A meldet sich an und besucht, B öffnet nur das Logbuch; vorher war nur E da
  assert.deepEqual(a.kopf.aktive_mandanten, { wert: 2, vorher: 1 });
  assert.deepEqual(a.kopf.sitzungen, { wert: 3, vorher: 1 });
  assert.deepEqual(a.kopf.fehlversuche, { wert: 1, vorher: 0 });
  assert.equal(a.tage.length, 30);
  assert.equal(a.tage.reduce((s, t) => s + t.sitzungen, 0), 3);
  assert.equal(a.wochen.length, 12);
  assert.equal(a.wochen[11].start, "2026-11-23");
  assert.equal(a.wochen[11].mandanten, 2);
  const m = Object.fromEntries(a.mandanten.map((x) => [x.id, x]));
  assert.deepEqual([m.A.status, m.B.status, m.C.status, m.D.status, m.E.status], ["aktiv", "aktiv", "nie angemeldet", "gesperrt", "eingeschlafen"]);
  assert.equal(m.A.stunden_bis_erstes_handbuch, 1);
  assert.equal(m.A.aktive_tage, 4, "01.11., 20.11., 22.11. (Seitenaufruf), 25.11.; der Fehlversuch am 24.11. zählt nicht");
  assert.equal(m.A.sitzungen, 3);
  assert.equal(m.E.tage_seit, 55);
  assert.equal(m.B.erste_anmeldung, null);
  assert.equal(a.besuche_ab, "2026-11-20T08:00:00Z");
  // Filter auf eine Organisation
  const b = portalAuswertung(db, { zeitraum: "alle", mandant: "B", jetzt: JETZT });
  assert.deepEqual(b.mandanten.map((x) => x.id), ["B"]);
  assert.equal(b.kopf.sitzungen.vorher, null);
});

test("Logbuch: Kopfzahlen, Wiederholungen, Abbrüche, Herkunft, Fehler, Reife, Rückmeldungen", () => {
  const l = auswertung(db, { zeitraum: "30", jetzt: JETZT });
  assert.deepEqual(l.kopf.handbuecher, { wert: 6, vorher: 1 });
  assert.deepEqual([l.kopf.ok.wert, l.kopf.fehler.wert], [3, 3]);
  // h2: gleiche Datei 10 Minuten nach h1; h3: geänderte Datei nach h2. h4 hat anderen Titel und andere Datei.
  assert.deepEqual(l.wiederholungen.map((w) => [w.vorgang, w.art, w.abstand_min, w.vorher_status]), [["h3", "geaendert", 10, "ok"], ["h2", "unveraendert", 10, "ok"]]);
  // Abbrüche: Seite am 22.11. ohne Versuch, h6 ohne späteren Erfolg; h3 hatte danach Erfolg (h4); h5 und die Seite von B sind noch offen
  assert.deepEqual(l.abbrueche.map((a) => [a.art, a.vorgang || a.zeit]), [["nach Fehler", "h6"], ["ohne Versuch", "2026-11-22T09:00:00Z"]]);
  assert.deepEqual(l.herkunft.map((h) => [h.name, h.anzahl, h.fehler]), [["PICTURE Prozessplattform", 4, 1], ["unbekannt", 2, 2]]);
  assert.deepEqual(l.fehlermeldungen.map((f) => [f.meldung, f.anzahl]), [["kaputt", 2], ["leer", 1]]);
  assert.deepEqual(l.reife, [{
    mandant_id: "A", organisation: "Stadt A", handbuecher: 3, schritte: 30, mit_arbeitshilfe: 15, mit_angaben: 3, fehlende_unterdiagramme: 6, zeichen_je_arbeitshilfe: 100
  }]);
  // Je Handbuch zählt die letzte Rückmeldung; h2 hat keine
  assert.deepEqual([l.kopf.passt.wert, l.kopf.passt_nicht.wert, l.rueckmeldungen.ohne], [1, 1, 1]);
  assert.deepEqual(l.rueckmeldungen.liste.map((r) => [r.vorgang, r.passt, r.text]), [["h4", true, ""], ["h1", false, "zu lang"]]);
  assert.equal(l.bestandteile.handbuecher, 1);
  assert.equal(l.bestandteile.warnungen, 1);
  assert.deepEqual(l.bestandteile.felder.map((f) => [f.name, f.handbuecher, f.anzahl, f.herkunft]), [["PICTURE: X / Y", 1, 2, ["PICTURE Prozessplattform"]]]);
  assert.equal(l.tage.reduce((s, t) => s + t.ok + t.fehler, 0), 6);
  // Nur Kreis B
  const b = auswertung(db, { zeitraum: "30", mandant: "B", jetzt: JETZT });
  assert.deepEqual([b.kopf.handbuecher.wert, b.abbrueche.length, b.wiederholungen.length, b.reife.length], [2, 1, 0, 0]);
  // Später entschieden: h5 ohne Erfolg und die Seite von B werden zu Abbrüchen
  const spaeter = auswertung(db, { zeitraum: "30", mandant: "B", jetzt: new Date("2026-11-25T14:00:00Z") });
  assert.equal(spaeter.abbrueche.length, 3);
});

test("Herkunft: Name ohne Version, mehrere Werkzeuge, ADONIS am Namensraum", () => {
  assert.equal(herkunftName("PICTURE Prozessplattform 3.0.0"), "PICTURE Prozessplattform");
  assert.equal(herkunftName("PICTURE 3.0.0, Camunda Modeler 5.2.0"), "PICTURE + Camunda Modeler");
  assert.equal(herkunftName(""), "unbekannt");
  assert.equal(werkzeugAus('<definitions xmlns:adonis="http://www.boc-group.com" id="d">'), "ADONIS");
  assert.equal(werkzeugAus('<definitions exporter="Camunda Modeler" exporterVersion="5.2.0" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">'), "Camunda Modeler 5.2.0");
});

test("Bestandteile: Herstellerfelder mit Inhalt, ungenutzte Elemente, fremde Erweiterungen", async () => {
  const adonis = `<?xml version="1.0"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:adonis="http://www.boc-group.com" id="d" targetNamespace="x">
    <process id="p">
      <extensionElements><adonis:modelattributes>
        <adonis:attribute name="A_OWNER"><adonis:value>Amt 10</adonis:value></adonis:attribute>
        <adonis:attribute name="A_COMPLEXITY"><adonis:value>Kein Eintrag</adonis:value></adonis:attribute>
        <adonis:attribute name="FONT_COLOUR"><adonis:value>$000000</adonis:value></adonis:attribute>
      </adonis:modelattributes></extensionElements>
      <task id="t" name="Prüfen"/>
      <startEvent id="s"/>
      <dataObject id="dobj"/>
      <dataObjectReference id="do" dataObjectRef="dobj"/>
      <textAnnotation id="ta"><text>Hinweis</text></textAnnotation>
    </process>
  </definitions>`;
  const a = await bestandteile(adonis);
  assert.deepEqual(a.felder, { "ADONIS: A_OWNER": 1 });
  assert.deepEqual(Object.keys(a.ungenutzt).sort(), ["bpmn:DataObject", "bpmn:DataObjectReference", "bpmn:TextAnnotation"]);
  assert.deepEqual([a.genutzt["bpmn:Task"], a.weggelassen["bpmn:StartEvent"], a.fremd["adonis:modelattributes"]], [1, 1, 1]);

  const picture = await bestandteile(fs.readFileSync(path.join(__dirname, "fixtures", "picture-geteilt-haupt.bpmn"), "utf8"));
  assert.ok(picture.genutzte_felder["PICTURE: Verknüpfung / Verknüpfung zum Subdiagramm"] >= 1);
  assert.ok(Object.keys(picture.felder).some((f) => f.startsWith("PICTURE: Inhaltliche Beschreibung")));
  assert.ok(picture.fremd["pic:attributes"] >= 1);
  // Kaputtes XML bricht nicht ab, es fehlt nur der Beitrag dieser Datei
  assert.deepEqual((await bestandteile(["<kein", adonis])).felder, { "ADONIS: A_OWNER": 1 });
});
