import { supabase } from './supabase'

export type KontoArt = 'giro' | 'tagesgeld' | 'depot' | 'kredit' | 'bar' | 'sonstiges'

export const KONTO_ARTEN: { wert: KontoArt; label: string }[] = [
  { wert: 'giro', label: 'Girokonto' },
  { wert: 'tagesgeld', label: 'Tagesgeld / Sparkonto' },
  { wert: 'depot', label: 'Depot' },
  { wert: 'kredit', label: 'Kredit / Schulden' },
  { wert: 'bar', label: 'Bargeld' },
  { wert: 'sonstiges', label: 'Sonstiges' },
]

export function artLabel(art: KontoArt): string {
  return KONTO_ARTEN.find((a) => a.wert === art)?.label ?? art
}

export interface Konto {
  id: string
  name: string
  bank: string | null
  art: KontoArt
  oberkonto_id: string | null
  startsaldo: number
  startsaldo_datum: string
  rendite_pa: number | null
  aktiv: boolean
  ausgeblendet: boolean
  sortierung: number
}

/** Felder, die das Formular setzt (id, user_id und Zeitstempel macht die Datenbank). */
export type KontoEingabe = Omit<Konto, 'id' | 'sortierung'> & { sortierung?: number }

const CACHE_KEY = 'finanzplan.konten'
const SPALTEN = 'id,name,bank,art,oberkonto_id,startsaldo,startsaldo_datum,rendite_pa,aktiv,ausgeblendet,sortierung'

function ausDb(z: Record<string, unknown>): Konto {
  return {
    ...(z as unknown as Konto),
    // numeric kommt aus Postgres teils als Text
    startsaldo: Number(z.startsaldo),
    rendite_pa: z.rendite_pa === null ? null : Number(z.rendite_pa),
  }
}

function schreibeCache(konten: Konto[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(konten))
  } catch {
    /* Speicher voll oder gesperrt – dann eben ohne Offline-Kopie */
  }
}

export function leseCache(): Konto[] {
  try {
    const roh = localStorage.getItem(CACHE_KEY)
    return roh ? (JSON.parse(roh) as Konto[]) : []
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

/** Lädt alle Konten vom Server. Bei Fehler: letzte Offline-Kopie + offline=true. */
export async function ladeKonten(): Promise<{ konten: Konto[]; offline: boolean }> {
  const { data, error } = await supabase
    .from('konten')
    .select(SPALTEN)
    .order('sortierung')
    .order('erstellt_am')
  if (error || !data) return { konten: leseCache(), offline: true }
  const konten = data.map(ausDb)
  schreibeCache(konten)
  return { konten, offline: false }
}

export async function speichereKonto(eingabe: KontoEingabe, id?: string): Promise<string | null> {
  const { error } = id
    ? await supabase.from('konten').update(eingabe).eq('id', id)
    : await supabase.from('konten').insert(eingabe)
  return error ? error.message : null
}

export async function aendereKonto(id: string, felder: Partial<KontoEingabe>): Promise<string | null> {
  const { error } = await supabase.from('konten').update(felder).eq('id', id)
  return error ? error.message : null
}

export async function loescheKonto(id: string): Promise<string | null> {
  const { error } = await supabase.from('konten').delete().eq('id', id)
  return error ? error.message : null
}

/** Konto, über das Posten ohne eigenes Konto laufen: erstes aktives Girokonto, sonst erstes aktives Konto. */
export function standardKontoId(konten: Konto[]): string | null {
  const aktive = konten.filter((k) => k.aktiv)
  return aktive.find((k) => k.art === 'giro')?.id ?? aktive[0]?.id ?? null
}

/** Prüft, ob eine Konto-ID (oder "kein Konto") effektiv das Standardkonto ist – genau wie die Prognose bucht. */
export function standardPruefer(konten: Konto[]): (id: string | null) => boolean {
  const aktivIds = new Set(konten.filter((k) => k.aktiv).map((k) => k.id))
  const std = standardKontoId(konten)
  return (id) => !id || !aktivIds.has(id) || id === std
}

/** Vermögen = Summe aller aktiven Konten (ausgeblendete zählen mit, deaktivierte nicht). */
export function summeVermoegen(konten: Konto[]): number {
  return konten.filter((k) => k.aktiv).reduce((s, k) => s + k.startsaldo, 0)
}
