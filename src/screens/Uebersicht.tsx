import { formatEuro } from '../lib/format'
import { summeVermoegen, type Konto } from '../lib/konten'
import { indexZuDatum, monatsFluss, monatsIndex, naechsteGrosseZahlung, type Posten } from '../lib/posten'
import { abgleichFaellig, runden, type Abgleich } from '../lib/abgleich'
import { basisMonat, ladeFreiModus, rechnePrognose } from '../lib/prognose'
import { toepfeRateIm, type Topf } from '../lib/toepfe'

interface Props {
  konten: Konto[]
  posten: Posten[] // Grundplan + eingeplante Einkäufe
  toepfe: Topf[]
  zuKonten: () => void
  zuPlanen: () => void
  zuPrognose: () => void
  zuAbgleich: () => void
  abgleiche: Abgleich[]
}

export default function Uebersicht({ konten, posten, toepfe, zuKonten, zuPlanen, zuPrognose, zuAbgleich, abgleiche }: Props) {
  const aktiveKonten = konten.filter((k) => k.aktiv)
  const jetzt = monatsIndex(new Date())
  // Echter Monat: Jahreszahlungen zählen voll in ihrem Monat
  const summe = monatsFluss(posten, jetzt)
  const toepfeMonat = toepfeRateIm(toepfe, jetzt, jetzt)
  const grosse = naechsteGrosseZahlung(posten, jetzt + 1, 12)
  const monatName = new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date())
  const monatJahr = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
  const frei = Math.round((summe.frei - toepfeMonat) * 100) / 100
  const hatPosten = posten.some((p) => p.aktiv)
  const basis = basisMonat(konten, jetzt)
  const prognose = aktiveKonten.length > 0 ? rechnePrognose(konten, posten, toepfe, basis, 12 + Math.max(0, jetzt - basis), ladeFreiModus()) : null
  const werte = prognose ? [prognose.start, ...prognose.monate.map((m) => m.gesamt)] : []
  const planIn12 = prognose ? prognose.monate[prognose.monate.length - 1].gesamt : 0
  const faellig = abgleichFaellig(konten, jetzt)
  const letzteRunde = runden(abgleiche).find((r) => r.abweichung !== null)
  const lo = Math.min(...werte)
  const hi = Math.max(...werte)
  const spanne = hi - lo || 1
  const sparkline = werte.map((v, i) => `${((i / Math.max(1, werte.length - 1)) * 300).toFixed(1)},${(56 - ((v - lo) / spanne) * 48).toFixed(1)}`).join(' ')
  const planMonat = new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric' }).format(new Date(indexZuDatum(jetzt + 12)))
  const anteil = (x: number) => (summe.einnahmen > 0 ? Math.max(0, x) : 0)

  return (
    <>
      <section className="karte">
        <span className="klein">Frei verfügbar im {monatName}</span>
        {hatPosten ? (
          <>
            <span className={`riesig ${frei < 0 ? 'minus' : ''}`}>{formatEuro(frei)}</span>
            {summe.einnahmen > 0 && (
              <div className="balken" aria-hidden="true">
                <span style={{ flex: anteil(summe.fixkosten), background: 'var(--muted)' }} />
                <span style={{ flex: anteil(summe.sparen), background: 'var(--punkt-2)' }} />
                <span style={{ flex: anteil(toepfeMonat), background: 'var(--punkt-3)' }} />
                <span style={{ flex: anteil(summe.einkaeufe), background: 'var(--warn)' }} />
                <span style={{ flex: anteil(frei), background: 'var(--accent)' }} />
              </div>
            )}
            <div className="vier-spalten">
              <div><span className="klein"><i className="legende" style={{ background: 'var(--text)' }} />Einnahmen</span><span className="wert">{formatEuro(summe.einnahmen)}</span></div>
              <div><span className="klein"><i className="legende" style={{ background: 'var(--muted)' }} />Fixkosten</span><span className="wert">−{formatEuro(summe.fixkosten)}</span></div>
              <div><span className="klein"><i className="legende" style={{ background: 'var(--punkt-2)' }} />Sparen</span><span className="wert">−{formatEuro(summe.sparen)}</span></div>
              <div><span className="klein"><i className="legende" style={{ background: 'var(--punkt-3)' }} />Töpfe</span><span className="wert">−{formatEuro(toepfeMonat)}</span></div>
              {summe.einkaeufe > 0 && (
                <div><span className="klein"><i className="legende" style={{ background: 'var(--warn)' }} />Einkäufe</span><span className="wert">−{formatEuro(summe.einkaeufe)}</span></div>
              )}
            </div>
            {frei < 0 && <p className="meldung meldung-fehler">Diesen Monat geht mehr raus, als reinkommt. Prüf, ob ein Kauf warten kann oder ob die Rücklage reicht.</p>}
            {grosse && (
              <p className="hinweis-zeile">
                <strong>Nächste Sonderzahlung: {monatJahr.format(new Date(indexZuDatum(grosse.index)))}</strong>
                {' – '}
                {grosse.posten.map((p) => `${p.name} ${formatEuro(p.betrag)}`).join(', ')}
              </p>
            )}
          </>
        ) : (
          <>
            <span className="gross gedimmt">noch keine Posten</span>
            <p className="klein">Trag deine Einnahmen und Fixkosten ein, dann steht hier, was dir jeden Monat frei bleibt.</p>
            <button className="knopf-primaer" onClick={zuPlanen}>Posten eintragen</button>
          </>
        )}
      </section>

      {aktiveKonten.length > 0 && (faellig || letzteRunde) && (
        <section className={`karte ${faellig ? 'karte-hinweis' : ''}`}>
          <div className="zwei-werte">
            <div>
              <span className="klein">{faellig ? 'Monatsabgleich fällig' : 'Letzter Abgleich'}</span>
              <span className="zeile-titel">
                {faellig ? 'Echte Kontostände eintragen' : new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' }).format(new Date(letzteRunde!.datum))}
              </span>
            </div>
            {letzteRunde && letzteRunde.abweichung !== null && (
              <div className="rechtsbuendig">
                <span className="klein">Plan vs. Ist</span>
                <span className={`zeile-titel ${letzteRunde.abweichung < 0 ? 'minus' : 'akzent-text'}`}>
                  {letzteRunde.abweichung >= 0 ? '+' : ''}{formatEuro(letzteRunde.abweichung)}
                </span>
              </div>
            )}
          </div>
          {faellig && <button className="knopf-primaer" onClick={zuAbgleich}>Jetzt abgleichen · ca. 2 Min.</button>}
        </section>
      )}

      <section className="karte">
        <div className="zwei-werte">
          <div>
            <span className="klein">Vermögen heute</span>
            <span className="mittel">{formatEuro(summeVermoegen(konten))}</span>
          </div>
          {prognose && (
            <div className="rechtsbuendig">
              <span className="klein">Plan {planMonat}</span>
              <span className="mittel akzent-text">{formatEuro(planIn12)}</span>
            </div>
          )}
        </div>
        {prognose && (
          <button className="sparkline-knopf" onClick={zuPrognose} aria-label="Zur Prognose">
            <svg aria-hidden="true" viewBox="0 0 300 60" preserveAspectRatio="none">
              <polyline points={sparkline} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </button>
        )}
        <span className="klein">
          {aktiveKonten.length === 0 ? 'Noch keine Konten angelegt.' : `${aktiveKonten.length} aktive${aktiveKonten.length === 1 ? 's Konto' : ' Konten'}`}
        </span>
        <button className="knopf-zweit" onClick={zuKonten}>{aktiveKonten.length === 0 ? 'Erstes Konto anlegen' : 'Zu den Konten'}</button>
      </section>
    </>
  )
}
