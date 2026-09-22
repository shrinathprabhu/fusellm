# FuseLLM

**Wire AI models into circuits that finish the job.** A free, browser-only, bring-your-own-key AI workspace at **[fusellm.lowkey.tools](https://fusellm.lowkey.tools/)**.

Chat with the best models side by side, then wire them together like a Zapier zap: Claude Fable writes the code, GPT-6 Astra reviews it, and the review loops back until it is approved. No approval clicks, no server, no account. Keys never leave the device.

Built by [Shrinath Prabhu](https://shrinath.me), from the makers of [OwlEye Analytics](https://owleye.dev). Part of [lowkey.tools](https://lowkey.tools).

[Source code and issues on GitHub](https://github.com/shrinathprabhu/fusellm).

Use the **download icon** in the desktop sidebar, mobile app bar, or Settings to install the PWA. Supported browsers open their install prompt; other browsers show installation instructions. The installed app opens saved work offline, while model requests need an internet connection.

## What it does

- **BYOK, 34 models.** GPT-6 Astra, GPT-5.6 Sol / Terra / Luna, gpt-oss 120B, Claude Fable 5.1 / Opus 5 / Sonnet 5, Gemini 3.8 Flash, Kimi K3, DeepSeek V4 Pro and V4 Flash, Grok 4.7, GLM 5.3, Qwen 3.8 Flash, Xiaomi MiMo V2.6 Pro, Meta Muse Spark 1.3, Mistral Medium 3.5, Amazon Nova 2 Lite, Cohere Command A, ByteDance Seed 2.0 Code, Nemotron 3 Ultra, MiniMax M3, Perplexity Sonar Pro and Sonar Deep Research, Sakana Fugu Ultra v2, Thinking Machines Inkling, Tencent Hy4, Nex N2.5 Pro, Upstage Solar Pro 4, Inception Mercury 2.5, inclusionAI Ling 3.0 Flash, Inference.net Schematron V2 Turbo and OpenRouter Fusion. Search and filter them by name, maker, strength or whether a key reaches them. One OpenRouter key reaches all of them; a Perplexity key reaches Sonar and 11 others through the Agent API; direct keys work for OpenAI, Anthropic, Google, DeepSeek, xAI, Moonshot, Qwen and MiniMax. Every key row has an ⓘ with where to get the key, what it looks like and how to cap it.
- **Circuits** (the "zaps"). A chain of stages. A *model* stage has a role, skills, MCP tools, app tools, a mode and a task; an *action* stage calls an app; a *media* stage makes images, video, speech, music or sound, or cuts a film; a *human review* stage pauses the run so you can continue, continue with comments for the next stage, send the work back to an earlier stage with comments, or cancel. Each stage chooses its **wires in**: *Input* (the brief), *Output* (previous step), *Context* (every step so far), *Memory* (notes saved with `<memory>` tags) and *Media* (earlier files, for models that see, hear or watch). Any stage can **loop** back until it approves (`VERDICT: APPROVED`, or `LGTM`), a phrase appears, or N rounds pass. Reviewers are told to block only on real defects — correctness, security, data loss, performance, a missed requirement — and to leave style and naming under *Optional* rather than holding the work back. Tasks and parameters take placeholders: `{{brief}} {{output}} {{final}} {{step:Name}} {{section:Heading}} {{sources}} {{memory}} {{date}} {{review}}`. Media stages can fan out, one file per shot or line (`{{item}}`), and use another stage's files as references.
- **Templates** (32), including code review loops, spec → tests → code, deep research, support inbox triage gated by a Jev decision and your own approval, an SEO brief to a published post, prospect research to one cold email, receipts into a Sheet, an interface audited against WCAG before it deploys, incident to postmortem and runbook, a design threat model filed in Linear, numbers to a one-page memo, a prompt lab that tests and rewrites its own prompt, a week-long study guide, CV to interview ready, inbox triage into Todoist, Sentry error triage, meeting notes to a Google Doc, competitor watch into a Sheet, one idea cut for every channel, Figma design review, docs from a repo, a landing page deployed live, and a 12-stage **Movie studio**: script → review → direction → character sheet → keyframes → a Veo clip per shot → narration → score → audio check → edit plan → final cut → screening against the script.
- **Chat** with up to four models at once, each keeping its own thread.
- **Jev decisions.** Add a **Jev decision** stage to a circuit for TypeSafe Jev 1.13 through your OpenRouter key. Supply text/context (including `{{brief}}` and `{{output}}`), a question, and criteria: labeled choices, ordered score levels, or true/false descriptions for a probability. Structured JSON results pass to later stages like other outputs. Jev uses OpenRouter’s Decisions API, so it is separate from chat models. Input and output usage count toward stop-loss; estimates are checked before the request, since this API has no output-token cap or streaming cancellation. The local mock supports all three question types.
- **Sources.** When Sonar, Claude web search or OpenRouter web search report the pages they used, they are listed under the answer with numbered citations, passed to later stages and kept in exports.
- **Apps: 18 of them, 28 actions**, as circuit steps or as tools a model can call. GitHub (push, issue, gist), GitLab (issue, pipeline), Google Workspace (Gmail, Docs, Sheets, Slides, Drive, Calendar, YouTube upload), EmailJS (Zoho, Outlook, any SMTP), Slack, Discord, Telegram, Linear, Asana, Todoist, Trello, Airtable, Netlify, Vercel, Figma (read, comment), Sentry (issues), Dropbox, and webhooks into Make/Zapier/n8n/Pipedream. Each takes a credential the user creates; every endpoint was CORS-checked before it was added. Google extras (Sheets, Slides, Calendar, YouTube) are opt-in tick boxes, so the consent screen stays small.
- **Not addable, and why:** Notion, Jira and Confluence refuse browser requests — they are in the MCP library instead, through their own servers. Zoho Mail goes via EmailJS. AWS cannot be signed in a browser without shipping a secret, so it is reached with a webhook (Lambda function URL, API Gateway, n8n). Cloudflare, CircleCI, HubSpot, Render and Resend send no CORS headers.
- **Library: 34 roles, 40 skills, 8 MCP servers, 32 circuit templates**, every one editable, clonable and restorable.
- **Studio.** 50+ image models, Veo, Sora, Kling, Runway, Hailuo, Seedance and Wan video, Lyria music and voices on OpenRouter; ElevenLabs music, sound effects and voices; fal.ai (fal models OpenRouter also serves fall back to the OpenRouter key). Film cuts are rendered in the browser (canvas, WebAudio, MediaRecorder).
- **Viewers.** Outputs open in the right viewer: Markdown (read, source, tidy, outline), a video and audio player with a waveform and timestamped notes, images, PDFs in the browser's own viewer, CSV and Excel as sortable tables, Word documents, JSON and text with line numbers; anything else downloads. Files a model writes as code blocks open the same way, and the Studio can open a file from your device without uploading it.
- **Token calculator.** Exact o200k_base counts on the device, cost on every model, and estimates for a whole chat or circuit (wires, loops, reasoning). A one-click optimiser tidies a prompt without touching code, inline code or URLs; a reply cap shortens the output side; a model can rewrite the prompt if you want it shorter still.
- **Library.** Built-in roles (instructions prepended to every prompt) and skills, all editable, clonable, deletable and restorable. Your own too.
- **MCP in the browser** over Streamable HTTP (DeepWiki and Context7 built in), plus web search.
- **Meters everywhere.** `✻ Thinking… 12.4s · ↑ 3.1k ↓ 842` live on every step; totals, reasoning tokens and cost at the end.
- **Stop-loss** per chat request, per stage and per circuit. Requests that cannot fit are refused, `max_tokens` is capped to what is left, streams abort when they cross the line, and circuits can *squeeze* (drop context, trim, go fast) before stopping. A run that hits its stop-loss — or that you stopped, or that errored — can be **resumed** with more tokens: it keeps every finished step and its shared memory, re-runs only the step that never finished, and carries on from there (a stage set to remember its own turns starts a fresh thread, since only finished replies are stored).
- **Fast / Balanced / Deep think** tune reasoning effort and length per provider (Balanced is each provider's own default).
- **Storage.** IndexedDB with persistent storage requested, an optional mirror to a folder on disk (File System Access API; keys are never written there), JSON backup, circuits as `.fusellm.json` files, Superbrain vault export.
- **PWA.** Installable, mobile first, opens offline. Because the app precaches its own shell, a device can sit a release behind until it swaps the cached copy — it now re-checks whenever the app comes back to the screen (at most every five minutes), and Settings → App version shows the build stamp and offers **Check for updates** and **Reload from the network**, neither of which touches IndexedDB. Keys can be locked with a passphrase (AES-GCM, PBKDF2-SHA256 600k).

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

## Deploy (Cloudflare Workers)

Cloudflare Workers is the only host: there is no Vercel, Netlify or Pages configuration in this repo. Connect this repository through **Workers & Pages → Create application**. The project uses Workers Static Assets to serve `dist`; all app logic still runs in the browser. `wrangler.jsonc` serves existing static assets directly. A small Worker handles known app paths and returns the generated error page with HTTP 404 for unknown paths. It never processes app data or provider requests. See Cloudflare's [Static Assets guide](https://developers.cloudflare.com/workers/static-assets/).

Use these settings in the Workers build form:

| Setting | Value |
| --- | --- |
| Project name | `fusellm` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler@4 deploy` |
| Non-production branch deploy command | `npx wrangler@4 versions upload` |
| Path / root directory | `/` (repository root) |
| Node.js | Node 22, selected by `.node-version` |
| API token | Create new token, or select an existing token with the required Workers permissions |
| Protect with Cloudflare Access | Off for the public app |

Let Workers Builds install dependencies automatically. Leave `SKIP_DEPENDENCY_INSTALL` unset. The output directory is read from `assets.directory` in `wrangler.jsonc`, so there is no separate output-directory field. Keep non-production branch builds enabled if you want preview versions. These fields follow Cloudflare's [Workers build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Push the Workers configuration before deploying. The old `pages_build_output_dir` setting and `wrangler pages deploy` command belong to Pages and must not be used with this configuration.

Response headers live in [`config/headers.mjs`](config/headers.mjs): CSP, security headers, asset caching, service-worker scope, the OAuth no-store policy, and crawler/image headers. The build turns them into `dist/_headers`, which Workers [static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/) apply to every asset, and a build check compares the generated file against the config for each built path. Cloudflare *joins* repeated headers with commas instead of replacing them, so the generator keeps only invariant headers in the `/*` block and repeats the rest per path; edit `config/headers.mjs` and rebuild rather than editing `_headers`. The Worker copies those headers onto app and error responses and sets its own `Cache-Control` and `X-Robots-Tag`.

`connect-src` allows any `https:` origin plus localhost, because the app talks to user-chosen providers and MCP servers straight from the browser. Scripts are locked to `'self'` plus one hash, and remote images are blocked so model output cannot exfiltrate data through image URLs.

When listing FuseLLM on the lowkey.tools hub, use `https://fusellm.lowkey.tools/`. The app publishes its own root `robots.txt` and `sitemap.xml`. Other app links use their own subdomains too, such as `https://superfocus.lowkey.tools/`.

Update external credential settings for this origin: Google OAuth's authorised JavaScript origin is `https://fusellm.lowkey.tools` and its redirect URI is `https://fusellm.lowkey.tools/oauth.html`. Use `http://localhost:5173` and `http://localhost:5173/oauth.html` for development. Website-restricted API keys and EmailJS allow-lists must also allow the new origin.

`wrangler.jsonc` declares **fusellm.lowkey.tools** with `custom_domain: true`, so `wrangler deploy` configures the custom domain. The canonical URL stays `https://fusellm.lowkey.tools/`. The `lowkey.tools` zone must be active in the deploying Cloudflare account; if migrating from another host, remove any conflicting CNAME for this hostname when ready to switch. See Cloudflare's [custom domain setup](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/#set-up-a-custom-domain-in-your-wrangler-configuration-file).

Cloudflare's automatic HTML handling redirects `/oauth.html` to `/oauth`. Both paths have header rules and are excluded from service-worker navigation fallback. Keep the Google redirect URI registered as `https://fusellm.lowkey.tools/oauth.html`, which is what the app sends. Verify Google sign-in on the deployed custom domain. See [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

For a CLI deployment:

```bash
npm ci
npm run build
npm run deploy:cloudflare
```

After building, `npm run preview:cloudflare` starts Wrangler's local preview with the static asset headers, while `npm run upload:cloudflare` uploads a non-production version. `vite preview` does not apply Cloudflare response headers. Wrangler prompts for Cloudflare authentication when needed; no app API keys belong in deployment configuration.

## Privacy

No backend, no analytics inside the app, no cookies. Keys, chats, circuits and runs live in IndexedDB on the device. Requests go directly to the providers and MCP servers you configure.

## License

MIT

## Clean URLs and not-found handling

Navigation uses History API paths (`/chat`, `/library/skills`, `/circuit/<id>`) and supports Back/Forward without reloading the app. Existing `/#/...` bookmarks are converted in the browser with `replaceState`, including their query parameters. The root canonical remains `https://fusellm.lowkey.tools/`; non-root app routes use no trailing slash.

Cloudflare serves real assets first and invokes `worker/index.ts` only for misses or the explicit error page. Known routes load the shell; unknown routes return HTTP 404 with `noindex`. App pages are excluded from indexing because their contents depend on local device data. IDs for chats, circuits and runs are checked in the browser: the server cannot know whether a locally stored item exists.

The service worker falls back to the shell only for known app routes. Other navigations use the network status, with a cached not-found page available offline. OAuth stays network-only. Verify direct links, refresh, Back/Forward and an unknown URL in `npm run preview:cloudflare`; Vite's development fallback does not simulate production HTTP status codes.

### Chat attachments, public links and downloads

Every chat (including model comparisons) accepts up to **10 files per message**, **10 MB per file**, and **25 MB total**. Choose **Attach files**, drop files onto the composer, or paste an image. The original uploads are saved with the chat in this browser's IndexedDB, included in JSON backups and exported chat vault ZIPs, and remain available for follow-ups and regeneration. A conversation can send at most 25 MB of accumulated attachments; start another chat when it needs a different set of large files.

- Text/code, CSV, JSON, SVG source, DOCX, XLSX, PPTX, ODT and text/code inside ZIPs are extracted locally in a worker. Documents expose text and tables, not their original visual layout. Extraction notes name omitted content; ZIP binaries must be attached separately. Limits: 200,000 extracted characters per file, 5,000 worksheet rows, and 20 MB / 1,000 entries per expanded archive.
- Images, PDFs, audio and video use provider-supported inputs. OpenRouter media capability checks use its current model catalog; PDF input is supported through OpenRouter or direct Claude. Other direct routes currently accept text and, where implemented, images. Unsupported formats/routes produce an explicit explanation instead of silently omitting the file. PDF/media token estimates are approximate until provider usage arrives.
- Pasting a public HTTP(S) link enables search and page retrieval on OpenRouter, direct Claude and Perplexity routes. The **Web** control enables them for questions without a link. OpenRouter uses its `openrouter:web_search` and `openrouter:web_fetch` server tools. Provider privacy rules, tool availability and fees still apply; there is no public proxy that bypasses access controls.
- A public page does not guarantee access to its media or an entire repository. GitHub reviews cover the files actually retrieved; attach a ZIP for a bounded repository snapshot. Google Docs must allow public viewing/export. Suno page text or lyrics are not audio analysis: upload the audio to a model with audio input if the page does not expose playable media. The assistant is instructed to disclose retrieval failures and what it actually read, heard or watched.

Replies and named code files stay in the saved chat. **Reply .md** downloads a response, **Files .zip** exports named code files, and each code block has **Download**, including unnamed snippets. File chips open a viewer with an individual download action. The chat toolbar exports the whole transcript or a vault ZIP including original attachments. Generated media from Studio/circuits is stored separately as IndexedDB Blobs with individual downloads; optional folder sync mirrors local records to a folder you choose. A text response describing a binary file is not an actual generated file, and links alone are not durable copies of remote media.
