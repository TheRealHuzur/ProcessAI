// Handbuch-Generator: hochladen, Liste der Modelle, Handbuch als PDF
(function () {
  "use strict";
  const { api, zeigeMeldung, datum, el, abmelden } = Portal;
  const A = "/api/m/handbuch";
  const meldung = (text, art) => zeigeMeldung(document.getElementById("meldung"), text, art);

  function zeigeListe(uploads) {
    const body = document.getElementById("liste");
    body.replaceChildren();
    if (!uploads.length) {
      body.append(el("tr", {}, el("td", { colspan: 5, class: "leer", text: "Noch keine Modelle hochgeladen." })));
      return;
    }
    for (const u of uploads) {
      const ok = u.status === "ok";
      body.append(el("tr", {},
        el("td", {}, el("strong", { text: u.titel || u.dateiname }), el("div", { class: "klein", text: u.dateiname })),
        el("td", { class: "klein", "data-titel": "Hochgeladen", text: datum(u.hochgeladen) }),
        el("td", { "data-titel": "Version", text: String(u.version) }),
        el("td", {}, el("span", { class: ok ? "status-ok" : "status-fehler", text: ok ? "lesbar" : "nicht lesbar" }), u.meldung ? el("div", { class: "klein", text: u.meldung }) : null),
        el("td", {}, ok
          ? el("a", { class: "btn btn-primaer btn-klein", href: `${A}/uploads/${encodeURIComponent(u.id)}/handbuch.pdf`, text: "Handbuch (PDF)" })
          : null)
      ));
    }
  }

  async function laden() {
    const d = await api(`${A}/uploads`);
    zeigeListe(d.uploads);
  }

  async function hochladen(dateien) {
    const ergebnisse = [];
    for (const datei of dateien) {
      meldung(`Lade ${datei.name} hoch ...`, "ok");
      try {
        const d = await api(`${A}/uploads`, { method: "POST", roh: true, body: datei, headers: { "Content-Type": "application/octet-stream", "X-Dateiname": encodeURIComponent(datei.name) } });
        ergebnisse.push(d.upload.status === "ok" ? `${datei.name}: hochgeladen.` : `${datei.name}: hochgeladen, aber nicht lesbar (${d.upload.meldung}).`);
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          location.href = "/";
          return;
        }
        ergebnisse.push(`${datei.name}: ${error.message}`);
      }
    }
    meldung(ergebnisse.join(" "), ergebnisse.every((e) => e.endsWith("hochgeladen.")) ? "ok" : "fehler");
    await laden();
  }

  const eingabe = document.getElementById("datei");
  eingabe.addEventListener("change", () => {
    if (eingabe.files.length) hochladen([...eingabe.files]);
    eingabe.value = "";
  });
  const ablage = document.getElementById("ablage");
  ablage.addEventListener("dragover", (e) => { e.preventDefault(); ablage.classList.add("ueber"); });
  ablage.addEventListener("dragleave", () => ablage.classList.remove("ueber"));
  ablage.addEventListener("drop", (e) => {
    e.preventDefault();
    ablage.classList.remove("ueber");
    if (e.dataTransfer.files.length) hochladen([...e.dataTransfer.files]);
  });
  document.getElementById("btn-abmelden").addEventListener("click", abmelden);

  api("/api/sitzung").then((s) => {
    if (!s.angemeldet) {
      location.href = "/";
      return;
    }
    document.getElementById("mandant-name").textContent = s.mandant.name;
    laden().catch((error) => meldung(error.message, "fehler"));
  });
})();
