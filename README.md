# Finanzplan (Arbeitstitel)

Eine App, um Geld zu **planen** statt jede Buchung zu tracken: feste Einnahmen, Fixkosten, Töpfe für geplante Ausgaben, Vermögensprognose und ein kurzer monatlicher Abgleich mit den echten Kontoständen.

Läuft als installierbare Web-App (PWA) auf Android und am Laptop. Die Daten werden über Supabase zwischen den Geräten abgeglichen.

## Stand

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Grundgerüst, Hosting, Supabase-Projekt, Hell/Dunkel | fertig |
| 1 | Login und Konten (Unterkonten, aktiv, ausgeblendet) | fertig, auf dem Gerät noch nicht getestet |
| 2 | Posten (Einnahmen, Fixkosten, Umbuchungen) und „Frei pro Monat“ | fertig, auf dem Gerät noch nicht getestet |
| 3 | Töpfe | fertig, auf dem Gerät noch nicht getestet |
| 4 | Prognose mit Diagramm | fertig, auf dem Gerät noch nicht getestet |
| 5 | Monatsabgleich | fertig, auf dem Gerät noch nicht getestet |
| 7 | Export/Backup, Feinschliff | fertig |
| 1.1 | Szenarien | fertig, auf dem Gerät noch nicht getestet |
| 1.2 | Echter Monat statt Durchschnitt, Einkaufslisten | fertig, auf dem Gerät noch nicht getestet |
| 1.3 | Einkaufslisten auf Übersicht, Links, Beträge ausblenden, Sparquote, Notgroschen, Kündigungsfristen, Kategorien, Kalender-Erinnerung, Einstellungen-Abgleich, Sicherung einspielen | fertig, auf dem Gerät noch nicht getestet |
| 1.4 | Logik-Prüfung (7 Korrekturen), Budget für Einkaufslisten mit Rechner, Muss/Wunsch, Kaufmonat | fertig, auf dem Gerät noch nicht getestet |

## Begriffe

