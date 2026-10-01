/**
 * Renders every icon and the social card from one mark, so the favicon, the
 * PWA icons and og.png can never drift apart. Run with `npm run icons` after
 * changing the geometry (it matches src/components/Brand.tsx).
 */
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'

const INK = '#f3efe6'
const PLATE = '#141518'
const ACCENT = '#e08a3c'

// The mark on a 64-unit grid: two nodes, a wire, a spark where they fuse.
const mark = (ink, accent, cut) => `
  <path d="M17 18C35 18 29 46 47 46" fill="none" stroke="${ink}" stroke-width="5.5" stroke-linecap="round"/>
  <circle cx="14" cy="18" r="8.5" fill="${ink}"/>
  <circle cx="50" cy="46" r="8.5" fill="${ink}"/>
  <path d="M32 19.5 35.2 28.8 44.5 32 35.2 35.2 32 44.5 28.8 35.2 19.5 32 28.8 28.8Z" fill="${accent}" stroke="${cut}" stroke-width="2.5" stroke-linejoin="round"/>`

/** A plated icon. `radius` rounds the plate; `scale` pulls art into the maskable safe zone. */
function plated(radius, scale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${radius}" fill="${PLATE}"/>
  <circle cx="50" cy="50" r="38" fill="${ACCENT}" opacity="0.10"/>
  <g transform="translate(50 50) scale(${scale}) translate(-32 -32)">${mark(INK, ACCENT, PLATE)}</g>
</svg>`
}

const favicon = plated(24, 1.2)
writeFileSync('public/favicon.svg', favicon + '\n')

function png(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
}

function save(file, buf, size) {
  writeFileSync(file, buf)
  console.log(`${file.padEnd(32)} ${size ? `${size}x${size}` : ''}  ${(buf.length / 1024).toFixed(1)} kB`)
}

save('public/icon-192.png', png(plated(22, 1.2), 192), 192)
save('public/icon-512.png', png(plated(22, 1.2), 512), 512)
save('public/icon-maskable-512.png', png(plated(0, 0.95), 512), 512)
save('public/apple-touch-icon.png', png(plated(0, 1.1), 180), 180)

// favicon.ico: a single 32px PNG inside an ICO container, which every
// browser since IE11 reads. Six-byte header, one 16-byte directory entry.
const ico32 = png(plated(24, 1.2), 32)
const head = Buffer.alloc(22)
head.writeUInt16LE(0, 0)
head.writeUInt16LE(1, 2)
head.writeUInt16LE(1, 4)
head.writeUInt8(32, 6)
head.writeUInt8(32, 7)
head.writeUInt8(0, 8)
head.writeUInt8(0, 9)
head.writeUInt16LE(1, 10)
head.writeUInt16LE(32, 12)
head.writeUInt32LE(ico32.length, 14)
head.writeUInt32LE(22, 18)
save('public/favicon.ico', Buffer.concat([head, ico32]), 32)

// The social card, 1200x630 for Open Graph and Twitter. Drawn with a system
// sans because resvg cannot read the woff2 files the app ships.
const face = 'Helvetica Neue, Helvetica, Arial, sans-serif'
const mono = 'Menlo, Consolas, monospace'
// Counts on the card come from the catalog and the library, so they stay true.
const countOf = (file, re) => (readFileSync(file, 'utf8').match(re) ?? []).length
const catalog = readFileSync('src/ai/catalog.ts', 'utf8')
const MODEL_COUNT = (catalog.slice(catalog.indexOf('export const MODELS'), catalog.indexOf('export const RETIRED_MODELS')).match(/^ {4}id: '/gm) ?? []).length
const TEMPLATE_COUNT = ['classic', 'engineering', 'business', 'knowledge', 'life', 'jev', 'daily'].reduce((n, f) => n + countOf(`src/library/circuits/${f}.ts`, /^ {2}(tpl\(\{|\{\n {4}id: 'tpl-)/gm), 0)

const node = (x, y, role, model, dot, status, w = 320) => `
  <rect x="${x}" y="${y}" width="${w}" height="128" rx="18" fill="#1c1e23" stroke="#30343c" stroke-width="2"/>
  <text x="${x + 24}" y="${y + 38}" fill="#8a909a" font-family="${face}" font-size="17" font-weight="700" letter-spacing="2">${role}</text>
  <circle cx="${x + 30}" cy="${y + 68}" r="7" fill="${dot}"/>
  <text x="${x + 46}" y="${y + 76}" fill="${INK}" font-family="${face}" font-size="25" font-weight="700">${model}</text>
  <text x="${x + 24}" y="${y + 108}" fill="#9aa0a8" font-family="${mono}" font-size="16">${status}</text>`
const wire = (x1, x2, y) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${ACCENT}" stroke-width="3" stroke-dasharray="7 6"/><circle cx="${(x1 + x2) / 2}" cy="${y}" r="6" fill="${ACCENT}"/>`

const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.15" cy="0" r="0.9">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="${PLATE}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(84 62) scale(1.35)">${mark(INK, ACCENT, PLATE)}</g>
  <text x="186" y="118" fill="${INK}" font-family="${face}" font-size="56" font-weight="800" letter-spacing="-1.5">Fuse<tspan fill="${ACCENT}">LLM</tspan></text>
  <text x="84" y="218" fill="${INK}" font-family="${face}" font-size="54" font-weight="800" letter-spacing="-1.5">Describe a job.</text>
  <text x="84" y="282" fill="${INK}" font-family="${face}" font-size="54" font-weight="800" letter-spacing="-1.5">Get an AI circuit that <tspan fill="${ACCENT}">does it.</tspan></text>
  ${node(84, 334, 'ROUTE', 'Jev 1.13', '#0f766e', '⑂ answer: bug → Fix')}
  ${wire(404, 444, 398)}
  ${node(444, 334, 'BUILDER', 'Claude Fable 5.1', '#d97757', '✻ Generating… 18.2s')}
  ${wire(764, 804, 398)}
  ${node(804, 334, 'REVIEWER', 'GPT-6 Astra', '#10a37f', '✓ VERDICT: APPROVED')}
  <text x="84" y="534" fill="#aab0b8" font-family="${face}" font-size="25">Zapier for AI · Your own keys · ${MODEL_COUNT} models · ${TEMPLATE_COUNT} circuits · Free</text>
  <text x="84" y="580" fill="${ACCENT}" font-family="${face}" font-size="23" font-weight="600">fusellm.lowkey.tools · by @shrinath_prabhu</text>
</svg>`

save('public/og.png', new Resvg(card, { font: { loadSystemFonts: true } }).render().asPng())
