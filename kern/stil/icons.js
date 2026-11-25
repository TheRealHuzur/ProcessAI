// ProzessPilot · Icons im Lucide-Stil (24er-Raster, 2 px Strich, Farbe über currentColor).
// Pfade aus Lucide (ISC-Lizenz, https://lucide.dev). Ein neues Werkzeug nennt in seinem Steckbrief
// nur den Namen; fehlt er hier, erscheint die Karte ohne Icon.
(function (global) {
  "use strict";

  const PFADE = {
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
  };

  // Liefert ein dekoratives <span class="pp-icon"> oder null, wenn der Name unbekannt ist
  function icon(name) {
    const pfade = PFADE[name];
    if (!pfade) return null;
    const span = document.createElement("span");
    span.className = "pp-icon";
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pfade}</svg>`;
    return span;
  }

  global.PPIcons = { icon, namen: Object.keys(PFADE) };
})(window);
