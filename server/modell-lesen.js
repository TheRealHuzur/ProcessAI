// Rücklesen des Modells aus BPMN-XML ins KI-JSON, dieselbe Datei wie im Browser (public/modell-lesen.js)
import BpmnModdle from "bpmn-moddle";
import { PPWissen } from "./wissen.js";
import "../public/modell-lesen.js";

export function neuesModdle() {
  return new BpmnModdle({ pp: PPWissen.descriptor });
}

// Ergebnis: { modell, abweichungen } wie im Browser
export async function leseModellAusXml(xml) {
  const { rootElement } = await neuesModdle().fromXML(xml);
  return globalThis.PPModellLesen.lesen(rootElement);
}
