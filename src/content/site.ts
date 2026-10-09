/**
 * One source of truth for everything FuseLLM says about itself.
 *
 * The React views read it, and so does the build: seo/plugin.ts renders the
 * same facts into the static HTML shell, the JSON-LD graph, llms.txt,
 * llms-full.txt and the sitemap. An answer engine, a crawler that never runs
 * JavaScript and a person using the app all get the same sentences, and
 * changing a fact here changes it everywhere at once.
 *
 * Keep this file free of DOM and React imports: it runs inside Node at build.
 */

import { MODELS } from '../ai/catalog.ts'

const MODEL_COUNT = MODELS.length

export const SITE = {
  name: 'FuseLLM',
  tagline: 'Wire AI models into circuits that finish the job.',
  title: 'FuseLLM: describe a job, get an AI workflow that does it',
  description:
    `FuseLLM is a free, browser-only AI workflow builder: Zapier for AI models. Describe a job and it designs a circuit for it, where models research, write, build and review each other within the limits you set, then deliver it to Gmail, GitHub, Slack, Google Docs or Todoist. Bring your own keys for ${MODEL_COUNT} models, including GPT-6, Claude Opus 5.5 and Sonnet 5.5, Gemini 3.1 Pro, Grok 4.7, DeepSeek V4, Kimi K3, Qwen and Perplexity Sonar. Jev decisions route each run down the right branch. Circuits make images, Veo 3.1 video and Lyria 3.5 songs, transcribe recordings, run over lists or on a schedule, and start from 210 templates. No FuseLLM account; keys are stored locally and sent directly to your chosen services.`,
  short:
    'A free, browser-only AI workflow builder. Describe a job and get a circuit of models that research, build, review each other and deliver the result, with your own keys.',
  /** Under 160 characters, for the meta description search engines show. */
  meta: `Describe a job and get an AI workflow that does it. Free, browser-only Zapier for AI: your own keys, ${MODEL_COUNT} models, review loops, Jev routing, 210 circuits.`,
  social: {
    title: 'FuseLLM: describe a job, get an AI workflow that does it',
    description: `Free, browser-only Zapier for AI models. Describe a job; models research, build, review each other and deliver it. Your own keys, ${MODEL_COUNT} models, 210 circuits.`,
    imageAlt: 'FuseLLM: a request becomes a circuit where Jev routes the work, Claude builds, GPT reviews and the result is delivered.',
  },
  canonical: 'https://fusellm.lowkey.tools/',
  origin: 'https://fusellm.lowkey.tools',
  base: '/',
  ogImage: 'https://fusellm.lowkey.tools/og.png',
  repo: 'https://github.com/shrinathprabhu/fusellm',
  version: '1.0.0',
  updated: '2026-10-09',
  hub: { name: 'lowkey.tools', url: 'https://lowkey.tools' },
  author: {
    name: 'Shrinath Prabhu',
    url: 'https://shrinath.me',
    github: 'https://github.com/shrinathprabhu',
    x: 'https://x.com/shrinath_prabhu',
    handle: '@shrinath_prabhu',
  },
  org: {
    name: 'OwlEye Analytics',
    url: 'https://owleye.dev',
    pitch: 'Privacy-first, cookie-free web analytics.',
    description:
      'OwlEye Analytics builds privacy-first, cookie-free web analytics and the developer tools on lowkey.tools.',
  },
} as const

/**
 * The rest of the lowkey.tools shelf. Each one gets a `hook`: a line written
 * for the moment it appears in FuseLLM, not a slogan repeated everywhere.
 * `where` decides which screens may offer it, so the suggestion is always
 * about what the person is already doing.
 */
