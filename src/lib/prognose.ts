import type { Konto } from './konten'
import { istFaelligIm, monatsFluss, type Posten } from './posten'
import { topfInfo, type Topf } from './toepfe'

/**
 * Prognose Monat für Monat.
 *
 * Annahmen (stehen auch in der App):
 * - Start ist der heutige Stand der aktiven Konten. Gerechnet wird ab dem nächsten Monat.
 * - Posten wirken in dem Monat, in dem sie wirklich fällig sind (jährliche Kfz-Versicherung im März voll).
 * - Umbuchungen verschieben Geld zwischen Konten, das Vermögen bleibt gleich.
 * - Töpfe: Die Monatsrate wandert auf das Topf-Konto, im Zielmonat wird der Zielbetrag ausgegeben.
 * - "Frei verfügbar" (echter Monat, nach allen fälligen Zahlungen) wird je nach Einstellung
 *   ausgegeben (Standard), halb gespart oder ganz gespart.
 * - Depots wachsen mit ihrer angenommenen Jahresrendite (monatlich verzinst).
 */

export type FreiModus = 'ausgeben' | 'haelfte' | 'sparen'

export const FREI_MODI: { wert: FreiModus; label: string; anteilAusgegeben: number }[] = [
  { wert: 'ausgeben', label: 'Ich gebe es aus', anteilAusgegeben: 1 },
  { wert: 'haelfte', label: 'Halb sparen', anteilAusgegeben: 0.5 },
  { wert: 'sparen', label: 'Alles sparen', anteilAusgegeben: 0 },
]

const KEY_FREI = 'finanzplan.prognose.frei'

export function ladeFreiModus(): FreiModus {
  try {
    const roh = localStorage.getItem(KEY_FREI)
    const w = roh ? (JSON.parse(roh) as FreiModus) : null
    return w && FREI_MODI.some((m) => m.wert === w) ? w : 'ausgeben'
  } catch {
    return 'ausgeben'
  }
}

export function speichereFreiModus(w: FreiModus) {
  try {
    localStorage.setItem(KEY_FREI, JSON.stringify(w))
  } catch {
    /* ignorieren */
  }
}

export interface Ereignis {
  text: string
  betrag: number // positiv = rein, negativ = raus (aus Sicht des Vermögens)
}

export interface PrognoseMonat {
  index: number
  gesamt: number
  veraenderung: number
  proKonto: Record<string, number> // Konto-ID → Stand; "ohne" = keinem Konto zugeordnet
  ereignisse: Ereignis[] // nicht-monatliche Posten, einmalige Posten, Topf-Ausgaben
  ausgegebenFrei: number
}

export interface MinusWarnung {
  kontoId: string
  index: number
  stand: number
}

export interface Prognose {
  start: number
  monate: PrognoseMonat[]
  warnung: MinusWarnung | null // erstes Konto (kein Kredit), das ins Minus rutscht
}

const r2 = (x: number) => Math.round(x * 100) / 100

/**
 * Ab welchem Monatsende die Prognose rechnet.
 * - Stand vom 1. eines Monats (Monatsabgleich) = Stand zum Monatsanfang = Ende des Vormonats.
 *   Der laufende Monat wird dann noch mitgerechnet.
 * - Stand von einem anderen Tag (z. B. beim Anlegen eines Kontos) = Ende dieses Monats.
 * Bei mehreren Konten zählt der älteste Stand.
 */
export function kontoBasis(k: Konto): number {
  const [j, m, t] = k.startsaldo_datum.split('-').map(Number)
  const idx = j * 12 + (m - 1)
  return t === 1 ? idx - 1 : idx
}

export function basisMonat(konten: Konto[], jetzt: number): number {
  const aktive = konten.filter((k) => k.aktiv)
  if (aktive.length === 0) return jetzt
  return Math.min(...aktive.map(kontoBasis))
}

