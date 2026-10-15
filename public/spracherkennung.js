// Spracherkennung, austauschbar gehalten.
// Version 0.1: Spracherkennung des Browsers (Chrome). Später kann hier ein anderer Dienst eingesetzt werden,
// solange die Schnittstelle gleich bleibt: start(), stop(), istVerfuegbar, Rückrufe onFinal, onZwischen, onStatus.
(function () {
  "use strict";

  function erzeugeBrowserErkennung() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const erkennung = {
      istVerfuegbar: Boolean(Recognition),
      aktiv: false,
      onFinal: () => {},
      onZwischen: () => {},
      onStatus: () => {},
      start,
      stop
    };
    if (!Recognition) return erkennung;

    let instanz = null;
    let letzterFinal = "";

    function normal(text) {
      return String(text || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
    }

    // Chrome auf Android liefert denselben Satz oft mehrfach als "final",
    // jeweils etwas länger ("Also", "Also der", "Also der Prozess").
    // Solche Wiederholungen ersetzen den letzten Satz statt ihn anzuhängen.
    function istFortsetzung(alt, neu) {
      const a = normal(alt);
      const b = normal(neu);
      if (!a || !b) return false;
      if (a === b || b.startsWith(a) || a.startsWith(b)) return true;
      let gemeinsam = 0;
      while (gemeinsam < a.length && gemeinsam < b.length && a[gemeinsam] === b[gemeinsam]) gemeinsam += 1;
      return gemeinsam >= 6 && gemeinsam >= Math.min(a.length, b.length) * 0.6;
    }

    function meldeFinal(text) {
      const satz = String(text || "").trim();
      if (!satz) return;
      if (normal(satz) === normal(letzterFinal)) return;
      const ersetzt = istFortsetzung(letzterFinal, satz);
      letzterFinal = satz;
      erkennung.onFinal(satz, { ersetzt });
    }

    function neueInstanz() {
      const r = new Recognition();
      r.lang = "de-DE";
      r.continuous = true;
      r.interimResults = true;

      r.onresult = (event) => {
        let zwischen = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const ergebnis = event.results[i];
          if (ergebnis.isFinal) {
            meldeFinal(ergebnis[0].transcript);
          } else {
            zwischen += ergebnis[0].transcript;
          }
        }
        erkennung.onZwischen(zwischen.trim());
      };

      r.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        const meldungen = {
          "not-allowed": "Das Mikrofon ist nicht freigegeben. Bitte im Browser erlauben.",
          "service-not-allowed": "Die Spracherkennung ist in diesem Browser gesperrt.",
          "audio-capture": "Kein Mikrofon gefunden.",
          network: "Die Spracherkennung braucht eine Internetverbindung."
        };
        erkennung.onStatus({ fehler: meldungen[event.error] || `Spracherkennung: ${event.error}` });
        if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") {
          erkennung.aktiv = false;
        }
      };

      // Chrome beendet nach Pausen von selbst. Solange aktiv, einfach weitermachen.
      r.onend = () => {
        if (erkennung.aktiv) {
          try {
            r.start();
          } catch {
            erkennung.aktiv = false;
            erkennung.onStatus({ beendet: true });
          }
        } else {
          erkennung.onStatus({ beendet: true });
        }
      };

      return r;
    }

    function start() {
      if (erkennung.aktiv) return;
      letzterFinal = "";
      instanz = neueInstanz();
      erkennung.aktiv = true;
      try {
        instanz.start();
        erkennung.onStatus({ gestartet: true });
      } catch (error) {
        erkennung.aktiv = false;
        erkennung.onStatus({ fehler: `Spracherkennung konnte nicht starten: ${error.message}` });
      }
    }

    function stop() {
      erkennung.aktiv = false;
      if (instanz) instanz.stop();
    }

    return erkennung;
  }

  window.PPSprache = erzeugeBrowserErkennung();
})();
