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

export const SITE = {
  name: 'FuseLLM',
  tagline: 'Wire AI models into circuits that finish the job.',
  title: 'FuseLLM: bring your own keys and make AI models work together',
  description:
    'FuseLLM is a free, browser-only AI workspace. Bring your own API keys for Claude, ChatGPT, Gemini, Grok, DeepSeek, Kimi, Qwen, GLM, MiniMax, Nemotron and Perplexity Sonar, then wire them into circuits where one model builds, another reviews, and the loop runs until the work is done. Circuits can generate images, video and music, push code to GitHub, send email and post to Slack. No server, no account, keys never leave your device.',
  short:
    'A free, browser-only BYOK AI workspace. Wire the best models into self-running circuits that research, build, review, make images and video, and ship to GitHub, Gmail or Slack.',
  canonical: 'https://fusellm.lowkey.tools/',
  origin: 'https://fusellm.lowkey.tools',
  base: '/',
  ogImage: 'https://fusellm.lowkey.tools/og.png',
  repo: 'https://github.com/shrinathprabhu/fusellm',
  version: '1.0.0',
  updated: '2026-09-12',
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
    icon: '🔑',
    title: 'Bring your own keys',
    body: 'Paste an OpenRouter key, then check model access against your privacy settings and guardrails. Or use a Perplexity key, or direct keys for OpenAI, Anthropic, Google, DeepSeek, xAI, Moonshot, Qwen and MiniMax. Every key has an ⓘ with where to get it and how to cap it. Keys stay in this browser and can be locked with a passphrase.',
  },
  {
    icon: '⚡',
    title: 'Circuits, not prompts',
    body: 'Wire models together like a Zapier zap. Claude Fable writes the code, GPT-6 Astra reviews it, and the review loops back until the reviewer approves. No approval clicks in between.',
  },
  {
    icon: '🔌',
    title: 'Four kinds of wire',
    body: 'Each connection can carry the Output of the last step, the original Input, the full Context of every step so far, and a shared Memory that any model can write to. Mix all four.',
  },
  {
    icon: '🎭',
    title: 'Roles and skills',
    body: 'Give every model a role, from senior engineer to data analyst, teacher, copywriter or chief of staff, and stack skills such as code review, SQL, translation, meeting notes or red teaming. Twenty-one roles and twenty-two skills ship built in, and every one can be edited, deleted or cloned.',
  },
  {
    icon: '🧰',
    title: 'MCP tools in the browser',
    body: 'Eight remote MCP servers are set up and waiting: DeepWiki, Context7, GitHub, Notion, Jira and Confluence, Linear, Asana and Hugging Face. Models call their tools mid-answer, and this is how apps that refuse browser requests are reached. Web search is one switch away.',
  },
  {
    icon: '⏱️',
    title: 'Every token on the meter',
    body: 'Live thinking and generating labels, elapsed time and token counts on every step, like a coding agent in a terminal. Totals and cost at the end. Set a stop-loss and the run halts before it spends more.',
  },
  {
    icon: '🎛️',
    title: 'Fast, balanced or deep',
    body: 'One switch tunes reasoning effort, output length and tone per model. Fast for quick drafts, deep think when correctness matters more than speed.',
  },
  {
    icon: '🔗',
    title: 'Apps and actions, like Zapier',
    body: 'End a circuit by pushing code to GitHub, emailing from Gmail, Zoho or Outlook, filling a Google Doc, Sheet or Slides deck, filing tasks in Asana, Todoist, Trello, Linear or Jira, deploying to Vercel or Netlify, commenting on Figma, saving to Drive or Dropbox, or publishing the video to YouTube. Eighteen apps, twenty-eight actions, and models can call them as tools too.',
  },
  {
    icon: '🎨',
    title: 'Images, video, music and voice',
    body: 'The Studio and media stages reach 50+ image models, Veo, Sora, Kling, Runway, Hailuo and Seedance video, Lyria music and a dozen voices on the same OpenRouter key, plus ElevenLabs music, sound effects and voices, and fal.ai. A vision model can critique an image and loop it back for edits.',
  },
  {
    icon: '🎞️',
    title: 'A film studio in a circuit',
    body: 'Script, review, direction, a character sheet, a keyframe and a video clip per shot, narration and score, an audio check, then a final cut with titles and crossfades rendered in your browser, and a screening that sends notes back to the edit.',
  },
  {
    icon: '🧮',
    title: 'Token calculator',
    body: 'Paste any text to count its tokens exactly, see what it costs on every model, and estimate a whole chat or circuit before you run it: wires, loops, reasoning and all. One click tidies a prompt (typically 20-50% smaller, code and links untouched), and a reply cap cuts the output side, where the money actually goes.',
  },
  {
    icon: '📚',
    title: 'Sources you can check',
    body: 'When Sonar, Claude web search or OpenRouter search report the pages they used, FuseLLM lists them under the answer with numbered citations, carries them into later stages, and keeps them in exports.',
  },
  {
    icon: '🧠',
    title: 'Research notes into Superbrain',
    body: 'Export any run or chat as a Superbrain vault: linked Markdown notes with sources, memory and images, ready to open in the Superbrain notes app on lowkey.tools.',
  },
  {
    icon: '📴',
    title: 'Installable and offline-first',
    body: 'A mobile-first progressive web app. It opens with no connection, so your chats, circuits and library are always there. Mirror everything to a folder on your computer, and share circuits as files. Talking to a model needs the internet, nothing else does.',
  },
] as const

