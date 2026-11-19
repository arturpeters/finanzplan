import { useState, type FormEvent } from 'react'
import { betragFuerEingabe, parseBetrag } from '../lib/format'
import type { Konto } from '../lib/konten'
import { KATEGORIEN, RHYTHMEN, type Posten, type PostenEingabe, type PostenTyp, type Rhythmus } from '../lib/posten'

interface Props {
  posten?: Posten
  vorgabeTyp?: PostenTyp
  szenarioId?: string // gesetzt = Posten gehört zu diesem Szenario
  konten: Konto[]
  onSpeichern: (eingabe: PostenEingabe) => Promise<string | null>
  onLoeschen?: () => Promise<string | null>
  onSchliessen: () => void
}

const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function aktuellerMonat(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const TYPEN: { wert: PostenTyp; label: string }[] = [
  { wert: 'einnahme', label: 'Einnahme' },
  { wert: 'ausgabe', label: 'Ausgabe' },
  { wert: 'umbuchung', label: 'Umbuchung' },
]

export default function PostenFormular({ posten, vorgabeTyp, szenarioId, konten, onSpeichern, onLoeschen, onSchliessen }: Props) {
  const aktiveKonten = konten.filter((k) => k.aktiv)
  const standardKonto = aktiveKonten.find((k) => k.art === 'giro')?.id ?? aktiveKonten[0]?.id ?? ''

  const [typ, setTyp] = useState<PostenTyp>(posten?.typ ?? vorgabeTyp ?? 'ausgabe')
  const [name, setName] = useState(posten?.name ?? '')
  const [betrag, setBetrag] = useState(posten ? betragFuerEingabe(posten.betrag) : '')
  const [rhythmus, setRhythmus] = useState<Rhythmus>(posten?.rhythmus ?? 'monatlich')
  const [faelligMonat, setFaelligMonat] = useState<number>(posten?.faellig_monat ?? new Date().getMonth() + 1)
  const [ab, setAb] = useState(posten ? posten.gueltig_ab.slice(0, 7) : aktuellerMonat())
  const [bis, setBis] = useState(posten?.gueltig_bis ? posten.gueltig_bis.slice(0, 7) : '')
  const [vonKonto, setVonKonto] = useState(posten?.von_konto_id ?? (posten ? '' : standardKonto))
  const [aufKonto, setAufKonto] = useState(posten?.auf_konto_id ?? (posten ? '' : standardKonto))
  const [kategorie, setKategorie] = useState(posten?.kategorie ?? '')
  const [aktiv, setAktiv] = useState(posten?.aktiv ?? true)
  const [kuendbarBis, setKuendbarBis] = useState(posten?.kuendbar_bis ?? '')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false)

  const einmalig = rhythmus === 'einmalig'
  const nichtMonatlich = rhythmus !== 'monatlich' && !einmalig

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    const zahl = parseBetrag(betrag)
    if (zahl === null || zahl < 0) {
      setFehler('Den Betrag verstehe ich nicht. Bitte ohne Minus eingeben, z. B. 45,90 – ob rein oder raus, sagt der Typ.')
      return
    }
    if (!ab) {
      setFehler(einmalig ? 'Bitte den Monat angeben.' : 'Bitte angeben, ab wann der Posten gilt.')
      return
    }
    if (!einmalig && bis && bis < ab) {
      setFehler('„Bis“ liegt vor „Ab“.')
      return
    }
    if (typ === 'umbuchung' && vonKonto && vonKonto === aufKonto) {
      setFehler('Bei einer Umbuchung müssen „von“ und „auf“ verschiedene Konten sein.')
      return
    }
    setLaedt(true)
    const f = await onSpeichern({
      name: name.trim(),
      typ,
      betrag: zahl,
      rhythmus,
      faellig_monat: nichtMonatlich ? faelligMonat : null,
      gueltig_ab: `${ab}-01`,
      gueltig_bis: einmalig ? `${ab}-01` : bis ? `${bis}-01` : null,
      von_konto_id: typ !== 'einnahme' ? vonKonto || null : null,
      auf_konto_id: typ !== 'ausgabe' ? aufKonto || null : null,
      kategorie: kategorie.trim() || null,
      notiz: posten?.notiz ?? null,
      aktiv,
      szenario_id: posten?.szenario_id ?? szenarioId ?? null,
      kuendbar_bis: typ === 'ausgabe' && !einmalig && kuendbarBis ? kuendbarBis : null,
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

  const kontoAuswahl = (wert: string, setzen: (v: string) => void, label: string) => (
    <label className="feld">
      <span>{label}</span>
      <select value={wert} onChange={(e) => setzen(e.target.value)}>
        <option value="">— kein bestimmtes Konto —</option>
        {aktiveKonten.map((k) => (
          <option key={k.id} value={k.id}>{k.name}{k.bank ? ` · ${k.bank}` : ''}</option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="posten-titel" onClick={onSchliessen}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-kopf">
          <h2 id="posten-titel">{posten ? 'Posten bearbeiten' : szenarioId ? 'Neuer Posten im Szenario' : 'Neuer Posten'}</h2>
          <button className="icon-knopf" aria-label="Schließen" onClick={onSchliessen}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <form className="formular" onSubmit={absenden}>
          <div className="segment" role="radiogroup" aria-label="Typ">
            {TYPEN.map((t) => (
              <button type="button" key={t.wert} role="radio" aria-checked={typ === t.wert} className={typ === t.wert ? 'aktiv' : ''} onClick={() => setTyp(t.wert)}>
                {t.label}
              </button>
            ))}
          </div>
          {typ === 'umbuchung' && <p className="klein hinweis">Geld, das du zwischen deinen Konten verschiebst, z. B. die Sparrate aufs Tagesgeld oder ins Depot. Ändert dein Vermögen nicht, ist aber verplant.</p>}

          <label className="feld">
            <span>Name</span>
            <input required maxLength={80} placeholder={typ === 'einnahme' ? 'z. B. Ausbildungsvergütung' : typ === 'ausgabe' ? 'z. B. Handyvertrag' : 'z. B. Sparrate Tagesgeld'} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="feld-reihe">
            <label className="feld">
              <span>Betrag (€)</span>
              <input required inputMode="decimal" placeholder="0,00" value={betrag} onChange={(e) => setBetrag(e.target.value)} />
            </label>
            <label className="feld">
              <span>Rhythmus</span>
              <select value={rhythmus} onChange={(e) => setRhythmus(e.target.value as Rhythmus)}>
                {RHYTHMEN.map((r) => (
                  <option key={r.wert} value={r.wert}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>

          {nichtMonatlich && (
            <label className="feld">
              <span>{rhythmus === 'jaehrlich' ? 'Wird bezahlt im' : 'Eine der Zahlungen ist im'}</span>
              <select value={faelligMonat} onChange={(e) => setFaelligMonat(Number(e.target.value))}>
                {MONATSNAMEN.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </label>
          )}

          <div className="feld-reihe">
            <label className="feld">
              <span>{einmalig ? 'Im Monat' : 'Gültig ab'}</span>
              <input type="month" required value={ab} onChange={(e) => setAb(e.target.value)} />
            </label>
            {!einmalig && (
              <label className="feld">
                <span>Gültig bis (optional)</span>
                <input type="month" value={bis} onChange={(e) => setBis(e.target.value)} />
              </label>
            )}
          </div>

          {typ === 'einnahme' && kontoAuswahl(aufKonto, setAufKonto, 'Geht auf Konto')}
          {typ === 'ausgabe' && kontoAuswahl(vonKonto, setVonKonto, 'Wird abgebucht von')}
          {typ === 'umbuchung' && (
            <div className="feld-reihe">
              {kontoAuswahl(vonKonto, setVonKonto, 'Von Konto')}
              {kontoAuswahl(aufKonto, setAufKonto, 'Auf Konto')}
            </div>
          )}

          {typ === 'ausgabe' && !einmalig && (
            <label className="feld">
              <span>Kündbar bis (optional)</span>
              <input type="date" value={kuendbarBis} onChange={(e) => setKuendbarBis(e.target.value)} />
              <span className="klein normal">Letzter Tag, an dem du kündigen kannst. Die Übersicht erinnert dich 30 Tage vorher.</span>
            </label>
          )}

          <label className="feld">
            <span>Kategorie (optional)</span>
            <input list="kategorien" maxLength={40} value={kategorie} onChange={(e) => setKategorie(e.target.value)} />
            <datalist id="kategorien">
              {KATEGORIEN.map((k) => <option key={k} value={k} />)}
            </datalist>
          </label>

          <div className="schalter-zeile">
            <div className="zeile-text">
              <span className="zeile-titel">Aktiv</span>
              <span className="klein">Aus = wird nicht mitgerechnet, bleibt aber gespeichert</span>
            </div>
            <button type="button" role="switch" aria-checked={aktiv} aria-label="Aktiv" className={`schalter ${aktiv ? 'an' : ''}`} onClick={() => setAktiv(!aktiv)}><span /></button>
          </div>

          {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}

          <button className="knopf-primaer" type="submit" disabled={laedt}>{laedt ? 'Speichere …' : 'Speichern'}</button>

          {posten && onLoeschen && !loeschenBestaetigen && (
            <button type="button" className="knopf-link knopf-gefahr" onClick={() => setLoeschenBestaetigen(true)}>Posten löschen</button>
          )}
          {posten && loeschenBestaetigen && (
            <div className="meldung meldung-fehler">
              <p>„{posten.name}“ endgültig löschen? Wenn er nur ausläuft, setz lieber „Gültig bis“ – dann stimmt auch die Vergangenheit in der Prognose.</p>
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
