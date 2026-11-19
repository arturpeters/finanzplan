/** Gibt eine Datei an den Nutzer: am Handy über "Teilen", sonst als Download. */
export async function gibDateiAus(inhalt: string, name: string, typ: string): Promise<void> {
  const blob = new Blob([inhalt], { type: typ })
  const file = new File([blob], name, { type: typ })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      // sonst unten normal herunterladen
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Kalendertermin (.ics) für den Monatsabgleich: am 1. jedes Monats um 18 Uhr Ortszeit, mit Erinnerung.
 * "Schwebende" Ortszeit (ohne Zeitzone) – der Kalender nimmt die Zeitzone des Geräts.
 */
export function abgleichKalender(appUrl: string, jetzt = new Date()): string {
  const naechster = new Date(jetzt.getFullYear(), jetzt.getMonth() + 1, 1)
  const d = `${naechster.getFullYear()}${String(naechster.getMonth() + 1).padStart(2, '0')}01`
  const stempel = jetzt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Finanzplan//Monatsabgleich//DE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:monatsabgleich-${stempel}@finanzplan`,
    `DTSTAMP:${stempel}`,
    `DTSTART:${d}T180000`,
    'DURATION:PT10M',
    'RRULE:FREQ=MONTHLY;BYMONTHDAY=1',
    'SUMMARY:Finanzplan: Monatsabgleich',
    `DESCRIPTION:Echte Kontostände eintragen\\, ca. 2 Minuten.\\n${appUrl}`,
    `URL:${appUrl}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Monatsabgleich in Finanzplan',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