export const SIBLINGS = [
  {
    slug: 'superbrain',
    name: 'SuperBrain',
    emoji: '🧠',
    pitch: 'A private, local-first workspace for notes, links and ideas: Notion and Obsidian with none of the ceremony.',
    hook: 'Research is only useful if you can find it again. Export the run as a vault and open it in SuperBrain.',
    where: ['run', 'chat', 'home'],
  },
  {
    slug: 'supersplit',
    name: 'SuperSplit',
    emoji: '🧾',
    pitch: 'Split group expenses, track who paid and settle up fairly. No accounts, no ads, no limits.',
    hook: 'Splitting the API bill with three teammates? SuperSplit works the same way this does: in your browser, no accounts.',
    where: ['tokens', 'settings'],
  },
  {
    slug: 'superfocus',
    name: 'SuperFocus',
    emoji: '🎯',
    pitch: 'An offline focus space: Pomodoro sessions, tasks, goals and quiet music.',
    hook: 'A deep circuit can run for a while. Put a Pomodoro on it with SuperFocus and come back to finished work.',
    where: ['run', 'home', 'circuits'],
  },
  {
    slug: 'streakfreak',
    name: 'StreakFreak',
    emoji: '🔥',
    pitch: 'A private, offline habit tracker with templates, flexible goals and streaks worth keeping.',
    hook: 'The circuit runs daily. Do you? StreakFreak keeps the chain visible, offline and to yourself.',
    where: ['circuits', 'settings'],
  },
  {
    slug: 'credo',
    name: 'Credo',
    emoji: '🔐',
    pitch: 'Share passwords, secrets and small files as encrypted links that expire on their own.',
    hook: 'Never paste an API key into a chat window. Credo shares secrets through encrypted, password-protected links that expire automatically.',
    where: ['models', 'apps', 'settings'],
  },
  {
    slug: 'converteasy',
    name: 'Converteasy',
    emoji: '🔁',
    pitch: 'Units, currencies, crypto denominations, dates and calculations in one intelligent box.',
    hook: 'Counting tokens here, converting everything else there: Converteasy handles units, currencies and dates.',
    where: ['tokens'],
  },
  {
    slug: 'favigen',
    name: 'Favigen',
    emoji: '🖼️',
    pitch: 'One SVG or PNG in, every favicon, app icon, manifest and HTML tag out.',
    hook: 'Generated a logo in the Studio? Favigen turns it into every favicon and app icon a site needs, with the tags.',
    where: ['studio', 'run'],
  },
  {
    slug: 'billgen',
    name: 'Billgen',
    emoji: '📄',
    pitch: 'Invoices, receipts, memos and bills made locally, then exported, printed or shared.',
    hook: 'Doing this for a client? Billgen writes the invoice locally and exports it, no sign-up in the way.',
    where: ['tokens', 'settings'],
  },
  {
    slug: 'mathmagician',
    name: 'MathMagician',
    emoji: '➗',
    pitch: 'Race the clock through as many arithmetic problems as you can, then share your best score.',
    hook: 'Waiting on a slow model? MathMagician: how many sums can you land before the timer goes.',
    where: ['run'],
  },
  {
    slug: 'chesscape',
    name: 'Chesscape',
    emoji: '♟️',
    pitch: 'Escape today’s near-checkmate position with the one saving move, in thirty seconds.',
    hook: 'One saving move, thirty seconds, one puzzle a day. Chesscape, while the circuit finishes thinking.',
    where: ['run', 'home'],
  },
  {
    slug: 'spotfast',
    name: 'SpotFast',
    emoji: '👀',
    pitch: 'Memorise a grid in seconds, then find the hidden targets before your three lives run out.',
    hook: 'Models are good at attention. Are you? SpotFast gives you three lives to prove it.',
    where: ['home', 'run'],
  },
] as const

export type Sibling = (typeof SIBLINGS)[number]

export const siblingUrl = (s: { slug: string }) => `https://${s.slug}.lowkey.tools/`

/** The siblings that suit a screen, newest-first rotation handled by the caller. */
export function siblingsFor(where: string): Sibling[] {
  return SIBLINGS.filter(s => (s.where as readonly string[]).includes(where))
}

