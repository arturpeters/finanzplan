import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Modus = 'anmelden' | 'registrieren'

function fehlerAufDeutsch(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort stimmt nicht.'
  if (/email not confirmed/i.test(msg)) return 'Die E-Mail ist noch nicht bestätigt. Klick zuerst auf den Link in der Bestätigungs-Mail.'
  if (/already registered/i.test(msg)) return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.'
  if (/password should be at least/i.test(msg)) return 'Das Passwort ist zu kurz (mindestens 8 Zeichen).'
  if (/rate limit/i.test(msg)) return 'Zu viele Versuche. Bitte ein paar Minuten warten.'
  if (/failed to fetch|network/i.test(msg)) return 'Keine Verbindung zum Server. Bist du online?'
  return msg
}

export default function Login() {
  const [modus, setModus] = useState<Modus>('anmelden')
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setHinweis(null)
    if (modus === 'registrieren' && passwort.length < 8) {
      setFehler('Das Passwort braucht mindestens 8 Zeichen.')
      return
    }
    setLaedt(true)
    if (modus === 'anmelden') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })
      if (error) setFehler(fehlerAufDeutsch(error.message))
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: passwort,
        options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
      })
      if (error) setFehler(fehlerAufDeutsch(error.message))
      else if (!data.session) {
        setHinweis(
          'Fast geschafft: Du bekommst gleich eine Mail. Klick auf den Link darin. Falls danach eine Fehlerseite kommt, ist das egal – die Bestätigung hat trotzdem geklappt. Dann hier anmelden.',
        )
        setModus('anmelden')
      }
    }
    setLaedt(false)
  }

  return (
    <div className="login">
      <div className="login-karte">
        <div className="login-logo" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4,16 9,11 13,14 20,6" />
          </svg>
        </div>
        <h1>{modus === 'anmelden' ? 'Anmelden' : 'Konto anlegen'}</h1>
        <p className="klein">Deine Daten liegen nur in deinem Konto und werden zwischen Handy und Laptop abgeglichen.</p>

        <form onSubmit={absenden} className="formular">
          <label className="feld">
            <span>E-Mail</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="feld">
            <span>Passwort</span>
            <input
              type="password"
              autoComplete={modus === 'anmelden' ? 'current-password' : 'new-password'}
              required
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
            />
          </label>
          {fehler && <p className="meldung meldung-fehler" role="alert">{fehler}</p>}
          {hinweis && <p className="meldung meldung-ok" role="status">{hinweis}</p>}
          <button className="knopf-primaer" type="submit" disabled={laedt}>
            {laedt ? 'Moment …' : modus === 'anmelden' ? 'Anmelden' : 'Konto anlegen'}
          </button>
        </form>

        <button
          className="knopf-link"
          onClick={() => {
            setModus(modus === 'anmelden' ? 'registrieren' : 'anmelden')
            setFehler(null)
          }}
        >
          {modus === 'anmelden' ? 'Noch kein Konto? Jetzt anlegen' : 'Schon ein Konto? Anmelden'}
        </button>
      </div>
    </div>
  )
}
