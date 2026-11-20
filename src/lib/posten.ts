import { supabase } from './supabase'

export type PostenTyp = 'einnahme' | 'ausgabe' | 'umbuchung'
export type Rhythmus = 'monatlich' | 'vierteljaehrlich' | 'halbjaehrlich' | 'jaehrlich' | 'einmalig'

export const RHYTHMEN: { wert: Rhythmus; label: string; monate: number }[] = [
  { wert: 'monatlich', label: 'monatlich', monate: 1 },
  { wert: 'vierteljaehrlich', label: 'vierteljährlich', monate: 3 },
  { wert: 'halbjaehrlich', label: 'halbjährlich', monate: 6 },
  { wert: 'jaehrlich', label: 'jährlich', monate: 12 },
  { wert: 'einmalig', label: 'einmalig', monate: 0 },
]

export const KATEGORIEN = ['Wohnen', 'Mobilität', 'Versicherung', 'Handy & Internet', 'Abos', 'Freizeit', 'Gesundheit', 'Sparen', 'Gehalt', 'Sonstiges']

export interface Posten {
  id: string
  name: string
  typ: PostenTyp
  betrag: number
  rhythmus: Rhythmus
  faellig_monat: number | null // 1–12: Monat der (ersten) Zahlung bei nicht-monatlichen Posten
  gueltig_ab: string // YYYY-MM-DD, immer der 1. eines Monats
  gueltig_bis: string | null
  von_konto_id: string | null
  auf_konto_id: string | null
  kategorie: string | null
  notiz: string | null
  aktiv: boolean
  szenario_id: string | null // null = Grundplan
  kuendbar_bis?: string | null // YYYY-MM-DD: spätester Kündigungstag
}

export type PostenEingabe = Omit<Posten, 'id'>

const CACHE_KEY = 'finanzplan.posten'
const SPALTEN = 'id,name,typ,betrag,rhythmus,faellig_monat,gueltig_ab,gueltig_bis,von_konto_id,auf_konto_id,kategorie,notiz,aktiv,szenario_id,kuendbar_bis'

export function rhythmusLabel(r: Rhythmus): string {
  return RHYTHMEN.find((x) => x.wert === r)?.label ?? r
}

// ---------- Monats-Rechnung (reine Funktionen, ohne Datenbank) ----------

/** Monat als Zahl zum Vergleichen: Jahr * 12 + (Monat - 1). "2026-11-01" → 24322 */
export function monatsIndex(datum: string | Date): number {
  if (typeof datum === 'string') {
    const [j, m] = datum.split('-').map(Number)
    return j * 12 + (m - 1)
  }
  return datum.getFullYear() * 12 + datum.getMonth()
}

export function indexZuDatum(index: number): string {
  const j = Math.floor(index / 12)
  const m = (index % 12) + 1
  return `${j}-${String(m).padStart(2, '0')}-01`
}

/** Ist der Posten im Monat `index` gültig (zwischen gültig ab und gültig bis)? */
export function istGueltigIm(p: Posten, index: number): boolean {
  if (!p.aktiv) return false
  if (index < monatsIndex(p.gueltig_ab)) return false
  if (p.gueltig_bis && index > monatsIndex(p.gueltig_bis)) return false
  return true
}

/**
 * Wird der Posten im Monat `index` tatsächlich bezahlt?
 * Monatlich: jeden gültigen Monat. Einmalig: nur im Monat "gültig ab".
 * Sonst: in jedem Monat, der im Takt des Rhythmus auf den Fälligkeitsmonat fällt.
 */
export function istFaelligIm(p: Posten, index: number): boolean {
  if (!istGueltigIm(p, index)) return false
  const takt = RHYTHMEN.find((r) => r.wert === p.rhythmus)?.monate ?? 1
  if (p.rhythmus === 'einmalig') return index === monatsIndex(p.gueltig_ab)
  if (takt === 1) return true
  const faellig = (p.faellig_monat ?? Number(p.gueltig_ab.slice(5, 7))) - 1 // 0–11
  return (((index % 12) - faellig) % takt + takt) % takt === 0
}

/** Betrag umgerechnet auf einen Monat (jährlich 540 € → 45 €). Einmalige Posten: 0. */
export function proMonat(p: Posten): number {
  const takt = RHYTHMEN.find((r) => r.wert === p.rhythmus)?.monate ?? 1
  if (takt === 0) return 0
  return Math.round((p.betrag / takt) * 100) / 100
}

/** Nächster Monat ab `abIndex`, in dem der Posten fällig ist (max. 5 Jahre voraus). */
export function naechsteFaelligkeit(p: Posten, abIndex: number): number | null {
  for (let i = abIndex; i < abIndex + 60; i++) if (istFaelligIm(p, i)) return i
  return null
}

export interface MonatsSumme {
  einnahmen: number
  fixkosten: number
  sparen: number // Umbuchungen, z. B. Sparrate aufs Tagesgeld oder ins Depot
  frei: number
}

/**
 * Durchschnittlicher Monat für den Monat `index`: alle dort gültigen Posten,
 * nicht-monatliche auf den Monat umgerechnet. Einmalige Posten zählen hier nicht –
 * sie erscheinen in der Prognose genau in ihrem Monat.
 */
export function monatsSumme(posten: Posten[], index: number): MonatsSumme {
  let einnahmen = 0
  let fixkosten = 0
  let sparen = 0
  for (const p of posten) {
    if (!istGueltigIm(p, index)) continue
    const b = proMonat(p)
    if (p.typ === 'einnahme') einnahmen += b
    else if (p.typ === 'ausgabe') fixkosten += b
    else sparen += b
  }
  const r = (x: number) => Math.round(x * 100) / 100
  return { einnahmen: r(einnahmen), fixkosten: r(fixkosten), sparen: r(sparen), frei: r(einnahmen - fixkosten - sparen) }
}

