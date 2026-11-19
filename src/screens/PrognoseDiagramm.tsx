import { useRef, useState, type PointerEvent } from 'react'
import { formatEuro, formatEuroGanz } from '../lib/format'
import { indexZuDatum } from '../lib/posten'
import type { Prognose } from '../lib/prognose'

const B = 600 // Breite der Zeichenfläche (viewBox)
const H = 220 // Höhe der Zeichenfläche (viewBox)

const kurz = new Intl.DateTimeFormat('de-DE', { month: 'short' })
const lang = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
const kurzJahr = new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit' })

interface Props {
  prognose: Prognose
  jetzt: number
}

export default function PrognoseDiagramm({ prognose, jetzt }: Props) {
  const flaeche = useRef<HTMLDivElement>(null)
  const [auswahl, setAuswahl] = useState<number | null>(null)

  // Punkt 0 = heute, danach je ein Punkt pro Monat
  const werte = [prognose.start, ...prognose.monate.map((m) => m.gesamt)]
  const n = werte.length - 1
  const echtMin = Math.min(...werte)
  const echtMax = Math.max(...werte)
  let min = echtMin
  let max = echtMax
  if (max - min < 1) {
    min -= 50
    max += 50
  }
  const puffer = (max - min) * 0.12
  min -= puffer
  max += puffer

  const x = (i: number) => (n === 0 ? 0 : (i / n) * B)
  const y = (v: number) => H - ((v - min) / (max - min)) * H
  const linie = werte.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const flaechePfad = `M0,${H} L${linie.split(' ').join(' L')} L${B},${H} Z`
  const nullLinie = min < 0 && max > 0 ? y(0) : null

  // Achsen-Beschriftung: heute, etwa die Mitte, Ende
  const marken = n <= 12 ? [0, Math.round(n / 2), n] : [0, Math.round(n / 3), Math.round((2 * n) / 3), n]
  const monatVon = (i: number) => new Date(indexZuDatum(jetzt + i))

  function waehle(e: PointerEvent<HTMLDivElement>) {
    const box = flaeche.current?.getBoundingClientRect()
    if (!box) return
    const anteil = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    setAuswahl(Math.round(anteil * n))
  }

  const gewaehlt = auswahl ?? n
  const monat = gewaehlt === 0 ? null : prognose.monate[gewaehlt - 1]
  const ereignisPunkte = prognose.monate.map((m, i) => ({ i: i + 1, m })).filter((p) => p.m.ereignisse.length > 0)

  const zusammenfassung = `Vermögensprognose: heute ${formatEuroGanz(prognose.start)}, in ${n} Monaten ${formatEuroGanz(werte[n])}. Tiefster Stand ${formatEuroGanz(Math.min(...werte))}.`

  return (
    <div className="diagramm">
      <div className="diagramm-info" aria-live="polite">
        <span className="klein">{gewaehlt === 0 ? 'Heute' : lang.format(monatVon(gewaehlt))}</span>
        <span className="mittel">{formatEuro(werte[gewaehlt])}</span>
        {monat && (
          <span className={`klein ${monat.veraenderung < 0 ? 'warn' : ''}`}>
            {monat.veraenderung >= 0 ? '+' : ''}
            {formatEuro(monat.veraenderung)} zum Vormonat
            {monat.ereignisse.length > 0 && ` · ${monat.ereignisse.map((e) => `${e.text} ${formatEuroGanz(e.betrag)}`).join(', ')}`}
          </span>
        )}
      </div>

      <div
        ref={flaeche}
        className="diagramm-flaeche"
        onPointerDown={waehle}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons > 0) && waehle(e)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setAuswahl(null)}
      >
        <svg role="img" aria-label={zusammenfassung} viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none">
          <line x1="0" x2={B} y1={y(echtMax)} y2={y(echtMax)} stroke="var(--line)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2={B} y1={y(echtMin)} y2={y(echtMin)} stroke="var(--line)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <path d={flaechePfad} fill="var(--accent)" fillOpacity="0.1" />
          {nullLinie !== null && <line x1="0" x2={B} y1={nullLinie} y2={nullLinie} stroke="var(--warn)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
          <line x1={x(gewaehlt)} x2={x(gewaehlt)} y1="0" y2={H} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polyline points={linie} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="diagramm-wert" aria-hidden="true" style={{ top: `${(y(echtMax) / H) * 100}%` }}>{formatEuroGanz(echtMax)}</span>
        {echtMax - echtMin >= 1 && (
          <span className="diagramm-wert" aria-hidden="true" style={{ top: `${(y(echtMin) / H) * 100}%` }}>{formatEuroGanz(echtMin)}</span>
        )}
        {ereignisPunkte.map(({ i, m }) => (
          <span
            key={i}
            className={`diagramm-punkt ${m.ereignisse.some((e) => e.betrag < 0) ? 'raus' : ''}`}
            style={{ left: `${(x(i) / B) * 100}%`, top: `${(y(werte[i]) / H) * 100}%` }}
          />
        ))}
        <span className="diagramm-punkt gewaehlt" style={{ left: `${(x(gewaehlt) / B) * 100}%`, top: `${(y(werte[gewaehlt]) / H) * 100}%` }} />
      </div>

      <div className="diagramm-achse" aria-hidden="true">
        {marken.map((i) => (
          <span key={i} style={{ left: `${(i / Math.max(1, n)) * 100}%` }}>
            {i === 0 ? 'heute' : n > 12 ? kurzJahr.format(monatVon(i)) : kurz.format(monatVon(i))}
          </span>
        ))}
      </div>
    </div>
  )
}
