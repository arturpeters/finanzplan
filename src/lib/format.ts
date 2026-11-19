const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const euroGanz = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/** 1234.5 → "1.234,50 €" */
export function formatEuro(betrag: number): string {
  return euro.format(betrag)
}

/** 1234.5 → "1.235 €" (für große Kennzahlen) */
export function formatEuroGanz(betrag: number): string {
  return euroGanz.format(betrag)
}

/**
 * Liest einen Betrag so, wie man ihn in Deutschland tippt:
 * "1.234,56" → 1234.56, "1234,5" → 1234.5, "-200" → -200, "12.5" → 12.5
 * Gibt null zurück, wenn das keine Zahl ist.
 */
export function parseBetrag(eingabe: string): number | null {
  let s = eingabe.trim().replace(/\s|€/g, '')
  if (s === '') return null
  if (s.includes(',')) {
    // Komma ist Dezimaltrenner, Punkte sind Tausendertrenner
    s = s.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Zahl für ein Eingabefeld: 1234.5 → "1234,50" */
export function betragFuerEingabe(betrag: number): string {
  return betrag.toFixed(2).replace('.', ',')
}
