import { gibDateiAus } from './datei'
import { supabase } from './supabase'

// Reihenfolge = Reihenfolge beim Einspielen (Fremdschlüssel zuerst)
const TABELLEN = ['konten', 'szenarien', 'posten', 'toepfe', 'abgleiche', 'listen', 'listen_positionen', 'einstellungen'] as const
type Tabelle = (typeof TABELLEN)[number]

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
  await gibDateiAus(JSON.stringify(inhalt, null, 2), `finanzplan-backup-${jetzt.toISOString().slice(0, 10)}.json`, 'application/json')
  return null
}

// ---------- Einspielen ----------

export interface Sicherung {
  exportiert_am: string
  anzahl: Record<string, number>
  daten: Partial<Record<Tabelle, Record<string, unknown>[]>>
}

/** Liest eine Sicherungsdatei und prüft, ob sie von dieser App stammt. */
export function leseSicherung(text: string): { sicherung: Sicherung | null; fehler: string | null } {
  let roh: unknown
  try {
    roh = JSON.parse(text)
  } catch {
    return { sicherung: null, fehler: 'Die Datei ist keine gültige Sicherung (kein JSON).' }
  }
  const s = roh as { app?: unknown; format?: unknown; daten?: unknown; exportiert_am?: unknown }
  if (s.app !== 'finanzplan' || s.format !== 1 || typeof s.daten !== 'object' || s.daten === null) {
    return { sicherung: null, fehler: 'Die Datei ist keine Sicherung dieser App.' }
  }
  const daten: Sicherung['daten'] = {}
  const anzahl: Record<string, number> = {}
  for (const t of TABELLEN) {
    const liste = (s.daten as Record<string, unknown>)[t]
    if (liste === undefined) continue
    if (!Array.isArray(liste) || liste.some((z) => typeof z !== 'object' || z === null)) {
      return { sicherung: null, fehler: `Die Sicherung ist beschädigt (${t}).` }
    }
    // user_id nie übernehmen – die Datenbank setzt immer den angemeldeten Nutzer
    daten[t] = (liste as Record<string, unknown>[]).map(({ user_id: _u, ...rest }) => rest)
    anzahl[t] = liste.length
  }
  return { sicherung: { exportiert_am: String(s.exportiert_am ?? ''), anzahl, daten }, fehler: null }
}

/**
 * Spielt eine Sicherung ein, ohne etwas zu löschen:
 * Einträge mit derselben ID werden auf den Stand der Sicherung gesetzt, fehlende werden wieder angelegt,
 * alles, was seitdem neu dazugekommen ist, bleibt.
 */
export async function spieleEin(s: Sicherung): Promise<string | null> {
  for (const t of TABELLEN) {
    const zeilen = s.daten[t]
    if (!zeilen || zeilen.length === 0) continue

    if (t === 'konten') {
      // Unterkonten verweisen auf Hauptkonten: erst ohne Verweis anlegen, dann Verweise setzen
      const ohneVerweis = zeilen.map((z) => ({ ...z, oberkonto_id: null }))
      const { error } = await supabase.from('konten').upsert(ohneVerweis, { onConflict: 'id' })
      if (error) return `Einspielen fehlgeschlagen (konten): ${error.message}`
      for (const z of zeilen.filter((z) => z.oberkonto_id)) {
        const { error: f } = await supabase.from('konten').update({ oberkonto_id: z.oberkonto_id }).eq('id', z.id as string)
        if (f) return `Einspielen fehlgeschlagen (Unterkonten): ${f.message}`
      }
      continue
    }

    const konflikt = t === 'einstellungen' ? 'user_id' : t === 'abgleiche' ? 'konto_id,datum' : 'id'
    const daten = t === 'abgleiche' ? zeilen.map(({ id: _id, ...rest }) => rest) : zeilen
    const { error } = await supabase.from(t).upsert(daten, { onConflict: konflikt })
    if (error) return `Einspielen fehlgeschlagen (${t}): ${error.message}`
  }
  return null
}