/** Präfix für Einkaufslisten-Positionen, die als einmalige Ausgabe in die Rechnung eingehen. */
export const LISTEN_PREFIX = 'liste:'

export interface MonatsFluss {
  einnahmen: number
  fixkosten: number // alles, was in diesem Monat wirklich abgebucht wird (auch Jahresabos, einmalige Posten)
  sparen: number // netto: Umbuchungen vom Girokonto weg minus Umbuchungen aufs Girokonto (negativ = Entnahme)
  einkaeufe: number // Einkäufe aus Einkaufslisten (geplant oder in diesem Monat gekauft)
  frei: number // ohne Töpfe – die zieht der Aufrufer ab
}

/**
 * Echter Monat: nur was in Monat `index` tatsächlich fällig ist.
 * Die jährliche Versicherung zählt also voll in ihrem Monat und sonst gar nicht.
 *
 * Umbuchungen: Mit `istStandard` (siehe standardPruefer) zählt nur Geld, das vom Girokonto weggeht,
 * als Sparen. Geld aufs Girokonto (z. B. vom Tagesgeld) erhöht das freie Geld, Umbuchungen zwischen
 * zwei Sparkonten ändern es nicht. Ohne `istStandard` zählt jede Umbuchung als Sparen.
 */
export function monatsFluss(posten: Posten[], index: number, istStandard?: (id: string | null) => boolean): MonatsFluss {
  let einnahmen = 0
  let fixkosten = 0
  let sparen = 0
  let einkaeufe = 0
  for (const p of posten) {
    if (!istFaelligIm(p, index)) continue
    if (p.typ === 'einnahme') einnahmen += p.betrag
    else if (p.typ === 'umbuchung') {
      if (!istStandard) sparen += p.betrag
      else {
        const vonGiro = istStandard(p.von_konto_id)
        const aufGiro = istStandard(p.auf_konto_id)
        if (vonGiro && !aufGiro) sparen += p.betrag
        else if (!vonGiro && aufGiro) sparen -= p.betrag
      }
    }
    else if (p.id.startsWith(LISTEN_PREFIX)) einkaeufe += p.betrag
    else fixkosten += p.betrag
  }
  const r = (x: number) => Math.round(x * 100) / 100
  return { einnahmen: r(einnahmen), fixkosten: r(fixkosten), sparen: r(sparen), einkaeufe: r(einkaeufe), frei: r(einnahmen - fixkosten - sparen - einkaeufe) }
}

export interface GrosseZahlung {
  index: number
  posten: Posten[]
  summe: number
}

/**
 * Nächster Monat ab `ab` (inklusive), in dem nicht-monatliche Ausgaben fällig sind
 * (Jahresabos, Quartalszahlungen, einmalige Posten, geplante Einkäufe). Sucht `monate` weit.
 */
export function naechsteGrosseZahlung(posten: Posten[], ab: number, monate = 12): GrosseZahlung | null {
  const kandidaten = posten.filter((p) => p.typ === 'ausgabe' && p.rhythmus !== 'monatlich')
  for (let i = ab; i < ab + monate; i++) {
    const faellig = kandidaten.filter((p) => istFaelligIm(p, i))
    if (faellig.length > 0) {
      return { index: i, posten: faellig, summe: Math.round(faellig.reduce((s, p) => s + p.betrag, 0) * 100) / 100 }
    }
  }
  return null
}

/** Verträge, deren Kündigungsfrist in den nächsten `tage` Tagen endet (heute eingeschlossen). */
export function baldKuendbar(posten: Posten[], heute: Date, tage = 30): { posten: Posten; tageUebrig: number }[] {
  const start = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate())
  return posten
    .filter((p) => p.aktiv && p.kuendbar_bis)
    .map((p) => {
      const [j, m, t] = p.kuendbar_bis!.split('-').map(Number)
      const frist = new Date(j, m - 1, t)
      return { posten: p, tageUebrig: Math.round((frist.getTime() - start.getTime()) / 86400000) }
    })
    .filter((x) => x.tageUebrig >= 0 && x.tageUebrig <= tage)
    .sort((a, b) => a.tageUebrig - b.tageUebrig)
}

// ---------- Datenbank ----------

function ausDb(z: Record<string, unknown>): Posten {
  return { ...(z as unknown as Posten), betrag: Number(z.betrag) }
}

function schreibeCache(posten: Posten[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(posten))
  } catch {
    /* ignorieren */
  }
}

export function leseCache(): Posten[] {
  try {
    const roh = localStorage.getItem(CACHE_KEY)
    return roh ? (JSON.parse(roh) as Posten[]) : []
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

export async function ladePosten(): Promise<{ posten: Posten[]; offline: boolean }> {
  const { data, error } = await supabase.from('posten').select(SPALTEN).order('typ').order('name')
  if (error || !data) return { posten: leseCache(), offline: true }
  const posten = data.map(ausDb)
  schreibeCache(posten)
  return { posten, offline: false }
}

export async function speicherePosten(eingabe: PostenEingabe, id?: string): Promise<string | null> {
  const { error } = id ? await supabase.from('posten').update(eingabe).eq('id', id) : await supabase.from('posten').insert(eingabe)
  return error ? error.message : null
}

export async function aenderePosten(id: string, felder: Partial<PostenEingabe>): Promise<string | null> {
  const { error } = await supabase.from('posten').update(felder).eq('id', id)
  return error ? error.message : null
}

export async function loeschePosten(id: string): Promise<string | null> {
  const { error } = await supabase.from('posten').delete().eq('id', id)
  return error ? error.message : null
}
