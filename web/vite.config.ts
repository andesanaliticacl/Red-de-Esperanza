import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Red de Esperanza',
        short_name: 'Esperanza',
        description: 'Reporta y coordina necesidades de emergencia en un mapa colaborativo.',
        theme_color: '#002FA7',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Importa el manejador de notificaciones push dentro del SW generado,
        // para recibir avisos con la app cerrada / en segundo plano.
        importScripts: ['push-sw.js'],
        // Cachea la app shell y los tiles base del mapa para abrir con señal débil.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.host.endsWith('tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Datos de Supabase (lecturas GET): red primero y, si no hay, la
            // última copia guardada. Así el mapa muestra lo último visto aunque
            // se abra sin Internet. Solo GET (Workbox no cachea escrituras).
            urlPattern: ({ url }) =>
              url.hostname.endsWith('.supabase.co') &&
              url.pathname.startsWith('/rest/'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'supabase-datos',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
