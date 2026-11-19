import { monatsIndex } from './posten'
import { supabase } from './supabase'

export interface Topf {
  id: string
  name: string
  zielbetrag: number
  zielmonat: string // YYYY-MM-01: Monat, in dem das Geld gebraucht wird
  angespart: number
  konto_id: string | null
  aktiv: boolean
  erledigt: boolean
  letzte_einzahlung: number | null // Betrag der letzten Einzahlung über "+ eingezahlt"
  letzte_einzahlung_monat: string | null // YYYY-MM-01
}

export type TopfEingabe = Omit<Topf, 'id'>

const CACHE_KEY = 'finanzplan.toepfe'
const SPALTEN = 'id,name,zielbetrag,zielmonat,angespart,konto_id,aktiv,erledigt,letzte_einzahlung,letzte_einzahlung_monat'

// ---------- Rechnung ----------

export type TopfStatus = 'laeuft' | 'erreicht' | 'faellig' | 'erledigt' | 'pausiert'

export interface TopfInfo {
  status: TopfStatus
  rest: number // was noch fehlt
  monateUebrig: number // Monate, in denen noch gespart werden kann (vor dem Zielmonat)
  rate: number // pro Monat, aufgerundet auf volle Cent
  fortschritt: number // 0–1
  dieserMonatEingezahlt: boolean
}

/**
 * Monatsrate für einen Topf im Monat `jetzt`.
 * Gespart wird in den Monaten VOR dem Zielmonat: Ziel Juli, jetzt November → Nov bis Juni = 8 Monate.
 * Ist der Zielmonat erreicht oder vorbei, gibt es keine Rate mehr (Status "fällig").
 */
export function topfInfo(t: Topf, jetzt: number): TopfInfo {
  const r2 = (x: number) => Math.round(x * 100) / 100
  const rest = Math.max(0, r2(t.zielbetrag - t.angespart))
  const fortschritt = t.zielbetrag > 0 ? Math.min(1, t.angespart / t.zielbetrag) : 1
  const monateUebrig = Math.max(0, monatsIndex(t.zielmonat) - jetzt)
  const dieserMonatEingezahlt =
    t.letzte_einzahlung_monat !== null && t.letzte_einzahlung !== null && monatsIndex(t.letzte_einzahlung_monat) === jetzt
  const basis = { rest, monateUebrig, fortschritt, dieserMonatEingezahlt }
  if (t.erledigt) return { ...basis, status: 'erledigt', rate: 0 }
  if (!t.aktiv) return { ...basis, status: 'pausiert', rate: 0 }
  // Rate wird vom Stand am Monatsanfang aus gerechnet: eine Einzahlung in diesem Monat
  // senkt die Rate nicht, sondern ist die Rate dieses Monats.
  const restAmMonatsanfang = dieserMonatEingezahlt ? r2(rest + (t.letzte_einzahlung ?? 0)) : rest
  if (restAmMonatsanfang === 0) return { ...basis, status: 'erreicht', rate: 0 }
  if (monateUebrig === 0) return { ...basis, status: rest === 0 ? 'erreicht' : 'faellig', rate: 0 }
  const rate = Math.min(restAmMonatsanfang, Math.ceil((restAmMonatsanfang / monateUebrig) * 100) / 100)
  return { ...basis, status: rest === 0 ? 'erreicht' : 'laeuft', rate }
}

/** Summe aller Monatsraten im Monat `jetzt`. */
export function toepfeRate(toepfe: Topf[], jetzt: number): number {
  const s = toepfe.reduce((sum, t) => sum + topfInfo(t, jetzt).rate, 0)
  return Math.round(s * 100) / 100
}

/**
 * Töpfe-Rate in einem Monat `m` ab heute (`jetzt`).
 * Annahme: Du zahlst ab jetzt jeden Monat die geplante Rate ein – dann bleibt sie bis zum Zielmonat gleich.
 */
export function toepfeRateIm(toepfe: Topf[], m: number, jetzt: number): number {
  let s = 0
  for (const t of toepfe) {
    const info = topfInfo(t, jetzt)
    if (info.rate === 0) continue
    if (m === jetzt) s += info.rate
    else if (info.status === 'laeuft' && m > jetzt && m < monatsIndex(t.zielmonat)) s += info.rate
  }
  return Math.round(s * 100) / 100
}

// ---------- Datenbank ----------

function ausDb(z: Record<string, unknown>): Topf {
  return { ...(z as unknown as Topf), zielbetrag: Number(z.zielbetrag), angespart: Number(z.angespart) }
}

function schreibeCache(toepfe: Topf[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(toepfe))
  } catch {
    /* ignorieren */
  }
}

export function leseCache(): Topf[] {
  try {
    const roh = localStorage.getItem(CACHE_KEY)
    return roh ? (JSON.parse(roh) as Topf[]) : []
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

export async function ladeToepfe(): Promise<{ toepfe: Topf[]; offline: boolean }> {
  const { data, error } = await supabase.from('toepfe').select(SPALTEN).order('zielmonat').order('name')
  if (error || !data) return { toepfe: leseCache(), offline: true }
  const toepfe = data.map(ausDb)
  schreibeCache(toepfe)
  return { toepfe, offline: false }
}

export async function speichereTopf(eingabe: TopfEingabe, id?: string): Promise<string | null> {
  const { error } = id ? await supabase.from('toepfe').update(eingabe).eq('id', id) : await supabase.from('toepfe').insert(eingabe)
  return error ? error.message : null
}

export async function aendereTopf(id: string, felder: Partial<TopfEingabe>): Promise<string | null> {
  const { error } = await supabase.from('toepfe').update(felder).eq('id', id)
  return error ? error.message : null
}

export async function loescheTopf(id: string): Promise<string | null> {
  const { error } = await supabase.from('toepfe').delete().eq('id', id)
  return error ? error.message : null
}
