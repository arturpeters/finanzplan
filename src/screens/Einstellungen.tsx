import { useEffect, useState } from 'react'
import { abgleichKalender, gibDateiAus } from '../lib/datei'
import { loescheCache as loescheEinstellungenCache, notgroschenKonten, speichereEinstellungen, type Einstellungen as EinstellungenDaten } from '../lib/einstellungen'
import { exportiereDaten, leseSicherung, spieleEin, type Sicherung } from '../lib/export'
import { betragFuerEingabe, formatEuro, parseBetrag } from '../lib/format'
import { artLabel, loescheCache, type Konto } from '../lib/konten'
import { loescheCache as loeschePostenCache } from '../lib/posten'
import { loescheCache as loescheToepfeCache } from '../lib/toepfe'
import { loescheCache as loescheAbgleichCache } from '../lib/abgleich'
import { loescheCache as loescheSzenarienCache } from '../lib/szenarien'
import { loescheCache as loescheListenCache } from '../lib/listen'
import { pruefeVerbindung, supabase } from '../lib/supabase'
import type { ThemeWahl } from '../lib/theme'

type Status = 'pruefe' | 'ok' | 'fehler'

function StatusZeile({ label, status, hinweis }: { label: string; status: Status; hinweis: string }) {
  const text = status === 'ok' ? 'ok' : status === 'fehler' ? 'nein' : '…'
  return (
    <div className="zeile">
      <div className="zeile-text">
        <span className="zeile-titel">{label}</span>
        <span className="klein">{hinweis}</span>
      </div>
      <span className={`badge badge-${status}`}>{text}</span>
    </div>
  )
}

interface Props {
  theme: ThemeWahl
  setTheme: (t: ThemeWahl) => void
  email: string | undefined
  konten: Konto[]
  einstellungen: EinstellungenDaten
  offline: boolean
  neuLaden: () => Promise<void>
}

const TABELLEN_NAMEN: Record<string, string> = {
  konten: 'Konten',
  szenarien: 'Szenarien',
  posten: 'Posten',
  toepfe: 'Töpfe',
  abgleiche: 'Abgleiche',
  listen: 'Einkaufslisten',
  listen_positionen: 'Listen-Positionen',
  einstellungen: 'Einstellungen',
}

