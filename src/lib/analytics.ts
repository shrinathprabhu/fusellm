import { useAnalytics, type AnalyticsController, type OwlConfig, type OwlRecord } from '@owleye/analytics'
import { trackPerf, type PerfController, type WebVitalsController } from '@owleye/analytics/performance'
import type { RuleEnricher, RulesController } from '@owleye/analytics/rules'
import { SITE } from '../content/site.ts'
import { href, NAVIGATE, parse, titleFor } from './router.ts'

/*
 * Usage statistics, sent to OwlEye Analytics (owleye.dev): which screens
 * open, which features and models are used, how long calls take and whether
 * they fail. The SDK is cookie-free, stores nothing in the browser and drops
 * URL queries and fragments. Settings has a switch that turns it off.
 *
 * The rule for every call site: send catalog ids (models, providers,
 * templates, actions), counts, durations and outcomes. Never a prompt, a
 * reply, a file name, a chat or circuit name, a key, a URL the person typed,
 * or an error message, which can quote any of those.
 */

/** The public tracking id of the FuseLLM app in the OwlEye console. Not a secret. */
const SITE_ID = 'owl_68e91f45f8cb43a49104324fddea84e5'

type Fields = Record<string, string | number | boolean | undefined>

let analytics: AnalyticsController | undefined
let perf: PerfController | undefined
let vitals: WebVitalsController | undefined
let rules: RulesController | undefined

function config(): OwlConfig {
  // Only the published site reports. Dev servers, previews and workers.dev
  // builds run the same code with requests off, so they never pollute the
  // numbers. `localStorage['fusellm:owl'] = 'debug'` logs what the SDK
  // decided for each event (sent, suppressed, accepted), not the payloads.
  let debug = false
  try {
    debug = localStorage.getItem('fusellm:owl') === 'debug'
  } catch {
    /* storage blocked */
  }
  const live = import.meta.env.PROD && location.hostname === new URL(SITE.canonical).hostname
  return {
    // Page views are sent by viewScreen(), with ids taken out of the path.
    autoTrackPageviews: false,
    // utm_source, utm_medium and utm_campaign only.
    captureCampaigns: true,
    // The switch in Settings is the opt-out, not the browser's GPC signal.
    respectGlobalPrivacyControl: false,
    mock: !live,
    debug,
  }
}

/** Page views, Web Vitals and the rules set up in the OwlEye console. Safe to call twice. */
export function startAnalytics() {
  if (analytics) return
  const cfg = config()
  analytics = useAnalytics(SITE_ID, cfg)
  analytics.setGlobalRecords({ build: __BUILD_ID__ })
  viewScreen()
  window.addEventListener('popstate', viewScreen)
  window.addEventListener(NAVIGATE, viewScreen)
  perf = trackPerf(SITE_ID, cfg)
  vitals = perf.observeVitals()
  watchErrors()
  // Rules are the larger half of the SDK and nothing waits on them.
  void import('@owleye/analytics/rules')
    .then(({ trackRules }) => {
      if (analytics && !rules) rules = trackRules(SITE_ID, { ...cfg, enrichRule })
    })
    .catch(() => {})
}

export function stopAnalytics() {
  window.removeEventListener('popstate', viewScreen)
  window.removeEventListener(NAVIGATE, viewScreen)
  viewed = undefined
  rules?.stop()
  vitals?.stop()
  analytics?.stop()
  analytics = perf = vitals = rules = undefined
}

/** The real pathname of the last page view, so a query or hash change is not another view. */
let viewed: string | undefined

/**
 * One page view per screen. The path is the route's shape (`/chat/:id`, not
 * the chat's id), so every chat, circuit and run shares a row in Pages, and
 * custom events sent from that screen carry the same page.
 */
function viewScreen() {
  if (!analytics || location.pathname === viewed) return
  const first = viewed === undefined
  viewed = location.pathname
  const route = parse(viewed)
  const path = route.name === 'notfound' ? '/404' : route.name === 'chat' || route.name === 'circuit' || route.name === 'run' ? (route.id ? `/${route.name}/:id` : href(route)) : href(route)
  analytics.pageview({
    path,
    // The landing view keeps its campaign; the rest start from inside the app,
    // not from wherever the visit came from.
    url: location.origin + path + (first ? campaign() : ''),
    title: titleFor(viewed),
    ...(first ? {} : { referrer: undefined, referrer_host: undefined }),
  })
}

function campaign(): string {
  const params = new URLSearchParams(location.search)
  const kept = new URLSearchParams()
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = params.get(key)
    if (value) kept.set(key, value.slice(0, 200))
  }
  return kept.size ? `?${kept}` : ''
}

/** One named event. A no-op until analytics has started, and after it is turned off. */
export function track(name: string, fields?: Fields) {
  if (!analytics) return
  // The page comes from the last page view, not from the document.
  const records = clean(fields)
  if (records) analytics.track(name, records)
  else analytics.track(name)
}

/** Times one operation: call the returned function when it ends, with its outcome. */
export function timed(name: string, fields?: Fields): (fields?: Fields) => void {
  const start = clean(fields)
  const end = start ? perf?.start(name, start) : perf?.start(name)
  return fields => {
    // Turned off while this was running: say nothing.
    if (!end || !perf) return
    const records = clean(fields)
    plainTitle(() => (records ? end(records) : end()))
  }
}

/** The SDK drops an event that carries `undefined`, so optional fields are left out instead. */
function clean(fields?: Fields): OwlRecord | undefined {
  if (!fields) return
  const out: OwlRecord = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = typeof value === 'string' ? value.slice(0, 80) : value
  }
  return out
}

/**
 * Timings read the page from the document, title included. A run that ends in
 * a background tab puts its circuit's name there (flagTitle in
 * state/engine.ts), and that name is the person's own words, so a timing that
 * ends meanwhile goes out under the screen's plain title.
 */
function plainTitle(send: () => void) {
  const shown = document.title
  const plain = titleFor(location.pathname)
  if (shown === plain) return send()
  document.title = plain
  try {
    send()
  } finally {
    document.title = shown
  }
}

/**
 * Extra fields on a rule match. Rule events read the page from the document,
 * so their paths carry the ids of chats, circuits and runs; `screen` is the
 * route's name to group by instead.
 */
const enrichRule: RuleEnricher = (_rule, { element }) => {
  const link = element.closest<HTMLAnchorElement>('a[href]')
  return clean({ screen: parse(location.pathname).name, to: link && link.host !== location.host ? link.host : undefined })
}

let watching = false
let reported = 0

/** Uncaught errors by type and place, never by message. A handful per page load is enough to see a bad release. */
function watchErrors() {
  if (watching) return
  watching = true
  const report = (kind: string, error: unknown, at?: { file?: string; line?: number }) => {
    const name = error instanceof Error ? error.name : typeof error
    // A stopped request is not a fault.
    if (name === 'AbortError' || reported >= 5) return
    reported++
    const stale = error instanceof Error && /dynamically imported module|module script failed/i.test(error.message)
    track('app_error', { kind, name, screen: parse(location.pathname).name, file: at?.file?.split('/').pop()?.split('?')[0], line: at?.line, stale_chunk: stale || undefined })
  }
  window.addEventListener('error', e => {
    if (/ResizeObserver loop/.test(e.message)) return
    report('error', e.error, { file: e.filename, line: e.lineno })
  })
  window.addEventListener('unhandledrejection', e => report('rejection', e.reason))
}
