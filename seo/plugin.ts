import type { Plugin } from 'vite'
import { FAQ, FEATURES, KEYWORDS, SIBLINGS, SITE, STEPS, USE_CASES, siblingUrl } from '../src/content/site.ts'
import { MODELS, PROVIDERS, PROVIDER_ORDER } from '../src/ai/catalog.ts'
import { DEFAULT_ROLES, DEFAULT_SKILLS, DEFAULT_MCP, TEMPLATES } from '../src/library/defaults.ts'
import { APP_BY_ID, OPS } from '../src/apps/registry.ts'

/*
 * Build-time SEO, AEO and GEO.
 *
 * Everything is generated from src/content/site.ts (plus the model catalog
 * and built-in library), so the static page, the structured data, llms.txt
 * and the app itself can never disagree about a fact.
 *
 * - The landing page is rendered into #root as plain HTML. Crawlers that do
 *   not run JavaScript, answer engines and a slow first load all see the full
 *   content. React replaces it on mount.
 * - One JSON-LD @graph links the app, the page, the lowkey.tools site, the
 *   maker organisation and the author, plus FAQ, HowTo and breadcrumbs.
 * - llms.txt is the short brief for language models; llms-full.txt carries
 *   every detail, for generative engines that want to quote specifics.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const A = (href: string, text: string, rel = 'noopener') => `<a href="${href}" target="_blank" rel="${rel}">${esc(text)}</a>`

const MARK = `<svg viewBox="0 0 64 64" width="24" height="24" aria-hidden="true" focusable="false"><path d="M17 18C35 18 29 46 47 46" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/><circle cx="14" cy="18" r="8.5" fill="currentColor"/><circle cx="50" cy="46" r="8.5" fill="currentColor"/><path d="M32 19.5 35.2 28.8 44.5 32 35.2 35.2 32 44.5 28.8 35.2 19.5 32 28.8 28.8Z" fill="var(--accent)" stroke="var(--bg)" stroke-width="2.5" stroke-linejoin="round"/></svg>`

export function landingHtml(): string {
  const features = FEATURES.map(f => `<li class="feature"><span class="feature-icon" aria-hidden="true">${f.icon}</span><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></li>`).join('')
  const steps = STEPS.map(s => `<li><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></li>`).join('')
  const uses = USE_CASES.map(u => `<li><strong>${esc(u.title)}.</strong> ${esc(u.body)}</li>`).join('')
  const faq = FAQ.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')
  const shelf = SIBLINGS.map(s => `<li><a class="shelf-card" href="${siblingUrl(s)}" target="_blank" rel="noopener"><span class="shelf-emoji" aria-hidden="true">${s.emoji}</span><strong>${esc(s.name)}</strong><span class="shelf-pitch">${esc(s.pitch)}</span></a></li>`).join('')
  const models = MODELS.map(m => `<li><span class="dot" style="--c:${m.color}" aria-hidden="true"></span><strong>${esc(m.name)}</strong> <span class="muted small">· ${esc(m.vendor)}</span></li>`).join('')
  return `<div class="static-shell">
<header class="top static-top"><a class="top-brand" href="${SITE.base}">${MARK}<span class="wordmark">Fuse<span class="wordmark-llm">LLM</span></span></a></header>
<main class="main"><div class="page landing">
<section class="hero">
<p class="eyebrow">Free · Bring your own keys · Runs in your browser</p>
<h1 class="hero-title">Wire AI models into circuits<br>that finish the job.</h1>
<p class="lede">${esc(SITE.short)}</p>
<div class="hero-cta"><a class="btn primary big" href="${SITE.base}#/models">Add your key</a><a class="btn big" href="${SITE.base}#/circuits">Browse circuits</a></div>
<p class="hero-note muted small">One OpenRouter key unlocks all ${MODELS.length} models, including a free one. Keys never leave this device.</p>
<div class="hero-demo" role="img" aria-label="Example circuit: Claude Fable builds, GPT-6 Astra reviews, loop until approved">
<div class="demo-node"><span class="demo-role">Builder</span><span class="demo-model"><span class="dot" style="--c:#d97757"></span> Claude Fable 5.1</span><span class="demo-status mono">✻ Generating… 18.2s · ↓ 4.1k</span></div>
<div class="demo-wire" aria-hidden="true"><span class="demo-spark"></span><span class="demo-wire-label">output + input</span></div>
<div class="demo-node"><span class="demo-role">Reviewer</span><span class="demo-model"><span class="dot" style="--c:#10a37f"></span> GPT-6 Astra</span><span class="demo-status mono">✓ VERDICT: APPROVED · round 2</span></div>
<div class="demo-loop" aria-hidden="true">↺ changes requested → back to Builder</div>
</div>
</section>
<section class="features" aria-labelledby="s-features"><h2 id="s-features" class="section-title">What it does</h2><ul class="feature-grid">${features}</ul></section>
<section class="steps" aria-labelledby="s-steps"><h2 id="s-steps" class="section-title">How it works</h2><ol class="step-list">${steps}</ol></section>
<section class="usecases" aria-labelledby="s-uses"><h2 id="s-uses" class="section-title">Circuits people run</h2><ul class="usecase-list">${uses}</ul></section>
<section class="block" aria-labelledby="s-models"><h2 id="s-models" class="section-title">Supported models</h2><ul class="model-mini">${models}</ul></section>
<section class="faq" aria-labelledby="s-faq"><h2 id="s-faq" class="section-title">Questions</h2>${faq}</section>
<section class="block" aria-labelledby="s-shelf"><h2 id="s-shelf" class="section-title">The rest of the shelf</h2>
<p class="lede small">FuseLLM is one of twelve tools on ${A(SITE.hub.url, SITE.hub.name)}. Same idea every time: open the page, do the thing, no account, nothing kept on a server.</p>
<ul class="shelf-grid">${shelf}</ul></section>
<div class="maker-cards">
<a class="maker-card" href="${SITE.org.url}" target="_blank" rel="noopener"><span class="maker-kicker">From the makers of</span><strong>${SITE.org.name}</strong><span class="maker-body">${esc(SITE.org.pitch)} Know what your visitors do without tracking who they are.</span><span class="maker-go">owleye.dev →</span></a>
<a class="maker-card" href="${SITE.author.url}" target="_blank" rel="noopener author"><span class="maker-kicker">Built by</span><strong>${SITE.author.name}</strong><span class="maker-body">Frontend engineer building small, fast, privacy-first tools like this one. He posts the next one first on X.</span><span class="maker-go">shrinath.me →</span></a>
<a class="maker-card" href="${SITE.author.x}" target="_blank" rel="noopener"><span class="maker-kicker">Follow along</span><strong>${SITE.author.handle}</strong><span class="maker-body">New tools, half-built experiments and the odd strong opinion about the web.</span><span class="maker-go">Follow on X →</span></a>
</div>
<footer class="page-foot"><div class="credits"><p>Built by ${A(SITE.author.url, SITE.author.name, 'noopener author')} · ${A(SITE.author.x, SITE.author.handle)} · from the makers of ${A(SITE.org.url, SITE.org.name)}</p><p class="credits-sub">Part of ${A(SITE.hub.url, SITE.hub.name)}: twelve small tools that stay out of your way. ${A(SITE.hub.url, 'See the rest →')}</p></div></footer>
</div></main>
<noscript><p class="page">FuseLLM runs in your browser and needs JavaScript to talk to AI models. Everything above describes what it does.</p></noscript>
</div>`
}

export function jsonLd(): string {
  const app = `${SITE.canonical}#app`
  const page = `${SITE.canonical}#webpage`
  const website = `${SITE.canonical}#website`
  const org = `${SITE.org.url}/#organization`
  const person = `${SITE.author.url}/#person`
  const graph = [
    {
      '@type': 'WebApplication',
      '@id': app,
      name: SITE.name,
      alternateName: ['Fuse LLM', 'FuseLLM Circuits'],
      url: SITE.canonical,
      description: SITE.description,
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'AI workflow automation',
      operatingSystem: 'Any (runs in a modern web browser)',
      browserRequirements: 'Requires JavaScript and a modern browser. Installable as a PWA.',
      softwareVersion: SITE.version,
      datePublished: SITE.updated,
      dateModified: SITE.updated,
      inLanguage: 'en',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
      featureList: FEATURES.map(f => `${f.title}: ${f.body}`),
      keywords: KEYWORDS.join(', '),
      screenshot: SITE.ogImage,
      image: SITE.ogImage,
      mentions: MODELS.map(m => ({ '@type': 'SoftwareApplication', name: m.name, applicationCategory: 'Large language model', provider: { '@type': 'Organization', name: m.vendor } })),
      author: { '@id': person },
      creator: { '@id': org },
      publisher: { '@id': org },
      isPartOf: { '@id': website },
    },
    {
      '@type': 'WebPage',
      '@id': page,
      url: SITE.canonical,
      name: SITE.title,
      description: SITE.description,
      inLanguage: 'en',
      isPartOf: { '@id': website },
      about: { '@id': app },
      mainEntity: { '@id': app },
      primaryImageOfPage: { '@type': 'ImageObject', url: SITE.ogImage, width: 1200, height: 630 },
      breadcrumb: { '@id': `${SITE.canonical}#breadcrumb` },
      author: { '@id': person },
      publisher: { '@id': org },
      dateModified: SITE.updated,
      speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.hero-title', '.lede', '.faq'] },
      relatedLink: SIBLINGS.map(siblingUrl),
    },
    {
      '@type': 'ItemList',
      '@id': `${SITE.canonical}#shelf`,
      name: `More tools on ${SITE.hub.name}`,
      description: `${SITE.name} is one of twelve browser-only tools published on ${SITE.hub.name}.`,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      numberOfItems: SIBLINGS.length,
      itemListElement: SIBLINGS.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: { '@type': 'WebApplication', name: s.name, description: s.pitch, url: siblingUrl(s), applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (runs in a modern web browser)', isAccessibleForFree: true, publisher: { '@id': org } },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${SITE.canonical}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE.hub.name, item: `${SITE.hub.url}/` },
        { '@type': 'ListItem', position: 2, name: SITE.name, item: SITE.canonical },
      ],
    },
    {
      '@type': 'WebSite',
      '@id': website,
      url: SITE.canonical,
      name: SITE.name,
      publisher: { '@id': org },
    },
    {
      '@type': 'Organization',
      '@id': org,
      name: SITE.org.name,
      url: SITE.org.url,
      description: SITE.org.description,
      sameAs: [SITE.author.url, `${SITE.hub.url}/`],
      founder: { '@id': person },
    },
    {
      '@type': 'Person',
      '@id': person,
      name: SITE.author.name,
      url: SITE.author.url,
      sameAs: [SITE.author.github, SITE.author.x],
      jobTitle: 'Frontend engineer',
      worksFor: { '@id': org },
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE.canonical}#faq`,
      isPartOf: { '@id': page },
      mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
    {
      '@type': 'HowTo',
      '@id': `${SITE.canonical}#howto`,
      name: 'How to make two AI models work together in FuseLLM',
      description: 'Build a circuit where one model creates and another reviews, looping until the work is approved.',
      totalTime: 'PT3M',
      estimatedCost: { '@type': 'MonetaryAmount', currency: 'USD', value: '0' },
      tool: [{ '@type': 'HowToTool', name: 'An API key from OpenRouter or a supported AI provider' }],
      step: STEPS.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.title, text: s.body, url: `${SITE.canonical}#step-${i + 1}` })),
    },
  ]
  // `<` is escaped so no string in the data can close the script element.
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`
}

function llmsTxt(): string {
  return `# ${SITE.name}

> ${SITE.description}

${SITE.name} is at ${SITE.canonical}. Built by [${SITE.author.name}](${SITE.author.url}) ([${SITE.author.handle}](${SITE.author.x})), from the makers of [${SITE.org.name}](${SITE.org.url}), and published on [${SITE.hub.name}](${SITE.hub.url}).

## What it does

${FEATURES.map(f => `- **${f.title}.** ${f.body}`).join('\n')}

## How it works

${STEPS.map((s, i) => `${i + 1}. **${s.title}.** ${s.body}`).join('\n')}

## Supported models

${MODELS.map(m => `- ${m.name} (${m.vendor}): ${m.blurb}`).join('\n')}

## Facts

- Price: free. Users pay their own AI provider for tokens, through their own key.
- Account: none. No sign-up, no email, no login.
- Backend: none. The browser talks to AI providers directly; data stays in IndexedDB on the device.
- Keys: stored only in the browser, optionally encrypted with a passphrase (AES-GCM, PBKDF2).
- Offline: installable PWA that opens offline; running a model needs a connection.
- Circuits: automated multi-model chains with four wire types (Input, Output, Context, Memory) and review loops that repeat until a verdict of APPROVED.
- Metering: live thinking and generating status, elapsed time and token counts per step, totals and cost per run, and an optional token stop-loss.
- Modes: Fast, Balanced and Deep think, which tune reasoning effort and answer length per provider.
- Tools: remote MCP servers over Streamable HTTP, and web search.

## Answers

${FAQ.map(f => `- **${f.q}** ${f.a}`).join('\n')}

## Links

- [${SITE.name}](${SITE.canonical}): the app
- [llms-full.txt](${new URL('llms-full.txt', SITE.canonical).href}): every detail, including built-in roles, skills and circuit templates

## More from the same shelf

${SITE.name} is one of twelve browser-only tools on [${SITE.hub.name}](${SITE.hub.url}), built by [${SITE.author.name}](${SITE.author.url}) ([${SITE.author.handle}](${SITE.author.x})) from the makers of [${SITE.org.name}](${SITE.org.url}).

${SIBLINGS.map(s => `- [${s.name}](${siblingUrl(s)}): ${s.pitch}`).join('\n')}
- [${SITE.org.name}](${SITE.org.url}): ${SITE.org.pitch}
- [${SITE.author.name}](${SITE.author.url}): the developer
- [${SITE.hub.name}](${SITE.hub.url}): more small, free tools from the same makers
`
}

function llmsFullTxt(): string {
  return `${llmsTxt()}
## Providers

FuseLLM calls providers straight from the browser. Each one below allows browser (CORS) requests. Z.ai (GLM) and NVIDIA (Nemotron) do not, so those models are reached through OpenRouter.

${PROVIDER_ORDER.map(p => `- ${PROVIDERS[p].name}: ${PROVIDERS[p].baseUrl}${PROVIDERS[p].note ? ` (${PROVIDERS[p].note})` : ''}`).join('\n')}

## Model details

| Model | Vendor | OpenRouter id | Context | Price in / out per 1M tokens (USD) |
|---|---|---|---|---|
${MODELS.map(m => `| ${m.name} | ${m.vendor} | \`${m.openrouter}\` | ${m.context.toLocaleString('en-US')} | ${m.price.in === 0 ? 'free' : `$${m.price.in} / $${m.price.out}`} |`).join('\n')}

## Circuit templates

${TEMPLATES.map(t => `### ${t.emoji} ${t.name}\n\n${t.description}\n\n${t.stages.map((s, i) => `${i + 1}. **${s.name}** ${s.kind === 'action' ? `(action: ${s.action?.op})` : s.kind === 'media' ? `(media: ${s.media?.kind} with ${s.media?.model})` : `on ${MODELS.find(m => m.id === s.modelId)?.name ?? s.modelId}: ${s.task}`}${s.loop ? ` Loops back until ${s.loop.until === 'approved' ? 'it approves' : s.loop.until === 'rounds' ? `${s.loop.maxRounds} rounds are done` : 'a phrase appears'}, at most ${s.loop.maxRounds} rounds.` : ''}`).join('\n')}`).join('\n\n')}

## Built-in roles

Roles are instructions prepended to every prompt. Every one can be edited, cloned or deleted.

${DEFAULT_ROLES.map(r => `- ${r.emoji} **${r.name}**: ${r.description}`).join('\n')}

## Built-in skills

Skills stack on top of a role. Review skills end with a VERDICT line that a loop can read.

${DEFAULT_SKILLS.map(s => `- ${s.emoji} **${s.name}** (${s.category}${s.verdict ? ', verdict' : ''}): ${s.description}`).join('\n')}

## Built-in MCP servers

${DEFAULT_MCP.map(m => `- **${m.name}** (${m.url}): ${m.description}`).join('\n')}

## Apps and actions

Circuits can end in deterministic action steps, and models can be given the same actions as tools. Each uses the user's own credential, called straight from the browser.

${OPS.map(o => `- **${o.name}** (${APP_BY_ID[o.app].name})${o.outward ? ' · sends to others' : ''}: ${o.summary}`).join('\n')}

Services that do not accept browser requests (Zoho Mail's API, Notion's REST API, Resend, SendGrid, Airtable forms and more) are reached through EmailJS for mail or a webhook into Make, Zapier, n8n or Pipedream.

## Studio: images, video, music, speech

Through the OpenRouter key: 50+ image models (Gemini 3 Pro Image, GPT Image 2, Seedream, Qwen Image, Recraft vector, Grok Imagine), video models (Veo 3.1, Sora 2 Pro, Kling 3, Runway Gen-4.5, Hailuo, Seedance, Wan, FLUX video edit and upscale), Google Lyria music, and text-to-speech voices (MAI-Voice-2, MiniMax Speech, Grok Voice, Gemini TTS, Deepgram, Kokoro and more). Reference images enable edits, image-to-image and image-to-video. Files are stored in the browser's IndexedDB.

## Superbrain export

Runs and chats export as a Superbrain vault: a zip with README.md (index with [[wiki links]]), one note per step with YAML frontmatter tags, Final output, Brief, Sources, Memory, and an assets folder of images and video. Import it at ${siblingUrl({ slug: 'superbrain' })}.

## Wires

- **Input**: the original brief typed when the circuit runs.
- **Output**: the final answer of the previous step.
- **Context**: every earlier step in full, labelled with the stage and model that wrote it.
- **Memory**: short notes any step saved with <memory> tags, shared across the whole run.
- **Media**: images from the previous step, shown to a vision model so it can critique or describe them.
- A stage can also remember its own earlier rounds, or start fresh each time a loop brings it back.

## Stop-loss

A stop-loss is a token limit for a chat request, a stage or a whole circuit, input included. FuseLLM refuses a request whose input alone would not fit, caps max_tokens to what is left, watches tokens as they stream, and aborts when the limit is crossed. With "Squeeze to fit", a circuit sheds full context, trims earlier outputs and drops to fast mode before giving up. Hidden reasoning is billed by providers, so the limit is close but not guaranteed to the token.

## Security

- No backend, no analytics inside the app, no cookies.
- Strict Content Security Policy: scripts only from the app's own origin; remote images blocked so model output cannot leak data through image URLs.
- Model output is rendered as Markdown with raw HTML disabled.
- Links written by models open with rel="noopener noreferrer nofollow ugc".
`
}

function sitemap(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE.canonical}</loc>
    <lastmod>${SITE.updated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${SITE.ogImage}</image:loc>
      <image:title>${esc(SITE.title)}</image:title>
    </image:image>
  </url>
</urlset>
`
}

function humansTxt(): string {
  return `/* TEAM */
