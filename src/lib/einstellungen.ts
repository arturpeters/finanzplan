import type { Konto } from './konten'
import { monatsSumme, type Posten } from './posten'
import type { FreiModus } from './prognose'
import type { Topf } from './toepfe'
import { supabase } from './supabase'

/** Einstellungen, die zwischen Handy und Laptop abgeglichen werden. */
export interface Einstellungen {
  frei_modus: FreiModus
  notgroschen_monate: number
  notgroschen_lebenshaltung: number
  notgroschen_konten: string[] | null // null = automatisch alle Tagesgeld-/Sparkonten
}

export const STANDARD: Einstellungen = {
  frei_modus: 'ausgeben',
  notgroschen_monate: 3,
  notgroschen_lebenshaltung: 0,
  notgroschen_konten: null,
}

const CACHE_KEY = 'finanzplan.einstellungen'
const FREI_KEY = 'finanzplan.prognose.frei' // wird von ladeFreiModus() gelesen

function merke(e: Einstellungen) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(e))
    localStorage.setItem(FREI_KEY, JSON.stringify(e.frei_modus))
  } catch {
    /* ignorieren */
  }
}

export function leseCache(): Einstellungen {
  try {
    const roh = localStorage.getItem(CACHE_KEY)
    return roh ? { ...STANDARD, ...(JSON.parse(roh) as Partial<Einstellungen>) } : STANDARD
  } catch {
    return STANDARD
  }
}

export function loescheCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignorieren */
  }
}

export async function ladeEinstellungen(): Promise<{ einstellungen: Einstellungen; offline: boolean }> {
  const { data, error } = await supabase
    .from('einstellungen')
    .select('frei_modus,notgroschen_monate,notgroschen_lebenshaltung,notgroschen_konten')
    .maybeSingle()
  if (error) return { einstellungen: leseCache(), offline: true }
  const e: Einstellungen = data
    ? { ...STANDARD, ...data, notgroschen_lebenshaltung: Number(data.notgroschen_lebenshaltung) }
    : // Noch nie gespeichert: bisherige Geräte-Einstellung übernehmen
      { ...STANDARD, frei_modus: leseCache().frei_modus }
  merke(e)
  return { einstellungen: e, offline: false }
}

export async function speichereEinstellungen(e: Einstellungen): Promise<string | null> {
  merke(e)
  const { error } = await supabase.from('einstellungen').upsert({ ...e, geaendert_am: new Date().toISOString() }, { onConflict: 'user_id' })
  return error ? error.message : null
}

// ---------- Notgroschen ----------

export interface Notgroschen {
  bedarfProMonat: number // Fixkosten (auf den Monat umgerechnet) + Lebenshaltung
  ziel: number
  ist: number // Kontostände minus das, was dort für Töpfe angespart ist
  reserviert: number // für Töpfe angespart auf diesen Konten
  konten: Konto[]
  erreicht: boolean
  anteil: number
}

/** Welche Konten zählen? Gewählte – sonst automatisch alle aktiven Tagesgeld-/Sparkonten. */
export function notgroschenKonten(konten: Konto[], e: Einstellungen): Konto[] {
  const aktive = konten.filter((k) => k.aktiv)
  if (e.notgroschen_konten) return aktive.filter((k) => e.notgroschen_konten!.includes(k.id))
  return aktive.filter((k) => k.art === 'tagesgeld')
}

export function notgroschen(konten: Konto[], posten: Posten[], e: Einstellungen, jetzt: number, toepfe: Topf[] = []): Notgroschen | null {
  if (e.notgroschen_monate <= 0) return null
  const r2 = (x: number) => Math.round(x * 100) / 100
  const bedarfProMonat = r2(monatsSumme(posten, jetzt).fixkosten + e.notgroschen_lebenshaltung)
  const ziel = r2(bedarfProMonat * e.notgroschen_monate)
  const ks = notgroschenKonten(konten, e)
  const ids = new Set(ks.map((k) => k.id))
  // Geld, das für Töpfe angespart ist, ist schon verplant – es ist kein Notgroschen
  const reserviert = r2(toepfe.filter((t) => t.aktiv && !t.erledigt && t.konto_id && ids.has(t.konto_id)).reduce((s, t) => s + t.angespart, 0))
  const ist = Math.max(0, r2(ks.reduce((s, k) => s + Math.max(0, k.startsaldo), 0) - reserviert))
  return { bedarfProMonat, ziel, ist, reserviert, konten: ks, erreicht: ziel > 0 && ist >= ziel, anteil: ziel > 0 ? Math.min(1, ist / ziel) : 0 }
}
