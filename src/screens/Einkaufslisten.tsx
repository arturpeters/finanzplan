import { useState, type FormEvent } from 'react'
import { betragFuerEingabe, formatEuro, parseBetrag } from '../lib/format'
import {
  aendereListe,
  aenderePosition,
  legeListeAn,
  listenSumme,
  loescheListe,
  pruefeLink,
  loeschePosition,
  speicherePosition,
  type Liste,
  type Position,
} from '../lib/listen'
import { indexZuDatum, monatsIndex } from '../lib/posten'

interface Props {
  listen: Liste[]
  positionen: Position[]
  offline: boolean
  neuLaden: () => Promise<void>
}

const monatLang = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
const monatKurz = new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric' })

function aktuellerMonat(): string {
  return indexZuDatum(monatsIndex(new Date())).slice(0, 7)
}

function Fortschritt({ anteil, label }: { anteil: number; label: string }) {
  return (
    <div className="fortschritt" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(anteil * 100)} aria-label={label}>
      <span style={{ width: `${Math.min(1, anteil) * 100}%` }} />
    </div>
  )
}

function PositionFormular({ position, onSchliessen, onSpeichern, onLoeschen }: {
  position: Position
  onSchliessen: () => void
  onSpeichern: (felder: Partial<Position>) => Promise<string | null>
  onLoeschen: () => Promise<string | null>
}) {
  const [name, setName] = useState(position.name)
  const [preis, setPreis] = useState(betragFuerEingabe(position.preis))
  const [monat, setMonat] = useState(position.geplant_monat?.slice(0, 7) ?? '')
  const [gekauft, setGekauft] = useState(position.gekauft)
  const [echterPreis, setEchterPreis] = useState(position.gekauft_preis !== null ? betragFuerEingabe(position.gekauft_preis) : '')
  const [link, setLink] = useState(position.link ?? '')
  const [fehler, setFehler] = useState<string | null>(null)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    const p = parseBetrag(preis)
    const ep = echterPreis.trim() === '' ? null : parseBetrag(echterPreis)
    if (p === null || p < 0) return setFehler('Den Preis verstehe ich nicht.')
    if (echterPreis.trim() !== '' && (ep === null || ep < 0)) return setFehler('Den echten Preis verstehe ich nicht.')
    const l = pruefeLink(link)
    if (l.fehler) return setFehler(l.fehler)
    const f = await onSpeichern({ name: name.trim(), preis: p, geplant_monat: monat ? `${monat}-01` : null, gekauft, gekauft_preis: gekauft ? ep : null, link: l.link })
    if (f) setFehler(f)
    else onSchliessen()
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pos-titel" onClick={onSchliessen}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-kopf">
          <h2 id="pos-titel">Position bearbeiten</h2>
          <button className="icon-knopf" aria-label="Schließen" onClick={onSchliessen}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <form className="formular" onSubmit={absenden}>
          <label className="feld"><span>Was?</span><input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="feld-reihe">
            <label className="feld"><span>Geplanter Preis (€)</span><input required inputMode="decimal" value={preis} onChange={(e) => setPreis(e.target.value)} /></label>
            <label className="feld"><span>Kaufen im (optional)</span><input type="month" value={monat} onChange={(e) => setMonat(e.target.value)} /></label>
          </div>
          <label className="feld"><span>Link (optional)</span><input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://…" maxLength={500} value={link} onChange={(e) => setLink(e.target.value)} /></label>
          <div className="schalter-zeile">
            <div className="zeile-text"><span className="zeile-titel">Gekauft</span><span className="klein">Zählt dann als ausgegeben, nicht mehr im Plan</span></div>
            <button type="button" role="switch" aria-checked={gekauft} aria-label="Gekauft" className={`schalter ${gekauft ? 'an' : ''}`} onClick={() => setGekauft(!gekauft)}><span /></button>
          </div>
          {gekauft && (
            <label className="feld"><span>Echter Preis (optional)</span><input inputMode="decimal" placeholder={betragFuerEingabe(parseBetrag(preis) ?? 0)} value={echterPreis} onChange={(e) => setEchterPreis(e.target.value)} /></label>
          )}
          {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}
          <button className="knopf-primaer" type="submit">Speichern</button>
          <button
            type="button"
            className="knopf-link knopf-gefahr"
            onClick={async () => {
              const f = await onLoeschen()
              if (f) setFehler(f)
              else onSchliessen()
            }}
          >
            Position löschen
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Einkaufslisten({ listen, positionen, offline, neuLaden }: Props) {
  const [offeneListe, setOffeneListe] = useState<string | null>(null)
  const [neuerListenName, setNeuerListenName] = useState('')
  const [posName, setPosName] = useState('')
  const [posPreis, setPosPreis] = useState('')
  const [posMonat, setPosMonat] = useState(aktuellerMonat())
  const [posLink, setPosLink] = useState('')
  const [bearbeiten, setBearbeiten] = useState<Position | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false)
  const jetzt = monatsIndex(new Date())

  async function aktion(f: Promise<string | null>) {
    setFehler(null)
    const e = await f
    if (e) setFehler(e)
    await neuLaden()
    return e
  }

  const liste = listen.find((l) => l.id === offeneListe)

  // ---------- Übersicht aller Listen ----------
  if (!liste) {
    return (
      <>
        <section className="karte">
          <span className="zeile-titel">Einkaufslisten</span>
          <span className="klein">Dinge, die du nach und nach kaufen willst. Jede Position mit Monat geht dort als Ausgabe in deinen Plan. Abgehakt zählt sie als ausgegeben.</span>
        </section>
        {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}
        {listen.length > 0 && (
          <div className="topf-raster">
            {listen.map((l) => {
              const pos = positionen.filter((p) => p.liste_id === l.id)
              const s = listenSumme(pos)
              const naechste = pos.filter((p) => !p.gekauft && p.geplant_monat).map((p) => Math.max(monatsIndex(p.geplant_monat!), jetzt)).sort((a, b) => a - b)[0]
              return (
                <button key={l.id} className={`topf topf-knopf ${l.erledigt ? 'blass' : ''}`} onClick={() => setOffeneListe(l.id)} aria-label={`Liste ${l.name} öffnen`}>
                  <span className="topf-kopf-text">
                    <span className="zeile-titel">{l.name}</span>
                    <span className="betrag">{formatEuro(s.offen)} <span className="klein">offen</span></span>
                  </span>
                  <Fortschritt anteil={s.gesamt > 0 ? s.ausgegeben / s.gesamt : 0} label={`${l.name}: ausgegeben`} />
                  <span className="klein">
                    {formatEuro(s.ausgegeben)} von {formatEuro(s.gesamt)} ausgegeben · {pos.length} {pos.length === 1 ? 'Position' : 'Positionen'}
                    {naechste !== undefined && ` · nächster Kauf ${monatKurz.format(new Date(indexZuDatum(naechste)))}`}
                    {l.erledigt && ' · erledigt'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <form
          className="neu-zeile"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!neuerListenName.trim()) return
            const r = await legeListeAn(neuerListenName.trim())
            if (r.fehler || !r.id) return setFehler(r.fehler ?? 'Unbekannter Fehler')
            setNeuerListenName('')
            await neuLaden()
            setOffeneListe(r.id)
          }}
        >
          <input aria-label="Name für neue Liste" placeholder="Neue Liste, z. B. Wohnung" maxLength={60} value={neuerListenName} onChange={(e) => setNeuerListenName(e.target.value)} />
          <button className="knopf-primaer kompakt" type="submit" disabled={offline || !neuerListenName.trim()}>Anlegen</button>
        </form>
      </>
    )
  }

  // ---------- Eine Liste ----------
  const pos = positionen.filter((p) => p.liste_id === liste.id)
  const s = listenSumme(pos)
  const offen = pos.filter((p) => !p.gekauft)
  const gekauft = pos.filter((p) => p.gekauft)
  const gruppen = new Map<string, Position[]>()
  for (const p of offen) {
    const key = p.geplant_monat ? indexZuDatum(Math.max(monatsIndex(p.geplant_monat), jetzt)) : 'ohne'
    gruppen.set(key, [...(gruppen.get(key) ?? []), p])
  }
  const sortiert = [...gruppen.entries()].sort((a, b) => (a[0] === 'ohne' ? 1 : b[0] === 'ohne' ? -1 : a[0] < b[0] ? -1 : 1))

  function Zeile({ p }: { p: Position }) {
    const ueberfaellig = !p.gekauft && p.geplant_monat && monatsIndex(p.geplant_monat) < jetzt
    return (
      <div className={`listen-zeile ${p.gekauft ? 'blass' : ''}`}>
        <button
          className={`haken ${p.gekauft ? 'an' : ''}`}
          role="checkbox"
          aria-checked={p.gekauft}
          aria-label={`${p.name} ${p.gekauft ? 'nicht gekauft' : 'gekauft'}`}
          disabled={offline}
          onClick={() => aktion(aenderePosition(p.id, { gekauft: !p.gekauft, gekauft_preis: null }))}
        >
          {p.gekauft && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
        </button>
        <button className="konto-haupt" onClick={() => setBearbeiten(p)} aria-label={`${p.name} bearbeiten`}>
          <span className="zeile-text">
            <span className={`zeile-titel ${p.gekauft ? 'durchgestrichen' : ''}`}>{p.name}</span>
            {ueberfaellig && <span className="klein warn">geplant {monatKurz.format(new Date(p.geplant_monat!))} – zählt jetzt diesen Monat</span>}
          </span>
          <span className="betrag">{formatEuro(p.gekauft ? p.gekauft_preis ?? p.preis : p.preis)}</span>
        </button>
        {p.link && (
          <a className="icon-knopf flach link-knopf" href={p.link} target="_blank" rel="noopener noreferrer" aria-label={`Link zu ${p.name} öffnen`}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
          </a>
        )}
      </div>
    )
  }

  return (
    <>
      <button className="knopf-link zurueck" onClick={() => { setOffeneListe(null); setLoeschenBestaetigen(false) }}>‹ Alle Listen</button>

      <section className="karte">
        <span className="zeile-titel">{liste.name}</span>
        <div className="drei-spalten">
          <div><span className="klein">Gesamt</span><span className="wert">{formatEuro(s.gesamt)}</span></div>
          <div><span className="klein">Ausgegeben</span><span className="wert">{formatEuro(s.ausgegeben)}</span></div>
          <div><span className="klein">Offen</span><span className="wert akzent">{formatEuro(s.offen)}</span></div>
        </div>
        <Fortschritt anteil={s.gesamt > 0 ? s.ausgegeben / s.gesamt : 0} label={`${liste.name}: ausgegeben`} />
        {s.ohneMonat > 0 && <span className="klein warn">{formatEuro(s.ohneMonat)} haben noch keinen Monat und sind deshalb nicht im Plan.</span>}
      </section>

      {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}

      <form
        className="karte formular-kompakt"
        onSubmit={async (e) => {
          e.preventDefault()
          const preis = parseBetrag(posPreis)
          if (!posName.trim() || preis === null || preis < 0) return setFehler('Bitte Name und Preis angeben, z. B. „Schreibtisch“ und 129,99')
          const l = pruefeLink(posLink)
          if (l.fehler) return setFehler(l.fehler)
          const f = await aktion(speicherePosition({ liste_id: liste.id, name: posName.trim(), preis, geplant_monat: posMonat ? `${posMonat}-01` : null, gekauft: false, gekauft_preis: null, link: l.link }))
          if (!f) {
            setPosName('')
            setPosPreis('')
            setPosLink('')
          }
        }}
      >
        <span className="zeile-titel">Position hinzufügen</span>
        <label className="feld"><span>Was?</span><input maxLength={80} placeholder="z. B. Schreibtisch" value={posName} onChange={(e) => setPosName(e.target.value)} /></label>
        <div className="feld-reihe">
          <label className="feld"><span>Preis (€)</span><input inputMode="decimal" placeholder="0,00" value={posPreis} onChange={(e) => setPosPreis(e.target.value)} /></label>
          <label className="feld"><span>Kaufen im</span><input type="month" value={posMonat} onChange={(e) => setPosMonat(e.target.value)} /></label>
        </div>
        <label className="feld"><span>Link (optional)</span><input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://…" maxLength={500} value={posLink} onChange={(e) => setPosLink(e.target.value)} /></label>
        <button className="knopf-primaer" type="submit" disabled={offline}>Hinzufügen</button>
      </form>

      {sortiert.map(([key, liste2]) => (
        <section key={key} className="karte liste">
          <div className="abschnitt-kopf">
            <span className="zeile-titel">{key === 'ohne' ? 'Noch ohne Monat' : monatLang.format(new Date(key))}</span>
            <span className="klein">{formatEuro(r2(liste2.reduce((x, p) => x + p.preis, 0)))}</span>
          </div>
          {liste2.map((p) => <Zeile key={p.id} p={p} />)}
        </section>
      ))}

      {gekauft.length > 0 && (
        <section className="karte liste">
          <div className="abschnitt-kopf">
            <span className="zeile-titel">Gekauft</span>
            <span className="klein">{formatEuro(s.ausgegeben)}</span>
          </div>
          {gekauft.map((p) => <Zeile key={p.id} p={p} />)}
        </section>
      )}

      <div className="knopf-reihe">
        <button className="knopf-zweit" disabled={offline} onClick={() => aktion(aendereListe(liste.id, { erledigt: !liste.erledigt }))}>
          {liste.erledigt ? 'Liste wieder öffnen' : 'Liste als erledigt markieren'}
        </button>
      </div>
      {!loeschenBestaetigen ? (
        <button className="knopf-link knopf-gefahr" disabled={offline} onClick={() => setLoeschenBestaetigen(true)}>Liste löschen</button>
      ) : (
        <div className="meldung meldung-fehler">
          <p>„{liste.name}“ mit allen {pos.length} Positionen endgültig löschen?</p>
          <div className="knopf-reihe">
            <button className="knopf-zweit" onClick={() => setLoeschenBestaetigen(false)}>Abbrechen</button>
            <button
              className="knopf-gefahr-voll"
              onClick={async () => {
                const f = await aktion(loescheListe(liste.id))
                if (!f) {
                  setOffeneListe(null)
                  setLoeschenBestaetigen(false)
                }
              }}
            >
              Endgültig löschen
            </button>
          </div>
        </div>
      )}

      {bearbeiten && (
        <PositionFormular
          position={bearbeiten}
          onSchliessen={() => setBearbeiten(null)}
          onSpeichern={(felder) => aktion(aenderePosition(bearbeiten.id, felder))}
          onLoeschen={() => aktion(loeschePosition(bearbeiten.id))}
        />
      )}
    </>
  )
}

function r2(x: number) {
  return Math.round(x * 100) / 100
}
