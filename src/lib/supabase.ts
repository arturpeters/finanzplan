import { createClient } from '@supabase/supabase-js'

// Projekt "finanz-planung" (Frankfurt).
// Der Publishable Key ist dafür gedacht, in der App zu stehen: Er gibt nur Zugriff
// auf das, was die Zugriffsregeln (Row Level Security) pro eingeloggtem Nutzer erlauben.
export const SUPABASE_URL = 'https://zmrmtnmsutfrdmfwuylp.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_2XBtLtL3fcGiKDip8mN0lA_XXKsNmxr'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

/** Prüft, ob der Server erreichbar ist (Phase 0: noch ohne Login und Tabellen). */
export async function pruefeVerbindung(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_KEY },
    })
    return res.ok
  } catch {
    return false
  }
}
