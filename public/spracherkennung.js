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
            erkennung.onFinal(ergebnis[0].transcript.trim());
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
