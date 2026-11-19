import { useState, type FormEvent } from 'react'
import { betragFuerEingabe, parseBetrag } from '../lib/format'
import { KONTO_ARTEN, type Konto, type KontoArt, type KontoEingabe } from '../lib/konten'

interface Props {
  konto?: Konto // leer = neues Konto
  alleKonten: Konto[]
  onSpeichern: (eingabe: KontoEingabe) => Promise<string | null>
  onLoeschen?: () => Promise<string | null>
  onSchliessen: () => void
}

export default function KontoFormular({ konto, alleKonten, onSpeichern, onLoeschen, onSchliessen }: Props) {
  const [name, setName] = useState(konto?.name ?? '')
  const [bank, setBank] = useState(konto?.bank ?? '')
  const [art, setArt] = useState<KontoArt>(konto?.art ?? 'giro')
  const [oberkonto, setOberkonto] = useState(konto?.oberkonto_id ?? '')
  const [saldo, setSaldo] = useState(konto ? betragFuerEingabe(Math.abs(konto.startsaldo)) : '')
  const [rendite, setRendite] = useState(konto?.rendite_pa != null ? String(konto.rendite_pa).replace('.', ',') : '')
  const [aktiv, setAktiv] = useState(konto?.aktiv ?? true)
  const [ausgeblendet, setAusgeblendet] = useState(konto?.ausgeblendet ?? false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false)

  // Als Oberkonto taugen nur Hauptkonten (keine Unterkonten) und nicht das Konto selbst
  const moeglicheOberkonten = alleKonten.filter((k) => !k.oberkonto_id && k.id !== konto?.id)
  const hatUnterkonten = konto ? alleKonten.some((k) => k.oberkonto_id === konto.id) : false

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    const betrag = parseBetrag(saldo === '' ? '0' : saldo)
    if (betrag === null) {
      setFehler('Den Kontostand verstehe ich nicht. Beispiel: 1.240,50')
      return
    }
    let renditeZahl: number | null = null
    if (art === 'depot' && rendite.trim() !== '') {
      renditeZahl = parseBetrag(rendite)
      if (renditeZahl === null || renditeZahl < -50 || renditeZahl > 50) {
        setFehler('Die Rendite bitte als Zahl in Prozent eingeben, z. B. 5 oder 4,5')
        return
      }
    }
    setLaedt(true)
    const fehlerText = await onSpeichern({
      name: name.trim(),
      bank: bank.trim() || null,
      art,
      oberkonto_id: oberkonto || null,
      // Kredite werden als Minus gespeichert, damit das Vermögen stimmt
      startsaldo: art === 'kredit' ? -Math.abs(betrag) : betrag,
      // Datum nur erneuern, wenn sich der Kontostand geändert hat
      startsaldo_datum:
        konto && Math.abs(konto.startsaldo) === Math.abs(betrag)
          ? konto.startsaldo_datum
          : new Date().toISOString().slice(0, 10),
      rendite_pa: art === 'depot' ? renditeZahl : null,
      aktiv,
      ausgeblendet,
    })
    setLaedt(false)
    if (fehlerText) setFehler(fehlerText)
    else onSchliessen()
  }

  async function loeschen() {
    if (!onLoeschen) return
    setLaedt(true)
    const fehlerText = await onLoeschen()
    setLaedt(false)
    if (fehlerText) setFehler(fehlerText)
    else onSchliessen()
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="konto-titel" onClick={onSchliessen}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-kopf">
          <h2 id="konto-titel">{konto ? 'Konto bearbeiten' : 'Neues Konto'}</h2>
          <button className="icon-knopf" aria-label="Schließen" onClick={onSchliessen}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <form className="formular" onSubmit={absenden}>
          <label className="feld">
            <span>Name</span>
            <input required maxLength={80} placeholder="z. B. Girokonto" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="feld">
            <span>Bank</span>
            <input maxLength={80} placeholder="z. B. Sparkasse" value={bank} onChange={(e) => setBank(e.target.value)} />
          </label>
          <label className="feld">
            <span>Art</span>
            <select value={art} onChange={(e) => setArt(e.target.value as KontoArt)}>
              {KONTO_ARTEN.map((a) => (
                <option key={a.wert} value={a.wert}>{a.label}</option>
              ))}
            </select>
          </label>
          <label className="feld">
            <span>{art === 'kredit' ? 'Restschuld heute (€)' : 'Kontostand heute (€)'}</span>
            <input inputMode="decimal" placeholder="0,00" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
          </label>
          {art === 'depot' && (
            <label className="feld">
              <span>Angenommene Rendite pro Jahr (%)</span>
              <input inputMode="decimal" placeholder="z. B. 5" value={rendite} onChange={(e) => setRendite(e.target.value)} />
            </label>
          )}
          {!hatUnterkonten && moeglicheOberkonten.length > 0 && (
            <label className="feld">
              <span>Unterkonto von</span>
              <select value={oberkonto} onChange={(e) => setOberkonto(e.target.value)}>
                <option value="">— keins, eigenes Hauptkonto —</option>
                {moeglicheOberkonten.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}{k.bank ? ` · ${k.bank}` : ''}</option>
                ))}
              </select>
            </label>
          )}

          <div className="schalter-zeile">
            <div className="zeile-text">
              <span className="zeile-titel">Aktiv</span>
              <span className="klein">Aus = zählt nirgends mehr mit</span>
            </div>
            <button type="button" role="switch" aria-checked={aktiv} aria-label="Aktiv" className={`schalter ${aktiv ? 'an' : ''}`} onClick={() => setAktiv(!aktiv)}><span /></button>
          </div>
          <div className="schalter-zeile">
            <div className="zeile-text">
              <span className="zeile-titel">Ausblenden</span>
              <span className="klein">Zählt weiter mit, wird nur nicht angezeigt</span>
            </div>
            <button type="button" role="switch" aria-checked={ausgeblendet} aria-label="Ausblenden" className={`schalter ${ausgeblendet ? 'an' : ''}`} onClick={() => setAusgeblendet(!ausgeblendet)}><span /></button>
          </div>

          {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}

          <button className="knopf-primaer" type="submit" disabled={laedt}>{laedt ? 'Speichere …' : 'Speichern'}</button>

          {konto && onLoeschen && !loeschenBestaetigen && (
            <button type="button" className="knopf-link knopf-gefahr" onClick={() => setLoeschenBestaetigen(true)}>Konto löschen</button>
          )}
          {konto && loeschenBestaetigen && (
            <div className="meldung meldung-fehler">
              <p>„{konto.name}“ endgültig löschen? Das lässt sich nicht rückgängig machen. Wenn du das Konto nur nicht mehr nutzt, schalte lieber „Aktiv“ aus.</p>
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
