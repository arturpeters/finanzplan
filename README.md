# Finanzplan (Arbeitstitel)

Eine App, um Geld zu **planen** statt jede Buchung zu tracken: feste Einnahmen, Fixkosten, Töpfe für geplante Ausgaben, Vermögensprognose und ein kurzer monatlicher Abgleich mit den echten Kontoständen.

Läuft als installierbare Web-App (PWA) auf Android und am Laptop. Die Daten werden über Supabase zwischen den Geräten abgeglichen.

## Stand

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Grundgerüst, Hosting, Supabase-Projekt, Hell/Dunkel | fertig |
| 1 | Login und Konten (Unterkonten, aktiv, ausgeblendet) | fertig, auf dem Gerät noch nicht getestet |
| 2 | Posten (Einnahmen, Fixkosten, Umbuchungen) und „Frei pro Monat“ | offen |
| 3 | Töpfe | offen |
| 4 | Prognose mit Diagramm | offen |
| 5 | Monatsabgleich | offen |
| 7 | Export/Backup, Feinschliff | offen |
| 1.1 | Szenarien | danach |

## Begriffe

- **Deaktiviert:** Ein Konto zählt nirgends mehr mit.
- **Ausgeblendet:** Ein Konto zählt weiter mit, wird nur nicht angezeigt.
- **Kredit:** Die Restschuld wird positiv eingegeben und als Minusbetrag gespeichert.

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
