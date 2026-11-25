# Styleguide ProzessPilot

Stand: 25.11.2026 · Grundlage: CI Wissen & Werkzeug · Freigegebenes Muster: Portal-Startseite Entwurf C3

Dieser Styleguide gilt für alle Oberflächen des ProzessPilot (Portal und Module wie das Logbuch). Neue Seiten werden nach diesem Muster gebaut. Die Werte stehen als CSS-Variablen und fertige Klassen in `prozesspilot.css`. Eine fertige Beispielseite ist `referenz-portal-startseite.html`.

**Ablage im Repo:** Stilvorlage, Schriften und Logo in `kern/stil/` (im Portal unter `/stil/` ausgeliefert, auch ohne Anmeldung). Dieser Styleguide und die Referenzseite in `docs/styleguide/`. Umgesetzt zuerst auf der Portal-Startseite (`portal/oberflaeche/index.html`).

## 1. Grundhaltung

- Hell, ruhig, sachlich. Viel Weißraum, wenige Farben.
- Türkis zeigt immer, wo man etwas tun kann: Buttons, Links, Icons, Kicker.
- Keine dunklen Flächen. Das tiefe Navy der Website (#0B162A) wird im ProzessPilot nicht verwendet.
- Keine Verläufe, keine Muster, kein Glaseffekt, keine Emoji.

## 2. Farben

| Rolle | Wert | Verwendung |
|---|---|---|
| Navy | `#2A314D` | Überschriften, Wortmarke "Prozess", Name der Organisation |
| Türkis | `#0E97AD` | Buttons, Links, Icons, Kicker, Wortmarke "Pilot" |
| Türkis Hover | `#097385` | Hover und gedrückter Zustand |
| Türkis hell | `#E5F4F6` | Band oben auf jeder Seite |
| Fließtext | `#484848` | Alle Texte |
| Weiß | `#FFFFFF` | Seitenhintergrund, Karten |
| Linie | `#E3E4E8` | Trennlinien Kopf- und Fußzeile |
| Linie stark | `#B9BCC4` | Formularfelder, gestrichelte Kontaktkarte |
| Erfolg | `#0E7A56` auf `#E7F4EF` | Status "Freigeschaltet", Erfolgsmeldungen |
| Fehler | `#B3261E` auf `#FBECEB` | Fehlermeldungen |

Keine weiteren Farben erfinden. Erfolg und Fehler nur für Status und Rückmeldungen.

## 3. Schrift

- **Montserrat** für Überschriften (700), Buttons, Navigation, Labels und Status (600).
- **Roboto** für Fließtext (400), Hervorhebungen (700).
- Größen: Seitenüberschrift 44 px (mobil 30), Kartentitel 24 px, Einleitung 19 px, Fließtext 16 px, Kleintext 14 px.
- Kicker (Eyebrow): Montserrat 700, 18 px, Großbuchstaben, 2 px Zeichenabstand, Türkis.
- Beide Schriften **lokal einbinden**, nicht von Google-Servern laden (DSGVO, wichtig für Organisationen des öffentlichen Dienstes).

## 4. Seitenaufbau

Jede Seite hat denselben Rahmen:

1. **Kopfzeile** weiß, unten 1 px Linie. Links Wortmarke "Prozess**Pilot**" (Montserrat 700, 24 px, "Pilot" in Türkis). Rechts Name der Organisation (Navy, 600) und "Abmelden" als Textbutton.
2. **Band** in Türkis hell. Kicker, Seitenüberschrift, ein Satz Einleitung. Unten 140 px Luft.
3. **Inhalt** im Container (max. 1140 px). Der Inhalt direkt nach dem Band ragt 96 px in das Band hinein, so liegen Karten halb auf dem Band.
4. **Fußzeile** weiß, oben 1 px Linie. Links Logo Wissen & Werkzeug (150 px breit), rechts "Testversion". Sonst nichts.

## 5. Bausteine

**Werkzeugkarte** (`.pp-card`)
Weiß, Radius 8 px, weicher Schatten, kein Rahmen, Mindesthöhe 300 px. Inhalt von oben: Icon 34 px in Türkis, Titelzeile mit Name und Status-Tag, ein bis zwei Sätze Beschreibung, Button unten mittig. Kein Grafikkopf. Raster mit `minmax(min(320px, 100%), 1fr)`, Abstand 28 px, auf dem Desktop drei Karten je Reihe (geändert am 25.11.2026: bei vier Karten passt "Handbuch erstellen" nicht einzeilig in die Karte, der Button würde kartenbreit).

**Kontaktkarte** (`.pp-card .pp-card--contact`)
Immer die letzte Karte im Raster. Gestrichelter Rahmen 2 px, kein Schatten, gleiche Höhe wie die Werkzeugkarten. Text kurz halten, damit die Karte nicht wächst.

**Buttons** (`.pp-btn`)
Primär: Türkis, weiße Schrift, Radius 8 px, Innenabstand 12 × 24 px, beim Hover dunkleres Türkis mit Schatten. Textbutton: nur türkise Schrift. Nie pillenförmig, nie über die volle Kartenbreite.

**Status-Tag** (`.pp-tag`)
Radius 4 px, Montserrat 600, 13 px. "Freigeschaltet" in Erfolgsgrün.

**Icons**
Linien-Icons im Lucide-Stil (24er-Raster, 2 px Strich, einfarbig Türkis). Empfehlung: Bibliothek `lucide` (ISC-Lizenz). Ein Icon je Werkzeug, auf der Karte 34 px, im Text 18 bis 22 px.

**Formulare und Meldungen** (`.pp-form`, `.pp-label`, `.pp-field`, `.pp-message`, Ergänzung vom 25.11.2026 für die Anmeldung)
Feld weiß mit 1 px Rahmen in Linie stark, Radius 8 px; Fokus türkis. Meldungen in Erfolg- oder Fehlerfarbe, Radius 4 px.

## 6. Bewegung und Zustände

- Übergänge 0,2 s, nur Farbe und Schatten. Kein Zoom, kein Hüpfen, keine Daueranimation.
- Karten verstärken beim Hover nur den Schatten.
- Fokus: 2 px Türkis-Rahmen, gut sichtbar (Tastaturbedienung).
- Fehler: roter Rahmen am Feld und kurzer Text darunter.

## 7. Texte

- Deutsch, die Nutzenden werden gesiezt.
- Kurz und sachlich, keine Superlative, keine Ausrufezeichen, keine Gedankenstriche.
- Buttons als Handlung, zwei bis drei Wörter: "Handbuch erstellen", "Kontakt aufnehmen".
- Überschriften ohne Punkt.

## 8. Barrierefreiheit

- Echte `<button>`- und `<a>`-Elemente, keine klickbaren `div`.
- Kontrast Text zu Hintergrund mindestens 4,5 : 1 (alle Farben oben erfüllen das in ihrer Rolle).
- Icons, die nur schmücken, mit `aria-hidden="true"`.
- Mobil (unter 767 px): Karten untereinander, Band und Überschrift kleiner.
