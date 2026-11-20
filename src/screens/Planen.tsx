import { useState } from 'react'
import { formatEuro, abzug, lokalesDatum } from '../lib/format'
import { standardPruefer, type Konto } from '../lib/konten'
import {
  indexZuDatum,
  istFaelligIm,
  istGueltigIm,
  loeschePosten,
  monatsFluss,
  monatsIndex,
  naechsteFaelligkeit,
  naechsteGrosseZahlung,
  proMonat,
  rhythmusLabel,
  speicherePosten,
  type Posten,
  type PostenTyp,
} from '../lib/posten'
import { toepfeRateIm, type Topf } from '../lib/toepfe'
import PostenFormular from './PostenFormular'

interface Props {
  posten: Posten[] // Grundplan
  listenPosten: Posten[] // eingeplante Einkäufe als einmalige Ausgaben
  toepfe: Topf[]
  konten: Konto[]
  offline: boolean
  neuLaden: () => Promise<void>
  zuListen: () => void
}

const kurzMonat = new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric' })
const langMonat = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
const monatText = (i: number) => kurzMonat.format(new Date(indexZuDatum(i)))

const ABSCHNITTE: { typ: PostenTyp; titel: string; leer: string }[] = [
  { typ: 'einnahme', titel: 'Einnahmen', leer: 'Noch keine Einnahmen – z. B. deine Ausbildungsvergütung.' },
  { typ: 'ausgabe', titel: 'Fixkosten', leer: 'Noch keine Fixkosten – z. B. Handy, Versicherung, Abos.' },
  { typ: 'umbuchung', titel: 'Sparen & Umbuchungen', leer: 'Noch nichts – z. B. die monatliche Sparrate aufs Tagesgeld.' },
]

