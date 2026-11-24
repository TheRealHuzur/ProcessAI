// Handbuch: Gliederung nach Schwimmbahn, Teilprozess, Aktivität und PDF-Erzeugung
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leseHandbuch, handbuchDokument, erzeugeHandbuch, HandbuchFehler } from "../server/handbuch.js";
import { bauenAusJson, zuXml } from "../server/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const teilprozesse = fs.readFileSync(path.join(__dirname, "fixtures", "teilprozesse.bpmn"), "utf8");
const beispiel = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "antrag-beispielmodell.json"), "utf8"));

const kurz = (e) => ({ art: e.art, name: e.name, eintraege: e.eintraege.map(kurz) });

test("Handbuch: Kapitel je Schwimmbahn, Teilprozess mit seinen Aktivitäten, Reihenfolge nach Lage", async () => {
  const handbuch = await leseHandbuch(teilprozesse);
  assert.equal(handbuch.titel, "Stadtkasse");
  assert.equal(handbuch.einfuehrung, "Wie eine Rechnung bezahlt wird.");
  assert.deepEqual(handbuch.kapitel.map((k) => ({ titel: k.titel, eintraege: k.eintraege.map(kurz) })), [
    {
      titel: "Sachbearbeitung",
      eintraege: [
        { art: "aufgabe", name: "Rechnung prüfen", eintraege: [] },
        {
          art: "teilprozess",
          name: "Zahlung ausführen",
          eintraege: [
            { art: "aufgabe", name: "Rechnung buchen", eintraege: [] },
            { art: "aufgabe", name: "Zahlung anweisen", eintraege: [] }
          ]
        }
      ]
    },
    { titel: "Kassenleitung", eintraege: [{ art: "teilprozess", name: "Zahlung freigeben", eintraege: [] }] }
  ]);
});

test("Handbuch: Arbeitshilfe und weitere Angaben, auch am Teilprozess ohne Aktivitäten", async () => {
  const { kapitel } = await leseHandbuch(teilprozesse);
  const pruefen = kapitel[0].eintraege[0];
  assert.equal(pruefen.arbeitshilfe, "Sachlich und rechnerisch richtig zeichnen.");
  assert.deepEqual(pruefen.wissen, {
    dokumente: ["Prüfvermerk, Vorlage V3", "Dienstanweisung https://example.org/da-kasse"],
    ansprechpersonen: ["Kassenleitung"],
    rechtsgrundlagen: ["§ 33 GemHVO"]
  });
  assert.equal(kapitel[1].eintraege[0].arbeitshilfe, "Ab 5.000 Euro zeichnet die Kassenleitung mit.");
});

test("Handbuch: Gliederung im PDF mit Nummern und Inhaltsverzeichnis bis zur dritten Ebene", async () => {
  const dokument = handbuchDokument(await leseHandbuch(teilprozesse), { name: "Rechnung bezahlen", version: 3, stand: "18.10.2026" });
  const ueberschriften = dokument.content.filter((k) => k.headlineLevel).map((k) => [k.headlineLevel, k.text, Boolean(k.tocItem)]);
  assert.deepEqual(ueberschriften, [
    [1, "1  Sachbearbeitung", true],
    [2, "1.1  Rechnung prüfen", true],
    [2, "1.2  Zahlung ausführen", true],
    [3, "1.2.1  Rechnung buchen", true],
    [3, "1.2.2  Zahlung anweisen", true],
    [1, "2  Kassenleitung", true],
    [2, "2.1  Zahlung freigeben", true]
  ]);
  const texte = JSON.stringify(dokument.content);
  assert.ok(texte.includes("Version 3"));
  assert.ok(texte.includes("Stand: 18.10.2026"));
  assert.ok(texte.includes("Noch keine Arbeitshilfe hinterlegt."), "Aktivität ohne Arbeitshilfe wird als Lücke sichtbar");
  assert.ok(texte.includes('"link":"https://example.org/da-kasse"'));
  assert.ok(dokument.content.some((k) => k.toc));
});

test("Handbuch: PDF wird erzeugt", async () => {
  const pdf = Buffer.from(await erzeugeHandbuch(teilprozesse, { name: "Rechnung bezahlen" }));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  // Deckblatt, Inhalt, zwei Kapitel
  assert.equal(pdf.toString("latin1").match(/\/Type \/Page\b/g).length, 4);
});

test("Handbuch: Modell aus der KI-Pipeline ohne Teilprozesse", async () => {
  const { kapitel } = await leseHandbuch(zuXml(bauenAusJson(beispiel).modell));
  assert.ok(kapitel.length >= 1);
  const alle = kapitel.flatMap((k) => k.eintraege);
  assert.equal(alle.find((e) => e.name === "Bescheid erstellen").arbeitshilfe, "Vorlage aus dem Fachverfahren verwenden.");
});

