import { formatEuro } from '../lib/format'
import { summeVermoegen, type Konto } from '../lib/konten'
import { monatsIndex, monatsSumme, type Posten } from '../lib/posten'

interface Props {
  konten: Konto[]
  posten: Posten[]
  zuKonten: () => void
  zuPlanen: () => void
}

export default function Uebersicht({ konten, posten, zuKonten, zuPlanen }: Props) {
  const aktiveKonten = konten.filter((k) => k.aktiv)
  const summe = monatsSumme(posten, monatsIndex(new Date()))
  const hatPosten = posten.some((p) => p.aktiv)
  const anteil = (x: number) => (summe.einnahmen > 0 ? Math.max(0, x) : 0)

  return (
    <>
      <section className="karte">
        <span className="klein">Frei verfügbar pro Monat</span>
        {hatPosten ? (
          <>
            <span className={`riesig ${summe.frei < 0 ? 'minus' : ''}`}>{formatEuro(summe.frei)}</span>
            {summe.einnahmen > 0 && (
              <div className="balken" aria-hidden="true">
                <span style={{ flex: anteil(summe.fixkosten), background: 'var(--muted)' }} />
                <span style={{ flex: anteil(summe.sparen), background: 'var(--punkt-2)' }} />
                <span style={{ flex: anteil(summe.frei), background: 'var(--accent)' }} />
              </div>
            )}
            <div className="drei-spalten">
              <div><span className="klein">Einnahmen</span><span className="wert">{formatEuro(summe.einnahmen)}</span></div>
              <div><span className="klein">Fixkosten</span><span className="wert">−{formatEuro(summe.fixkosten)}</span></div>
              <div><span className="klein">Sparen</span><span className="wert">−{formatEuro(summe.sparen)}</span></div>
            </div>
            {summe.frei < 0 && <p className="meldung meldung-fehler">Deine festen Ausgaben und Sparraten sind höher als deine Einnahmen.</p>}
          </>
        ) : (
          <>
            <span className="gross gedimmt">noch keine Posten</span>
            <p className="klein">Trag deine Einnahmen und Fixkosten ein, dann steht hier, was dir jeden Monat frei bleibt.</p>
            <button className="knopf-primaer" onClick={zuPlanen}>Posten eintragen</button>
          </>
        )}
      </section>

      <section className="karte">
        <span className="klein">Vermögen heute</span>
        <span className="mittel">{formatEuro(summeVermoegen(konten))}</span>
        <span className="klein">
          {aktiveKonten.length === 0 ? 'Noch keine Konten angelegt.' : `${aktiveKonten.length} aktive${aktiveKonten.length === 1 ? 's Konto' : ' Konten'}`}
        </span>
        <button className="knopf-zweit" onClick={zuKonten}>{aktiveKonten.length === 0 ? 'Erstes Konto anlegen' : 'Zu den Konten'}</button>
      </section>
    </>
  )
}