export default function Einstellungen({ theme, setTheme, email, konten, einstellungen, offline, neuLaden }: Props) {
  const [server, setServer] = useState<Status>('pruefe')
  const [installiert, setInstalliert] = useState<Status>('pruefe')
  const [offlineFaehig, setOfflineFaehig] = useState<Status>('pruefe')
  const [exportLaeuft, setExportLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string; wo: string } | null>(null)

  // Notgroschen
  const [monate, setMonate] = useState(String(einstellungen.notgroschen_monate))
  const [lebenshaltung, setLebenshaltung] = useState(einstellungen.notgroschen_lebenshaltung ? betragFuerEingabe(einstellungen.notgroschen_lebenshaltung) : '')
  const [auswahl, setAuswahl] = useState<Set<string>>(() => new Set(notgroschenKonten(konten, einstellungen).map((k) => k.id)))
  // Wenn die Einstellungen vom Server nachgeladen werden (z. B. vom anderen Gerät geändert), Formular angleichen
  const einstellungenText = JSON.stringify(einstellungen)
  const kontenText = konten.map((k) => k.id + k.art + k.aktiv).join()
  useEffect(() => {
    setMonate(String(einstellungen.notgroschen_monate))
    setLebenshaltung(einstellungen.notgroschen_lebenshaltung ? betragFuerEingabe(einstellungen.notgroschen_lebenshaltung) : '')
    setAuswahl(new Set(notgroschenKonten(konten, einstellungen).map((k) => k.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [einstellungenText, kontenText])

  // Einspielen
  const [sicherung, setSicherung] = useState<Sicherung | null>(null)
  const [einspielenLaeuft, setEinspielenLaeuft] = useState(false)

  useEffect(() => {
    pruefeVerbindung().then((ok) => setServer(ok ? 'ok' : 'fehler'))
    setInstalliert(window.matchMedia('(display-mode: standalone)').matches ? 'ok' : 'fehler')
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => setOfflineFaehig(reg ? 'ok' : 'fehler'))
    } else setOfflineFaehig('fehler')
  }, [])

  const Meldung = ({ wo }: { wo: string }) =>
    meldung && meldung.wo === wo ? <p className={`meldung ${meldung.ok ? 'meldung-ok' : 'meldung-fehler'}`} role="status">{meldung.text}</p> : null

  async function notgroschenSpeichern() {
    const m = Number(monate)
    const l = lebenshaltung.trim() === '' ? 0 : parseBetrag(lebenshaltung)
    if (!Number.isInteger(m) || m < 0 || m > 24) return setMeldung({ ok: false, text: 'Monate bitte als ganze Zahl von 0 bis 24.', wo: 'not' })
    if (l === null || l < 0) return setMeldung({ ok: false, text: 'Den Betrag für Lebenshaltung verstehe ich nicht.', wo: 'not' })
    const f = await speichereEinstellungen({ ...einstellungen, notgroschen_monate: m, notgroschen_lebenshaltung: l, notgroschen_konten: [...auswahl] })
    setMeldung(f ? { ok: false, text: f, wo: 'not' } : { ok: true, text: 'Gespeichert – gilt auch auf deinen anderen Geräten.', wo: 'not' })
    await neuLaden()
  }

  const aktiveKonten = konten.filter((k) => k.aktiv && k.art !== 'kredit')
  const appUrl = window.location.origin + import.meta.env.BASE_URL

  return (
    <>
      <section className="karte">
        <span className="zeile-titel">Darstellung</span>
        <div className="segment" role="radiogroup" aria-label="Darstellung">
          {(['hell', 'dunkel', 'system'] as ThemeWahl[]).map((w) => (
            <button key={w} role="radio" aria-checked={theme === w} className={theme === w ? 'aktiv' : ''} onClick={() => setTheme(w)}>
              {w === 'hell' ? 'Hell' : w === 'dunkel' ? 'Dunkel' : 'Wie System'}
            </button>
          ))}
        </div>
      </section>

      <section className="karte">
        <span className="zeile-titel">Notgroschen</span>
        <span className="klein">
          Eine Reserve für Unerwartetes, z. B. Reparaturen. Bedarf pro Monat = deine Fixkosten (Jahresabos anteilig) plus Lebenshaltung wie Essen. Oft werden 3 Monate empfohlen; 0 blendet die Karte aus.
        </span>
        <div className="feld-reihe">
          <label className="feld"><span>Wie viele Monate?</span><input inputMode="numeric" value={monate} onChange={(e) => setMonate(e.target.value)} /></label>
          <label className="feld"><span>Lebenshaltung pro Monat (€)</span><input inputMode="decimal" placeholder="z. B. 300" value={lebenshaltung} onChange={(e) => setLebenshaltung(e.target.value)} /></label>
        </div>
        <span className="klein">Diese Konten zählen als Notgroschen:</span>
        {aktiveKonten.length === 0 && <span className="klein">Noch keine Konten angelegt.</span>}
        {aktiveKonten.map((k) => (
          <div key={k.id} className="schalter-zeile trenner">
            <div className="zeile-text">
              <span className="zeile-titel">{k.name}</span>
              <span className="klein">{artLabel(k.art)} · {formatEuro(k.startsaldo)}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={auswahl.has(k.id)}
              aria-label={`${k.name} zählt als Notgroschen`}
              className={`schalter ${auswahl.has(k.id) ? 'an' : ''}`}
              onClick={() => {
                const neu = new Set(auswahl)
                if (neu.has(k.id)) neu.delete(k.id)
                else neu.add(k.id)
                setAuswahl(neu)
              }}
            >
              <span />
            </button>
          </div>
        ))}
        <button className="knopf-zweit" onClick={notgroschenSpeichern} disabled={offline}>Notgroschen speichern</button>
        <Meldung wo="not" />
      </section>

      <section className="karte">
        <span className="zeile-titel">Erinnerung an den Monatsabgleich</span>
        <span className="klein">Legt in deinem Kalender einen Termin am 1. jedes Monats um 18 Uhr an, mit Erinnerung und Link zur App.</span>
        <button
          className="knopf-zweit"
          onClick={async () => {
            await gibDateiAus(abgleichKalender(appUrl), 'finanzplan-monatsabgleich.ics', 'text/calendar')
            setMeldung({ ok: true, text: 'Termin erstellt – öffne die Datei bzw. wähle deinen Kalender, um ihn zu übernehmen.', wo: 'kal' })
          }}
        >
          Termin in den Kalender
        </button>
        <Meldung wo="kal" />
      </section>

      <section className="karte liste">
        <StatusZeile label="Server erreichbar" status={server} hinweis="Verbindung zu Supabase (Frankfurt)" />
        <StatusZeile label="Als App installiert" status={installiert} hinweis="Vom Startbildschirm geöffnet, nicht im Browser" />
        <StatusZeile label="Offline-fähig" status={offlineFaehig} hinweis="Hintergrunddienst registriert (ab 2. Start)" />
      </section>

      <section className="karte">
        <span className="zeile-titel">Sicherung</span>
        <span className="klein">
          Speichert alles – Konten, Posten, Töpfe, Abgleiche, Szenarien, Einkaufslisten und Einstellungen – als Datei. Supabase macht im kostenlosen Plan keine automatischen Backups; ein Export nach dem Monatsabgleich schützt deine Planung.
        </span>
        <button
          className="knopf-zweit"
          disabled={exportLaeuft}
          onClick={async () => {
            setExportLaeuft(true)
            setMeldung(null)
            const f = await exportiereDaten()
            setExportLaeuft(false)
            setMeldung(f ? { ok: false, text: f, wo: 'exp' } : { ok: true, text: 'Export erstellt.', wo: 'exp' })
          }}
        >
          {exportLaeuft ? 'Exportiere …' : 'Daten exportieren'}
        </button>
        <Meldung wo="exp" />

        <label className="feld datei-feld">
          <span>Sicherung einspielen</span>
          <input
            type="file"
            accept="application/json,.json"
            disabled={offline}
            onChange={async (e) => {
              setMeldung(null)
              setSicherung(null)
              const datei = e.target.files?.[0]
              if (!datei) return
              if (datei.size > 5_000_000) return setMeldung({ ok: false, text: 'Die Datei ist zu groß für eine Sicherung.', wo: 'imp' })
              const r = leseSicherung(await datei.text())
              if (r.fehler) setMeldung({ ok: false, text: r.fehler, wo: 'imp' })
              else setSicherung(r.sicherung)
              e.target.value = ''
            }}
          />
        </label>
        {sicherung && (
          <div className="meldung meldung-warn">
            <p>
              Sicherung vom {sicherung.exportiert_am ? new Date(sicherung.exportiert_am).toLocaleString('de-DE') : 'unbekannten Datum'}:{' '}
              {Object.entries(sicherung.anzahl).map(([t, n]) => `${n} ${TABELLEN_NAMEN[t] ?? t}`).join(', ')}.
            </p>
            <p>
              <strong>Was passiert:</strong> Gelöschtes kommt zurück. Einträge, die es noch gibt, werden auf den Stand der Sicherung zurückgesetzt – Änderungen seit der Sicherung gehen dabei verloren. Was du seitdem neu angelegt hast, bleibt. Es wird nichts gelöscht.
            </p>
            <div className="knopf-reihe">
              <button className="knopf-zweit" onClick={() => setSicherung(null)}>Abbrechen</button>
              <button
                className="knopf-primaer"
                disabled={einspielenLaeuft || offline}
                onClick={async () => {
                  setEinspielenLaeuft(true)
                  const f = await spieleEin(sicherung)
                  setEinspielenLaeuft(false)
                  setSicherung(null)
                  setMeldung(f ? { ok: false, text: f, wo: 'imp' } : { ok: true, text: 'Sicherung eingespielt.', wo: 'imp' })
                  await neuLaden()
                }}
              >
                {einspielenLaeuft ? 'Spiele ein …' : 'Jetzt einspielen'}
              </button>
            </div>
          </div>
        )}
        <Meldung wo="imp" />
      </section>

      <section className="karte">
        <span className="klein">Angemeldet als</span>
        <span className="zeile-titel">{email ?? '—'}</span>
        <button
          className="knopf-zweit"
          onClick={async () => {
            loescheCache()
            loeschePostenCache()
            loescheToepfeCache()
            loescheAbgleichCache()
            loescheSzenarienCache()
            loescheListenCache()
            loescheEinstellungenCache()
            await supabase.auth.signOut()
          }}
        >
          Abmelden
        </button>
      </section>
    </>
  )
}
