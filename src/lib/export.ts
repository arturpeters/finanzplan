import { supabase } from './supabase'

const TABELLEN = ['konten', 'posten', 'toepfe', 'abgleiche', 'szenarien'] as const

/**
 * Lädt alle eigenen Daten frisch vom Server und speichert sie als JSON-Datei.
 * Gedacht als Sicherung: Supabase macht im kostenlosen Plan keine automatischen Backups.
 */
export async function exportiereDaten(): Promise<string | null> {
  const daten: Record<string, unknown[]> = {}
  for (const t of TABELLEN) {
    const { data, error } = await supabase.from(t).select('*')
    if (error) return `Export fehlgeschlagen (${t}): ${error.message}`
    // user_id weglassen – gehört zum Konto, nicht zu den Daten
    daten[t] = (data ?? []).map(({ user_id: _u, ...rest }) => rest)
  }
  const jetzt = new Date()
  const inhalt = {
    app: 'finanzplan',
    format: 1,
    exportiert_am: jetzt.toISOString(),
    anzahl: Object.fromEntries(TABELLEN.map((t) => [t, daten[t].length])),
    daten,
  }
  const datei = new Blob([JSON.stringify(inhalt, null, 2)], { type: 'application/json' })
  const name = `finanzplan-backup-${jetzt.toISOString().slice(0, 10)}.json`

  // Auf dem Handy bevorzugt über "Teilen" (z. B. in Google Drive speichern), sonst normaler Download
  const file = new File([datei], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return null
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null
      // sonst unten normal herunterladen
    }
  }
  const url = URL.createObjectURL(datei)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return null
}
