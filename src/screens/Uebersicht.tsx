import { formatEuro } from '../lib/format'
import { summeVermoegen, type Konto } from '../lib/konten'

interface Props {
  konten: Konto[]
  zuKonten: () => void
}

export default function Uebersicht({ konten, zuKonten }: Props) {
  const aktive = konten.filter((k) => k.aktiv)
  return (
    <>
      <section className="karte">
        <span className="klein">Frei verfügbar pro Monat</span>
        <span className="gross gedimmt">kommt in Phase 2</span>
        <p className="klein">Sobald du Einnahmen und Fixkosten eingetragen hast, steht hier deine wichtigste Zahl.</p>
      </section>

      <section className="karte">
        <span className="klein">Vermögen heute</span>
        <span className="mittel">{formatEuro(summeVermoegen(konten))}</span>
        <span className="klein">
          {aktive.length === 0 ? 'Noch keine Konten angelegt.' : `${aktive.length} aktive${aktive.length === 1 ? 's Konto' : ' Konten'}`}
        </span>
        <button className="knopf-zweit" onClick={zuKonten}>{aktive.length === 0 ? 'Erstes Konto anlegen' : 'Zu den Konten'}</button>
      </section>
    </>
  )
}