test("Handbuch: ohne Aktivitäten oder mit kaputtem XML gibt es eine verständliche Meldung", async () => {
  const leer = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x">
  <bpmn:process id="P"><bpmn:startEvent id="S" /></bpmn:process>
</bpmn:definitions>`;
  await assert.rejects(leseHandbuch(leer), HandbuchFehler);
  await assert.rejects(leseHandbuch("<kein xml"), HandbuchFehler);
});

// PICTURE: Inhalt der Teilprozesse aus verknüpften Diagrammen, Bahnen im Teilprozess, nur das Beschreibungsfeld
const picture = fs.readFileSync(path.join(__dirname, "fixtures", "picture-teilprozesse.bpmn"), "utf8");
const gliederung = (e) => ({ art: e.art, name: e.name, ...(e.hinweis ? { hinweis: e.hinweis } : {}), eintraege: e.eintraege.map(gliederung) });

test("PICTURE: Teilprozess bekommt Inhalt aus dem verknüpften Diagramm, je Bahn eine Ebene", async () => {
  const handbuch = await leseHandbuch(picture);
  assert.equal(handbuch.titel, "Seminar durchführen");
  assert.equal(handbuch.einfuehrung, "", "Prozessauslöser gehört vorerst nicht ins Handbuch");
  assert.deepEqual(handbuch.kapitel.map((k) => ({ titel: k.titel, eintraege: k.eintraege.map(gliederung) })), [{
    titel: "Verwaltung",
    eintraege: [
      { art: "teilprozess", name: "Anfrage bearbeiten", eintraege: [
        { art: "bahn", name: "Dozent", eintraege: [
          { art: "aufgabe", name: "Termin prüfen", eintraege: [] },
          { art: "aufgabe", name: "Seminar zusagen", eintraege: [] }
        ] },
        { art: "bahn", name: "Geschäftszimmer", eintraege: [{ art: "aufgabe", name: "Termin eintragen", eintraege: [] }] }
      ] },
      { art: "teilprozess", name: "Seminar durchführen", eintraege: [] },
      { art: "teilprozess", name: "Rechnung stellen", hinweis: "Siehe Modell „Rechnungswesen: Rechnung stellen“", eintraege: [] },
      { art: "teilprozess", name: "Mahnverfahren durchführen", hinweis: "Siehe Modell „Mahnverfahren durchführen“", eintraege: [] },
      { art: "teilprozess", name: "Veranstaltung im NLC bearbeiten", hinweis: "Siehe Modell „Veranstaltung im NLC bearbeiten“", eintraege: [] }
    ]
  }]);
});

test("PICTURE: nur das Beschreibungsfeld, keine Verbesserungsvorschläge, Nummerierung oder Farben", async () => {
  const { kapitel } = await leseHandbuch(picture);
  const [dozent] = kapitel[0].eintraege[0].eintraege;
  assert.equal(dozent.eintraege[0].arbeitshilfe, "Kalender auf freie Tage prüfen.");
  assert.equal(dozent.eintraege[1].arbeitshilfe, "Zusage per Mail.", "documentation hat Vorrang, kein doppelter Text");
  const eintragen = kapitel[0].eintraege[0].eintraege[1].eintraege[0];
  assert.equal(eintragen.arbeitshilfe, "Eintragen in:\n - Kalender & Liste\n  - Outlook\n - Trello", "HTML-Beschreibung als Text, ohne Verbesserungsvorschläge");
});

test("Handbuch: Aufzählungen im Text werden zu verschachtelten Listen im PDF", () => {
  const handbuch = { titel: "T", einfuehrung: "", kapitel: [{ titel: "K", eintraege: [{ art: "aufgabe", id: "a", name: "A", hinweis: "", wissen: {}, eintraege: [],
    arbeitshilfe: "Vorab:\n - Punkt eins\n  - Unterpunkt\n - Punkt zwei https://example.org\n - \n\nSchluss." }] }] };
  const inhalt = handbuchDokument(handbuch, { stand: "24.11.2026" }).content;
  const start = inhalt.findIndex((k) => k.text === "Vorab:");
  assert.ok(start > 0);
  const listeKnoten = inhalt[start + 1];
  assert.equal(listeKnoten.ul[0].text, "Punkt eins");
  assert.deepEqual(listeKnoten.ul[1], { ul: [{ text: "Unterpunkt" }] });
  assert.equal(listeKnoten.ul[2].text[1].link, "https://example.org");
  assert.equal(listeKnoten.ul.length, 3, "leerer Listenpunkt entfällt");
  assert.equal(inhalt[start + 2].text, "Schluss.");
});

test("Handbuch: Text, der mit einem eingerückten Listenpunkt beginnt, bleibt eine Ebene", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x">
  <bpmn:process id="P"><bpmn:task id="T" name="Prüfen"><bpmn:documentation> - Erster Punkt
 - Zweiter Punkt
  - Unterpunkt</bpmn:documentation></bpmn:task></bpmn:process>
</bpmn:definitions>`;
  const handbuch = await leseHandbuch(xml);
  const knoten = handbuchDokument(handbuch, { stand: "24.11.2026" }).content.find((k) => k.ul && k.style === "liste");
  assert.deepEqual(knoten.ul, [{ text: "Erster Punkt" }, { text: "Zweiter Punkt" }, { ul: [{ text: "Unterpunkt" }] }]);
});

