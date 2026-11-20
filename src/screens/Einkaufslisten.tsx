import { useState, type FormEvent } from 'react'
import { betragFuerEingabe, formatEuro, lokalesDatum, parseBetrag } from '../lib/format'
import {
  aendereListe,
  aenderePosition,
  budgetStand,
  kosten,
  legeListeAn,
  loescheListe,
  loeschePosition,
  pruefeLink,
  speicherePosition,
  type BudgetStand,
  type Liste,
  type Position,
  type Prioritaet,
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
const r2 = (x: number) => Math.round(x * 100) / 100

function aktuellerMonat(): string {
  return indexZuDatum(monatsIndex(new Date())).slice(0, 7)
}

/** Felder fürs Abhaken: Kaufmonat merken, beim Zurücknehmen löschen. */
function abhakFelder(p: Position, gekauft: boolean, jetzt: number): Partial<Position> {
  if (!gekauft) return { gekauft: false, gekauft_preis: null, gekauft_monat: null }
  return { gekauft: true, gekauft_monat: p.gekauft ? p.gekauft_monat : indexZuDatum(jetzt) }
}

/** Balken in drei Teilen: ausgegeben · eingeplant (offen) · frei. Ohne Budget: ausgegeben vom Gesamt. */
function BudgetBalken({ s, label }: { s: BudgetStand; label: string }) {
  const basis = s.budget !== null ? Math.max(s.budget, s.gesamt) : s.gesamt
  if (basis <= 0) return <div className="fortschritt" aria-hidden="true" />
  return (
    <div className="budget-balken" role="img" aria-label={label}>
      <span className="teil-ausgegeben" style={{ flex: s.ausgegeben / basis }} />
      <span className={`teil-offen ${s.ueber > 0 ? 'drueber' : ''}`} style={{ flex: s.offen / basis }} />
      <span className="teil-frei" style={{ flex: Math.max(0, basis - s.gesamt) / basis }} />
    </div>
  )
}

function budgetText(s: BudgetStand): string {
  if (s.budget === null) return `${formatEuro(s.ausgegeben)} von ${formatEuro(s.gesamt)} ausgegeben`
  return s.ueber > 0 ? `${formatEuro(s.ueber)} über Budget (${formatEuro(s.budget)})` : `${formatEuro(s.frei!)} von ${formatEuro(s.budget)} Budget frei`
}

function PositionFormular({ position, jetzt, onSchliessen, onSpeichern, onLoeschen }: {
  position: Position
  jetzt: number
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
  const [prioritaet, setPrioritaet] = useState<Prioritaet>(position.prioritaet)
  const [fehler, setFehler] = useState<string | null>(null)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    const p = parseBetrag(preis)
    const ep = echterPreis.trim() === '' ? null : parseBetrag(echterPreis)
    if (p === null || p < 0) return setFehler('Den Preis verstehe ich nicht.')
    if (echterPreis.trim() !== '' && (ep === null || ep < 0)) return setFehler('Den echten Preis verstehe ich nicht.')
    const l = pruefeLink(link)
    if (l.fehler) return setFehler(l.fehler)
    const f = await onSpeichern({
      name: name.trim(),
      preis: p,
      geplant_monat: monat ? `${monat}-01` : null,
      ...abhakFelder(position, gekauft, jetzt),
      gekauft_preis: gekauft ? ep : null,
      link: l.link,
      prioritaet,
    })
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
          <div className="segment" role="radiogroup" aria-label="Wichtigkeit">
            <button type="button" role="radio" aria-checked={prioritaet === 'muss'} className={prioritaet === 'muss' ? 'aktiv' : ''} onClick={() => setPrioritaet('muss')}>Muss</button>
            <button type="button" role="radio" aria-checked={prioritaet === 'wunsch'} className={prioritaet === 'wunsch' ? 'aktiv' : ''} onClick={() => setPrioritaet('wunsch')}>Wunsch</button>
          </div>
          <div className="feld-reihe">
            <label className="feld"><span>Geplanter Preis (€)</span><input required inputMode="decimal" value={preis} onChange={(e) => setPreis(e.target.value)} /></label>
            <label className="feld"><span>Kaufen im (optional)</span><input type="month" value={monat} onChange={(e) => setMonat(e.target.value)} /></label>
          </div>
          <label className="feld"><span>Link (optional)</span><input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://…" maxLength={500} value={link} onChange={(e) => setLink(e.target.value)} /></label>
          <div className="schalter-zeile">
            <div className="zeile-text"><span className="zeile-titel">Gekauft</span><span className="klein">Zählt dann als ausgegeben – im Monat des Kaufs</span></div>
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
  const [posPrio, setPosPrio] = useState<Prioritaet>('muss')
  const [budgetEingabe, setBudgetEingabe] = useState<string | null>(null) // null = nicht im Bearbeiten-Modus
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
          <span className="klein">Dinge, die du nach und nach kaufen willst. Jede Position mit Monat geht dort als Ausgabe in deinen Plan. Abgehakt zählt sie als ausgegeben – im Monat des Kaufs.</span>
        </section>
        {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}
        {listen.length > 0 && (
          <div className="topf-raster">
            {listen.map((l) => {
              const pos = positionen.filter((p) => p.liste_id === l.id)
              const s = budgetStand(l, positionen)
              const naechste = pos.filter((p) => !p.gekauft && p.geplant_monat).map((p) => Math.max(monatsIndex(p.geplant_monat!), jetzt)).sort((a, b) => a - b)[0]
              return (
                <button key={l.id} className={`topf topf-knopf ${l.erledigt ? 'blass' : ''}`} onClick={() => { setOffeneListe(l.id); setBudgetEingabe(null) }} aria-label={`Liste ${l.name} öffnen`}>
                  <span className="topf-kopf-text">
                    <span className="zeile-titel">{l.name}</span>
                    <span className="betrag">{formatEuro(s.offen)} <span className="klein">offen</span></span>
                  </span>
                  <BudgetBalken s={s} label={`${l.name}: ${budgetText(s)}`} />
                  <span className={`klein ${s.ueber > 0 ? 'warn' : ''}`}>
                    {budgetText(s)} · {pos.length} {pos.length === 1 ? 'Position' : 'Positionen'}
                    {naechste !== undefined && ` · nächster Kauf ${monatKurz.format(lokalesDatum(indexZuDatum(naechste)))}`}
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
  const s = budgetStand(liste, positionen)
  const offen = pos.filter((p) => !p.gekauft)
  const gekauft = pos.filter((p) => p.gekauft)
  const gruppen = new Map<string, Position[]>()
  for (const p of offen) {
    const key = p.geplant_monat ? indexZuDatum(Math.max(monatsIndex(p.geplant_monat), jetzt)) : 'ohne'
    gruppen.set(key, [...(gruppen.get(key) ?? []), p])
  }
  const sortiert = [...gruppen.entries()].sort((a, b) => (a[0] === 'ohne' ? 1 : b[0] === 'ohne' ? -1 : a[0] < b[0] ? -1 : 1))

  // "Passt das noch rein?" – live beim Eintippen des Preises
  const neuerPreis = parseBetrag(posPreis)
  const nachKauf = s.frei !== null && neuerPreis !== null && neuerPreis > 0 ? r2(s.frei - neuerPreis) : null

  async function budgetSpeichern() {
    const roh = (budgetEingabe ?? '').trim()
    const wert = roh === '' ? null : parseBetrag(roh)
    if (roh !== '' && (wert === null || wert < 0)) return setFehler('Das Budget verstehe ich nicht. Beispiel: 1.000')
    const f = await aktion(aendereListe(liste!.id, { budget: wert }))
    if (!f) setBudgetEingabe(null)
  }

  function Zeile({ p }: { p: Position }) {
    const ueberfaellig = !p.gekauft && p.geplant_monat && monatsIndex(p.geplant_monat) < jetzt
    const vorschlag = s.streichen.some((x) => x.id === p.id)
    return (
      <div className={`listen-zeile ${p.gekauft ? 'blass' : ''}`}>
        <button
          className={`haken ${p.gekauft ? 'an' : ''}`}
          role="checkbox"
          aria-checked={p.gekauft}
          aria-label={`${p.name} ${p.gekauft ? 'nicht gekauft' : 'gekauft'}`}
          disabled={offline}
          onClick={() => aktion(aenderePosition(p.id, abhakFelder(p, !p.gekauft, jetzt)))}
        >
          {p.gekauft && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
        </button>
        <button className="konto-haupt" onClick={() => setBearbeiten(p)} aria-label={`${p.name} bearbeiten`}>
          <span className="zeile-text">
            <span className={`zeile-titel ${p.gekauft ? 'durchgestrichen' : ''}`}>
              {p.name}
              {p.prioritaet === 'wunsch' && <span className={`etikett ${vorschlag ? 'etikett-warn' : ''}`}>{vorschlag ? 'Wunsch · streichen?' : 'Wunsch'}</span>}
            </span>
            {ueberfaellig && <span className="klein warn">geplant {monatKurz.format(lokalesDatum(p.geplant_monat!))} – zählt jetzt diesen Monat</span>}
            {p.gekauft && p.gekauft_monat && <span className="klein">gekauft im {monatKurz.format(lokalesDatum(p.gekauft_monat))}</span>}
          </span>
          <span className="betrag">{formatEuro(kosten(p))}</span>
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
        <div className="vier-spalten">
          <div><span className="klein">Budget</span><span className="wert">{s.budget === null ? '–' : formatEuro(s.budget)}</span></div>
          <div><span className="klein">Eingeplant</span><span className="wert">{formatEuro(s.gesamt)}</span></div>
          <div><span className="klein">Ausgegeben</span><span className="wert">{formatEuro(s.ausgegeben)}</span></div>
          <div>
            <span className="klein">{s.budget === null ? 'Offen' : s.ueber > 0 ? 'Über Budget' : 'Noch frei'}</span>
            <span className={`wert ${s.ueber > 0 ? 'warn' : 'akzent'}`}>{s.budget === null ? formatEuro(s.offen) : formatEuro(s.ueber > 0 ? s.ueber : s.frei!)}</span>
          </div>
        </div>
        <BudgetBalken s={s} label={`${liste.name}: ${budgetText(s)}`} />
        <div className="legende-zeile klein" aria-hidden="true">
          <span><i className="legende" style={{ background: 'var(--accent)' }} />ausgegeben</span>
          <span><i className="legende legende-offen" />eingeplant</span>
          {s.budget !== null && <span><i className="legende" style={{ background: 'var(--track)' }} />frei</span>}
        </div>

        {s.ueber > 0 && (
          <p className="meldung meldung-warn">
            {s.streichen.length === 0
              ? `${formatEuro(s.ueber)} über Budget. Markier Positionen als „Wunsch“, dann schlage ich vor, was du streichen oder verschieben könntest.`
              : s.streichenReicht
                ? `Ohne ${s.streichen.map((p) => `„${p.name}“`).join(', ')} (${formatEuro(r2(s.streichen.reduce((x, p) => x + p.preis, 0)))}) passt es wieder ins Budget.`
                : `Selbst ohne alle Wünsche (${formatEuro(r2(s.streichen.reduce((x, p) => x + p.preis, 0)))}) bleibst du ${formatEuro(r2(s.ueber - s.streichen.reduce((x, p) => x + p.preis, 0)))} über Budget.`}
          </p>
        )}
        {s.ersparnis !== 0 && (
          <span className={`klein ${s.ersparnis > 0 ? 'akzent-text' : 'warn'}`}>
            {s.ersparnis > 0 ? `${formatEuro(s.ersparnis)} günstiger gekauft als geplant` : `${formatEuro(-s.ersparnis)} teurer gekauft als geplant`}
          </span>
        )}
        {s.ohneMonat > 0 && <span className="klein warn">{formatEuro(s.ohneMonat)} haben noch keinen Monat und sind deshalb nicht im Plan.</span>}

        {budgetEingabe === null ? (
          <button className="knopf-link links" onClick={() => setBudgetEingabe(liste.budget == null ? '' : betragFuerEingabe(liste.budget))} disabled={offline}>
            {liste.budget == null ? '+ Budget festlegen' : 'Budget ändern'}
          </button>
        ) : (
          <form className="neu-zeile" onSubmit={(e) => { e.preventDefault(); budgetSpeichern() }}>
            <input aria-label="Budget für die Liste in Euro" inputMode="decimal" placeholder="z. B. 1.000 (leer = kein Budget)" value={budgetEingabe} onChange={(e) => setBudgetEingabe(e.target.value)} autoFocus />
            <button className="knopf-primaer kompakt" type="submit">Speichern</button>
          </form>
        )}
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
          const f = await aktion(
            speicherePosition({
              liste_id: liste.id,
              name: posName.trim(),
              preis,
              geplant_monat: posMonat ? `${posMonat}-01` : null,
              gekauft: false,
              gekauft_preis: null,
              gekauft_monat: null,
              link: l.link,
              prioritaet: posPrio,
            }),
          )
          if (!f) {
            setPosName('')
            setPosPreis('')
            setPosLink('')
          }
        }}
      >
        <span className="zeile-titel">Position hinzufügen</span>
        <label className="feld"><span>Was?</span><input maxLength={80} placeholder="z. B. Schreibtisch" value={posName} onChange={(e) => setPosName(e.target.value)} /></label>
        <div className="segment" role="radiogroup" aria-label="Wichtigkeit der neuen Position">
          <button type="button" role="radio" aria-checked={posPrio === 'muss'} className={posPrio === 'muss' ? 'aktiv' : ''} onClick={() => setPosPrio('muss')}>Muss</button>
          <button type="button" role="radio" aria-checked={posPrio === 'wunsch'} className={posPrio === 'wunsch' ? 'aktiv' : ''} onClick={() => setPosPrio('wunsch')}>Wunsch</button>
        </div>
        <div className="feld-reihe">
          <label className="feld"><span>Preis (€)</span><input inputMode="decimal" placeholder="0,00" value={posPreis} onChange={(e) => setPosPreis(e.target.value)} /></label>
          <label className="feld"><span>Kaufen im</span><input type="month" value={posMonat} onChange={(e) => setPosMonat(e.target.value)} /></label>
        </div>
        {nachKauf !== null && (
          <span className={`klein passt ${nachKauf < 0 ? 'warn' : 'akzent-text'}`} role="status">
            {nachKauf >= 0 ? `Passt: danach noch ${formatEuro(nachKauf)} im Budget frei.` : `Passt nicht: danach ${formatEuro(-nachKauf)} über Budget.`}
          </span>
        )}
        <label className="feld"><span>Link (optional)</span><input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://…" maxLength={500} value={posLink} onChange={(e) => setPosLink(e.target.value)} /></label>
        <button className="knopf-primaer" type="submit" disabled={offline}>Hinzufügen</button>
      </form>

      {sortiert.map(([key, liste2]) => (
        <section key={key} className="karte liste">
          <div className="abschnitt-kopf">
            <span className="zeile-titel">{key === 'ohne' ? 'Noch ohne Monat' : monatLang.format(lokalesDatum(key))}</span>
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
          jetzt={jetzt}
          onSchliessen={() => setBearbeiten(null)}
          onSpeichern={(felder) => aktion(aenderePosition(bearbeiten.id, felder))}
          onLoeschen={() => aktion(loeschePosition(bearbeiten.id))}
        />
      )}
    </>
  )
}
