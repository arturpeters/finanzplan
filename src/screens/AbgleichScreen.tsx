import { useMemo, useState } from 'react'
import { erwarteteStaende, runden, speichereAbgleich, type Abgleich, type AbgleichEintrag } from '../lib/abgleich'
import { betragFuerEingabe, formatEuro, parseBetrag } from '../lib/format'
import type { Konto } from '../lib/konten'
import { indexZuDatum, monatsIndex, type Posten } from '../lib/posten'
import { ladeFreiModus } from '../lib/prognose'
import type { Topf } from '../lib/toepfe'

interface Props {
  konten: Konto[]
  posten: Posten[]
  toepfe: Topf[]
  abgleiche: Abgleich[]
  offline: boolean
  neuLaden: () => Promise<void>
  fertig: () => void
}

const datumLang = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
const monatLang = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })

export default function AbgleichScreen({ konten, posten, toepfe, abgleiche, offline, neuLaden, fertig }: Props) {
  const jetzt = monatsIndex(new Date())
  const aktive = konten.filter((k) => k.aktiv)
  const erwartet = useMemo(() => erwarteteStaende(konten, posten, toepfe, jetzt, ladeFreiModus()), [konten, posten, toepfe, jetzt])
  const [eingaben, setEingaben] = useState<Record<string, string>>({})
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [ergebnis, setErgebnis] = useState<{ ist: number; plan: number } | null>(null)

  const zeilen = aktive.map((k) => {
    const roh = eingaben[k.id] ?? ''
    const ist = roh.trim() === '' ? null : parseBetrag(roh)
    const plan = erwartet[k.id] ?? k.startsaldo
    // Kredite gibt man als Restschuld (positiv) ein, gespeichert wird minus
    const istGespeichert = ist === null ? null : k.art === 'kredit' ? -Math.abs(ist) : ist
    return { k, roh, ist, plan, istGespeichert, ungueltig: roh.trim() !== '' && ist === null }
  })
  const ausgefuellt = zeilen.filter((z) => z.istGespeichert !== null)
  const summePlan = ausgefuellt.reduce((s, z) => s + z.plan, 0)
  const summeIst = ausgefuellt.reduce((s, z) => s + (z.istGespeichert ?? 0), 0)

  async function speichern() {
    setFehler(null)
    if (zeilen.some((z) => z.ungueltig)) return setFehler('Mindestens ein Betrag ist nicht lesbar. Beispiel: 1.240,50')
    if (ausgefuellt.length === 0) return setFehler('Trag mindestens einen Kontostand ein.')
    const eintraege: AbgleichEintrag[] = ausgefuellt.map((z) => ({ konto_id: z.k.id, saldo: z.istGespeichert!, erwartet: z.plan }))
    setLaedt(true)
    // Stand zum Monatsanfang: immer der 1. des laufenden Monats
    const f = await speichereAbgleich(eintraege, indexZuDatum(jetzt))
    setLaedt(false)
    if (f) return setFehler(f)
    setErgebnis({ ist: summeIst, plan: summePlan })
    await neuLaden()
  }

  const verlauf = runden(abgleiche).slice(0, 6)

  if (ergebnis) {
    const diff = Math.round((ergebnis.ist - ergebnis.plan) * 100) / 100
    return (
      <>
        <section className="karte">
          <span className="klein">Abgleich gespeichert</span>
          <span className={`gross ${diff < 0 ? 'minus' : ''}`}>{diff >= 0 ? '+' : ''}{formatEuro(diff)}</span>
          <span className="klein">
            {Math.abs(diff) < 1
              ? 'Punktlandung – dein Plan stimmt mit der Wirklichkeit überein.'
              : diff > 0
                ? 'Du hast mehr als geplant. Die Prognose rechnet ab jetzt mit dem echten Stand weiter.'
                : 'Du hast weniger als geplant. Die Prognose rechnet ab jetzt mit dem echten Stand weiter. Wenn das öfter passiert, fehlt im Plan vermutlich ein Posten.'}
          </span>
        </section>
        <button className="knopf-primaer" onClick={fertig}>Zur Übersicht</button>
      </>
    )
  }

  return (
    <>
      <section className="karte">
        <span className="zeile-titel">Monatsabgleich {monatLang.format(new Date(indexZuDatum(jetzt)))}</span>
        <p className="klein hinweis">
          Trag ein, was heute wirklich auf deinen Konten ist – am besten Anfang des Monats. „Plan“ ist, was die App zum Monatsanfang erwartet. Leere Felder werden übersprungen.
        </p>
        {offline && <span className="klein warn">Offline – speichern geht erst wieder mit Verbindung.</span>}
      </section>

      <section className="karte liste">
        {zeilen.map(({ k, roh, ist, plan, istGespeichert, ungueltig }) => {
          const diff = istGespeichert === null ? null : Math.round((istGespeichert - plan) * 100) / 100
          return (
            <div key={k.id} className="abgleich-zeile">
              <div className="zeile-text">
                <span className="zeile-titel">{k.name}</span>
                <span className="klein">
                  Plan {formatEuro(plan)}
                  {diff !== null && (
                    <span className={diff < 0 ? 'warn' : 'akzent-text'}> · {diff >= 0 ? '+' : ''}{formatEuro(diff)}</span>
                  )}
                </span>
              </div>
              <div className="abgleich-eingabe">
                <input
                  aria-label={`Echter Stand ${k.name}${k.art === 'kredit' ? ' (Restschuld)' : ''}`}
                  inputMode="decimal"
                  placeholder={k.art === 'kredit' ? 'Restschuld' : 'Ist'}
                  value={roh}
                  className={ungueltig ? 'ungueltig' : ''}
                  onChange={(e) => setEingaben({ ...eingaben, [k.id]: e.target.value })}
                />
                {ist === null && (
                  <button
                    className="knopf-link klein-knopf"
                    aria-label={`Plan-Wert für ${k.name} übernehmen`}
                    onClick={() => setEingaben({ ...eingaben, [k.id]: betragFuerEingabe(k.art === 'kredit' ? Math.abs(plan) : plan) })}
                  >
                    = Plan
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {ausgefuellt.length > 0 && (
        <section className="karte">
          <div className="zwei-werte">
            <div><span className="klein">Plan</span><span className="mittel">{formatEuro(summePlan)}</span></div>
            <div className="rechtsbuendig"><span className="klein">Ist</span><span className="mittel">{formatEuro(summeIst)}</span></div>
          </div>
          <span className={`klein ${summeIst - summePlan < 0 ? 'warn' : ''}`}>
            Abweichung {summeIst - summePlan >= 0 ? '+' : ''}{formatEuro(Math.round((summeIst - summePlan) * 100) / 100)} ({ausgefuellt.length} von {aktive.length} Konten)
          </span>
        </section>
      )}

      {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}
      <div className="knopf-reihe">
        <button className="knopf-zweit" onClick={fertig}>Abbrechen</button>
        <button className="knopf-primaer" onClick={speichern} disabled={laedt || offline}>{laedt ? 'Speichere …' : 'Abgleich speichern'}</button>
      </div>

      {verlauf.length > 0 && (
        <section className="karte liste">
          <span className="zeile-titel abschnitt">Bisherige Abgleiche</span>
          {verlauf.map((r) => (
            <div key={r.datum} className="zeile">
              <div className="zeile-text">
                <span className="zeile-titel">{datumLang.format(new Date(r.datum))}</span>
                <span className="klein">{r.anzahl} {r.anzahl === 1 ? 'Konto' : 'Konten'} · Ist {formatEuro(r.ist)}</span>
              </div>
              {r.abweichung !== null && (
                <span className={`betrag ${r.abweichung < 0 ? 'minus' : ''}`}>{r.abweichung >= 0 ? '+' : ''}{formatEuro(r.abweichung)}</span>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  )
}
