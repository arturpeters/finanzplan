import { useEffect, useState } from 'react'
import { exportiereDaten } from '../lib/export'
import { loescheCache } from '../lib/konten'
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
}

export default function Einstellungen({ theme, setTheme, email }: Props) {
  const [server, setServer] = useState<Status>('pruefe')
  const [installiert, setInstalliert] = useState<Status>('pruefe')
  const [offlineFaehig, setOfflineFaehig] = useState<Status>('pruefe')
  const [exportLaeuft, setExportLaeuft] = useState(false)
  const [exportMeldung, setExportMeldung] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    pruefeVerbindung().then((ok) => setServer(ok ? 'ok' : 'fehler'))
    setInstalliert(window.matchMedia('(display-mode: standalone)').matches ? 'ok' : 'fehler')
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => setOfflineFaehig(reg ? 'ok' : 'fehler'))
    } else setOfflineFaehig('fehler')
  }, [])

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

      <section className="karte liste">
        <StatusZeile label="Server erreichbar" status={server} hinweis="Verbindung zu Supabase (Frankfurt)" />
        <StatusZeile label="Als App installiert" status={installiert} hinweis="Vom Startbildschirm geöffnet, nicht im Browser" />
        <StatusZeile label="Offline-fähig" status={offlineFaehig} hinweis="Hintergrunddienst registriert (ab 2. Start)" />
      </section>

      <section className="karte">
        <span className="zeile-titel">Sicherung</span>
        <span className="klein">
          Speichert alle deine Konten, Posten, Töpfe und Abgleiche als Datei. Supabase macht im kostenlosen Plan keine automatischen Backups – ein Export ab und zu (z. B. nach dem Monatsabgleich) schützt deine Planung.
        </span>
        <button
          className="knopf-zweit"
          disabled={exportLaeuft}
          onClick={async () => {
            setExportLaeuft(true)
            setExportMeldung(null)
            const f = await exportiereDaten()
            setExportLaeuft(false)
            setExportMeldung(f ? { ok: false, text: f } : { ok: true, text: 'Export erstellt.' })
          }}
        >
          {exportLaeuft ? 'Exportiere …' : 'Daten exportieren'}
        </button>
        {exportMeldung && <p className={`meldung ${exportMeldung.ok ? 'meldung-ok' : 'meldung-fehler'}`} role="status">{exportMeldung.text}</p>}
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
            await supabase.auth.signOut()
          }}
        >
          Abmelden
        </button>
      </section>
    </>
  )
}