test("PICTURE: PDF mit Bahnen unter dem Teilprozess und Hinweisen statt leerer Stellen", async () => {
  const dokument = handbuchDokument(await leseHandbuch(picture), { stand: "24.11.2026" });
  const texte = dokument.content.map((k) => k.text).filter((t) => typeof t === "string");
  for (const erwartet of ["1.1  Anfrage bearbeiten", "1.1.1  Dozent", "1.1.1.1  Termin prüfen", "1.1.2  Geschäftszimmer", "Keine Beschreibung hinterlegt.", "Siehe Modell „Rechnungswesen: Rechnung stellen“"]) {
    assert.ok(texte.includes(erwartet), `fehlt: ${erwartet}`);
  }
  assert.ok(!texte.some((t) => /Geht das schneller/.test(t)));
  assert.equal(texte.filter((t) => t === "Schwimmbahn").length, 2);
  assert.equal(texte.filter((t) => t === "Noch keine Arbeitshilfe hinterlegt.").length, 0);
  const pdf = await erzeugeHandbuch(picture, { stand: "24.11.2026" });
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
});

// Mehrere Dateien: PICTURE exportiert teils je Diagramm eine Datei
const geteiltHaupt = fs.readFileSync(path.join(__dirname, "fixtures", "picture-geteilt-haupt.bpmn"), "utf8");
const geteiltUnter = fs.readFileSync(path.join(__dirname, "fixtures", "picture-geteilt-unterdiagramm.bpmn"), "utf8");

test("Mehrere Dateien: nur das Hauptdiagramm ergibt den Hinweis auf das fehlende Unterdiagramm", async () => {
  const { kapitel } = await leseHandbuch(geteiltHaupt);
  const anfrage = kapitel[0].eintraege[0];
  assert.equal(anfrage.name, "Anfrage bearbeiten");
  assert.equal(anfrage.hinweis, "Siehe Modell „Anfrage bearbeiten“");
  assert.deepEqual(anfrage.eintraege, []);
});

test("Mehrere Dateien: Unterdiagramm aus anderer Datei wird eingehängt, Reihenfolge der Dateien egal", async () => {
  const zusammen = await leseHandbuch([{ name: "unter.bpmn", xml: geteiltUnter }, { name: "haupt.bpmn", xml: geteiltHaupt }]);
  const eineDatei = await leseHandbuch(picture);
  assert.deepEqual(zusammen.kapitel.map((k) => ({ titel: k.titel, eintraege: k.eintraege.map(gliederung) })),
    eineDatei.kapitel.map((k) => ({ titel: k.titel, eintraege: k.eintraege.map(gliederung) })));
  assert.equal(zusammen.titel, "Seminar durchführen");
});

test("Mehrere Dateien: weitere Prozesse als eigene Kapitel mit Zusatz, gleiche IDs stören nicht", async () => {
  const einzeln = await leseHandbuch(teilprozesse);
  const doppelt = await leseHandbuch([teilprozesse, teilprozesse]);
  assert.equal(doppelt.kapitel.length, einzeln.kapitel.length * 2);
  assert.deepEqual(doppelt.kapitel.slice(0, einzeln.kapitel.length).map((k) => k.titel), einzeln.kapitel.map((k) => k.titel));
  assert.ok(doppelt.kapitel.slice(einzeln.kapitel.length).every((k, i) => k.titel === `${einzeln.kapitel[i].titel} (Stadtkasse)`));
  assert.deepEqual(doppelt.kapitel[einzeln.kapitel.length].eintraege.map(gliederung), einzeln.kapitel[0].eintraege.map(gliederung));
});

test("Mehrere Dateien: kaputte Datei wird mit Namen gemeldet", async () => {
  await assert.rejects(leseHandbuch([{ name: "gut.bpmn", xml: geteiltHaupt }, { name: "kaputt.bpmn", xml: "<kein xml" }]), /„kaputt\.bpmn“/);
  await assert.rejects(leseHandbuch([]), HandbuchFehler);
});
