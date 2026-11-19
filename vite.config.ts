import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Auf GitHub Pages läuft die App unter /<repo-name>/.
// Der Pfad kommt beim Build aus der Umgebungsvariable BASE_PATH (siehe .github/workflows/deploy.yml).
const base = process.env.BASE_PATH ?? '/'

// Arbeitstitel – wird ersetzt, sobald der App-Name feststeht.
const APP_NAME = 'Finanzplan'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: 'Einnahmen, Fixkosten, Töpfe und Vermögen planen',
        lang: 'de',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f4f6f9',
        theme_color: '#0f766e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
