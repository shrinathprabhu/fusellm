# FuseLLM

**Wire AI models into circuits that finish the job.** A free, browser-only, bring-your-own-key AI workspace at **[fusellm.lowkey.tools](https://fusellm.lowkey.tools/)**.

Chat with the best models side by side, then wire them together like a Zapier zap: Claude Fable writes the code, GPT-6 Astra reviews it, and the review loops back until it is approved. No approval clicks, no server, no account. Keys never leave the device.

Built by [Shrinath Prabhu](https://shrinath.me), from the makers of [OwlEye Analytics](https://owleye.dev). Part of [lowkey.tools](https://lowkey.tools).

## What it does

- **BYOK, 17 models.** GPT-6 Astra, GPT-5.6 Sol / Terra / Luna, Claude Fable 5.1 / Opus 5 / Sonnet 5, Gemini 3.8 Flash, Kimi K3, DeepSeek V4 Pro, Grok 4.6, GLM 5.3, Qwen 3.8 Flash, Nemotron 3 Ultra, MiniMax M3, Perplexity Sonar Pro and Sonar Deep Research. One OpenRouter key reaches all of them; a Perplexity key reaches Sonar and 11 others through the Agent API; direct keys work for OpenAI, Anthropic, Google, DeepSeek, xAI, Moonshot, Qwen and MiniMax. Every key row has an ⓘ with where to get the key, what it looks like and how to cap it.
- **Circuits** (the "zaps"). A chain of stages. A *model* stage has a role, skills, MCP tools, app tools, a mode and a task; an *action* stage calls an app; a *media* stage makes images, video, speech, music or sound, or cuts a film. Each stage chooses its **wires in**: *Input* (the brief), *Output* (previous step), *Context* (every step so far), *Memory* (notes saved with `<memory>` tags) and *Media* (earlier files, for models that see, hear or watch). Any stage can **loop** back until it approves (`VERDICT: APPROVED`), a phrase appears, or N rounds pass. Tasks and parameters take placeholders: `{{brief}} {{output}} {{final}} {{step:Name}} {{section:Heading}} {{sources}} {{memory}} {{date}}`. Media stages can fan out, one file per shot or line (`{{item}}`), and use another stage's files as references.
- **Templates** (20), including code review loops, deep research, inbox triage into Todoist, Sentry error triage, meeting notes to a Google Doc, competitor watch into a Sheet, one idea cut for every channel, Figma design review, docs from a repo, a landing page deployed live, and a 12-stage **Movie studio**: script → review → direction → character sheet → keyframes → a Veo clip per shot → narration → score → audio check → edit plan → final cut → screening against the script.
- **Chat** with up to four models at once, each keeping its own thread.
- **Sources.** When Sonar, Claude web search or OpenRouter web search report the pages they used, they are listed under the answer with numbered citations, passed to later stages and kept in exports.
- **Apps: 18 of them, 28 actions**, as circuit steps or as tools a model can call. GitHub (push, issue, gist), GitLab (issue, pipeline), Google Workspace (Gmail, Docs, Sheets, Slides, Drive, Calendar, YouTube upload), EmailJS (Zoho, Outlook, any SMTP), Slack, Discord, Telegram, Linear, Asana, Todoist, Trello, Airtable, Netlify, Vercel, Figma (read, comment), Sentry (issues), Dropbox, and webhooks into Make/Zapier/n8n/Pipedream. Each takes a credential the user creates; every endpoint was CORS-checked before it was added. Google extras (Sheets, Slides, Calendar, YouTube) are opt-in tick boxes, so the consent screen stays small.
- **Not addable, and why:** Notion, Jira and Confluence refuse browser requests — they are in the MCP library instead, through their own servers. Zoho Mail goes via EmailJS. AWS cannot be signed in a browser without shipping a secret, so it is reached with a webhook (Lambda function URL, API Gateway, n8n). Cloudflare, CircleCI, HubSpot, Render and Resend send no CORS headers.
- **Library: 21 roles, 22 skills, 8 MCP servers, 20 circuit templates**, every one editable, clonable and restorable.
- **Studio.** 50+ image models, Veo, Sora, Kling, Runway, Hailuo, Seedance and Wan video, Lyria music and voices on OpenRouter; ElevenLabs music, sound effects and voices; fal.ai. Film cuts are rendered in the browser (canvas, WebAudio, MediaRecorder).
- **Token calculator.** Exact o200k_base counts on the device, cost on every model, and estimates for a whole chat or circuit (wires, loops, reasoning). A one-click optimiser tidies a prompt without touching code, inline code or URLs; a reply cap shortens the output side; a model can rewrite the prompt if you want it shorter still.
- **Library.** Built-in roles (instructions prepended to every prompt) and skills, all editable, clonable, deletable and restorable. Your own too.
- **MCP in the browser** over Streamable HTTP (DeepWiki and Context7 built in), plus web search.
- **Meters everywhere.** `✻ Thinking… 12.4s · ↑ 3.1k ↓ 842` live on every step; totals, reasoning tokens and cost at the end.
- **Stop-loss** per chat request, per stage and per circuit. Requests that cannot fit are refused, `max_tokens` is capped to what is left, streams abort when they cross the line, and circuits can *squeeze* (drop context, trim, go fast) before stopping.
- **Fast / Balanced / Deep think** tune reasoning effort and length per provider (Balanced is each provider's own default).
- **Storage.** IndexedDB with persistent storage requested, an optional mirror to a folder on disk (File System Access API; keys are never written there), JSON backup, circuits as `.fusellm.json` files, Superbrain vault export.
- **PWA.** Installable, mobile first, opens offline. Keys can be locked with a passphrase (AES-GCM, PBKDF2-SHA256 600k).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173/
npm run mock       # fake OpenAI, Anthropic, Perplexity and media provider on :5199 (no tokens spent)
npm test           # unit tests (node --test)
npm run build      # typecheck app + build config, build, verify CSP / SEO / PWA / backlinks / OG
npm run icons      # regenerate favicon, PWA icons and og.png from the mark
```

To try circuits without a real key, run `npm run mock`, open **Models → Direct provider keys → Show custom base URLs**, set the OpenRouter and Anthropic base URLs to `http://localhost:5199/v1`, and paste any placeholder key. Review stages request changes once, then approve, so loops are exercised end to end. The mock also returns sources, images, speech, music and video jobs; for real clips in the film editor, start it with `MOCK_VIDEO_DIR=/path/to/mp4s npm run mock`.

Google (Gmail, Docs) uses a browser OAuth client ID, which is public by design. Set `VITE_GOOGLE_CLIENT_ID` at build time, or users can paste their own under Library → Apps. The authorised redirect URI is `https://fusellm.lowkey.tools/oauth.html` (and `http://localhost:5173/oauth.html` for development).

## Layout

```
src/ai/          provider adapters (OpenAI-compatible, Anthropic, Perplexity Agent API), media, sources, key guides, MCP client, SSE, turn runner + stop-loss
src/apps/        kit.ts (shared types and helpers), registry.ts + more.ts (18 apps, 28 actions), app tools, file parsing
src/lib/         IndexedDB, folder mirror, film assembly, exports, estimates, prompt optimiser, OAuth
src/state/       store, persistence, chat actions, circuit engine, live streaming state
src/views/       Home, Chat, Circuits, CircuitEditor, RunView, Studio, Tokens, Library, Apps, Models, Settings, About
src/content/     site.ts: every public fact, shared by the app and the build
src/library/     built-in roles, skills, MCP servers and circuit templates
seo/plugin.ts    static landing HTML, JSON-LD graph, llms.txt, llms-full.txt, sitemap, humans.txt
```

## SEO, AEO and GEO

- Canonical `https://fusellm.lowkey.tools/` for the dedicated subdomain; the full landing page is rendered into `#root` as plain HTML so crawlers and answer engines see content without JavaScript.
- One JSON-LD `@graph`: WebApplication, WebPage (with speakable), BreadcrumbList, WebSite (FuseLLM), Organization (OwlEye Analytics), Person (Shrinath Prabhu), FAQPage, HowTo.
- `llms.txt` and `llms-full.txt` generated from the same facts; `robots.txt` welcomes AI crawlers; `humans.txt`, sitemap with image.
- The post-build guard rejects old hub-path app URLs and verifies the root PWA scope, crawler files, social metadata, maker backlinks and the 1200×630 OG image. Social artwork is checked in; regenerate it with `npm run icons` when its content changes.
- Backlinks: credits on every screen, maker cards on Home and About, `rel="author"`/`publisher`, JSON-LD `sameAs`, OpenRouter `HTTP-Referer` attribution (FuseLLM appears in OpenRouter's app rankings), and an optional credit line on exported Markdown. The referrer policy keeps origin referrers so owleye.dev and shrinath.me see the traffic.

## Deploy (Vercel)

Deploy this repo as its own Vercel project on **fusellm.lowkey.tools**. `vercel.json` sets the build, the security headers (strict CSP with a hashed inline script, HSTS preload, COOP, CORP, Permissions-Policy, frame-ancestors none) and cache rules (immutable hashed assets, revalidated HTML, service worker and manifest).

`connect-src` allows any `https:` origin plus localhost, because the app talks to user-chosen providers and MCP servers straight from the browser. Scripts are locked to `'self'` plus one hash, and remote images are blocked so model output cannot exfiltrate data through image URLs.

Add **fusellm.lowkey.tools** under the Vercel project's Domains settings and configure the DNS record Vercel provides. The app is served at `/`; hash routes such as `/#/chat` need no rewrites. There are no proxy rewrites or path-prefix build settings.

When listing FuseLLM on the lowkey.tools hub, use `https://fusellm.lowkey.tools/`. The app publishes its own root `robots.txt` and `sitemap.xml`. Other app links use their own subdomains too, such as `https://superfocus.lowkey.tools/`.

Update external credential settings for this origin: Google OAuth's authorised JavaScript origin is `https://fusellm.lowkey.tools` and its redirect URI is `https://fusellm.lowkey.tools/oauth.html`. Use `http://localhost:5173` and `http://localhost:5173/oauth.html` for development. Website-restricted API keys and EmailJS allow-lists must also allow the new origin.

## Deploy (Cloudflare Pages)

Create a **Pages** project in Workers & Pages and connect this repository. Use these Git build settings:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | Repository root |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Environment variable | `SKIP_DEPENDENCY_INSTALL=1` |
| Node.js | Latest Node 22, selected by `.node-version` |

Set these for production and preview builds. The install-skip variable lets the build use the lockfile through `npm ci` instead of installing dependencies twice. Pages' Git build command is configured in its dashboard; `wrangler.jsonc` supplies the project name and output directory for Wrangler. See Cloudflare's [build settings](https://developers.cloudflare.com/pages/configuration/build-image/) and [Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

The normal build generates `dist/_headers` from `vercel.json`, carrying over the CSP, security headers, asset caching, service-worker scope, OAuth no-store policy, and crawler/image headers. The build checks the resulting policies for every asset. Change the policy in `vercel.json` and rebuild to update both hosts. No Pages Functions, bindings, proxy rewrites or app secrets are needed. Cloudflare's [static header rules](https://developers.cloudflare.com/pages/configuration/headers/) apply directly to this output.

Add **fusellm.lowkey.tools** under the Pages project's **Custom domains**, then follow its DNS instructions. The canonical URL stays `https://fusellm.lowkey.tools/` whichever host serves it. If moving from Vercel, switch DNS after the Pages deployment is ready.

Pages automatically redirects `/oauth.html` to `/oauth`. Both paths have header rules, and the service worker excludes both so it cannot replace the callback with the app shell. Keep the registered Google redirect URI as `https://fusellm.lowkey.tools/oauth.html`, which is what the app sends. Verify sign-in on the deployed custom domain after switching hosts. See [Pages route matching](https://developers.cloudflare.com/pages/configuration/serving-pages/).

For an optional CLI upload after building:

```bash
npm ci
npm run build
npx wrangler@4 pages deploy
```

Wrangler reads `wrangler.jsonc` and prompts for Cloudflare authentication when needed. To preview Pages locally, run `npx wrangler@4 pages dev dist` after building; `vite preview` does not apply Pages response headers.

## Privacy

No backend, no analytics inside the app, no cookies. Keys, chats, circuits and runs live in IndexedDB on the device. Requests go directly to the providers and MCP servers you configure.

## License

MIT
