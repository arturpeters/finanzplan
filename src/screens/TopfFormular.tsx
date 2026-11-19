import { useState, type FormEvent } from 'react'
import { betragFuerEingabe, parseBetrag } from '../lib/format'
import type { Konto } from '../lib/konten'
import type { Topf, TopfEingabe } from '../lib/toepfe'

interface Props {
  topf?: Topf
  konten: Konto[]
  onSpeichern: (eingabe: TopfEingabe) => Promise<string | null>
  onLoeschen?: () => Promise<string | null>
  onSchliessen: () => void
}

export default function TopfFormular({ topf, konten, onSpeichern, onLoeschen, onSchliessen }: Props) {
  const aktiveKonten = konten.filter((k) => k.aktiv)
  const [name, setName] = useState(topf?.name ?? '')
  const [ziel, setZiel] = useState(topf ? betragFuerEingabe(topf.zielbetrag) : '')
  const [monat, setMonat] = useState(topf ? topf.zielmonat.slice(0, 7) : '')
  const [angespart, setAngespart] = useState(topf ? betragFuerEingabe(topf.angespart) : '')
  const [konto, setKonto] = useState(topf?.konto_id ?? '')
  const [aktiv, setAktiv] = useState(topf?.aktiv ?? true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    const zielZahl = parseBetrag(ziel)
    const angespartZahl = parseBetrag(angespart === '' ? '0' : angespart)
    if (zielZahl === null || zielZahl <= 0) return setFehler('Bitte einen Zielbetrag größer als 0 eingeben, z. B. 1.200')
    if (angespartZahl === null || angespartZahl < 0) return setFehler('Den bisher angesparten Betrag verstehe ich nicht.')
    if (!monat) return setFehler('Bitte angeben, in welchem Monat du das Geld brauchst.')
    setLaedt(true)
    const f = await onSpeichern({
      name: name.trim(),
      zielbetrag: zielZahl,
      zielmonat: `${monat}-01`,
      angespart: angespartZahl,
      konto_id: konto || null,
      aktiv,
      erledigt: topf?.erledigt ?? false,
      // Wer den Stand von Hand ändert, setzt die Merkhilfe für "+ eingezahlt" zurück
      letzte_einzahlung: topf && angespartZahl === topf.angespart ? topf.letzte_einzahlung : null,
      letzte_einzahlung_monat: topf && angespartZahl === topf.angespart ? topf.letzte_einzahlung_monat : null,
    })
    setLaedt(false)
    if (f) setFehler(f)
    else onSchliessen()
  }

  async function loeschen() {
    if (!onLoeschen) return
    setLaedt(true)
    const f = await onLoeschen()
    setLaedt(false)
    if (f) setFehler(f)
    else onSchliessen()
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="topf-titel" onClick={onSchliessen}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-kopf">
          <h2 id="topf-titel">{topf ? 'Topf bearbeiten' : 'Neuer Topf'}</h2>
          <button className="icon-knopf" aria-label="Schließen" onClick={onSchliessen}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <form className="formular" onSubmit={absenden}>
          <label className="feld">
            <span>Wofür?</span>
            <input required maxLength={80} placeholder="z. B. Urlaub Sommer" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="feld-reihe">
            <label className="feld">
              <span>Zielbetrag (€)</span>
              <input required inputMode="decimal" placeholder="1.200" value={ziel} onChange={(e) => setZiel(e.target.value)} />
            </label>
            <label className="feld">
              <span>Gebraucht im</span>
              <input type="month" required value={monat} onChange={(e) => setMonat(e.target.value)} />
            </label>
          </div>
          <label className="feld">
            <span>Schon angespart (€)</span>
            <input inputMode="decimal" placeholder="0" value={angespart} onChange={(e) => setAngespart(e.target.value)} />
          </label>
          <label className="feld">
            <span>Liegt auf Konto (optional)</span>
            <select value={konto} onChange={(e) => setKonto(e.target.value)}>
              <option value="">— kein bestimmtes Konto —</option>
              {aktiveKonten.map((k) => (
                <option key={k.id} value={k.id}>{k.name}{k.bank ? ` · ${k.bank}` : ''}</option>
              ))}
            </select>
          </label>

          <div className="schalter-zeile">
            <div className="zeile-text">
              <span className="zeile-titel">Aktiv</span>
              <span className="klein">Aus = pausiert, keine Monatsrate</span>
            </div>
            <button type="button" role="switch" aria-checked={aktiv} aria-label="Aktiv" className={`schalter ${aktiv ? 'an' : ''}`} onClick={() => setAktiv(!aktiv)}><span /></button>
          </div>

          {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}
          <button className="knopf-primaer" type="submit" disabled={laedt}>{laedt ? 'Speichere …' : 'Speichern'}</button>

          {topf && onLoeschen && !loeschenBestaetigen && (
            <button type="button" className="knopf-link knopf-gefahr" onClick={() => setLoeschenBestaetigen(true)}>Topf löschen</button>
          )}
          {topf && loeschenBestaetigen && (
            <div className="meldung meldung-fehler">
              <p>„{topf.name}“ endgültig löschen? Wenn das Ziel erreicht ist, markier ihn lieber als erledigt.</p>
              <div className="knopf-reihe">
                <button type="button" className="knopf-zweit" onClick={() => setLoeschenBestaetigen(false)}>Abbrechen</button>
                <button type="button" className="knopf-gefahr-voll" onClick={loeschen} disabled={laedt}>Endgültig löschen</button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
