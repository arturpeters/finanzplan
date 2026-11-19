import { useState } from 'react'
import { formatEuro } from '../lib/format'
import type { Konto } from '../lib/konten'
import {
  indexZuDatum,
  loeschePosten,
  monatsIndex,
  monatsSumme,
  naechsteFaelligkeit,
  proMonat,
  rhythmusLabel,
  speicherePosten,
  type Posten,
  type PostenTyp,
} from '../lib/posten'
import { toepfeRate, type Topf } from '../lib/toepfe'
import PostenFormular from './PostenFormular'

interface Props {
  posten: Posten[]
  toepfe: Topf[]
  konten: Konto[]
  offline: boolean
  neuLaden: () => Promise<void>
}

const kurzMonat = new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric' })
function monatText(index: number): string {
  return kurzMonat.format(new Date(indexZuDatum(index)))
}

const ABSCHNITTE: { typ: PostenTyp; titel: string; leer: string }[] = [
  { typ: 'einnahme', titel: 'Einnahmen', leer: 'Noch keine Einnahmen – z. B. deine Ausbildungsvergütung.' },
  { typ: 'ausgabe', titel: 'Fixkosten', leer: 'Noch keine Fixkosten – z. B. Handy, Versicherung, Abos.' },
  { typ: 'umbuchung', titel: 'Sparen & Umbuchungen', leer: 'Noch nichts – z. B. die monatliche Sparrate aufs Tagesgeld.' },
]

export default function Planen({ posten, toepfe, konten, offline, neuLaden }: Props) {
  const [bearbeiten, setBearbeiten] = useState<Posten | PostenTyp | null>(null)
  const jetzt = monatsIndex(new Date())
  const summe = monatsSumme(posten, jetzt)
  const toepfeMonat = toepfeRate(toepfe, jetzt)
  const frei = Math.round((summe.frei - toepfeMonat) * 100) / 100
  const inaktive = posten.filter((p) => !p.aktiv)

  function Zeile({ p }: { p: Posten }) {
    const start = monatsIndex(p.gueltig_ab)
    const ende = p.gueltig_bis ? monatsIndex(p.gueltig_bis) : null
    const zukunft = start > jetzt
    const abgelaufen = ende !== null && ende < jetzt
    const naechste = p.rhythmus !== 'monatlich' ? naechsteFaelligkeit(p, jetzt) : null

    const details: string[] = []
    if (p.rhythmus === 'einmalig') details.push(`einmalig im ${monatText(start)}`)
    else {
      details.push(p.rhythmus === 'monatlich' ? 'monatlich' : `${rhythmusLabel(p.rhythmus)} ${formatEuro(p.betrag)}`)
      if (naechste !== null && !abgelaufen) details.push(`nächste ${monatText(naechste)}`)
      if (zukunft) details.push(`ab ${monatText(start)}`)
      if (ende !== null && !abgelaufen) details.push(`bis ${monatText(ende)}`)
    }
    if (abgelaufen) details.push('abgelaufen')
    if (p.kategorie) details.push(p.kategorie)

    const rechts = p.rhythmus === 'einmalig' ? formatEuro(p.betrag) : formatEuro(proMonat(p))
    return (
      <button className={`posten-zeile ${zukunft || abgelaufen ? 'blass' : ''}`} onClick={() => setBearbeiten(p)} aria-label={`${p.name} bearbeiten`}>
        <span className="zeile-text">
          <span className="zeile-titel">{p.name}</span>
          <span className="klein">{details.join(' · ')}</span>
        </span>
        <span className="posten-betrag">
          <span className="betrag">{rechts}</span>
          {p.rhythmus !== 'einmalig' && <span className="klein">pro Monat</span>}
        </span>
      </button>
    )
  }

  return (
    <>
      <section className="karte">
        <span className="klein">Diesen Monat im Schnitt</span>
        <div className="vier-spalten">
          <div><span className="klein">Einnahmen</span><span className="wert">{formatEuro(summe.einnahmen)}</span></div>
          <div><span className="klein">Fixkosten</span><span className="wert">−{formatEuro(summe.fixkosten)}</span></div>
          <div><span className="klein">Sparen</span><span className="wert">−{formatEuro(summe.sparen)}</span></div>
          <div><span className="klein">Töpfe</span><span className="wert">−{formatEuro(toepfeMonat)}</span></div>
          <div className="ganze-breite"><span className="klein">Frei</span><span className={`wert akzent ${frei < 0 ? 'minus' : ''}`}>{formatEuro(frei)}</span></div>
        </div>
        {offline && <span className="klein warn">Offline – zuletzt geladener Stand, Ändern geht erst wieder mit Verbindung.</span>}
      </section>

      {ABSCHNITTE.map((a) => {
        const liste = posten.filter((p) => p.aktiv && p.typ === a.typ)
        return (
          <section key={a.typ} className="karte liste">
            <div className="abschnitt-kopf">
              <span className="zeile-titel">{a.titel}</span>
              <button className="knopf-link" onClick={() => setBearbeiten(a.typ)} disabled={offline}>+ Hinzufügen</button>
            </div>
            {liste.length === 0 ? <p className="klein leer-zeile">{a.leer}</p> : liste.map((p) => <Zeile key={p.id} p={p} />)}
          </section>
        )
      })}

      {inaktive.length > 0 && (
        <section className="karte liste">
          <span className="klein abschnitt">Deaktiviert – wird nicht mitgerechnet</span>
          {inaktive.map((p) => <Zeile key={p.id} p={p} />)}
        </section>
      )}

      {bearbeiten && (
        <PostenFormular
          posten={typeof bearbeiten === 'string' ? undefined : bearbeiten}
          vorgabeTyp={typeof bearbeiten === 'string' ? bearbeiten : undefined}
          konten={konten}
          onSchliessen={() => setBearbeiten(null)}
          onSpeichern={async (eingabe) => {
            const f = await speicherePosten(eingabe, typeof bearbeiten === 'string' ? undefined : bearbeiten.id)
            if (!f) await neuLaden()
            return f
          }}
          onLoeschen={
            typeof bearbeiten === 'string'
              ? undefined
              : async () => {
                  const f = await loeschePosten(bearbeiten.id)
                  if (!f) await neuLaden()
                  return f
                }
          }
        />
      )}
    </>
  )
}
