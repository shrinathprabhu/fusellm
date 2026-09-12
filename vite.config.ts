import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { seo } from './seo/plugin.ts'

export default defineConfig({
  // Served from the root of fusellm.lowkey.tools, its own host.
  base: '/',
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        // React changes rarely and markdown-it only loads with the first
        // reply; keep both out of the app chunk so a UI release does not
        // invalidate them.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (/[\\/](markdown-it|linkify-it|mdurl|uc\.micro|entities|punycode)[\\/]/.test(id)) return 'markdown'
        },
      },
    },
  },
  plugins: [
    react(),
    seo(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'robots.txt'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The OAuth landing page must always come from the network, fresh.
        globIgnores: ['**/og.png', '**/oauth.html', '**/oauth.js', '**/o200k_base-*.js'],
        // (og.png is for crawlers and link previews; precaching it would
        // cost every visitor bytes they never see. The same goes for the
        // 2 MB tokenizer, which only the token calculator loads: it is
        // cached on first use by the rule below instead.)
        navigateFallback: 'index.html',
        // Text files must be served as themselves, never as the app shell.
        navigateFallbackDenylist: [/\.(txt|xml|json|webmanifest|png|svg|ico)$/, /(^|\/)assets\//, /(^|\/)oauth(?:\.html)?\/?$/],
        cleanupOutdatedCaches: true,
        // API calls go to providers on other origins and are never cached.
        // The only runtime cache is the tokenizer chunk, which is
        // content-hashed and therefore safe to keep until it changes.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /\/assets\/o200k_base-[\w-]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'fusellm-tokenizer', expiration: { maxEntries: 2 } },
          },
        ],
      },
      manifest: {
        id: '/',
        name: 'FuseLLM: multi-model AI circuits',
        short_name: 'FuseLLM',
        description:
          'Bring your own keys for Claude, ChatGPT, Gemini, Grok, DeepSeek and more, then wire them into circuits that build, review and research on their own. Runs in your browser.',
        lang: 'en',
        dir: 'ltr',
        categories: ['productivity', 'developer', 'utilities'],
        theme_color: '#121316',
        background_color: '#faf9f6',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        start_url: '/',
        scope: '/',
        launch_handler: { client_mode: 'focus-existing' },
        // Share text or a link into FuseLLM from any app; it lands in Home's
        // prompt box, ready to send to a model or a circuit.
        share_target: { action: '/', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        prefer_related_applications: false,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'New chat', short_name: 'Chat', url: '/#/chat', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Circuits', short_name: 'Circuits', url: '/#/circuits', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Models and keys', short_name: 'Keys', url: '/#/models', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
        ],
        screenshots: [
          { src: '/og.png', sizes: '1200x630', type: 'image/png', form_factor: 'wide', label: 'FuseLLM: wire AI models into circuits that finish the job' },
        ],
      },
    }),
  ],
})