export function rechnePrognose(
  konten: Konto[],
  posten: Posten[],
  toepfe: Topf[],
  jetzt: number,
  anzahlMonate: number,
  freiModus: FreiModus,
  /**
   * Für Szenarien: Posten, aus denen das ausgegebene freie Geld berechnet wird (normalerweise der Grundplan).
   * Annahme: Dein Lebensstil bleibt gleich – Mehrkosten im Szenario gehen also vom Ersparten ab,
   * statt still vom freien Geld geschluckt zu werden.
   */
  freiReferenz?: Posten[],
): Prognose {
  const aktive = konten.filter((k) => k.aktiv)
  const aktivIds = new Set(aktive.map((k) => k.id))
  const standardKonto = aktive.find((k) => k.art === 'giro')?.id ?? aktive[0]?.id ?? 'ohne'
  const zuKonto = (id: string | null) => (id && aktivIds.has(id) ? id : standardKonto)
  // Jedes Konto läuft erst ab seinem eigenen letzten Stand weiter (z. B. wenn beim Abgleich
  // nur ein Teil der Konten neu eingetragen wurde). Davor ist sein Stand schon "echt".
  const basisVon: Record<string, number> = { ohne: -Infinity }
  for (const k of aktive) basisVon[k.id] = kontoBasis(k)
  const buche = (id: string, betrag: number, m: number) => {
    if (m > basisVon[id]) stand[id] += betrag
  }
  const anteilAusgegeben = FREI_MODI.find((m) => m.wert === freiModus)?.anteilAusgegeben ?? 1

  const stand: Record<string, number> = { ohne: 0 }
  for (const k of aktive) stand[k.id] = k.startsaldo
  const monatsZins: Record<string, number> = {}
  for (const k of aktive) {
    if (k.art === 'depot' && k.rendite_pa) monatsZins[k.id] = Math.pow(1 + k.rendite_pa / 100, 1 / 12) - 1
  }

  // Töpfe werden mitsimuliert: angespart wächst mit jeder Rate
  const simToepfe = toepfe
    .filter((t) => t.aktiv && !t.erledigt)
    .map((t) => ({ ...t, letzte_einzahlung: null, letzte_einzahlung_monat: null }))
  const freiPosten = freiReferenz ?? posten

  const summe = () => r2(Object.values(stand).reduce((s, x) => s + x, 0))
  const start = summe()
  const monate: PrognoseMonat[] = []
  let warnung: MinusWarnung | null = null
  let vorher = start

  for (let i = 1; i <= anzahlMonate; i++) {
    const m = jetzt + i
    const ereignisse: Ereignis[] = []

    // 1. Posten, die in diesem Monat fällig sind
    for (const p of posten) {
      if (!istFaelligIm(p, m)) continue
      if (p.typ === 'einnahme') buche(zuKonto(p.auf_konto_id), p.betrag, m)
      else if (p.typ === 'ausgabe') buche(zuKonto(p.von_konto_id), -p.betrag, m)
      else {
        buche(zuKonto(p.von_konto_id), -p.betrag, m)
        buche(zuKonto(p.auf_konto_id), p.betrag, m)
      }
      if (p.rhythmus !== 'monatlich' && p.typ !== 'umbuchung') {
        ereignisse.push({ text: p.name, betrag: p.typ === 'einnahme' ? p.betrag : -p.betrag })
      }
    }

    // 2. Töpfe: Rate aufs Topf-Konto schieben, im Zielmonat ausgeben
    let toepfeRateMonat = 0
    for (const t of simToepfe) {
      const ziel = Math.max(Number(t.zielmonat.slice(0, 4)) * 12 + Number(t.zielmonat.slice(5, 7)) - 1, jetzt + 1)
      if (m < ziel) {
        const rate = topfInfo(t, m).rate
        if (rate > 0) {
          toepfeRateMonat += rate
          t.angespart = r2(t.angespart + rate)
          buche(standardKonto, -rate, m)
          buche(zuKonto(t.konto_id), rate, m)
        }
      } else if (m === ziel) {
        buche(zuKonto(t.konto_id), -t.zielbetrag, m)
        ereignisse.push({ text: `Topf: ${t.name}`, betrag: -t.zielbetrag })
      }
    }

    // 3. Freies Geld des echten Monats: der ausgegebene Teil verlässt das Standardkonto.
    //    Im Monat der Jahreszahlung ist entsprechend weniger frei.
    const frei = monatsFluss(freiPosten, m).frei - toepfeRateMonat
    const ausgegebenFrei = r2(Math.max(0, frei) * anteilAusgegeben)
    buche(standardKonto, -ausgegebenFrei, m)

    // 4. Depot-Rendite
    for (const [id, zins] of Object.entries(monatsZins)) if (m > basisVon[id]) stand[id] = stand[id] * (1 + zins)

    for (const id of Object.keys(stand)) stand[id] = r2(stand[id])
    const gesamt = summe()

    if (!warnung) {
      for (const k of aktive) {
        if (k.art !== 'kredit' && stand[k.id] < 0) {
          warnung = { kontoId: k.id, index: m, stand: stand[k.id] }
          break
        }
      }
    }

    monate.push({ index: m, gesamt, veraenderung: r2(gesamt - vorher), proKonto: { ...stand }, ereignisse, ausgegebenFrei })
    vorher = gesamt
  }

  return { start, monate, warnung }
}