- **Deaktiviert:** Ein Konto zählt nirgends mehr mit.
- **Ausgeblendet:** Ein Konto zählt weiter mit, wird nur nicht angezeigt.
- **Kredit:** Die Restschuld wird positiv eingegeben und als Minusbetrag gespeichert.
- **Frei im Monat (echter Monat):** Einnahmen − alles, was in diesem Monat wirklich abgebucht wird (auch Jahresabos voll in ihrem Monat) − Sparen − Töpfe − geplante Einkäufe. Planen hat eine Monatsauswahl; Übersicht und Planen zeigen die nächste Sonderzahlung. Die Prognose gibt im Modus „ausgeben“ genau dieses freie Geld des jeweiligen Monats aus.
- **Topf:** Sparziel mit Betrag und Monat. Monatsrate = noch fehlender Betrag ÷ Monate vor dem Zielmonat (Ziel Juli, jetzt November → 8 Monate), auf volle Cent aufgerundet. „+ eingezahlt“ merkt sich Betrag und Monat, damit die Rate im laufenden Monat nicht fälschlich sinkt. Frei pro Monat = Einnahmen − Fixkosten − Sparen − Töpfe.
- **Prognose:** Startet beim heutigen Stand der aktiven Konten und rechnet ab dem nächsten Monat. Posten zählen im Monat ihrer echten Fälligkeit, Töpfe schieben ihre Rate aufs Topf-Konto und geben im Zielmonat den Zielbetrag aus, Depots wachsen mit ihrer Rendite. Das freie Geld wird je nach Einstellung ausgegeben (Standard), halb oder ganz gespart. Warnung, wenn ein Konto (außer Kredit) ins Minus rutscht.
- **Monatsabgleich:** Echte Kontostände eintragen. Die App fragt, ob die Zahlungen des Monats schon durch sind (bis zum 5. ist „nein“ vorausgewählt). „Nein“ → gespeichert als Stand zum 1. (= Ende des Vormonats), der laufende Monat wird in der Prognose noch gerechnet. „Ja“ → gespeichert mit heutigem Datum (= Stand zum Monatsende), der laufende Monat gilt als erledigt. Allgemein gilt: Datum am 1. = Monatsanfang, jeder andere Tag = Monatsende. Jedes Konto läuft in der Prognose ab seinem eigenen letzten Stand weiter. Der erwartete Wert wird mitgespeichert (Plan vs. Ist).
- **Szenario:** „Was wäre, wenn …“ – zusätzliche Posten plus Grundplan-Posten, die wegfallen. Ändert den echten Plan nicht; erscheint in der Prognose als gestrichelte Linie. Annahme: Der Lebensstil bleibt gleich, d. h. das ausgegebene freie Geld wird aus dem Grundplan berechnet – Mehrkosten gehen vom Ersparten ab.
- **Einkaufsliste:** Mehrere Listen mit Positionen (Preis, geplanter Monat). Offene Positionen mit Monat zählen dort als einmalige Ausgabe (überfällige im laufenden Monat), Positionen ohne Monat sind nicht im Plan. Abgehakt = ausgegeben, optional mit echtem Preis; die App merkt sich den Kaufmonat. Gekaufte zählen in ihrem Kaufmonat weiter (sonst würde „Frei“ nach dem Abhaken steigen) und im Plan-Wert beim Abgleich, aber nie doppelt vor einem bekannten Kontostand. Bewusst kein Verlauf – planen, nicht tracken.
- **Budget (Einkaufsliste):** Optionaler Gesamtbetrag pro Liste. Rechner: Budget, Eingeplant (gekauft + offen), Ausgegeben, Noch frei bzw. Über Budget. Beim Hinzufügen zeigt die App live, ob die Position noch passt. Positionen sind „Muss“ oder „Wunsch“; bei Überschreitung schlägt die App vor, welche Wünsche (teuerste zuerst) gestrichen werden könnten. Günstiger gekauft → Ersparnis wird angezeigt.
- **Notgroschen:** Ziel = Monate × (Fixkosten pro Monat, Jahresabos anteilig + Lebenshaltung). Zählt die gewählten Konten, ohne Auswahl alle Tagesgeld-/Sparkonten – abzüglich des Geldes, das dort für Töpfe angespart ist.
- **Sparquote:** (Sparen + Töpfe) ÷ Einnahmen im laufenden Monat.
- **Sicherung einspielen:** Nichts wird gelöscht. Einträge mit gleicher ID werden auf den Stand der Sicherung gesetzt, fehlende kommen zurück, Neues bleibt.
- **Einstellungen-Abgleich:** Prognose-Modus und Notgroschen liegen in der Tabelle `einstellungen` und gelten auf allen Geräten. „Beträge ausblenden“ und Hell/Dunkel bleiben bewusst pro Gerät.
- **Umbuchung:** Geld zwischen eigenen Konten (z. B. Sparrate). Ändert das Vermögen nicht. Vom Standardkonto (Giro) weg = Sparen, verringert „Frei“. Zum Standardkonto hin = Entnahme, erhöht „Frei“. Zwischen zwei anderen Konten (Tagesgeld → Depot) = neutral.

## Technik

- React + Vite + TypeScript, `vite-plugin-pwa`
- Supabase (Projekt `finanz-planung`, Region Frankfurt): Login per E-Mail und Passwort, Postgres mit Row Level Security (jeder Nutzer sieht nur seine eigenen Zeilen)
- Hosting: GitHub Pages über `.github/workflows/deploy.yml`
- `.github/workflows/wach-halten.yml` liest alle 3 Tage eine Zeile, damit das kostenlose Supabase-Projekt nicht pausiert
- Datenbankschema: `supabase/migrations/`

## Lokal starten

```bash
npm install
npm run dev
```
