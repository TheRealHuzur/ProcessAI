// Spracherkennung, austauschbar gehalten. Zwei Varianten mit gleicher Schnittstelle:
// start(), stop(), istVerfuegbar, aktiv, Rückrufe onFinal, onZwischen, onStatus.
// - browser: Spracherkennung des Browsers (Chrome), Audio geht an Google, nur für Tests
// - server: Aufnahme im Browser, Erkennung über /api/sprache auf dem eigenen Server (Whisper)
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

  // Aufnahme in Abschnitten, geschnitten an Sprechpausen. Jeder Abschnitt geht schon während der Aufnahme
  // an den Server, nach dem Stopp bleibt nur der letzte zu verschriften. "beschaeftigt" gilt von start()
  // bis der letzte Abschnitt verschriftet ist; erst dann kommt onStatus({ beendet }).
  function erzeugeServerErkennung() {
    const kannAufnehmen = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && window.AudioContext);
    const erkennung = {
      istVerfuegbar: kannAufnehmen,
      aktiv: false,
      beschaeftigt: false,
      onFinal: () => {},
      onZwischen: () => {},
      onStatus: () => {},
      start,
      stop
    };
    if (!kannAufnehmen) return erkennung;

    const FRUEHESTENS_MS = 6000; // kürzere Abschnitte verlieren Zusammenhang
    const SPAETESTENS_MS = 30000; // längere Abschnitte machen das Warten nach dem Stopp lang
    const PAUSE_MS = 700; // so lange leise gilt als Sprechpause
    const SCHWELLE = 0.015; // Lautstärke (RMS), ab der jemand spricht
    const HOERBAR = 0.004; // Abschnitte ganz ohne Ton werden nicht geschickt
    const TAKT_MS = 100;

    let strom = null;
    let kontext = null;
    let analyse = null;
    let puffer = null;
    let takt = null;
    let rekorder = null;
    let beginn = 0;
    let letzteSprache = 0;
    let sprachMs = 0;
    let spitze = 0;
    let offen = 0;
    let warteschlange = Promise.resolve();
    let vorher = "";

    function audioTyp() {
      return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((typ) => MediaRecorder.isTypeSupported(typ)) || "";
    }

    function pegel() {
      analyse.getFloatTimeDomainData(puffer);
      let summe = 0;
      for (let i = 0; i < puffer.length; i += 1) summe += puffer[i] * puffer[i];
      return Math.sqrt(summe / puffer.length);
    }

    // Jeder Abschnitt ist eine eigene, vollständige Datei, deshalb je Abschnitt ein neuer Rekorder
    function neuerAbschnitt() {
      const typ = audioTyp();
      const r = new MediaRecorder(strom, typ ? { mimeType: typ } : undefined);
      const teile = [];
      r.ondataavailable = (event) => {
        if (event.data && event.data.size) teile.push(event.data);
      };
      r.onstop = () => {
        const audio = new Blob(teile, { type: (r.mimeType || typ || "audio/webm").split(";")[0] });
        if (r.letzter) aufraeumen();
        if (audio.size && r.hoerbar) verschrifte(audio);
        else abschnittErledigt();
      };
      r.start();
      rekorder = r;
      beginn = Date.now();
      letzteSprache = beginn;
      sprachMs = 0;
      spitze = 0;
    }

    function schneide({ letzter = false } = {}) {
      const r = rekorder;
      if (!r) return;
      r.hoerbar = sprachMs > 0 || spitze >= HOERBAR;
      r.letzter = letzter;
      rekorder = null;
      offen += 1;
      r.stop();
      if (!letzter) neuerAbschnitt();
    }

    function beobachte() {
      const jetzt = Date.now();
      const wert = pegel();
      spitze = Math.max(spitze, wert);
      if (wert >= SCHWELLE) {
        letzteSprache = jetzt;
        sprachMs += TAKT_MS;
      }
      const dauer = jetzt - beginn;
      const pause = jetzt - letzteSprache >= PAUSE_MS;
      if ((dauer >= FRUEHESTENS_MS && pause && sprachMs > 0) || dauer >= SPAETESTENS_MS) schneide();
    }

    // Abschnitte nacheinander, damit der Text in der richtigen Reihenfolge ankommt
    function verschrifte(audio) {
      warteschlange = warteschlange.then(async () => {
        try {
          const res = await fetch("/api/sprache", {
            method: "POST",
            headers: { "Content-Type": audio.type, "X-Vorher": encodeURIComponent(vorher.slice(-200)) },
            body: audio,
            credentials: "same-origin"
          });
          const daten = await res.json().catch(() => null);
          if (!res.ok) throw new Error((daten && daten.fehler) || `Fehler ${res.status}`);
          const text = String((daten && daten.text) || "").trim();
          if (text) {
            vorher = text;
            erkennung.onFinal(text, { abschnitt: true });
          }
        } catch (error) {
          erkennung.onStatus({ fehler: `Spracherkennung: ${error.message}` });
        } finally {
          abschnittErledigt();
        }
      });
    }

    function abschnittErledigt() {
      offen -= 1;
      if (!erkennung.aktiv && erkennung.beschaeftigt && offen === 0) {
        erkennung.beschaeftigt = false;
        erkennung.onStatus({ beendet: true });
      }
    }

    function aufraeumen() {
      if (strom) strom.getTracks().forEach((spur) => spur.stop());
      if (kontext) kontext.close().catch(() => {});
      strom = null;
      kontext = null;
      analyse = null;
    }

    async function start() {
      if (erkennung.aktiv) return;
      if (erkennung.beschaeftigt) {
        erkennung.onStatus({ fehler: "Die letzte Aufnahme wird noch verschriftet. Bitte einen Moment warten." });
        return;
      }
      erkennung.aktiv = true;
      let neuerStrom;
      try {
        neuerStrom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (error) {
        erkennung.aktiv = false;
        const meldungen = { NotAllowedError: "Das Mikrofon ist nicht freigegeben. Bitte im Browser erlauben.", NotFoundError: "Kein Mikrofon gefunden." };
        erkennung.onStatus({ fehler: meldungen[error.name] || `Das Mikrofon konnte nicht starten: ${error.message}` });
        return;
      }
      // Während der Freigabe schon wieder beendet
      if (!erkennung.aktiv) {
        neuerStrom.getTracks().forEach((spur) => spur.stop());
        return;
      }
      strom = neuerStrom;
      strom.getAudioTracks().forEach((spur) => spur.addEventListener("ended", stop));
      kontext = new AudioContext();
      kontext.resume().catch(() => {});
      analyse = kontext.createAnalyser();
      analyse.fftSize = 2048;
      puffer = new Float32Array(analyse.fftSize);
      kontext.createMediaStreamSource(strom).connect(analyse);
      vorher = "";
      offen = 0;
      erkennung.beschaeftigt = true;
      neuerAbschnitt();
      takt = setInterval(beobachte, TAKT_MS);
      erkennung.onStatus({ gestartet: true });
    }

    function stop() {
      if (!erkennung.aktiv) return;
      erkennung.aktiv = false;
      clearInterval(takt);
      takt = null;
      if (!erkennung.beschaeftigt) {
        erkennung.onStatus({ beendet: true });
        return;
      }
      erkennung.onStatus({ hinweis: "Die letzten Worte werden noch verschriftet …" });
      schneide({ letzter: true });
    }

    return erkennung;
  }

  // Whisper-Abschnitte enden an Sprechpausen, oft mitten im Satz, und Whisper markiert die Schnittstelle
  // mit "..." (am Ende des einen, am Anfang des nächsten Abschnitts). Geht es danach klein oder mit "..."
  // weiter, fallen die Punkte an der Schnittstelle weg. Schreibung und Satzzeichen bleiben sonst, wie Whisper sie liefert.
  function haengeAbschnittAn(bisher, abschnitt) {
    const roh = String(abschnitt || "").trim();
    const neu = roh.replace(/^(\.\.\.|…)\s*/, "");
    if (!neu) return bisher;
    let text = String(bisher || "");
    const fortsetzung = neu !== roh || /^\p{Ll}/u.test(neu);
    if (fortsetzung) text = text.replace(/\s*(\.\.\.|…)\s*$/, "");
    const trenner = text && !/\s$/.test(text) ? " " : "";
    return `${text}${trenner}${neu}`;
  }

  window.PPSprache = { browser: erzeugeBrowserErkennung, server: erzeugeServerErkennung, haengeAbschnittAn };
})();
