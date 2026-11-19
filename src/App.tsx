import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ladeKonten, leseCache, type Konto } from './lib/konten'
import { ladePosten, leseCache as lesePostenCache, type Posten } from './lib/posten'
import { ladeToepfe, leseCache as leseToepfeCache, type Topf } from './lib/toepfe'
import { ladeAbgleiche, leseCache as leseAbgleichCache, type Abgleich } from './lib/abgleich'
import AbgleichScreen from './screens/AbgleichScreen'
import { grundplan, ladeSzenarien, leseCache as leseSzenarienCache, type Szenario } from './lib/szenarien'
import SzenarioScreen from './screens/SzenarioScreen'
import { ladeListen, leseListenCache, lesePositionenCache, listenAlsPosten, type Liste, type Position } from './lib/listen'
import { monatsIndex } from './lib/posten'
import { supabase } from './lib/supabase'
import { ladeThemeWahl, speichereThemeWahl, systemIstDunkel, wendeThemeAn, type ThemeWahl } from './lib/theme'
import Einstellungen from './screens/Einstellungen'
import Konten from './screens/Konten'
import Login from './screens/Login'
import Planen from './screens/Planen'
import PrognoseScreen from './screens/PrognoseScreen'
import Toepfe from './screens/Toepfe'
import Uebersicht from './screens/Uebersicht'
import './app.css'

type TabId = 'uebersicht' | 'planen' | 'prognose' | 'toepfe' | 'konten' | 'einstellungen' | 'abgleich' | 'szenario'

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'uebersicht', label: 'Übersicht', icon: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" /> },
  { id: 'planen', label: 'Planen', icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
  { id: 'prognose', label: 'Prognose', icon: <><path d="M3 3v18h18" /><polyline points="7,15 11,11 14,13 20,7" /></> },
  { id: 'toepfe', label: 'Töpfe', icon: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></> },
  { id: 'konten', label: 'Konten', icon: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></> },
]

