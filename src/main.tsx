import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// Hintergrunddienst für Offline und Installation.
// Bei einem Update lädt die App sich selbst neu, damit sofort die neue Version läuft.
// Außerdem wird stündlich und beim Zurückkehren in die App nach Updates gesucht.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    setInterval(() => reg.update(), 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