/** How to go from zero to a running circuit. Also rendered as a HowTo. */
export const STEPS = [
  {
    title: 'Add a key',
    body: 'Open Models and paste an OpenRouter key, or a direct key from any supported provider. Enable the models you want.',
  },
  {
    title: 'Pick or build a circuit',
    body: 'Start from a template such as "Code, review, repeat" or "Student and professor", or add stages yourself. Each stage is a model with a role, skills and tools.',
  },
  {
    title: 'Wire the stages',
    body: 'Choose what flows into each stage: Output, Input, Context, Memory. Add a loop so a reviewer can send work back until it approves.',
  },
  {
    title: 'Run it',
    body: 'Type the brief and press Run. Watch each stage think and generate with live time and token counts, then copy or download the final result.',
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
    a: 'FuseLLM is a free AI workspace that runs entirely in your browser. You bring your own API keys, chat with leading models, and wire several models into circuits where each one builds on, reviews or extends the work of the others until the task is done.',
  },
  {
    q: 'Is FuseLLM free?',
    a: 'Yes. FuseLLM itself is free and has no paid tier. You only pay your AI provider for the tokens you use, at their normal rates, through your own key. Some OpenRouter models, such as Nemotron 3 Ultra (free), cost nothing.',
  },
  {
    q: 'Are my API keys safe?',
    a: 'Your keys are stored only in this browser and are sent only to the AI provider they belong to. FuseLLM has no backend, so there is no server that could see them. You can lock them behind a passphrase, which encrypts them with AES-GCM on your device.',
  },
  {
    q: 'What is a circuit in FuseLLM?',
    a: 'A circuit is an automated chain of AI models, like a Zapier zap for LLMs. Each stage is a model with a role, skills and tools. Wires pass the output, the original input, the full context or shared memory from one stage to the next, and loops let a reviewer send work back until it is approved.',
  },
  {
    q: 'Which AI models does FuseLLM support?',
    a: 'GPT-6 Astra, GPT-5.6 Sol, Terra and Luna from OpenAI; Claude Fable 5.1, Opus 5 and Sonnet 5 from Anthropic; Gemini 3.8 Flash; Kimi K3; DeepSeek V4 Pro; Grok 4.6; GLM 5.3; Qwen 3.8 Flash; Nemotron 3 Ultra; MiniMax M3; and Perplexity Sonar Pro and Sonar Deep Research. All are listed on OpenRouter, with access subject to your privacy settings and guardrails, and a Perplexity key reaches Sonar and eleven of the others with web search built in.',
  },
  {
    q: 'Can FuseLLM send emails or push code to GitHub?',
    a: 'Yes. Connect GitHub with a fine-grained token and a circuit can create a repository and commit every generated file in one push. Connect Gmail to send mail from your own address, or EmailJS to send through Zoho Mail, Outlook or any SMTP server. Eighteen apps are built in: GitHub, GitLab, Google Workspace (Gmail, Docs, Sheets, Slides, Drive, Calendar, YouTube), Slack, Discord, Telegram, Linear, Asana, Todoist, Trello, Airtable, Netlify, Vercel, Figma, Sentry, Dropbox and webhooks into Make, Zapier, n8n or Pipedream. Each uses a credential you create and can revoke.',
  },
  {
    q: 'Can FuseLLM generate images, video and music?',
    a: 'Yes, with your OpenRouter key. The Studio and circuit media stages reach more than 50 image models including Gemini 3 Pro Image and GPT Image 2, video models such as Veo 3.1, Sora 2 Pro, Kling 3 and Runway Gen-4.5, Google Lyria for music, and a dozen text-to-speech voices. Images can be edited with reference images, and a vision model can review and loop them.',
  },
  {
    q: 'Is it safe to put API keys into a browser app?',
    a: 'In FuseLLM the keys are your own and never leave your device except to go straight to the provider they belong to. There is no FuseLLM server and no app-owned secret shipped in the page. Keys sit in the browser’s IndexedDB, can be encrypted with a passphrase, and are protected by a strict Content Security Policy that allows only FuseLLM’s own scripts. Use scoped keys where you can: a spend limit on OpenRouter, a fine-grained GitHub token for chosen repos, Gmail limited to sending.',
  },
  {
    q: 'How do I get an API key for FuseLLM?',
    a: 'The quickest is an OpenRouter key: sign in at openrouter.ai, add a few dollars of credit, open Keys and create one with a credit limit. One key covers the FuseLLM catalog plus image, video and audio models, subject to your privacy settings and guardrails. In FuseLLM, the ⓘ next to each provider on the Models page gives the steps for that provider and the setting that caps a key if it ever leaks.',
  },
  {
    q: 'How many tokens will my prompt or workflow use?',
    a: 'Open the token calculator in FuseLLM and paste the text. It counts tokens exactly with OpenAI’s o200k_base tokenizer on your device, shows words and characters, prices the text on every model as input and as output, and estimates a whole chat or circuit: each step’s input from its wires, loops by assumption, typical reply and reasoning lengths, and the total cost.',
  },
  {
    q: 'Does FuseLLM show sources for research answers?',
    a: 'Yes. When a model reports the web pages it used, as Perplexity Sonar, Claude web search and OpenRouter web search do, FuseLLM lists them under the answer with titles, sites and numbered citations. Sources are passed to later circuit stages, available as the {{sources}} placeholder, and included in Markdown and Superbrain exports.',
  },
  {
    q: 'Where does FuseLLM store chats and circuits?',
    a: 'In your browser’s IndexedDB, which can hold gigabytes, with persistent storage requested so the browser does not clear it when space runs low. On Chrome, Edge and other Chromium browsers you can also mirror everything to a folder on your computer as JSON, Markdown and media files, and load it back into another browser. API keys are never written to that folder. Circuits export as .fusellm.json files you can share.',
  },
  {
    q: 'Can FuseLLM upload a video to YouTube or write to Notion and Jira?',
    a: 'YouTube yes: tick the YouTube permission when you connect Google, and a circuit can publish a generated video, private by default. Notion, Jira and Confluence block browser requests, so FuseLLM reaches them through their own remote MCP servers instead, which are set up in the MCP library. Anything else can be reached by sending a webhook to Make, Zapier, n8n or Pipedream.',
  },
  {
    q: 'How do I make a prompt use fewer tokens?',
    a: 'The token calculator has a one-click optimiser. It runs on your device for free and only makes changes that cannot alter meaning: whitespace, invisible characters pasted from documents, curly quotes, filler phrases, repeated paragraphs, table padding and HTML comments, never touching code blocks, inline code or URLs. It typically removes a fifth to a half of a hand-written prompt. A reply cap saves more, because output is billed at three to five times the input price, and Fast mode cuts the hidden reasoning that is billed as output too. A model can also rewrite the prompt for you if you want it shorter still.',
  },
  {
    q: 'Can I export FuseLLM research to Superbrain?',
    a: 'Yes. Any circuit run or chat exports as a Superbrain vault: a zip of linked Markdown notes with an index, one note per step, sources, shared memory and generated images. Open superbrain.lowkey.tools, choose Import a vault, and pick the zip.',
  },
  {
    q: 'Can two AI models talk to each other in FuseLLM?',
    a: 'Yes. That is what circuits are for. For example, Claude Fable writes code, GPT-6 Astra reviews it, and the review goes back to Claude until Astra approves. Or one model plays a student researcher while another plays the professor who grades the work.',
  },
  {
    q: 'Does FuseLLM need a server or an account?',
    a: 'No. There is no sign-up and no FuseLLM server. Your browser talks to the AI providers directly, and your chats, circuits and library are stored locally in IndexedDB.',
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
    a: 'Yes. FuseLLM speaks MCP over Streamable HTTP, so any remote MCP server that allows browser requests works, including DeepWiki and Context7. Attach a server to a chat or a circuit stage and the model can call its tools.',
  },
  {
    q: 'Who makes FuseLLM?',
    a: 'FuseLLM is built by Shrinath Prabhu (shrinath.me) and published on lowkey.tools by the makers of OwlEye Analytics (owleye.dev), a privacy-first, cookie-free web analytics product.',
  },
] as const