const TITEL: Record<TabId, string> = {
  uebersicht: 'Übersicht',
  planen: 'Planen',
  prognose: 'Prognose',
  toepfe: 'Töpfe',
  konten: 'Konten',
  einstellungen: 'Einstellungen',
  abgleich: 'Monatsabgleich',
  szenario: 'Szenario',
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export default function App() {
  const [theme, setTheme] = useState<ThemeWahl>(ladeThemeWahl)
  const [session, setSession] = useState<Session | null>(null)
  const [authGeladen, setAuthGeladen] = useState(false)
  const [tab, setTab] = useState<TabId>('uebersicht')
  const [konten, setKonten] = useState<Konto[]>(leseCache)
  const [posten, setPosten] = useState<Posten[]>(lesePostenCache)
  const [toepfe, setToepfe] = useState<Topf[]>(leseToepfeCache)
  const [abgleiche, setAbgleiche] = useState<Abgleich[]>(leseAbgleichCache)
  const [szenarien, setSzenarien] = useState<Szenario[]>(leseSzenarienCache)
  const [listen, setListen] = useState<Liste[]>(leseListenCache)
  const [positionen, setPositionen] = useState<Position[]>(lesePositionenCache)
  const [toepfeAnsicht, setToepfeAnsicht] = useState<'toepfe' | 'listen'>('toepfe')
  const [szenarioId, setSzenarioId] = useState<string | null>(null) // im Editor geöffnet
  const [vergleichId, setVergleichIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('finanzplan.prognose.vergleich')
    } catch {
      return null
    }
  })
  const setVergleichId = (id: string | null) => {
    setVergleichIdState(id)
    try {
      if (id) localStorage.setItem('finanzplan.prognose.vergleich', id)
      else localStorage.removeItem('finanzplan.prognose.vergleich')
    } catch {
      /* ignorieren */
    }
  }
  const [offline, setOffline] = useState(false)

  // Theme anwenden und bei "wie System" auf Systemwechsel reagieren
  useEffect(() => {
    wendeThemeAn(theme)
    speichereThemeWahl(theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => theme === 'system' && wendeThemeAn('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  // Login-Status
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthGeladen(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const neuLaden = useCallback(async () => {
    const [k, p, t, a, s, l] = await Promise.all([ladeKonten(), ladePosten(), ladeToepfe(), ladeAbgleiche(), ladeSzenarien(), ladeListen()])
    setKonten(k.konten)
    setPosten(p.posten)
    setToepfe(t.toepfe)
    setAbgleiche(a.abgleiche)
    setSzenarien(s.szenarien)
    setListen(l.listen)
    setPositionen(l.positionen)
    setOffline(k.offline || p.offline || t.offline || a.offline || s.offline || l.offline)
  }, [])

  // Daten laden, sobald eingeloggt – und immer, wenn die App wieder in den Vordergrund kommt.
  // So sieht der Laptop Änderungen vom Handy und umgekehrt.
  useEffect(() => {
    if (!session) return
    neuLaden()
    const onSichtbar = () => document.visibilityState === 'visible' && neuLaden()
    document.addEventListener('visibilitychange', onSichtbar)
    window.addEventListener('online', neuLaden)
    return () => {
      document.removeEventListener('visibilitychange', onSichtbar)
      window.removeEventListener('online', neuLaden)
    }
  }, [session, neuLaden])

  if (!authGeladen) return null
  if (!session) return <Login />

  // Grundplan: alles außer Szenario-Posten. Nur die Prognose und der Szenario-Editor sehen alle.
  const basisPosten = grundplan(posten)
  // Eingeplante Einkäufe gehen als einmalige Ausgaben in Plan und Prognose
  const listenPosten = listenAlsPosten(listen, positionen, monatsIndex(new Date()))
  const planPosten = [...basisPosten, ...listenPosten]
  const offenesSzenario = szenarien.find((s) => s.id === szenarioId) ?? null
  const istDunkel = theme === 'dunkel' || (theme === 'system' && systemIstDunkel())
  const monat = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

  return (
    <div className="layout">
      <aside className="seitenmenue">
        <span className="logo">Finanzplan</span>
        <nav className="seitennav">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'aktiv' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <Icon>{t.icon}</Icon>
              {t.label}
            </button>
          ))}
          <button className={tab === 'einstellungen' ? 'aktiv' : ''} onClick={() => setTab('einstellungen')}>
            <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Icon>
            Einstellungen
          </button>
        </nav>
      </aside>

      <main className="inhalt">
        <header className="kopf">
          <div>
            <span className="klein">{monat}</span>
            <h1>{TITEL[tab]}</h1>
          </div>
          <div className="kopf-knoepfe">
            <button
              className="icon-knopf"
              aria-label={istDunkel ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'}
              onClick={() => setTheme(istDunkel ? 'hell' : 'dunkel')}
            >
              {istDunkel ? (
                <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
              ) : (
                <Icon><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Icon>
              )}
            </button>
            <button className="icon-knopf nur-handy" aria-label="Einstellungen" onClick={() => setTab('einstellungen')}>
              <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Icon>
            </button>
          </div>
        </header>

        {tab === 'uebersicht' && <Uebersicht konten={konten} posten={planPosten} toepfe={toepfe} zuKonten={() => setTab('konten')} zuPlanen={() => setTab('planen')} zuPrognose={() => setTab('prognose')} zuAbgleich={() => setTab('abgleich')} abgleiche={abgleiche} />}
        {tab === 'planen' && <Planen posten={basisPosten} listenPosten={listenPosten} zuListen={() => { setToepfeAnsicht('listen'); setTab('toepfe') }} toepfe={toepfe} konten={konten} offline={offline} neuLaden={neuLaden} />}
        {tab === 'prognose' && (
          <PrognoseScreen
            konten={konten}
            posten={[...posten, ...listenPosten]}
            toepfe={toepfe}
            szenarien={szenarien}
            vergleichId={vergleichId}
            setVergleichId={setVergleichId}
            oeffneSzenario={(id) => {
              setSzenarioId(id)
              setTab('szenario')
            }}
            neuLaden={neuLaden}
            offline={offline}
          />
        )}
        {tab === 'toepfe' && <Toepfe toepfe={toepfe} listen={listen} positionen={positionen} ansicht={toepfeAnsicht} setAnsicht={setToepfeAnsicht} konten={konten} offline={offline} neuLaden={neuLaden} />}
        {tab === 'konten' && <Konten konten={konten} offline={offline} neuLaden={neuLaden} zuAbgleich={() => setTab('abgleich')} />}
        {tab === 'abgleich' && (
          <AbgleichScreen konten={konten} posten={planPosten} toepfe={toepfe} abgleiche={abgleiche} offline={offline} neuLaden={neuLaden} fertig={() => setTab('uebersicht')} />
        )}
        {tab === 'szenario' && offenesSzenario && (
          <SzenarioScreen
            key={offenesSzenario.id}
            szenario={offenesSzenario}
            posten={[...posten, ...listenPosten]}
            konten={konten}
            toepfe={toepfe}
            offline={offline}
            neuLaden={neuLaden}
            zurPrognose={() => {
              setVergleichId(offenesSzenario.id)
              setTab('prognose')
            }}
            geloescht={() => {
              if (vergleichId === offenesSzenario.id) setVergleichId(null)
              setTab('prognose')
            }}
          />
        )}
        {tab === 'einstellungen' && <Einstellungen theme={theme} setTheme={setTheme} email={session.user.email} />}
      </main>

      <nav className="leiste">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'aktiv' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <Icon>{t.icon}</Icon>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
