import { LISTEN_PREFIX, monatsIndex, indexZuDatum, type Posten } from './posten'
import { supabase } from './supabase'

export interface Liste {
  id: string
  name: string
  erledigt: boolean
}

export interface Position {
  id: string
  liste_id: string
  name: string
  preis: number
  geplant_monat: string | null // YYYY-MM-01
  gekauft: boolean
  gekauft_preis: number | null
}

const KEY_L = 'finanzplan.listen'
const KEY_P = 'finanzplan.positionen'
const r2 = (x: number) => Math.round(x * 100) / 100

// ---------- Rechnung ----------

export interface ListenSumme {
  gesamt: number
  ausgegeben: number
  offen: number
  ohneMonat: number // offene Positionen ohne geplanten Monat (nicht im Plan)
}

/** Gesamt = Ausgegeben (echter Preis, sonst geplanter) + Offen. */
export function listenSumme(positionen: Position[]): ListenSumme {
  let ausgegeben = 0
  let offen = 0
  let ohneMonat = 0
  for (const p of positionen) {
    if (p.gekauft) ausgegeben += p.gekauft_preis ?? p.preis
    else {
      offen += p.preis
      if (!p.geplant_monat) ohneMonat += p.preis
    }
  }
  return { gesamt: r2(ausgegeben + offen), ausgegeben: r2(ausgegeben), offen: r2(offen), ohneMonat: r2(ohneMonat) }
}

/**
 * Offene, eingeplante Positionen als einmalige Ausgaben für Plan und Prognose.
 * Liegt der geplante Monat schon in der Vergangenheit, zählt die Position im laufenden Monat.
 * Gekaufte Positionen zählen nicht mehr – das Geld ist schon weg und steckt im echten Kontostand.
 */
export function listenAlsPosten(listen: Liste[], positionen: Position[], jetzt: number): Posten[] {
  const aktiveListen = new Map(listen.filter((l) => !l.erledigt).map((l) => [l.id, l]))
  return positionen
    .filter((p) => !p.gekauft && p.geplant_monat && aktiveListen.has(p.liste_id))
    .map((p) => {
      const monat = indexZuDatum(Math.max(monatsIndex(p.geplant_monat!), jetzt))
      return {
        id: LISTEN_PREFIX + p.id,
        name: p.name,
        typ: 'ausgabe',
        betrag: p.preis,
        rhythmus: 'einmalig',
        faellig_monat: null,
        gueltig_ab: monat,
        gueltig_bis: monat,
        von_konto_id: null,
        auf_konto_id: null,
        kategorie: `Einkaufsliste: ${aktiveListen.get(p.liste_id)!.name}`,
        notiz: null,
        aktiv: true,
        szenario_id: null,
      } satisfies Posten
    })
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

export async function ladeListen(): Promise<{ listen: Liste[]; positionen: Position[]; offline: boolean }> {
  const [l, p] = await Promise.all([
    supabase.from('listen').select('id,name,erledigt').order('erstellt_am'),
    supabase.from('listen_positionen').select('id,liste_id,name,preis,geplant_monat,gekauft,gekauft_preis').order('geplant_monat', { nullsFirst: false }).order('erstellt_am'),
  ])
  if (l.error || p.error || !l.data || !p.data) return { listen: leseListenCache(), positionen: lesePositionenCache(), offline: true }
  const positionen = p.data.map((z) => ({ ...z, preis: Number(z.preis), gekauft_preis: z.gekauft_preis === null ? null : Number(z.gekauft_preis) })) as Position[]
  return { listen: cache(KEY_L, l.data as Liste[]), positionen: cache(KEY_P, positionen), offline: false }
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