/** What the app does, in the order a newcomer should meet it. */
export const FEATURES = [
  {
    icon: '✨',
    title: 'Describe a job, get a circuit',
    body: 'Type or say what you want done and where the result should go. With an OpenRouter key, Jev helps pick a starting point from 210 templates; otherwise the builder uses a text match. An efficient model designs the stages and picks the model that fits each one (one stage when one is enough), and every model, role, skill and app step is checked before the circuit opens for you to review. Choose best, balanced or cheapest, or let Jev Router pick the model for each stage as it runs.',
  },
  {
    icon: '⚡',
    title: 'Circuits, not prompts',
    body: 'Zapier for AI models. Claude Fable writes the code, GPT-6 Astra reviews it, and the review loops back until approval or the configured round limit. Human review stages pause for you where it matters. Model stages have a model, a role, skills, tools and a mode.',
  },
  {
    icon: '⚖️',
    title: 'Jev decisions and branches',
    body: 'Jev by TypeSafe makes structured decisions inside a circuit: a labelled choice, a score on a scale, or a probability. Each answer can send the run down its own branch (billing to one reply, bugs to another, high-risk changes to a deeper review), and the branches join up again.',
  },
  {
    icon: '🔑',
    title: 'Bring your own keys',
    body: `One OpenRouter key can access all ${MODEL_COUNT} model choices, OpenRouter media in the Studio and Jev, subject to your account settings. Some Studio models need a separate provider key. Direct keys work for OpenAI, Anthropic, Google, DeepSeek, xAI, Moonshot, Qwen and MiniMax, and a Perplexity key reaches Sonar. Every key has an ⓘ with where to get it and how to cap it. Keys are stored in this browser, sent to the services you configure, and can be locked with a passphrase.`,
  },
  {
    icon: '🧭',
    title: 'Models, sorted for you',
    body: 'GPT-6 Astra, GPT-6.1 Sol and Luna, Claude Fable 5.1, Opus 5.5, Sonnet 5.5 and Haiku 5.5, Gemini 3.1 Pro and 3.8 Flash, Grok 4.7, DeepSeek V4, Kimi K3, Qwen 3.8, GLM 5.3, Step 5 Preview, Mistral Large 4, Ling 3.1 Flash, Apodex 1.1 Mini, Pareto 26.10 Preview and more, filtered by Top picks, Most used, Fastest, Cheap, Free and Reliable. A New on OpenRouter panel shows what arrived since this version.',
  },
  {
    icon: '🎙️',
    title: 'Talk, transcribe, listen',
    body: 'Dictate into chat, circuit briefs and prompts. Transcribe recordings in chunks with GPT Transcribe, Gemini 3.5 Transcribe, Whisper and more, with timestamps where supported, then send the transcript to a chat or a circuit such as meeting recording to notes and follow-up email. Replies can be read aloud.',
  },
  {
    icon: '🔁',
    title: 'Run once, over a list, or on a schedule',
    body: 'Run a circuit on one brief, once per line or CSV row with the results exported as CSV, or every hour, day, weekday or week while the app is open. Feed in the final output of up to three earlier runs, chain circuits into one, and resume interrupted runs that have a saved checkpoint.',
  },
  {
    icon: '🎭',
    title: 'Roles and skills',
    body: 'Sixty roles and a hundred and twenty skills ship built in, grouped into everyday life, work, marketing, research, tech and media: from senior engineer, research analyst and copywriter to personal assistant, home cook and consumer rights advocate. Attach them to a chat or a stage, and edit, clone or delete any of them.',
  },
  {
    icon: '🎛️',
    title: 'Six ways to think',
    body: 'Fast, Balanced, Thinking, Search, Research and Perfectionist. Modes set instructions and output limits, plus reasoning effort and web search where the provider supports them. Search and Research request web retrieval; Perfectionist asks the model to check and revise its answer.',
  },
  {
    icon: '🔗',
    title: 'Apps and actions',
    body: 'End a circuit by pushing code to GitHub, emailing from Gmail, Zoho or Outlook, filling a Google Doc, Sheet or Slides deck, filing tasks in Asana, Todoist, Trello or Linear, deploying to Vercel or Netlify, commenting on Figma, or publishing to YouTube. Eighteen apps, twenty-eight actions, eight MCP server presets, and webhooks to Make, Zapier and n8n.',
  },
  {
    icon: '🎨',
    title: 'Images, video, music and voice',
    body: 'Nano Banana Pro, GPT Image 2.5, Seedream and Recraft images; Veo 3.1 video that starts on one frame and ends on another, as in Google Flow, plus Sora, Kling, Wan and Seedance; Lyria 3.5 songs with vocals using a Google AI Studio key; and natural voices. A model that supports the generated media can review it and request another attempt.',
  },
  {
    icon: '🎞️',
    title: 'A film studio in a circuit',
    body: 'Script, review, direction, a character sheet, a keyframe per shot, a Veo clip that flows into the next shot, narration and score, an audio check, then a final cut with titles and crossfades rendered in your browser, and a screening that sends notes back to the edit.',
  },
  {
    icon: '⏱️',
    title: 'Every token on the meter',
    body: 'Live thinking and generating labels, elapsed time and token counts on every step, totals and cost at the end, and a stop-loss that caps requests and stops a run near your token budget. Hidden reasoning and provider reporting can cause overshoot. The calculator counts text with OpenAI’s o200k_base tokenizer and estimates a whole circuit; other models’ token counts and final charges can differ.',
  },
  {
    icon: '📚',
    title: 'Sources you can check',
    body: 'When Sonar, Claude web search or OpenRouter search report the pages they used, FuseLLM lists them under the answer with numbered citations, carries them into later stages, and keeps them in exports.',
  },
  {
    icon: '🔗',
    title: 'Share a circuit as a link',
    body: 'The whole circuit, with the roles and skills it uses, is packed into the link itself; nothing is uploaded. Personal app details such as email addresses and sheet ids are left out by default. Whoever opens it gets their own copy.',
  },
  {
    icon: '📴',
    title: 'Private, installable, offline-first',
    body: 'No FuseLLM account: chats and circuits are saved locally, and the browser sends requests directly to the providers and apps you choose. It installs as an app, opens offline, supports folder backups in compatible browsers, and exports runs to Superbrain notes. Cookie-free usage statistics can be turned off in Settings.',
  },
] as const

