export type ThemeWahl = 'hell' | 'dunkel' | 'system'

const KEY = 'finanzplan.theme'

export function ladeThemeWahl(): ThemeWahl {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'hell' || v === 'dunkel' || v === 'system') return v
  } catch {
    /* Speicher nicht verfügbar – Standard nehmen */
  }
  return 'system'
}

export function speichereThemeWahl(wahl: ThemeWahl) {
  try {
    localStorage.setItem(KEY, wahl)
  } catch {
    /* ignorieren */
  }
}

export function systemIstDunkel(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Setzt data-theme auf <html> und die Farbe der Android-Statusleiste. */
export function wendeThemeAn(wahl: ThemeWahl) {
  const dunkel = wahl === 'dunkel' || (wahl === 'system' && systemIstDunkel())
  document.documentElement.dataset.theme = dunkel ? 'dunkel' : 'hell'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dunkel ? '#0b0f14' : '#f4f6f9')
}
