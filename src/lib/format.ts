const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const euroGanz = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/** Heutiges Datum als YYYY-MM-DD in Ortszeit (nicht UTC – sonst ist es kurz nach Mitternacht noch "gestern"). */
export function heuteLokal(jetzt = new Date()): string {
  return `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`
}

/** "YYYY-MM-DD" als Datum in Ortszeit (new Date("2026-12-05") wäre UTC und kann je nach Zeitzone einen Tag verrutschen). */
export function lokalesDatum(s: string): Date {
  const [j, m, t] = s.split('-').map(Number)
  return new Date(j, (m || 1) - 1, t || 1)
}

// "Beträge ausblenden": alle angezeigten Beträge werden zu •••, Eingabefelder bleiben unberührt
let verborgen = false
export function setzeBetraegeVerborgen(v: boolean) {
  verborgen = v
}

/** 1234.5 → "1.234,50 €" */
export function formatEuro(betrag: number): string {
  return verborgen ? '••• €' : euro.format(betrag)
}

/** 1234.5 → "1.235 €" (für große Kennzahlen) */
export function formatEuroGanz(betrag: number): string {
  return verborgen ? '••• €' : euroGanz.format(betrag)
}

/**
 * Liest einen Betrag so, wie man ihn in Deutschland tippt:
 * "1.234,56" → 1234.56, "1234,5" → 1234.5, "1.050" → 1050, "-200" → -200, "12.5" → 12.5
 * Gibt null zurück, wenn das keine Zahl ist.
 */
export function parseBetrag(eingabe: string): number | null {
  let s = eingabe.trim().replace(/\s|€/g, '')
  if (s === '') return null
  if (s.includes(',')) {
    // Komma ist Dezimaltrenner, Punkte sind Tausendertrenner
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.050" oder "12.500.000" ohne Komma: Punkte sind Tausendertrenner
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Zahl für ein Eingabefeld: 1234.5 → "1234,50" */
export function betragFuerEingabe(betrag: number): string {
  return betrag.toFixed(2).replace('.', ',')
}

/** Abzug mit Minuszeichen – aber 0 ohne "−0,00 €". */
export function abzug(betrag: number): string {
  return betrag > 0.004 ? `−${formatEuro(betrag)}` : formatEuro(0)
}