Developer: ${SITE.author.name}
Site: ${SITE.author.url}
GitHub: ${SITE.author.github}

/* MAKERS */
${SITE.org.name}: ${SITE.org.url}
${SITE.org.pitch}

/* SITE */
Canonical: ${SITE.canonical}
Part of: ${SITE.hub.url}
Last update: ${SITE.updated}
Standards: HTML, CSS, TypeScript, React, Vite, PWA
Fonts: Geist and Geist Mono by Vercel (via Fontsource)
`
}

const FILES: Record<string, () => { body: string; type: string }> = {
  'llms.txt': () => ({ body: llmsTxt(), type: 'text/plain; charset=utf-8' }),
  'llms-full.txt': () => ({ body: llmsFullTxt(), type: 'text/plain; charset=utf-8' }),
  'sitemap.xml': () => ({ body: sitemap(), type: 'application/xml; charset=utf-8' }),
  'humans.txt': () => ({ body: humansTxt(), type: 'text/plain; charset=utf-8' }),
}

export function seo(): Plugin {
  return {
    name: 'fusellm-seo',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        let out = html.replace('<!--seo:jsonld-->', jsonLd()).replace('<!--seo:landing-->', landingHtml())
        // Preload the one font file every page paints with, so text is not
        // re-laid out when Geist arrives.
        const font = ctx.bundle && Object.keys(ctx.bundle).find(f => /geist-latin-wght-normal.*\.woff2$/.test(f) && !f.includes('mono'))
        if (font) out = out.replace('</title>', `</title>\n    <link rel="preload" href="${SITE.base}${font}" as="font" type="font/woff2" crossorigin />`)
        return out
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.replace(SITE.base, '').split('?')[0] ?? ''
        const f = FILES[name]
        if (!f) return next()
        const { body, type } = f()
        res.setHeader('content-type', type)
        res.end(body)
      })
    },
    generateBundle() {
      for (const [fileName, make] of Object.entries(FILES)) this.emitFile({ type: 'asset', fileName, source: make().body })
    },
  }
}