/** How to go from zero to a running circuit. Also rendered as a HowTo. */
export const STEPS = [
  {
    title: 'Add a key',
    body: 'Open Models and paste an OpenRouter key for the text catalog, OpenRouter media and Jev, subject to your account settings. Some Studio models need their own provider key. Or add a direct key from OpenAI, Anthropic, Google or another supported provider.',
  },
  {
    title: 'Describe the job',
    body: 'Type or dictate what you want done and where the result should go, and press Build it. Or pick one of 210 ready circuits, grouped into everyday life, work, marketing, research, tech and media.',
  },
  {
    title: 'Review the circuit',
    body: 'Check the stages: the model, role and skills of each, what it reads, where reviewers loop back, where Jev branches, and which app gets the result. Change anything.',
  },
  {
    title: 'Run it',
    body: 'Run it on a brief, once per item in a list, or on a schedule. Watch each stage think and generate with live time and cost, approve where it asks you, then copy, download or send the result on.',
  },
] as const

/**
 * Questions people actually type into search boxes and answer engines. Each
 * answer opens with the direct answer, so it can be lifted out and quoted
 * without the question around it.
 */
export const FAQ = [
  {
    q: 'What is FuseLLM?',
    a: 'FuseLLM is a free AI workflow builder that runs entirely in your browser, like Zapier for AI models. You describe a job, it designs a circuit of models that research, build and review each other within the limits you set, and the result goes to your email, GitHub, Slack or Google Docs. You bring your own API keys; no FuseLLM account is needed, and workflows run in your browser.',
  },
  {
    q: 'Is FuseLLM free?',
    a: 'Yes. FuseLLM itself is free and has no paid tier. Providers charge through your own keys for tokens, media, search or other services you use. Connected services may have their own charges. Some OpenRouter models, such as Nemotron 3 Ultra (free), cost nothing.',
  },
  {
    q: 'Are my API keys safe?',
    a: 'Your keys are stored in this browser and sent directly to the provider, app or MCP endpoint you configure. They do not pass through a FuseLLM API proxy. Only configure endpoints you trust. You can lock them behind a passphrase, which encrypts them with AES-GCM on your device.',
  },
  {
    q: 'What is a circuit in FuseLLM?',
    a: 'A circuit is an automated chain of AI models, like a Zapier zap for LLMs. Stages can call a model, run an app action, generate media, make a decision or pause for human review. Wires pass the output, the original input, the full context or shared memory from one stage to the next, and loops let a reviewer send work back until approval or the configured round limit.',
  },
  {
    q: 'Which AI models does FuseLLM support?',
    a: 'The built-in catalog includes GPT-6 Astra, GPT-6.1 Sol, GPT-6 Luna and GPT-5.6 Terra from OpenAI; Claude Fable 5.1, Opus 5.5, Sonnet 5.5 and Haiku 5.5 from Anthropic; Gemini 3.1 Pro, Gemini 3.8 Flash and Gemma 4; Kimi K3; DeepSeek V4 Pro and V4.1 Flash; Grok 4.7; GLM 5.3 and GLM 5.3 Flash; Qwen 3.8 Max and Flash; Nemotron 3 Ultra; MiniMax M3; Step 5 Preview; Mistral Large 4; Ling 3.1 Flash; Pareto 26.10 Preview; Perplexity Sonar Pro and Sonar Deep Research; and free models such as Laguna S 2.1 and Apodex 1.1 Mini. Filter them by Top picks, Most used, Fastest, Cheap, Free or Reliable. All are listed on OpenRouter, with access subject to your privacy settings and guardrails, and a Perplexity key reaches Sonar and eleven other model choices with web search. Some Perplexity routes use older model versions; check the route in Models.',
  },
  {
    q: 'Can FuseLLM send emails or push code to GitHub?',
    a: 'Yes. Connect GitHub with a fine-grained token and a circuit can create a repository and commit every generated file in one push. Connect Gmail to send mail from your own address, or EmailJS to send through Zoho Mail, Outlook or any SMTP server. Eighteen apps are built in: GitHub, GitLab, Google Workspace (Gmail, Docs, Sheets, Slides, Drive, Calendar, YouTube), Slack, Discord, Telegram, Linear, Asana, Todoist, Trello, Airtable, Netlify, Vercel, Figma, Sentry, Dropbox, EmailJS and webhooks into Make, Zapier, n8n or Pipedream. Each uses a credential you create and can revoke.',
  },
  {
    q: 'Can FuseLLM generate images, video and music?',
    a: 'Yes. With an OpenRouter key the Studio and circuit media stages offer image models including Nano Banana Pro (Gemini 3 Pro Image) and GPT Image 2.5, video models such as Veo 3.1, Sora 2 Pro, Kling 3, Wan 3 and Seedance, Lyria 3 music and natural voices. Veo 3.1 clips can start on one image and end on another, as in Google Flow. With a Google AI Studio key it also reaches Lyria 3.5, the model behind Google Flow Music, for full songs with vocals.',
  },
  {
    q: 'Is it safe to put API keys into a browser app?',
    a: 'In FuseLLM, keys are stored locally and sent directly to the provider, app or MCP endpoint you configure. They do not pass through a FuseLLM API proxy, and no app-owned secret is shipped in the page. Keys sit in the browser’s IndexedDB, can be encrypted with a passphrase, and are protected by a strict Content Security Policy that allows only FuseLLM’s own scripts. Use scoped keys where you can: a spend limit on OpenRouter, a fine-grained GitHub token for chosen repos, Gmail limited to sending.',
  },
  {
    q: 'How do I get an API key for FuseLLM?',
    a: 'The quickest is an OpenRouter key: sign in at openrouter.ai, add a few dollars of credit, open Keys and create one with a credit limit. One OpenRouter key covers the text catalog and OpenRouter image, video and audio models, subject to your privacy settings and guardrails. Google, ElevenLabs and fal.ai models may need separate keys. In FuseLLM, the ⓘ next to each provider on the Models page gives the steps for that provider and the setting that caps a key if it ever leaks.',
  },
  {
    q: 'How many tokens will my prompt or workflow use?',
    a: 'Open the token calculator in FuseLLM and paste the text. It counts text with OpenAI’s o200k_base tokenizer on your device once loaded, with a character-based estimate as a fallback. Other models tokenize differently, and displayed costs are estimates based on catalog rates. It shows words and characters and estimates a whole chat or circuit: each step’s input from its wires, loops by assumption, typical reply and reasoning lengths, and the total cost.',
  },
  {
    q: 'Does FuseLLM show sources for research answers?',
    a: 'Yes. When a model reports the web pages it used, as Perplexity Sonar, Claude web search and OpenRouter web search do, FuseLLM lists them under the answer with titles, sites and numbered citations. Sources are passed to later circuit stages, available as the {{sources}} placeholder, and included in Markdown and Superbrain exports.',
  },
  {
    q: 'Where does FuseLLM store chats and circuits?',
    a: 'In your browser’s IndexedDB. Available space and retention depend on your browser; requesting persistent storage helps but does not replace a backup. On supported desktop Chromium browsers you can also mirror chats, circuits, runs, media and the library to a folder on your computer as JSON, Markdown and media files, and load it back into another browser. API keys are never written to that folder. Circuits export as .fusellm.json files you can share.',
  },
  {
    q: 'Can FuseLLM upload a video to YouTube or write to Notion and Jira?',
    a: 'YouTube yes: tick the YouTube permission when you connect Google, and a circuit can publish a generated video, private by default. Notion, Jira and Confluence do not have built-in app actions. Use a configured webhook workflow, or an MCP server compatible with browser requests and token-based authentication. The built-in MCP client does not complete OAuth sign-in, so a listed server may need a separate bridge or setup.',
  },
  {
    q: 'How do I make a prompt use fewer tokens?',
    a: 'The token calculator has a local optimiser that trims whitespace, shortens common phrases and can remove repeated paragraphs and HTML comments. Savings depend on the text. Review the result before using it: removing repetition or comments can change an instruction. Reply caps can reduce output, and Fast mode requests less reasoning where supported. An optional model rewrite uses your provider key and may incur charges.',
  },
  {
    q: 'Can I export FuseLLM research to Superbrain?',
    a: 'Yes. Any circuit run or chat exports as a Superbrain vault: a zip of linked Markdown notes with an index, one note per step, sources, shared memory and generated images. Open superbrain.lowkey.tools, choose Import a vault, and pick the zip.',
  },
  {
    q: 'Can two AI models talk to each other in FuseLLM?',
    a: 'Yes. That is what circuits are for. For example, Claude Fable writes code, GPT-6 Astra reviews it, and the review goes back to Claude until approval or the configured round limit. Or one model plays a student researcher while another plays the professor who grades the work.',
  },
  {
    q: 'Does FuseLLM need a server or an account?',
    a: 'No FuseLLM account or self-hosted backend is needed. The hosted site serves the app, while your browser calls AI providers and connected services directly. Those services need their own accounts or keys. Chats, circuits and your library are saved locally. The published site also sends cookie-free usage statistics to OwlEye unless you turn them off in Settings.',
  },
  {
    q: 'Does FuseLLM work offline?',
    a: 'The app installs as a PWA and opens offline, with all of your chats, circuits, roles and skills available. Running a model needs an internet connection, because the model runs at the provider.',
  },
  {
    q: 'How do I limit how many tokens a circuit spends?',
    a: 'Set a stop-loss on a chat or a circuit. FuseLLM caps each request to the budget that is left, watches tokens as they stream, and stops the run when the limit is reached. It can also squeeze context to fit. Providers bill hidden reasoning, so the limit is enforced as closely as the provider allows but is not guaranteed to the token.',
  },
  {
    q: 'Can I use MCP servers in the browser?',
    a: 'Yes. FuseLLM speaks MCP over Streamable HTTP, so servers must support browser requests and the authentication you can configure in FuseLLM: a bearer token or custom header. The client has no MCP OAuth sign-in flow. DeepWiki and Context7 are included as starting points. Attach a server to a chat or a circuit stage and the model can call its tools.',
  },
  {
    q: 'How do I build an AI workflow from a description?',
    a: 'Open FuseLLM, type or dictate the job and where the result should go, for example “every Monday, research what changed at three competitors and email me a one-page brief”, and press Build it. With an OpenRouter key, Jev helps choose a template; otherwise the builder uses a text match. An efficient model designs the stages and matches a model to each one, and FuseLLM checks every model, role, skill and app step before opening the circuit for you to review and run.',
  },
  {
    q: 'Is FuseLLM a Zapier alternative for AI?',
    a: 'For AI-heavy work, yes. FuseLLM chains AI models the way Zapier chains apps: stages run one after another, reviewers loop work back within configured limits, Jev branches the run, and the result goes to Gmail, GitHub, Slack, Google Docs, Sheets, Todoist and more. FuseLLM itself is free, runs in your browser with your own keys and needs no FuseLLM account. Provider usage still costs money. Use a hosted automation service when you need triggers that fire while your computer is off.',
  },
  {
    q: 'What is Jev in FuseLLM?',
    a: 'Jev is TypeSafe’s decision model, reached through OpenRouter’s Decisions API. In a circuit, a Jev stage answers one structured question (a labelled choice, a score on a scale, or a probability) and each answer can send the run down its own branch. With an OpenRouter key, FuseLLM also uses Jev to help choose a starting template when it builds a circuit from your description, and offers Jev Router, which picks the model for each request.',
  },
  {
    q: 'Can FuseLLM transcribe audio and take dictation?',
    a: 'Yes. A mic button in chat, circuit briefs and the Studio records you and turns speech into text with a speech-to-text model on your OpenRouter or OpenAI key, or with the browser’s own recogniser when there is no key. The Studio splits supported recordings into chunks for transcription, with timestamps where the model supports them. File size, format and browser memory still limit what it can process, and the transcript can go straight into a circuit such as meeting recording to notes and a follow-up email.',
  },
  {
    q: 'Can I run an AI workflow on a schedule or over a list?',
    a: 'Yes. A circuit can run hourly, daily, on weekdays or weekly at a set time while FuseLLM is open in a tab or as an installed app. If catch-up is enabled, a missed schedule can run once when you next open it. It can also run once per line or CSV row, one after another, with the results exported as CSV. Schedules run locally and do not fire while the app is closed.',
  },
  {
    q: 'Can I share a FuseLLM circuit?',
    a: 'Yes. Share as a link packs the whole circuit, with the roles and skills it uses, into the link itself, so nothing is uploaded to a server. Personal app details such as email addresses and sheet ids are left out by default, and briefs, keys, runs and schedules are never included. Whoever opens the link can add their own copy. Circuits also export as .fusellm.json files.',
  },
  {
    q: 'Which AI model should I use for each step?',
    a: 'Use a frontier model such as Claude Opus 5.5, GPT-6 Astra or Gemini 3.1 Pro for hard reasoning and review, Claude Sonnet 5.5 or GPT-6.1 Sol for everyday building and writing, and fast, cheap models such as GPT-6 Luna, DeepSeek V4.1 Flash or GLM 5.3 Flash for extraction and routine steps. FuseLLM’s Top picks, Most used, Fastest, Cheap and Free filters help, the circuit builder chooses for you, and Jev Router can pick per request.',
  },
  {
    q: 'Who makes FuseLLM?',
    a: 'FuseLLM is built by Shrinath Prabhu (shrinath.me) and published on lowkey.tools by the makers of OwlEye Analytics (owleye.dev), a privacy-first, cookie-free web analytics product.',
  },
] as const

