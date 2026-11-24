// Jedes Dockerfile muss alle Ordner kopieren, aus denen sein Startpunkt (mittelbar) importiert.
// Anlass: 24.11.2026 fehlte kern/ im Dockerfile des ProzessPiloten, das Deployment brach ab.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Alle lokalen Dateien, die von start aus über relative Importe erreicht werden
function erreichbar(start) {
  const gesehen = new Set();
  const offen = [path.join(ROOT, start)];
  while (offen.length) {
    const datei = offen.pop();
    if (gesehen.has(datei)) continue;
    gesehen.add(datei);
    const text = fs.readFileSync(datei, "utf8");
    for (const [, ziel] of text.matchAll(/(?:import|export)\s[^"']*?["'](\.{1,2}\/[^"']+)["']|import\s+["'](\.{1,2}\/[^"']+)["']/g).map((m) => [m[0], m[1] || m[2]])) {
      offen.push(path.resolve(path.dirname(datei), ziel));
    }
  }
  return [...gesehen].map((d) => path.relative(ROOT, d));
}

function kopiert(dockerfile) {
  const text = fs.readFileSync(path.join(ROOT, dockerfile), "utf8");
  return [...text.matchAll(/^COPY\s+(\S+)\s+\S+$/gm)].map((m) => m[1].replace(/\/$/, ""));
}

for (const [dockerfile, start] of [["Dockerfile", "server/index.js"], ["Dockerfile.portal", "portal/server.js"]]) {
  test(`${dockerfile} kopiert alles, was ${start} braucht`, () => {
    const quellen = kopiert(dockerfile);
    const fehlt = erreichbar(start).filter((datei) => !quellen.some((q) => datei === q || datei.startsWith(`${q}/`)));
    assert.deepEqual(fehlt, []);
  });
}

test("Dockerfile.portal enthält keinen KI-Code", () => {
  assert.ok(!kopiert("Dockerfile.portal").some((q) => q === "server" || q.startsWith("server/")));
  assert.ok(!erreichbar("portal/server.js").some((d) => d.startsWith("server/")));
});
