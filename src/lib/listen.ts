import { LISTEN_PREFIX, monatsIndex, indexZuDatum, type Posten } from './posten'
import { supabase } from './supabase'

export interface Liste {
  id: string
  name: string
  erledigt: boolean
  budget: number | null // optionales Budget für die ganze Liste
}

export type Prioritaet = 'muss' | 'wunsch'

export interface Position {
  id: string
  liste_id: string
  name: string
  preis: number
  geplant_monat: string | null // YYYY-MM-01
  gekauft: boolean
  gekauft_preis: number | null
  gekauft_monat: string | null // YYYY-MM-01, wird beim Abhaken gesetzt
  link: string | null // nur https://
  prioritaet: Prioritaet
}

const KEY_L = 'finanzplan.listen'
const KEY_P = 'finanzplan.positionen'
const r2 = (x: number) => Math.round(x * 100) / 100

/** Prüft einen eingegebenen Link. Leer = kein Link. Ohne Schema wird https:// ergänzt. */
export function pruefeLink(eingabe: string): { link: string | null; fehler: string | null } {
  let s = eingabe.trim()
  if (s === '') return { link: null, fehler: null }
  if (!/^[a-z]+:\/\//i.test(s)) s = 'https://' + s
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:') return { link: null, fehler: 'Nur sichere Links mit https:// sind erlaubt.' }
    if (s.length > 500) return { link: null, fehler: 'Der Link ist zu lang.' }
    return { link: u.toString(), fehler: null }
  } catch {
    return { link: null, fehler: 'Das sieht nicht wie ein Link aus.' }
  }
}

// ---------- Rechnung ----------

export interface ListenSumme {
  gesamt: number
  ausgegeben: number
  offen: number
  ohneMonat: number // offene Positionen ohne geplanten Monat (nicht im Plan)
}

/** Was eine Position kostet bzw. gekostet hat: echter Preis, sonst geplanter. */
export const kosten = (p: Position) => (p.gekauft ? p.gekauft_preis ?? p.preis : p.preis)

/** Gesamt = Ausgegeben (echter Preis, sonst geplanter) + Offen. */
export function listenSumme(positionen: Position[]): ListenSumme {
  let ausgegeben = 0
  let offen = 0
  let ohneMonat = 0
  for (const p of positionen) {
    if (p.gekauft) ausgegeben += kosten(p)
    else {
      offen += p.preis
      if (!p.geplant_monat) ohneMonat += p.preis
    }
  }
  return { gesamt: r2(ausgegeben + offen), ausgegeben: r2(ausgegeben), offen: r2(offen), ohneMonat: r2(ohneMonat) }
}

export interface BudgetStand extends ListenSumme {
  budget: number | null
  frei: number | null // Budget − Gesamt (eingeplant inkl. gekauft); negativ = drüber
  ueber: number // wie viel über Budget (0 wenn es passt)
  ersparnis: number // Summe (geplanter − echter Preis) bei gekauften Positionen mit echtem Preis; negativ = teurer
  streichen: Position[] // offene Wunsch-Positionen, die das Budget wieder passend machen würden
  streichenReicht: boolean // reicht das Streichen aller vorgeschlagenen Wünsche?
}

/**
 * Budget-Rechner einer Liste.
 * Vorschlag zum Streichen: die teuersten offenen Wünsche zuerst, bis die Überschreitung gedeckt ist.
 */
export function budgetStand(liste: Liste, positionen: Position[]): BudgetStand {
  const pos = positionen.filter((p) => p.liste_id === liste.id)
  const summe = listenSumme(pos)
  const ersparnis = r2(pos.filter((p) => p.gekauft && p.gekauft_preis !== null).reduce((s, p) => s + (p.preis - p.gekauft_preis!), 0))
  if (liste.budget == null) return { ...summe, budget: null, frei: null, ueber: 0, ersparnis, streichen: [], streichenReicht: true }
  const frei = r2(liste.budget - summe.gesamt)
  const ueber = Math.max(0, -frei)
  const streichen: Position[] = []
  let gedeckt = 0
  if (ueber > 0) {
    const wuensche = pos.filter((p) => !p.gekauft && p.prioritaet === 'wunsch').sort((a, b) => b.preis - a.preis)
    for (const w of wuensche) {
      if (gedeckt >= ueber) break
      streichen.push(w)
      gedeckt = r2(gedeckt + w.preis)
    }
  }
  return { ...summe, budget: liste.budget ?? null, frei, ueber, ersparnis, streichen, streichenReicht: gedeckt >= ueber }
}

/**
 * Einkaufslisten als einmalige Ausgaben für Plan, Prognose und Abgleich.
 * - Offene Positionen mit Monat: in ihrem geplanten Monat; liegt der schon zurück, im laufenden Monat.
 *   Nur aus nicht erledigten Listen.
 * - Gekaufte Positionen: im Kaufmonat (sonst im geplanten Monat), mit echtem Preis. So bleibt ein Kauf
 *   in "Frei im Monat" und im Plan-Wert des Abgleichs enthalten. In Monaten, deren Kontostand schon
 *   bekannt ist, ignoriert die Prognose ihn automatisch (er steckt dann im echten Kontostand).
 */
