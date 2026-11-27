# Zyklus – symptothermale Aufzeichnung (Sensiplan-Regeln)

Web-App fürs iPhone. Der Code liegt auf GitHub Pages, die Zyklusdaten bleiben ausschließlich auf dem Gerät.

## Einrichten (einmalig, ca. 10 Minuten)

1. Auf github.com ein neues Repository anlegen, z. B. `zyklus`, Sichtbarkeit **Public** (GitHub Pages ist für private Repos nur mit Bezahl-Account möglich). Im Repo liegen nur Programmdateien, keine persönlichen Daten.
2. „Add file“ → „Upload files“ → alle Dateien dieses Ordners hochladen (`index.html`, `nfp.js`, `sw.js`, `manifest.webmanifest`, die drei `icon-*.png`, diese README) → „Commit changes“.
3. Settings → Pages → Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
4. Nach ein bis zwei Minuten ist die App erreichbar unter `https://<dein-github-name>.github.io/zyklus/`.

## Aufs iPhone

1. Die Adresse in **Safari** öffnen.
2. Teilen-Symbol → „Zum Home-Bildschirm“ → Hinzufügen.
3. Ab jetzt **nur noch über das Symbol auf dem Home-Bildschirm** starten. Die Home-Bildschirm-App hat einen eigenen Speicher: Daten, die im normalen Safari-Tab eingetragen wurden, sind dort nicht sichtbar.

Die App funktioniert danach auch offline.

## Datensicherung

- Unter „Mehr“ → „Daten sichern“ wird eine JSON-Datei erzeugt. In „Dateien“ → iCloud Drive speichern.
- Die App erinnert nach 30 Tagen ohne Sicherung.
- Wird die App vom Home-Bildschirm gelöscht oder Safari-Websitedaten werden gelöscht, sind die Daten ohne Sicherung weg.
- Wiederherstellen oder Gerätewechsel: „Sicherung laden“.

## Updates

Geänderte Dateien im Repo ersetzen. Die App lädt beim nächsten Start mit Internet die neue Version, die Daten bleiben erhalten.

## Ausprobieren

„Mehr“ → „Demo mit Beispieldaten starten“ zeigt 14 Beispielzyklen, ohne die eigenen Daten anzufassen.

## Ausgewertete Regeln

- **Ende der fruchtbaren Zeit (doppelte Kontrolle):** Temperatur „3 über 6“ mit Hilfslinie und 0,2-°C-Regel, 1. und 2. Ausnahmeregel (nicht kombinierbar), Ausklammern von Störwerten; Schleimhöhepunkt + 3 Tage. Unfruchtbar ab dem Abend, an dem beide Bedingungen erfüllt sind.
- **Beginn der fruchtbaren Zeit:** 5-Tage-Regel bis 12 ausgewertete Zyklen, dann Minus-8-Regel (früher, sobald sie einen früheren Tag ergibt). Erster Schleim oder Feuchtigkeit beendet die relativ unfruchtbare Phase sofort.
- **Zusätzliche App-Vorsichtsregeln:** keine relativ unfruchtbaren Tage im ersten Zyklus und nach Zyklen ohne bestätigten Temperaturanstieg; fehlender Schleimeintrag beendet die relativ unfruchtbare Phase; die 3 Tage nach dem Höhepunkt müssen lückenlos eingetragen sein; Messortwechsel verhindert die Temperaturauswertung. Optional: strenger Modus ganz ohne relativ unfruchtbare Tage.
- **Hinweise:** abweichende Messzeit, Lücken, Lernphase, ungeschützter Verkehr an fruchtbaren Tagen, kurze Hochlage, Hochlage über 18 Tage, ungewöhnliche Zykluslänge, Abstand zwischen Temperaturanstieg und Schleimhöhepunkt.

## Wichtig

Hilfsmittel zum Aufzeichnen, kein geprüftes Medizinprodukt. Ersetzt nicht das Erlernen der Methode („Natürlich & sicher – Das Praxisbuch“, Arbeitsgruppe NFP) und keine Beratung. Jede Auswertung selbst nachprüfen, besonders in den ersten Zyklen.
