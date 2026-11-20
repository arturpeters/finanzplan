import type { Konto } from './konten'
import { monatsIndex, type Posten } from './posten'
import { basisMonat, rechnePrognose, type FreiModus } from './prognose'
import { supabase } from './supabase'
import type { Topf } from './toepfe'

export interface Abgleich {
  id: string
  konto_id: string
  datum: string // YYYY-MM-DD
  saldo: number
  erwartet: number | null
}

const CACHE_KEY = 'finanzplan.abgleiche'

// ---------- Rechnung ----------

/**
 * Was der Plan zum Ende des Monats `ziel` auf jedem aktiven Konto erwartet.
 * - Abgleich "Zahlungen dieses Monats noch nicht durch": ziel = Vormonat (Stand zum Monatsanfang)
 * - Abgleich "Zahlungen schon durch": ziel = laufender Monat (Stand zum Monatsende)
 * Ausgangspunkt ist der letzte bekannte Stand (siehe basisMonat). Liegt der nicht vor `ziel`,
 * erwartet der Plan keine Veränderung.
 */
export function erwarteteStaende(konten: Konto[], posten: Posten[], toepfe: Topf[], ziel: number, freiModus: FreiModus): Record<string, number> {
  const aktive = konten.filter((k) => k.aktiv)
  if (aktive.length === 0) return {}
  const basis = basisMonat(konten, ziel)
  const erwartet: Record<string, number> = {}
  if (ziel <= basis) {
    for (const k of aktive) erwartet[k.id] = k.startsaldo
    return erwartet
  }
  const p = rechnePrognose(konten, posten, toepfe, basis, ziel - basis, freiModus)
  const letzter = p.monate[p.monate.length - 1]
  for (const k of aktive) erwartet[k.id] = letzter.proKonto[k.id] ?? k.startsaldo
  return erwartet
}

/** Ist ein Abgleich fällig? Ja, wenn mindestens ein aktives Konto in diesem Monat noch keinen neuen Stand bekommen hat. */
export function abgleichFaellig(konten: Konto[], jetzt: number): boolean {
  const aktive = konten.filter((k) => k.aktiv)
  if (aktive.length === 0) return false
  return aktive.some((k) => monatsIndex(k.startsaldo_datum) < jetzt)
}

export interface AbgleichRunde {
  datum: string
  ist: number
  erwartet: number | null
  abweichung: number | null
  anzahl: number
}

/** Fasst gespeicherte Abgleiche pro Datum zusammen, neueste zuerst. */
export function runden(abgleiche: Abgleich[]): AbgleichRunde[] {
  const proDatum = new Map<string, Abgleich[]>()
  for (const a of abgleiche) proDatum.set(a.datum, [...(proDatum.get(a.datum) ?? []), a])
  const r2 = (x: number) => Math.round(x * 100) / 100
  return [...proDatum.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([datum, liste]) => {
      const ist = r2(liste.reduce((s, a) => s + a.saldo, 0))
      const mitErwartung = liste.filter((a) => a.erwartet !== null)
      const erwartet = mitErwartung.length ? r2(mitErwartung.reduce((s, a) => s + (a.erwartet ?? 0), 0)) : null
      const istMitErwartung = r2(mitErwartung.reduce((s, a) => s + a.saldo, 0))
      return { datum, ist, erwartet, abweichung: erwartet === null ? null : r2(istMitErwartung - erwartet), anzahl: liste.length }
    })
}

// ---------- Datenbank ----------

function schreibeCache(a: Abgleich[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(a))
  } catch {
    /* ignorieren */
  }
}

export function leseCache(): Abgleich[] {
  try {
    const roh = localStorage.getItem(CACHE_KEY)
    return roh ? (JSON.parse(roh) as Abgleich[]) : []
  } catch {
    return []
  }
}

export function loescheCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignorieren */
  }
}

export async function ladeAbgleiche(): Promise<{ abgleiche: Abgleich[]; offline: boolean }> {
  const { data, error } = await supabase.from('abgleiche').select('id,konto_id,datum,saldo,erwartet').order('datum', { ascending: false }).limit(500)
  if (error || !data) return { abgleiche: leseCache(), offline: true }
  const abgleiche = data.map((z) => ({ ...z, saldo: Number(z.saldo), erwartet: z.erwartet === null ? null : Number(z.erwartet) })) as Abgleich[]
  schreibeCache(abgleiche)
  return { abgleiche, offline: false }
}

export interface AbgleichEintrag {
  konto_id: string
  saldo: number
  erwartet: number | null
}

/**
 * Speichert einen Abgleich: Verlauf in "abgleiche" (pro Konto und Tag einmal, erneutes Speichern
 * am selben Tag überschreibt) und den neuen Stand als Ausgangspunkt im Konto.
 */
export async function speichereAbgleich(eintraege: AbgleichEintrag[], datum: string): Promise<string | null> {
  if (eintraege.length === 0) return null
  const { error } = await supabase
    .from('abgleiche')
    .upsert(eintraege.map((e) => ({ ...e, datum })), { onConflict: 'konto_id,datum' })
  if (error) return error.message
  for (const e of eintraege) {
    const { error: f } = await supabase.from('konten').update({ startsaldo: e.saldo, startsaldo_datum: datum }).eq('id', e.konto_id)
    if (f) return f.message
  }
  return null
}