export function listenAlsPosten(
  listen: Liste[],
  positionen: Position[],
  jetzt: number,
  auswahl: { offen?: boolean; gekauft?: boolean } = {},
): Posten[] {
  const { offen = true, gekauft = true } = auswahl
  const listenNach = new Map(listen.map((l) => [l.id, l]))
  const ergebnis: Posten[] = []
  for (const p of positionen) {
    const liste = listenNach.get(p.liste_id)
    if (!liste) continue
    let monat: string | null = null
    if (p.gekauft) {
      if (!gekauft) continue
      monat = p.gekauft_monat ?? p.geplant_monat
    } else {
      if (!offen || liste.erledigt || !p.geplant_monat) continue
      monat = indexZuDatum(Math.max(monatsIndex(p.geplant_monat), jetzt))
    }
    if (!monat) continue
    ergebnis.push({
      id: LISTEN_PREFIX + p.id,
      name: p.name,
      typ: 'ausgabe',
      betrag: kosten(p),
      rhythmus: 'einmalig',
      faellig_monat: null,
      gueltig_ab: monat,
      gueltig_bis: monat,
      von_konto_id: null,
      auf_konto_id: null,
      kategorie: `Einkaufsliste: ${liste.name}`,
      notiz: p.gekauft ? 'gekauft' : null,
      aktiv: true,
      szenario_id: null,
    })
  }
  return ergebnis
}

// ---------- Datenbank ----------

function cache<T>(key: string, wert?: T[]): T[] {
  try {
    if (wert) {
      localStorage.setItem(key, JSON.stringify(wert))
      return wert
    }
    const roh = localStorage.getItem(key)
    return roh ? (JSON.parse(roh) as T[]) : []
  } catch {
    return wert ?? []
  }
}

export const leseListenCache = () => cache<Liste>(KEY_L)
export const lesePositionenCache = () => cache<Position>(KEY_P)

export function loescheCache() {
  try {
    localStorage.removeItem(KEY_L)
    localStorage.removeItem(KEY_P)
  } catch {
    /* ignorieren */
  }
}

const zahlOderNull = (x: unknown) => (x == null || Number.isNaN(Number(x)) ? null : Number(x))
// Auch Daten aus älteren Versionen (Offline-Kopie ohne Budget/Priorität/Kaufmonat) sauber machen
function normListe(z: Record<string, unknown>): Liste {
  return { ...(z as unknown as Liste), budget: zahlOderNull(z.budget) }
}
function normPosition(z: Record<string, unknown>): Position {
  return {
    ...(z as unknown as Position),
    preis: Number(z.preis) || 0,
    gekauft_preis: zahlOderNull(z.gekauft_preis),
    gekauft_monat: (z.gekauft_monat as string | null | undefined) ?? null,
    link: (z.link as string | null | undefined) ?? null,
    prioritaet: z.prioritaet === 'wunsch' ? 'wunsch' : 'muss',
  }
}

export async function ladeListen(): Promise<{ listen: Liste[]; positionen: Position[]; offline: boolean }> {
  const [l, p] = await Promise.all([
    supabase.from('listen').select('id,name,erledigt,budget').order('erstellt_am'),
    supabase.from('listen_positionen').select('id,liste_id,name,preis,geplant_monat,gekauft,gekauft_preis,gekauft_monat,link,prioritaet').order('geplant_monat', { nullsFirst: false }).order('erstellt_am'),
  ])
  if (l.error || p.error || !l.data || !p.data) return { listen: leseListenCache().map((z) => normListe(z as never)), positionen: lesePositionenCache().map((z) => normPosition(z as never)), offline: true }
  const positionen = p.data.map(normPosition)
  const listenDaten = l.data.map(normListe)
  return { listen: cache(KEY_L, listenDaten), positionen: cache(KEY_P, positionen), offline: false }
}

export async function legeListeAn(name: string): Promise<{ id: string | null; fehler: string | null }> {
  const { data, error } = await supabase.from('listen').insert({ name }).select('id').single()
  return error ? { id: null, fehler: error.message } : { id: data.id as string, fehler: null }
}

export async function aendereListe(id: string, felder: Partial<Omit<Liste, 'id'>>): Promise<string | null> {
  const { error } = await supabase.from('listen').update(felder).eq('id', id)
  return error ? error.message : null
}

export async function loescheListe(id: string): Promise<string | null> {
  const { error } = await supabase.from('listen').delete().eq('id', id)
  return error ? error.message : null
}

export type PositionEingabe = Omit<Position, 'id'>

export async function speicherePosition(eingabe: PositionEingabe, id?: string): Promise<string | null> {
  const { error } = id ? await supabase.from('listen_positionen').update(eingabe).eq('id', id) : await supabase.from('listen_positionen').insert(eingabe)
  return error ? error.message : null
}

export async function aenderePosition(id: string, felder: Partial<PositionEingabe>): Promise<string | null> {
  const { error } = await supabase.from('listen_positionen').update(felder).eq('id', id)
  return error ? error.message : null
}

export async function loeschePosition(id: string): Promise<string | null> {
  const { error } = await supabase.from('listen_positionen').delete().eq('id', id)
  return error ? error.message : null
}
