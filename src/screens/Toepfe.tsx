import { useState } from 'react'
import { formatEuro, lokalesDatum } from '../lib/format'
import type { Konto } from '../lib/konten'
import { indexZuDatum, monatsIndex } from '../lib/posten'
import { aendereTopf, loescheTopf, speichereTopf, toepfeRate, topfInfo, type Topf } from '../lib/toepfe'
import type { Liste, Position } from '../lib/listen'
import Einkaufslisten from './Einkaufslisten'
import TopfFormular from './TopfFormular'

interface Props {
  toepfe: Topf[]
  listen: Liste[]
  positionen: Position[]
  ansicht: 'toepfe' | 'listen'
  setAnsicht: (a: 'toepfe' | 'listen') => void
  konten: Konto[]
  offline: boolean
  neuLaden: () => Promise<void>
}

const monatJahr = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })

export default function Toepfe({ toepfe, listen, positionen, ansicht, setAnsicht, konten, offline, neuLaden }: Props) {
  const [bearbeiten, setBearbeiten] = useState<Topf | 'neu' | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const jetzt = monatsIndex(new Date())
  const offen = toepfe.filter((t) => !t.erledigt)
  const erledigt = toepfe.filter((t) => t.erledigt)
  const summeRate = toepfeRate(toepfe, jetzt)

  async function aendern(t: Topf, felder: Partial<Topf>) {
    setFehler(null)
    const f = await aendereTopf(t.id, felder)
    if (f) setFehler(f)
    await neuLaden()
  }

  function Karte({ t }: { t: Topf }) {
    const info = topfInfo(t, jetzt)
    const ziel = monatJahr.format(lokalesDatum(t.zielmonat))
    const konto = konten.find((k) => k.id === t.konto_id)
    let zeile: string
    if (info.status === 'laeuft')
      zeile = `${formatEuro(info.rate)} pro Monat · noch ${info.monateUebrig} ${info.monateUebrig === 1 ? 'Monat' : 'Monate'} bis ${ziel}${info.dieserMonatEingezahlt ? ' · diesen Monat eingezahlt ✓' : ''}`
    else if (info.status === 'erreicht') zeile = `Ziel erreicht · gebraucht im ${ziel}`
    else if (info.status === 'faellig') zeile = `${ziel} ist erreicht – es fehlen noch ${formatEuro(info.rest)}`
    else if (info.status === 'pausiert') zeile = `pausiert · Ziel ${ziel}`
    else zeile = `erledigt · ${ziel}`

    return (
      <div className={`topf ${info.status === 'pausiert' || info.status === 'erledigt' ? 'blass' : ''}`}>
        <button className="topf-kopf" onClick={() => setBearbeiten(t)} aria-label={`${t.name} bearbeiten`}>
          <span className="zeile-titel">{t.name}</span>
          <span className="betrag">{formatEuro(t.angespart)} <span className="klein">von {formatEuro(t.zielbetrag)}</span></span>
        </button>
        <div className="fortschritt" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(info.fortschritt * 100)} aria-label={`${t.name}: ${Math.round(info.fortschritt * 100)} Prozent angespart`}>
          <span style={{ width: `${info.fortschritt * 100}%` }} className={info.status === 'faellig' ? 'warn-bg' : ''} />
        </div>
        <span className={`klein ${info.status === 'faellig' ? 'warn' : ''}`}>{zeile}{konto ? ` · ${konto.name}` : ''}</span>
        {!t.erledigt && (info.status === 'laeuft' || info.status === 'erreicht' || info.status === 'faellig') && (
          <div className="topf-knoepfe">
            {info.status === 'laeuft' && !info.dieserMonatEingezahlt && (
              <button
                className="knopf-zweit klein-knopf"
                disabled={offline}
                onClick={() =>
                  aendern(t, {
                    angespart: Math.round((t.angespart + info.rate) * 100) / 100,
                    letzte_einzahlung: info.rate,
                    letzte_einzahlung_monat: indexZuDatum(jetzt),
                  })
                }
              >
                + {formatEuro(info.rate)} eingezahlt
              </button>
            )}
            {info.status === 'laeuft' && info.dieserMonatEingezahlt && (
              <button
                className="knopf-link klein-knopf"
                disabled={offline}
                onClick={() =>
                  aendern(t, {
                    angespart: Math.max(0, Math.round((t.angespart - (t.letzte_einzahlung ?? 0)) * 100) / 100),
                    letzte_einzahlung: null,
                    letzte_einzahlung_monat: null,
                  })
                }
              >
                Rückgängig
              </button>
            )}
            {(info.status === 'erreicht' || info.status === 'faellig') && (
              <button className="knopf-zweit klein-knopf" disabled={offline} onClick={() => aendern(t, { erledigt: true })}>Als erledigt markieren</button>
            )}
          </div>
        )}
        {t.erledigt && (
          <div className="topf-knoepfe">
            <button className="knopf-zweit klein-knopf" disabled={offline} onClick={() => aendern(t, { erledigt: false })}>Wieder öffnen</button>
          </div>
        )}
      </div>
    )
  }

  const umschalter = (
    <div className="segment" role="radiogroup" aria-label="Ansicht">
      <button role="radio" aria-checked={ansicht === 'toepfe'} className={ansicht === 'toepfe' ? 'aktiv' : ''} onClick={() => setAnsicht('toepfe')}>Töpfe</button>
      <button role="radio" aria-checked={ansicht === 'listen'} className={ansicht === 'listen' ? 'aktiv' : ''} onClick={() => setAnsicht('listen')}>Einkaufslisten</button>
    </div>
  )

  if (ansicht === 'listen') {
    return (
      <>
        {umschalter}
        <Einkaufslisten listen={listen} positionen={positionen} offline={offline} neuLaden={neuLaden} />
      </>
    )
  }

  return (
    <>
      {umschalter}
      <section className="karte">
        <span className="klein">Monatlich zurücklegen für alle Töpfe</span>
        <span className="gross">{formatEuro(summeRate)}</span>
        <span className="klein">Wird bei „Frei pro Monat“ schon abgezogen. Die Rate passt sich an, wenn du den angesparten Betrag aktualisierst.</span>
        {offline && <span className="klein warn">Offline – zuletzt geladener Stand, Ändern geht erst wieder mit Verbindung.</span>}
      </section>

      {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}

      {offen.length === 0 ? (
        <section className="karte leer">
          <span className="zeile-titel">Noch keine Töpfe</span>
          <span className="klein">Ein Topf ist Geld, das du für etwas Bestimmtes zurücklegst – z. B. Urlaub im Juli oder ein neuer Laptop. Du sagst Betrag und Monat, die App rechnet die Rate aus.</span>
        </section>
      ) : (
        <div className="topf-raster">
          {offen.map((t) => <Karte key={t.id} t={t} />)}
        </div>
      )}

      <button className="knopf-primaer" onClick={() => setBearbeiten('neu')} disabled={offline}>+ Topf anlegen</button>

      {erledigt.length > 0 && (
        <>
          <span className="klein abschnitt">Erledigt</span>
          <div className="topf-raster">
            {erledigt.map((t) => <Karte key={t.id} t={t} />)}
          </div>
        </>
      )}

      {bearbeiten && (
        <TopfFormular
          topf={bearbeiten === 'neu' ? undefined : bearbeiten}
          konten={konten}
          onSchliessen={() => setBearbeiten(null)}
          onSpeichern={async (eingabe) => {
            const f = await speichereTopf(eingabe, bearbeiten === 'neu' ? undefined : bearbeiten.id)
            if (!f) await neuLaden()
            return f
          }}
          onLoeschen={
            bearbeiten === 'neu'
              ? undefined
              : async () => {
                  const f = await loescheTopf(bearbeiten.id)
                  if (!f) await neuLaden()
                  return f
                }
          }
        />
      )}
    </>
  )
}