/** Named examples that make the idea concrete for people and for crawlers. */
export const USE_CASES = [
  { title: 'Describe it, get it built', body: '“Every Monday, research what changed at Linear, Notion and Asana and email me a brief” becomes a circuit with a researcher, a writer, a checker and a Gmail step.' },
  { title: 'Build code, then review it with a second model', body: 'Claude Fable writes it, GPT-6 Astra reviews it, and the loop stops on approval or at the configured round limit.' },
  { title: 'Meeting recording to notes, action items and a follow-up email', body: 'Transcribe the recording, check the notes against what was said, and send the follow-up once you approve it.' },
  { title: 'Support ticket routed by Jev', body: 'Jev reads the ticket and branches to the billing, bug, how-to or urgent specialist, and the reply is posted to Slack.' },
  { title: 'Cited research report, fact-checked against the live web', body: 'Break a question down, research each part with Sonar, fact-check the claims with Grok, then write the report.' },
  { title: 'Voice memo to tidy notes and to-dos', body: 'Dictate a ramble; get organised notes and the to-dos filed in Todoist.' },
  { title: 'Morning brain dump to a time-blocked day', body: 'Everything on your mind becomes the three things that matter and a plan in Google Calendar.' },
  { title: 'Suspicious message checked for a scam', body: 'The warning signs, Jev’s probability that it is a scam, and what to do now.' },
  { title: 'One idea for every channel', body: 'A post, an edit, LinkedIn, X and newsletter versions, and a cover image.' },
  { title: 'Prospect research to one cold email', body: 'Research the company on the live web, write one short email, strip the fluff, and send only when you approve.' },
  { title: '60-second AI short film', body: 'Script to screening: characters, keyframes, Veo clips that flow from shot to shot, narration, score and a final cut rendered in your browser.' },
  { title: 'Run over a list', body: 'Paste fifty leads, tickets or product notes and run the same circuit once per row, with the results exported as CSV.' },
] as const

export const KEYWORDS = [
  'AI workflow builder',
  'Zapier for AI',
  'Zapier for LLMs',
  'no-code AI automation',
  'AI agent builder',
  'multi-agent workflow',
  'build an AI workflow from a description',
  'BYOK AI',
  'bring your own API key',
  'multi-model AI chat',
  'LLM orchestration in the browser',
  'AI code review loop',
  'Jev decisions',
  'OpenRouter client',
  'MCP client browser',
  'AI transcription',
  'AI dictation',
  'Veo 3.1 video',
  'Lyria 3.5 music',
  'Nano Banana Pro',
  'Claude Opus 5.5',
  'GPT-6',
  'Gemini 3.1 Pro',
  'Perplexity Sonar',
  'AI push to GitHub',
  'send email with AI',
  'free AI workspace',
  'privacy-first AI',
  'token calculator',
]
