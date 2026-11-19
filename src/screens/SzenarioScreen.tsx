import { useState } from 'react'
import { formatEuro } from '../lib/format'
import type { Konto } from '../lib/konten'
import { loeschePosten, monatsIndex, monatsSumme, proMonat, rhythmusLabel, speicherePosten, type Posten } from '../lib/posten'
import { basisMonat, ladeFreiModus, rechnePrognose } from '../lib/prognose'
import { aendereSzenario, grundplan, loescheSzenario, postenImSzenario, type Szenario } from '../lib/szenarien'
import { toepfeRate, type Topf } from '../lib/toepfe'
import PostenFormular from './PostenFormular'

interface Props {
  szenario: Szenario
  posten: Posten[] // alle, inkl. Szenario-Posten
  konten: Konto[]
  toepfe: Topf[]
  offline: boolean
  neuLaden: () => Promise<void>
  zurPrognose: () => void
  geloescht: () => void
}

export default function SzenarioScreen({ szenario, posten, konten, toepfe, offline, neuLaden, zurPrognose, geloescht }: Props) {
  const [name, setName] = useState(szenario.name)
  const [bearbeiten, setBearbeiten] = useState<Posten | 'neu' | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false)
  const jetzt = monatsIndex(new Date())

  const basis = grundplan(posten).filter((p) => p.aktiv)
  const eigene = posten.filter((p) => p.szenario_id === szenario.id)
  const mitSzenario = postenImSzenario(posten, szenario)

  const frei = (liste: Posten[]) => monatsSumme(liste, jetzt).frei - toepfeRate(toepfe, jetzt)
  const freiVorher = frei(grundplan(posten))
  const freiNachher = frei(mitSzenario)
  const b = basisMonat(konten, jetzt)
  const monate = 12 + Math.max(0, jetzt - b)
  const hatKonten = konten.some((k) => k.aktiv)
  const endeVorher = hatKonten ? rechnePrognose(konten, grundplan(posten), toepfe, b, monate, ladeFreiModus()).monate.at(-1)!.gesamt : 0
  const endeNachher = hatKonten ? rechnePrognose(konten, mitSzenario, toepfe, b, monate, ladeFreiModus(), grundplan(posten)).monate.at(-1)!.gesamt : 0

  async function aktion(f: Promise<string | null>) {
    setFehler(null)
    const e = await f
    if (e) setFehler(e)
    await neuLaden()
  }

  function umschalten(id: string) {
    const weg = szenario.ohne_posten.includes(id) ? szenario.ohne_posten.filter((x) => x !== id) : [...szenario.ohne_posten, id]
    aktion(aendereSzenario(szenario.id, { ohne_posten: weg }))
  }

  const diff = (a: number, b: number) => {
    const d = Math.round((b - a) * 100) / 100
    return <span className={d < 0 ? 'minus' : 'akzent-text'}>{d >= 0 ? '+' : ''}{formatEuro(d)}</span>
  }

  return (
    <>
      <section className="karte">
        <label className="feld">
          <span>Name des Szenarios</span>
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== szenario.name && aktion(aendereSzenario(szenario.id, { name: name.trim() }))}
          />
        </label>
        <p className="klein hinweis">Ein Szenario ändert deinen echten Plan nicht. Es zeigt nur, was wäre, wenn – als Vergleich in der Prognose.</p>
      </section>

      <section className="karte">
        <span className="zeile-titel">Auswirkung</span>
        <div className="vier-spalten">
          <div><span className="klein">Frei/Monat jetzt</span><span className="wert">{formatEuro(freiVorher)}</span></div>
          <div><span className="klein">mit Szenario</span><span className="wert">{formatEuro(freiNachher)} <span className="klein">{diff(freiVorher, freiNachher)}</span></span></div>
          {hatKonten && (
            <>
              <div><span className="klein">Vermögen in 12 M.</span><span className="wert">{formatEuro(endeVorher)}</span></div>
              <div><span className="klein">mit Szenario</span><span className="wert">{formatEuro(endeNachher)} <span className="klein">{diff(endeVorher, endeNachher)}</span></span></div>
            </>
          )}
        </div>
        <span className="klein">„Frei/Monat“ gilt für diesen Monat. Beim Vermögen nimmt die App an, dass du gleich viel ausgibst wie bisher – Mehrkosten gehen also vom Ersparten ab.</span>
        <button className="knopf-primaer" onClick={zurPrognose}>In der Prognose vergleichen</button>
      </section>

      {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}

      <section className="karte liste">
        <div className="abschnitt-kopf">
          <span className="zeile-titel">Kommt dazu</span>
          <button className="knopf-link" onClick={() => setBearbeiten('neu')} disabled={offline}>+ Hinzufügen</button>
        </div>
        {eigene.length === 0 && <p className="klein leer-zeile">Z. B. „Auto-Rate 150 € ab März“ oder „Mehr Vergütung ab August“.</p>}
        {eigene.map((p) => (
          <button key={p.id} className="posten-zeile" onClick={() => setBearbeiten(p)} aria-label={`${p.name} bearbeiten`}>
            <span className="zeile-text">
              <span className="zeile-titel">{p.name}</span>
              <span className="klein">{p.typ === 'einnahme' ? 'Einnahme' : p.typ === 'ausgabe' ? 'Ausgabe' : 'Umbuchung'} · {rhythmusLabel(p.rhythmus)} · ab {p.gueltig_ab.slice(5, 7)}/{p.gueltig_ab.slice(0, 4)}</span>
            </span>
            <span className="betrag">{p.typ === 'einnahme' ? '+' : '−'}{formatEuro(p.rhythmus === 'einmalig' ? p.betrag : proMonat(p))}</span>
          </button>
        ))}
      </section>

      <section className="karte liste">
        <div className="abschnitt-kopf">
          <span className="zeile-titel">Fällt weg</span>
          <span className="klein">aus deinem Grundplan</span>
        </div>
        {basis.length === 0 && <p className="klein leer-zeile">Dein Grundplan hat noch keine Posten.</p>}
        {basis.map((p) => {
          const weg = szenario.ohne_posten.includes(p.id)
          return (
            <div key={p.id} className="schalter-zeile trenner">
              <div className="zeile-text">
                <span className={`zeile-titel ${weg ? 'durchgestrichen' : ''}`}>{p.name}</span>
                <span className="klein">{formatEuro(p.rhythmus === 'einmalig' ? p.betrag : proMonat(p))}{p.rhythmus !== 'einmalig' ? ' pro Monat' : ''}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={weg}
                aria-label={`${p.name} fällt weg`}
                className={`schalter ${weg ? 'an' : ''}`}
                disabled={offline}
                onClick={() => umschalten(p.id)}
              >
                <span />
              </button>
            </div>
          )
        })}
      </section>

      {!loeschenBestaetigen ? (
        <button className="knopf-link knopf-gefahr" onClick={() => setLoeschenBestaetigen(true)} disabled={offline}>Szenario löschen</button>
      ) : (
        <div className="meldung meldung-fehler">
          <p>„{szenario.name}“ und seine Zusatz-Posten endgültig löschen? Dein Grundplan bleibt unverändert.</p>
          <div className="knopf-reihe">
            <button className="knopf-zweit" onClick={() => setLoeschenBestaetigen(false)}>Abbrechen</button>
            <button
              className="knopf-gefahr-voll"
              onClick={async () => {
                const e = await loescheSzenario(szenario.id)
                if (e) return setFehler(e)
                await neuLaden()
                geloescht()
              }}
            >
              Endgültig löschen
            </button>
          </div>
        </div>
      )}

      {bearbeiten && (
        <PostenFormular
          posten={bearbeiten === 'neu' ? undefined : bearbeiten}
          szenarioId={szenario.id}
          konten={konten}
          onSchliessen={() => setBearbeiten(null)}
          onSpeichern={async (eingabe) => {
            const f = await speicherePosten(eingabe, bearbeiten === 'neu' ? undefined : bearbeiten.id)
            if (!f) await neuLaden()
            return f
          }}
          onLoeschen={
            bearbeiten === 'neu'
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
