import { useState } from 'react'
import { formatEuro } from '../lib/format'
import { aendereKonto, artLabel, loescheKonto, speichereKonto, summeVermoegen, type Konto } from '../lib/konten'
import KontoFormular from './KontoFormular'

interface Props {
  konten: Konto[]
  offline: boolean
  neuLaden: () => Promise<void>
}

const PUNKT_FARBEN: Record<string, string> = {
  giro: 'var(--punkt-1)',
  tagesgeld: 'var(--punkt-2)',
  depot: 'var(--punkt-3)',
  kredit: 'var(--warn)',
  bar: 'var(--muted)',
  sonstiges: 'var(--muted)',
}

export default function Konten({ konten, offline, neuLaden }: Props) {
  const [bearbeiten, setBearbeiten] = useState<Konto | 'neu' | null>(null)
  const [zeigeAusgeblendete, setZeigeAusgeblendete] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const aktive = konten.filter((k) => k.aktiv)
  const deaktivierte = konten.filter((k) => !k.aktiv)
  const anzahlAusgeblendet = aktive.filter((k) => k.ausgeblendet).length
  const sichtbar = (k: Konto) => zeigeAusgeblendete || !k.ausgeblendet
  const hauptkonten = aktive.filter((k) => !k.oberkonto_id || !aktive.some((o) => o.id === k.oberkonto_id))
  const unterkontenVon = (id: string) => aktive.filter((k) => k.oberkonto_id === id)

  async function umschalten(k: Konto, feld: 'aktiv' | 'ausgeblendet') {
    setFehler(null)
    const f = await aendereKonto(k.id, { [feld]: !k[feld] })
    if (f) setFehler(f)
    await neuLaden()
  }

  function Zeile({ k, unter }: { k: Konto; unter?: boolean }) {
    return (
      <div className={`konto-zeile ${unter ? 'unter' : ''} ${k.ausgeblendet ? 'blass' : ''}`}>
        <button className="konto-haupt" onClick={() => setBearbeiten(k)} aria-label={`${k.name} bearbeiten`}>
          {!unter && <span className="punkt" style={{ background: PUNKT_FARBEN[k.art] }} />}
          <span className="zeile-text">
            <span className="zeile-titel">{k.name}</span>
            <span className="klein">
              {[k.bank, artLabel(k.art), k.ausgeblendet ? 'ausgeblendet' : null].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className={`betrag ${k.startsaldo < 0 ? 'minus' : ''}`}>{formatEuro(k.startsaldo)}</span>
        </button>
        <button
          className="icon-knopf flach"
          aria-label={k.ausgeblendet ? `${k.name} wieder anzeigen` : `${k.name} ausblenden`}
          onClick={() => umschalten(k, 'ausgeblendet')}
          disabled={offline}
        >
          {k.ausgeblendet ? (
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6" /></svg>
          ) : (
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </button>
      </div>
    )
  }

  return (
    <>
      <section className="karte">
        <span className="klein">Vermögen heute (aktive Konten)</span>
        <span className="gross">{formatEuro(summeVermoegen(konten))}</span>
        {offline && <span className="klein warn">Offline – du siehst den zuletzt geladenen Stand. Ändern geht erst wieder mit Verbindung.</span>}
      </section>

      {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}

      {konten.length === 0 ? (
        <section className="karte leer">
          <span className="zeile-titel">Noch keine Konten</span>
          <span className="klein">Leg deine Konten mit dem heutigen Kontostand an. Unterkonten kannst du einem Hauptkonto zuordnen.</span>
        </section>
      ) : (
        <section className="karte liste">
          {hauptkonten.filter(sichtbar).map((k) => (
            <div key={k.id} className="konto-gruppe">
              <Zeile k={k} />
              {unterkontenVon(k.id).filter(sichtbar).map((u) => <Zeile key={u.id} k={u} unter />)}
            </div>
          ))}
          {hauptkonten.filter(sichtbar).length === 0 && <p className="klein leer-zeile">Alle aktiven Konten sind ausgeblendet.</p>}
        </section>
      )}

      <div className="knopf-reihe">
        <button className="knopf-primaer" onClick={() => setBearbeiten('neu')} disabled={offline}>+ Konto anlegen</button>
        {anzahlAusgeblendet > 0 && (
          <button className="knopf-zweit" onClick={() => setZeigeAusgeblendete(!zeigeAusgeblendete)}>
            {zeigeAusgeblendete ? 'Ausgeblendete verstecken' : `${anzahlAusgeblendet} ausgeblendet anzeigen`}
          </button>
        )}
      </div>

      {deaktivierte.length > 0 && (
        <section className="karte liste">
          <span className="klein abschnitt">Deaktiviert – zählt nicht mit</span>
          {deaktivierte.map((k) => (
            <div key={k.id} className="konto-zeile blass">
              <button className="konto-haupt" onClick={() => setBearbeiten(k)} aria-label={`${k.name} bearbeiten`}>
                <span className="zeile-text">
                  <span className="zeile-titel">{k.name}</span>
                  <span className="klein">{[k.bank, artLabel(k.art)].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="betrag">{formatEuro(k.startsaldo)}</span>
              </button>
              <button className="knopf-zweit klein-knopf" onClick={() => umschalten(k, 'aktiv')} disabled={offline}>Aktivieren</button>
            </div>
          ))}
        </section>
      )}

      {bearbeiten && (
        <KontoFormular
          konto={bearbeiten === 'neu' ? undefined : bearbeiten}
          alleKonten={konten}
          onSchliessen={() => setBearbeiten(null)}
          onSpeichern={async (eingabe) => {
            const f = await speichereKonto(eingabe, bearbeiten === 'neu' ? undefined : bearbeiten.id)
            if (!f) await neuLaden()
            return f
          }}
          onLoeschen={
            bearbeiten === 'neu'
              ? undefined
              : async () => {
                  const f = await loescheKonto(bearbeiten.id)
                  if (!f) await neuLaden()
                  return f
                }
          }
        />
      )}
    </>
  )
}
