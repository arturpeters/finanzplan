import type { Posten } from './posten'
import { supabase } from './supabase'

export interface Szenario {
  id: string
  name: string
  ohne_posten: string[] // Grundplan-Posten, die in diesem Szenario wegfallen
}

const CACHE_KEY = 'finanzplan.szenarien'

/** Grundplan = alle Posten, die zu keinem Szenario gehören. */
export function grundplan(posten: Posten[]): Posten[] {
  return posten.filter((p) => !p.szenario_id)
}

/** Posten-Liste, wie sie in einem Szenario gilt: Grundplan ohne die gestrichenen Posten, plus die Szenario-Posten. */
export function postenImSzenario(posten: Posten[], s: Szenario): Posten[] {
  const weg = new Set(s.ohne_posten)
  return posten.filter((p) => (!p.szenario_id && !weg.has(p.id)) || p.szenario_id === s.id)
}

function schreibeCache(s: Szenario[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s))
  } catch {
    /* ignorieren */
  }
}

export function leseCache(): Szenario[] {
  try {
    const roh = localStorage.getItem(CACHE_KEY)
    return roh ? (JSON.parse(roh) as Szenario[]) : []
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

export async function ladeSzenarien(): Promise<{ szenarien: Szenario[]; offline: boolean }> {
  const { data, error } = await supabase.from('szenarien').select('id,name,ohne_posten').order('erstellt_am')
  if (error || !data) return { szenarien: leseCache(), offline: true }
  const szenarien = data.map((z) => ({ ...z, ohne_posten: z.ohne_posten ?? [] })) as Szenario[]
  schreibeCache(szenarien)
  return { szenarien, offline: false }
}

export async function legeSzenarioAn(name: string): Promise<{ id: string | null; fehler: string | null }> {
  const { data, error } = await supabase.from('szenarien').insert({ name }).select('id').single()
  return error ? { id: null, fehler: error.message } : { id: data.id as string, fehler: null }
}

export async function aendereSzenario(id: string, felder: Partial<Omit<Szenario, 'id'>>): Promise<string | null> {
  const { error } = await supabase.from('szenarien').update(felder).eq('id', id)
  return error ? error.message : null
}

/** Löscht das Szenario samt seiner Zusatz-Posten (per Fremdschlüssel). Der Grundplan bleibt unberührt. */
export async function loescheSzenario(id: string): Promise<string | null> {
  const { error } = await supabase.from('szenarien').delete().eq('id', id)
  return error ? error.message : null
}