export default function Planen({ posten, listenPosten, toepfe, konten, offline, neuLaden, zuListen }: Props) {
  const [bearbeiten, setBearbeiten] = useState<Posten | PostenTyp | null>(null)
  const jetzt = monatsIndex(new Date())
  const [m, setM] = useState(jetzt) // angezeigter Monat
  const alle = [...posten, ...listenPosten]
  const fluss = monatsFluss(alle, m, standardPruefer(konten))
  const toepfeMonat = toepfeRateIm(toepfe, m, jetzt)
  const frei = Math.round((fluss.frei - toepfeMonat) * 100) / 100
  const grosse = naechsteGrosseZahlung(alle, m, 12)
  const einkaeufe = listenPosten.filter((p) => istFaelligIm(p, m))
  const inaktive = posten.filter((p) => !p.aktiv)
  const [kategorienOffen, setKategorienOffen] = useState(false)
  // Fixkosten nach Kategorie, auf den Monat umgerechnet (Jahresabo 540 € → 45 €), für den gewählten Monat gültig
  const proKategorie = new Map<string, number>()
  for (const p of posten) {
    if (p.typ !== 'ausgabe' || p.rhythmus === 'einmalig' || !istGueltigIm(p, m)) continue
    const k = p.kategorie?.trim() || 'Ohne Kategorie'
    proKategorie.set(k, (proKategorie.get(k) ?? 0) + proMonat(p))
  }
  const kategorien = [...proKategorie.entries()].sort((a, b) => b[1] - a[1])
  const kategorienSumme = kategorien.reduce((s, [, v]) => s + v, 0)

  function Zeile({ p }: { p: Posten }) {
    const start = monatsIndex(p.gueltig_ab)
    const ende = p.gueltig_bis ? monatsIndex(p.gueltig_bis) : null
    const gueltig = istGueltigIm(p, m)
    const faellig = istFaelligIm(p, m)
    const naechste = p.rhythmus !== 'monatlich' ? naechsteFaelligkeit(p, m) : null

    const details: string[] = []
    if (p.rhythmus === 'einmalig') details.push(`einmalig im ${monatText(start)}`)
    else {
      details.push(p.rhythmus === 'monatlich' ? 'monatlich' : `${rhythmusLabel(p.rhythmus)} ${formatEuro(p.betrag)}`)
      if (naechste !== null && !faellig) details.push(`nächste ${monatText(naechste)}`)
      if (start > m) details.push(`ab ${monatText(start)}`)
      if (ende !== null && ende >= m) details.push(`bis ${monatText(ende)}`)
      if (ende !== null && ende < m) details.push('abgelaufen')
    }
    if (p.kategorie) details.push(p.kategorie)
    if (p.kuendbar_bis) details.push(`kündbar bis ${lokalesDatum(p.kuendbar_bis).toLocaleDateString('de-DE')}`)

    return (
      <button className={`posten-zeile ${!gueltig || !faellig ? 'blass' : ''}`} onClick={() => setBearbeiten(p)} aria-label={`${p.name} bearbeiten`}>
        <span className="zeile-text">
          <span className="zeile-titel">{p.name}</span>
          <span className="klein">{details.join(' · ')}</span>
        </span>
        <span className="posten-betrag">
          <span className="betrag">{faellig ? formatEuro(p.betrag) : '–'}</span>
          <span className="klein">{faellig ? 'in diesem Monat' : 'nicht fällig'}</span>
        </span>
      </button>
    )
  }

  return (
    <>
      <section className="karte">
        <div className="monat-wahl">
          <button className="icon-knopf" aria-label="Vorheriger Monat" disabled={m <= jetzt} onClick={() => setM(m - 1)}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <div className="monat-wahl-text">
            <span className="zeile-titel">{langMonat.format(new Date(indexZuDatum(m)))}</span>
            {m !== jetzt && <button className="knopf-link klein-knopf" onClick={() => setM(jetzt)}>zurück zu heute</button>}
          </div>
          <button className="icon-knopf" aria-label="Nächster Monat" disabled={m >= jetzt + 23} onClick={() => setM(m + 1)}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div className="vier-spalten">
          <div><span className="klein">Einnahmen</span><span className="wert">{formatEuro(fluss.einnahmen)}</span></div>
          <div><span className="klein">Fixkosten</span><span className="wert">{abzug(fluss.fixkosten)}</span></div>
          {fluss.sparen >= 0 ? (
            <div><span className="klein">Sparen</span><span className="wert">{abzug(fluss.sparen)}</span></div>
          ) : (
            <div><span className="klein">Entnahme</span><span className="wert">+{formatEuro(-fluss.sparen)}</span></div>
          )}
          <div><span className="klein">Töpfe</span><span className="wert">{abzug(toepfeMonat)}</span></div>
          {fluss.einkaeufe > 0 && <div><span className="klein">Einkäufe</span><span className="wert">{abzug(fluss.einkaeufe)}</span></div>}
          <div className="ganze-breite"><span className="klein">Frei in diesem Monat</span><span className={`wert akzent ${frei < 0 ? 'minus' : ''}`}>{formatEuro(frei)}</span></div>
        </div>
        {grosse && (
          <p className="hinweis-zeile">
            <strong>{grosse.index === m ? 'Diesen Monat' : `Nächste Sonderzahlung: ${langMonat.format(new Date(indexZuDatum(grosse.index)))}`}</strong>
            {' – '}
            {grosse.posten.map((p) => `${p.name} ${formatEuro(p.betrag)}`).join(', ')}
          </p>
        )}
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

      {kategorien.length > 0 && (
        <section className="karte liste">
          <button className="abschnitt-kopf knopf-flach" aria-expanded={kategorienOffen} onClick={() => setKategorienOffen(!kategorienOffen)}>
            <span className="zeile-titel">Fixkosten nach Kategorie</span>
            <span className="klein">{kategorienOffen ? 'zuklappen' : `${formatEuro(Math.round(kategorienSumme * 100) / 100)} / Monat`}</span>
          </button>
          {kategorienOffen && (
            <div className="kategorien">
              <span className="klein">Auf den Monat umgerechnet – ein Jahresabo zählt hier mit einem Zwölftel.</span>
              {kategorien.map(([name, wert]) => (
                <div key={name} className="kategorie-zeile">
                  <div className="kategorie-text">
                    <span>{name}</span>
                    <span className="klein">{formatEuro(Math.round(wert * 100) / 100)} · {Math.round((wert / kategorienSumme) * 100)} %</span>
                  </div>
                  <div className="fortschritt" aria-hidden="true"><span style={{ width: `${(wert / kategorien[0][1]) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {einkaeufe.length > 0 && (
        <section className="karte liste">
          <div className="abschnitt-kopf">
            <span className="zeile-titel">Einkäufe in diesem Monat</span>
            <button className="knopf-link" onClick={zuListen}>Zu den Listen</button>
          </div>
          {einkaeufe.map((p) => (
            <div key={p.id} className="posten-zeile statisch">
              <span className="zeile-text">
                <span className="zeile-titel">{p.notiz === 'gekauft' ? `✓ ${p.name}` : p.name}</span>
                <span className="klein">{p.kategorie}{p.notiz === 'gekauft' ? ' · gekauft' : ''}</span>
              </span>
              <span className="betrag">{formatEuro(p.betrag)}</span>
            </div>
          ))}
        </section>
      )}

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
