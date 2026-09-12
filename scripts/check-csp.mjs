/**
 * Post-build guard: every inline script in dist/index.html must be allowed by
 * a hash in vercel.json's Content-Security-Policy, and nothing else in the
 * build may rely on inline script. Editing the theme snippet in index.html
 * without updating the hash would otherwise ship a page whose first-paint
 * theme silently stops working in production. Fails the build with the
 * hash to paste.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const html = readFileSync('dist/index.html', 'utf8')
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
const origin = 'https://fusellm.lowkey.tools'
const canonical = `${origin}/`
const csp = vercel.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy')?.value ?? ''

let failed = false
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)) {
  const hash = `sha256-${createHash('sha256').update(m[1]).digest('base64')}`
  if (!csp.includes(`'${hash}'`)) {
    console.error(`✗ Inline script is not allowed by the CSP. Add '${hash}' to script-src in vercel.json.`)
    failed = true
  } else console.log(`✓ inline script allowed (${hash.slice(0, 20)}…)`)
}

for (const needle of ['<!--seo:landing-->', '<!--seo:jsonld-->']) {
  if (html.includes(needle)) {
    console.error(`✗ ${needle} was not replaced; the SEO plugin did not run.`)
    failed = true
  }
}
const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
try {
  const data = JSON.parse(ld?.[1] ?? '')
  for (const type of ['WebApplication', 'WebPage', 'WebSite']) {
    check(data['@graph']?.some(node => node['@type'] === type && node.url === canonical), `${type} must use the canonical root URL with its trailing slash.`)
  }
  console.log('✓ JSON-LD parses')
} catch {
  console.error('✗ JSON-LD is missing or invalid.')
  failed = true
}
if (!html.includes(`rel="canonical" href="${canonical}"`)) {
  console.error('✗ Canonical link missing.')
  failed = true
}

// Guard the deployed files, including generated metadata and PWA URLs.
function check(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`)
    failed = true
  }
}
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) inspect(path)
    else if (/\.(html|js|css|txt|xml|json|webmanifest)$/.test(entry.name)) {
      const text = readFileSync(path, 'utf8')
      check(!/https?:\/\/lowkey\.tools\/[a-z]/i.test(text), `${path} contains an old hub-path app URL.`)
      check(!/["'`]\/fusellm(?:\/|["'`])/.test(text), `${path} contains the old app base path.`)
      check(!text.includes(`${origin}//`), `${path} contains a doubled slash after the origin.`)
    }
  }
}
inspect('dist')

// Check Pages' additive header semantics against Vercel's effective policy.
// In particular, a global CORP value must not be joined to an OG/text override.
const pagesConfig = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'))
check(pagesConfig.pages_build_output_dir === './dist', 'Pages must deploy the dist build output.')
const pagesRules = []
for (const line of readFileSync('dist/_headers', 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue
  if (!/^\s/.test(line)) pagesRules.push({ path: line, headers: {} })
  else {
    const [, key, value] = line.match(/^\s+([^:]+):\s*(.*)$/) ?? []
    check(Boolean(key), `Invalid Pages header line: ${line}`)
    if (key) {
      const headers = pagesRules.at(-1).headers
      headers[key] = headers[key] ? `${headers[key]}, ${value}` : value
    }
  }
}
function checkPagesPath(path, vercelPath = path) {
  const actual = {}
  for (const rule of pagesRules.filter(rule => rule.path === '/*' || rule.path === path)) {
    for (const [key, value] of Object.entries(rule.headers)) {
      actual[key] = actual[key] ? `${actual[key]}, ${value}` : value
    }
  }
  const expected = Object.fromEntries(vercel.headers
    .filter(rule => new RegExp(`^${rule.source}$`).test(vercelPath))
    .flatMap(rule => rule.headers.map(({ key, value }) => [key, value])))
  for (const [key, value] of Object.entries(expected)) {
    check(actual[key] === value, `Pages ${path}: ${key} must match Vercel without duplicate values.`)
  }
}
checkPagesPath('/')
checkPagesPath('/oauth', '/oauth.html')
for (const entry of readdirSync('dist', { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && !entry.name.startsWith('_')) {
    checkPagesPath(`${entry.parentPath}/${entry.name}`.replace(/^dist/, ''))
  }
}
const worker = readFileSync('dist/sw.js', 'utf8')
check(worker.includes('oauth(?:\\.html)?'), 'Service worker must exclude both Pages and Vercel OAuth callback paths.')
console.log('✓ Cloudflare Pages headers match Vercel for every built asset and the OAuth alias')
check(!vercel.rewrites?.length, 'Vercel must serve the app directly without rewrites.')
const swHeaders = vercel.headers.flatMap(rule => rule.headers).filter(header => header.key === 'Service-Worker-Allowed')
check(swHeaders.length > 0 && swHeaders.every(header => header.value === '/'), 'Service worker headers must allow the domain root.')
const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'))
for (const key of ['id', 'start_url', 'scope']) check(manifest[key] === '/', `Manifest ${key} must be /.`)
check(manifest.share_target?.action === '/', 'Share target must use the domain root.')
const robots = readFileSync('dist/robots.txt', 'utf8')
check(robots.includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt must advertise the subdomain sitemap.')
const sitemap = readFileSync('dist/sitemap.xml', 'utf8')
check(sitemap.includes(`<loc>${canonical}</loc>`), 'Sitemap canonical must use the root URL with its trailing slash.')
check(sitemap.includes(`<image:loc>${origin}/og.png</image:loc>`), 'Sitemap image must use the subdomain.')
for (const name of ['llms.txt', 'llms-full.txt', 'humans.txt']) {
  check(readFileSync(`dist/${name}`, 'utf8').includes(canonical), `${name} must identify the canonical root URL.`)
}
for (const tag of [
  `property="og:url" content="${canonical}"`,
  `property="og:image" content="${origin}/og.png"`,
  `name="twitter:image" content="${origin}/og.png"`,
]) check(html.includes(tag), `Missing social metadata: ${tag}`)
for (const url of ['https://shrinath.me', 'https://x.com/shrinath_prabhu', 'https://owleye.dev', 'https://lowkey.tools']) {
  check(html.includes(`href="${url}"`), `Static landing page needs the ${url} backlink.`)
}
check(/href="https:\/\/(?!fusellm\.)[a-z]+\.lowkey\.tools\/"/.test(html), 'Static landing page needs an app subdomain shoutout.')
const image = readFileSync('dist/og.png')
check(image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && image.readUInt32BE(16) === 1200 && image.readUInt32BE(20) === 630, 'OG image must be a 1200×630 PNG.')
if (failed) process.exit(1)
console.log('✓ subdomain metadata, crawler files, backlinks, OG image and root PWA settings verified')
