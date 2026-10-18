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
