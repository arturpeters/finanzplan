import { useMemo, useState } from 'react'
import { formatEuro, formatEuroGanz } from '../lib/format'
import type { Konto } from '../lib/konten'
import { indexZuDatum, monatsIndex, type Posten } from '../lib/posten'
import { basisMonat, FREI_MODI, ladeFreiModus, rechnePrognose, speichereFreiModus, type FreiModus } from '../lib/prognose'
import type { Topf } from '../lib/toepfe'
import PrognoseDiagramm from './PrognoseDiagramm'

interface Props {
  konten: Konto[]
  posten: Posten[]
  toepfe: Topf[]
}

const HORIZONTE = [12, 24, 36]
const KEY_HORIZONT = 'finanzplan.prognose.horizont'

function lies<T>(key: string, erlaubt: T[], standard: T): T {
  try {
    const roh = localStorage.getItem(key)
    const wert = roh === null ? null : (JSON.parse(roh) as T)
    return wert !== null && erlaubt.includes(wert) ? wert : standard
  } catch {
    return standard
  }
}

function merke(key: string, wert: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(wert))
  } catch {
    /* ignorieren */
  }
}

const monatJahr = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
const kurzMonat = new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric' })

export default function PrognoseScreen({ konten, posten, toepfe }: Props) {
  const [horizont, setHorizont] = useState<number>(() => lies(KEY_HORIZONT, HORIZONTE, 12))
  const [freiModus, setFreiModus] = useState<FreiModus>(ladeFreiModus)
  const [tabelleOffen, setTabelleOffen] = useState(false)
  const jetzt = monatsIndex(new Date())

  // Gerechnet wird ab dem letzten bekannten Stand bis "heute + Zeitraum"
  const basis = basisMonat(konten, jetzt)
  const prognose = useMemo(
    () => rechnePrognose(konten, posten, toepfe, basis, horizont + Math.max(0, jetzt - basis), freiModus),
    [konten, posten, toepfe, basis, jetzt, horizont, freiModus],
  )
  const startLabel = basis === jetzt ? 'Heute' : basis === jetzt - 1 ? 'Monatsanfang' : 'Letzter Stand'
  const veraltet = basis < jetzt - 1
  const ende = prognose.monate[prognose.monate.length - 1]
  const tiefsterMonat = prognose.monate.reduce((a, b) => (b.gesamt < a.gesamt ? b : a), prognose.monate[0])
  const tiefster = tiefsterMonat.gesamt < prognose.start ? { text: kurzMonat.format(new Date(indexZuDatum(tiefsterMonat.index))), wert: tiefsterMonat.gesamt } : { text: 'heute', wert: prognose.start }
  const aktive = konten.filter((k) => k.aktiv)
  const warnKonto = prognose.warnung ? konten.find((k) => k.id === prognose.warnung!.kontoId) : null

  if (aktive.length === 0) {
    return (
      <section className="karte leer">
        <span className="zeile-titel">Noch keine Konten</span>
        <span className="klein">Die Prognose startet mit deinen heutigen Kontoständen. Leg zuerst unter „Konten“ mindestens ein Konto an.</span>
      </section>
    )
  }

  return (
    <>
      <section className="karte">
        <div className="prognose-kopf">
          <div>
            <span className="klein">Vermögen in {horizont} Monaten</span>
            <span className="gross">{formatEuro(ende.gesamt)}</span>
            <span className={`klein ${ende.gesamt - prognose.start < 0 ? 'warn' : ''}`}>
              {ende.gesamt - prognose.start >= 0 ? '+' : ''}
              {formatEuro(ende.gesamt - prognose.start)} gegenüber {startLabel === 'Heute' ? 'heute' : startLabel === 'Monatsanfang' ? 'Monatsanfang' : 'letztem Stand'} ({formatEuro(prognose.start)})
            </span>
          </div>
          <div className="segment segment-klein" role="radiogroup" aria-label="Zeitraum">
            {HORIZONTE.map((h) => (
              <button
                key={h}
                role="radio"
                aria-checked={horizont === h}
                className={horizont === h ? 'aktiv' : ''}
                onClick={() => {
                  setHorizont(h)
                  merke(KEY_HORIZONT, h)
                }}
              >
                {h} M.
              </button>
            ))}
          </div>
        </div>

        <PrognoseDiagramm prognose={prognose} jetzt={basis} startLabel={startLabel} />
        <span className="klein">Tippen oder darüberfahren zeigt einzelne Monate. Punkte markieren besondere Zahlungen.</span>
      </section>

      {veraltet && (
        <p className="meldung meldung-warn">
          Der letzte bekannte Kontostand ist von {monatJahr.format(new Date(indexZuDatum(basis)))}. Die Prognose rechnet die Monate seitdem nach Plan – mit einem Monatsabgleich wird sie genauer.
        </p>
      )}

      {prognose.warnung && warnKonto && (
        <p className="meldung meldung-fehler" role="alert">
          Achtung: <strong>{warnKonto.name}</strong> rutscht im {monatJahr.format(new Date(indexZuDatum(prognose.warnung.index)))} ins Minus ({formatEuro(prognose.warnung.stand)}).
          Prüf, ob dort genug Geld liegt oder ob eine Zahlung von einem anderen Konto laufen sollte.
        </p>
      )}

      <section className="karte">
        <span className="zeile-titel">Was passiert mit dem freien Geld?</span>
        <div className="segment" role="radiogroup" aria-label="Freies Geld">
          {FREI_MODI.map((m) => (
            <button
              key={m.wert}
              role="radio"
              aria-checked={freiModus === m.wert}
              className={freiModus === m.wert ? 'aktiv' : ''}
              onClick={() => {
                setFreiModus(m.wert)
                speichereFreiModus(m.wert)
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="klein">
          „Frei verfügbar“ ist Geld ohne festen Zweck – Essen, Freizeit, Spontanes. Realistisch ist meist „Ich gebe es aus“: Dann wächst dein Vermögen nur um Sparraten und Töpfe.
        </span>
      </section>

      <section className="karte liste">
        <span className="zeile-titel abschnitt">Konten in {horizont} Monaten</span>
        {aktive.map((k) => (
          <div key={k.id} className="zeile">
            <div className="zeile-text">
              <span className="zeile-titel">{k.name}</span>
              <span className="klein">{startLabel.toLowerCase()} {formatEuro(k.startsaldo)}</span>
            </div>
            <span className={`betrag ${(ende.proKonto[k.id] ?? 0) < 0 ? 'minus' : ''}`}>{formatEuro(ende.proKonto[k.id] ?? 0)}</span>
          </div>
        ))}
        <div className="zeile">
          <div className="zeile-text">
            <span className="zeile-titel">Tiefster Stand gesamt</span>
            <span className="klein">{tiefster.text}</span>
          </div>
          <span className={`betrag ${tiefster.wert < 0 ? 'minus' : ''}`}>{formatEuro(tiefster.wert)}</span>
        </div>
      </section>

      <section className="karte liste">
        <button className="abschnitt-kopf knopf-flach" aria-expanded={tabelleOffen} onClick={() => setTabelleOffen(!tabelleOffen)}>
          <span className="zeile-titel">Monat für Monat</span>
          <span className="klein">{tabelleOffen ? 'zuklappen' : 'aufklappen'}</span>
        </button>
        {tabelleOffen && (
          <div className="tabelle-box">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Monat</th>
                  <th className="rechts">Vermögen</th>
                  <th className="rechts">Veränderung</th>
                  <th>Besonderes</th>
                </tr>
              </thead>
              <tbody>
                {prognose.monate.map((m) => (
                  <tr key={m.index}>
                    <td>{kurzMonat.format(new Date(indexZuDatum(m.index)))}</td>
                    <td className="rechts">{formatEuro(m.gesamt)}</td>
                    <td className={`rechts ${m.veraenderung < 0 ? 'minus' : ''}`}>
                      {m.veraenderung >= 0 ? '+' : ''}
                      {formatEuro(m.veraenderung)}
                    </td>
                    <td className="klein">{m.ereignisse.map((e) => `${e.text} ${formatEuroGanz(e.betrag)}`).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="karte annahmen">
        <summary className="zeile-titel">So rechnet die Prognose</summary>
        <ul className="klein">
          <li>Start ist der letzte bekannte Stand deiner aktiven Konten. Ein Monatsabgleich gilt als Stand zum Monatsanfang, der laufende Monat wird dann noch mitgerechnet. Ein Kontostand, den du mitten im Monat beim Anlegen eingetragen hast, gilt als Stand zum Monatsende.</li>
          <li>Posten zählen in dem Monat, in dem sie wirklich bezahlt werden – die jährliche Versicherung also voll im Fälligkeitsmonat.</li>
          <li>Umbuchungen und Töpfe verschieben Geld zwischen deinen Konten. Im Zielmonat eines Topfs wird der Zielbetrag ausgegeben.</li>
          <li>Depots wachsen mit der Rendite, die du beim Konto eingetragen hast. Das ist eine Annahme, keine Zusage.</li>
          <li>Posten ohne Konto laufen über dein Girokonto.</li>
        </ul>
      </details>
    </>
  )
}
