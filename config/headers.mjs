/**
 * The response headers for every file Cloudflare serves, and the one place to
 * change them.
 *
 * `scripts/cloudflare-headers.mjs` turns these rules into `dist/_headers` at
 * build time, and `scripts/check-csp.mjs` verifies the generated file against
 * them for every built asset. Workers Static Assets read `_headers`; there is
 * no header section in `wrangler.jsonc`, and Cloudflare Pages is not used.
 * https://developers.cloudflare.com/workers/static-assets/headers/
 *
 * `path` matches a file's URL path as a whole-string regular expression, and
 * later rules win over earlier ones for the same header. Cloudflare *joins*
 * repeated headers with commas rather than replacing them, which is why the
 * generator writes only invariant headers into the `/*` block and repeats
 * everything else per path.
 *
 * App routes such as `/chat` and `/run/<id>` are not files: the Worker in
 * `worker/index.ts` serves them from the `/` asset, keeping these headers and
 * setting its own `Cache-Control` and `X-Robots-Tag`.
 */
export const HEADER_RULES = [
  {
    // Security headers for everything. `connect-src` allows any https origin
    // plus localhost because the browser talks straight to the provider and
    // MCP servers the user chooses; scripts are locked to 'self' plus the hash
    // of the theme snippet in index.html; remote images are blocked so model
    // output cannot leak data through an image URL; `frame-src blob:` is for
    // the built-in PDF viewer, which frames a blob the page made itself.
    path: '/(.*)',
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'sha256-GAZYsdRSo7dedVo8e6sxpGNkV6LHtPdN0TH2ConIw/A='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; worker-src 'self'; manifest-src 'self'; media-src 'self' blob: data:; object-src 'none'; frame-src blob:; child-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Resource-Policy': 'same-site',
      'X-DNS-Prefetch-Control': 'on',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'Permissions-Policy':
        'accelerometer=(), autoplay=(), bluetooth=(), camera=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=(), xr-spatial-tracking=(), interest-cohort=(), browsing-topics=(), clipboard-read=(), clipboard-write=(self), screen-wake-lock=(self), fullscreen=(self)',
    },
  },
  {
    // The OAuth callback. Cloudflare's HTML handling also serves it at /oauth.
    path: '/oauth\\.(html|js)',
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  },
  {
    // Hashed filenames: safe to cache forever.
    path: '/assets/(.*)',
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  },
  {
    path: '/(favicon\\.svg|favicon\\.ico|apple-touch-icon\\.png|icon-192\\.png|icon-512\\.png|icon-maskable-512\\.png)',
    headers: {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800, s-maxage=2592000',
    },
  },
  {
    // Social cards are fetched by other sites, so they need a cross-origin CORP.
    path: '/og\\.png',
    headers: {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  },
  {
    path: '/(sw\\.js|workbox-.*\\.js|registerSW\\.js)',
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  },
  {
    path: '/manifest\\.webmanifest',
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate, s-maxage=86400',
      'Content-Type': 'application/manifest+json; charset=utf-8',
    },
  },
  {
    // Crawler and answer-engine files, readable from anywhere.
    path: '/(robots\\.txt|llms\\.txt|llms-full\\.txt|humans\\.txt)',
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  },
  {
    path: '/sitemap\\.xml',
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Content-Type': 'application/xml; charset=utf-8',
    },
  },
  {
    // The app shell, which every release replaces.
    path: '/(index\\.html)?',
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  },
  {
    path: '/(404|404\\.html|offline-404|offline-404\\.html)',
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, follow',
    },
  },
]