/** Named examples that make the idea concrete for people and for crawlers. */
export const USE_CASES = [
  { title: 'Code, review, repeat', body: 'Claude Fable writes it, GPT-6 Astra reviews it, and the loop runs until the review passes.' },
  { title: 'Student and professor', body: 'Gemini drafts research with web search, Claude Opus grades it and sends it back with notes.' },
  { title: 'Plan to product', body: 'Spec, architecture, implementation, review, tests and docs, one model per job, one brief to start it.' },
  { title: 'Deep research', body: 'Break a question down, research each part, fact-check the claims, then write the report.' },
  { title: 'Debate and judge', body: 'Grok argues for, DeepSeek argues against, and Opus weighs the case.' },
  { title: 'Build and ship', body: 'Plan, build and review until approved, then commit the code to a new GitHub repo in one push.' },
  { title: 'Art director loop', body: 'Claude writes the prompt, Gemini paints it, a vision model critiques it and sends edits back.' },
  { title: 'Podcast in a box', body: 'Sonar researches, Sonnet scripts, a voice model narrates and Lyria scores the intro.' },
  { title: 'Inbox to next actions', body: 'Paste a morning of email and messages; get today’s plan and the tasks filed in Todoist.' },
  { title: 'Error triage', body: 'Pull unresolved Sentry errors, group them by root cause, write the fix, open the GitHub issue.' },
  { title: 'Meeting to memo', body: 'A transcript becomes decisions, owners and dates, checked against the transcript and saved as a Google Doc.' },
  { title: 'Landing page, live', body: 'Copy, a built page, an accessibility review, then a deploy that returns the URL.' },
  { title: 'Movie studio', body: 'Script to screening in twelve stages: characters, keyframes, Veo clips per shot, narration, score and a final cut, with review loops at every step.' },
] as const

export const KEYWORDS = [
  'BYOK AI chat',
  'multi-model AI',
  'AI agent workflow',
  'LLM orchestration in the browser',
  'Zapier for LLMs',
  'AI code review loop',
  'OpenRouter client',
  'MCP client browser',
  'AI image and video generation',
  'Perplexity Sonar',
  'send email with AI',
  'AI push to GitHub',
  'Claude and ChatGPT together',
  'free AI workspace',
  'token calculator',
  'LLM cost estimator',
  'AI video pipeline',
  'ElevenLabs music',
]
