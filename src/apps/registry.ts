import { parseFiles } from './files.ts'
import { authorizeGoogle, googleClientId } from '../lib/oauth.ts'
import { AppError, bool, filesOf, json, need, renderHtml, wait, type AppDef, type OpContext, type OpDef, type OpResult } from './kit.ts'
import { MORE_APPS, MORE_OPS } from './more.ts'

export type { AppDef, AppField, OpDef, OpParam, OpContext, OpResult } from './kit.ts'

/*
 * Connected apps: the "Zapier" half of FuseLLM.
 *
 * Every app here is reachable straight from a browser (checked against each
 * API's CORS answer), using a credential the user creates and controls:
 * a fine-grained GitHub token, a Google sign-in limited to sending mail and
 * creating Drive files, a webhook URL, a bot token. Nothing passes through a
 * FuseLLM server, because there is none.
 *
 * Each action is defined once and used two ways:
 *   - as an Action stage in a circuit (deterministic, templated params), and
 *   - as a tool a model may call mid-answer (params filled in by the model).
 *
 * Services that refuse browser requests (Zoho Mail's API, Notion's REST API,
 * Resend, SendGrid…) are reached indirectly: through EmailJS for mail, or a
 * webhook into Make, Zapier, n8n or Pipedream for everything else.
 */

/* ── GitHub ──────────────────────────────────────────────────────────────── */

async function gh(cfg: Record<string, string>, path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    signal,
    credentials: 'omit',
    headers: {
      authorization: `Bearer ${need(cfg.token, 'GitHub token')}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  })
  if (res.status === 204) return null
  return json(res, 'GitHub')
}

async function ghMaybe(cfg: Record<string, string>, path: string, signal?: AbortSignal): Promise<any | null> {
  try {
    return await gh(cfg, path, {}, signal)
  } catch (e) {
    if (e instanceof AppError && (e.status === 404 || e.status === 409)) return null
    throw e
  }
}

const github: AppDef = {
  id: 'github',
  name: 'GitHub',
  icon: '🐙',
  blurb: 'Create repos, commit generated code in one push, open issues, publish gists.',
  docsUrl: 'https://github.com/settings/personal-access-tokens/new',
  setup:
    'Create a fine-grained personal access token. Give it access to "All repositories" (or only the ones FuseLLM may touch) with Contents: Read and write, Issues: Read and write, and Administration: Read and write if it should create repos. Add Gists: Read and write for gists.',
  fields: [{ key: 'token', label: 'Fine-grained token', secret: true, placeholder: 'github_pat_…' }],
  ready: cfg => !!cfg?.token,
}

const githubOps: OpDef[] = [
  {
    id: 'github.push',
    app: 'github',
    name: 'Push files to a repo',
    summary: 'Commit one or more files to a GitHub repository in a single commit. Creates the repository (private by default) if it does not exist.',
    params: [
      { key: 'repo', label: 'Repository', placeholder: 'owner/name or just name' },
      { key: 'files', label: 'Files', type: 'files', default: '{{final}}', help: 'Code blocks with a path on their first line become files. Otherwise the text is saved as README.md.' },
      { key: 'message', label: 'Commit message', default: 'FuseLLM: {{circuit}}' },
      { key: 'branch', label: 'Branch', optional: true, placeholder: 'default branch' },
      { key: 'private', label: 'Private if created', type: 'bool', default: 'true' },
      { key: 'description', label: 'Repo description if created', optional: true },
    ],
    async run(p, { cfg, signal }) {
      const files = filesOf(p.files)
      if (!files.length) throw new AppError('Nothing to commit: no files found.')
      const me = await gh(cfg, '/user', {}, signal)
      const spec = need(p.repo, 'repository').replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')
      let [owner, name] = spec.includes('/') ? spec.split('/') : [me.login, spec]
      name = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
      let repo = await ghMaybe(cfg, `/repos/${owner}/${name}`, signal)
      let created = false
      if (!repo) {
        const path = owner.toLowerCase() === String(me.login).toLowerCase() ? '/user/repos' : `/orgs/${owner}/repos`
        repo = await gh(cfg, path, { method: 'POST', body: JSON.stringify({ name, private: bool(p.private, true), auto_init: true, description: p.description || 'Created with FuseLLM · fusellm.lowkey.tools' }) }, signal)
        created = true
        owner = repo.owner.login
      }
      const branch = String(p.branch || repo.default_branch || 'main')
      // A brand-new repo can take a moment before its first commit is visible.
      let ref = null
      for (let i = 0; i < (created ? 8 : 1) && !ref; i++) {
        ref = await ghMaybe(cfg, `/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(branch)}`, signal)
        if (!ref && created) await wait(1000)
      }
      let baseSha: string
      let branchExists = !!ref
      if (ref) baseSha = ref.object.sha
      else {
        const def = await gh(cfg, `/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`, {}, signal)
        baseSha = def.object.sha
      }
      const base = await gh(cfg, `/repos/${owner}/${name}/git/commits/${baseSha}`, {}, signal)
      const tree = await gh(
        cfg,
        `/repos/${owner}/${name}/git/trees`,
        { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree: files.map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) }) },
        signal,
      )
      const commit = await gh(cfg, `/repos/${owner}/${name}/git/commits`, { method: 'POST', body: JSON.stringify({ message: String(p.message || 'FuseLLM update'), tree: tree.sha, parents: [baseSha] }) }, signal)
      if (branchExists) await gh(cfg, `/repos/${owner}/${name}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) }, signal)
      else await gh(cfg, `/repos/${owner}/${name}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) }, signal)
      return {
        text: `${created ? 'Created' : 'Updated'} ${owner}/${name} on ${branch}: ${files.length} file${files.length > 1 ? 's' : ''} in commit ${commit.sha.slice(0, 7)}.\n\n${files.map(f => `- ${f.path}`).join('\n')}`,
        links: [
          { label: `${owner}/${name}`, url: repo.html_url },
          { label: `Commit ${commit.sha.slice(0, 7)}`, url: commit.html_url ?? `${repo.html_url}/commit/${commit.sha}` },
        ],
      }
    },
  },
  {
    id: 'github.issue',
    app: 'github',
    name: 'Open an issue',
    summary: 'Open an issue in a GitHub repository.',
    params: [
      { key: 'repo', label: 'Repository', placeholder: 'owner/name' },
      { key: 'title', label: 'Title', default: '{{circuit}}: follow-up' },
      { key: 'body', label: 'Body', type: 'long', default: '{{final}}' },
    ],
    async run(p, { cfg, signal }) {
      const repo = need(p.repo, 'repository')
      const issue = await gh(cfg, `/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: need(p.title, 'title').slice(0, 250), body: String(p.body ?? '').slice(0, 65000) }) }, signal)
      return { text: `Opened ${repo}#${issue.number}: ${issue.title}`, links: [{ label: `#${issue.number}`, url: issue.html_url }] }
    },
  },
  {
    id: 'github.gist',
    app: 'github',
    name: 'Publish a gist',
    summary: 'Save text or code as a GitHub gist and return its link.',
    params: [
      { key: 'filename', label: 'File name', default: 'fusellm.md' },
      { key: 'content', label: 'Content', type: 'long', default: '{{final}}' },
      { key: 'description', label: 'Description', optional: true, default: '{{circuit}}' },
      { key: 'public', label: 'Public', type: 'bool', default: 'false' },
    ],
    async run(p, { cfg, signal }) {
      const gist = await gh(
        cfg,
        '/gists',
        { method: 'POST', body: JSON.stringify({ description: String(p.description ?? ''), public: bool(p.public), files: { [need(p.filename, 'file name')]: { content: need(p.content, 'content') } } }) },
        signal,
      )
      return { text: `Published gist ${gist.id}.`, links: [{ label: 'Gist', url: gist.html_url }] }
    },
  },
]

/* ── Google: Gmail and Docs ──────────────────────────────────────────────── */

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/drive.file', 'openid', 'email']

/**
 * Extras the user ticks before signing in. They stay off by default: Google
 * shows every scope on its consent screen, and nobody should approve access
 * to all their spreadsheets to send one email.
 */
export const GOOGLE_EXTRAS: { id: string; label: string; scope: string; hint: string }[] = [
  { id: 'sheets', label: 'Sheets', scope: 'https://www.googleapis.com/auth/spreadsheets', hint: 'Append rows to a spreadsheet you name.' },
  { id: 'slides', label: 'Slides', scope: 'https://www.googleapis.com/auth/presentations', hint: 'Build a deck from headings and bullets.' },
  { id: 'calendar', label: 'Calendar', scope: 'https://www.googleapis.com/auth/calendar.events', hint: 'Create events on your calendar.' },
  { id: 'youtube', label: 'YouTube', scope: 'https://www.googleapis.com/auth/youtube.upload', hint: 'Upload a generated video. Uploads are private unless you change it.' },
]

export function googleScopes(cfg: Record<string, string> | undefined): string[] {
  const on = String(cfg?.extras ?? '').split(',').filter(Boolean)
  return [...GOOGLE_SCOPES, ...GOOGLE_EXTRAS.filter(e => on.includes(e.id)).map(e => e.scope)]
}

const google: AppDef = {
  id: 'google',
  name: 'Google Workspace',
  icon: '✉️',
  blurb: 'Send Gmail, save Docs, append to Sheets, build Slides, upload to Drive, add Calendar events and publish to YouTube.',
  docsUrl: 'https://console.cloud.google.com/apis/credentials',
  oauth: 'google',
  setup:
    'Sign in with Google and approve two permissions: send mail as you, and create files FuseLLM makes in your Drive. FuseLLM cannot read your mail or your other files. Tick an extra below before connecting if you want Sheets, Slides, Calendar or YouTube. Sign-ins last an hour, so connect again before a long unattended run.',
  steps: [
    'Press Connect Google and pick your account.',
    'Google lists what FuseLLM is asking for: sending mail as you, and files it creates in your Drive. Nothing else is readable.',
    'Tick any extras you want (Sheets, Slides, Calendar, YouTube) before connecting: each adds one line to that screen.',
    'If you see “Google hasn’t verified this app”, choose Advanced and continue: it is this page talking to Google directly, with no server in between.',
    'Sign-ins last one hour. Reconnect before starting a long unattended run.',
    'Running your own OAuth client instead? Create a Web application client in Google Cloud → Credentials, add this origin and /oauth.html as an authorised redirect URI, and paste the client ID below.',
  ],
  scopeOptions: GOOGLE_EXTRAS,
  fields: [{ key: 'clientId', label: 'OAuth client ID (optional)', optional: true, placeholder: 'Uses FuseLLM’s own if empty', help: 'Bring your own "Web application" client from Google Cloud with this page’s origin and /oauth.html as redirect.' }],
  ready: cfg => !!cfg?.accessToken && Number(cfg.expiresAt) > Date.now(),
}

export async function connectGoogle(cfg: Record<string, string> = {}): Promise<Record<string, string>> {
  const clientId = googleClientId(cfg.clientId)
  if (!clientId) throw new AppError('No Google OAuth client ID is configured. Add your own in the field above.')
  const t = await authorizeGoogle(clientId, googleScopes(cfg))
  let email = ''
  try {
    const me = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { authorization: `Bearer ${t.accessToken}` }, credentials: 'omit' }).then(r => r.json())
    email = me.email ?? ''
  } catch {
    /* optional */
  }
  return { ...cfg, accessToken: t.accessToken, expiresAt: String(t.expiresAt), email }
}

function googleToken(cfg: Record<string, string>): string {
  if (!cfg.accessToken) throw new AppError('Google is not connected. Connect it in Library → Apps.')
  if (Number(cfg.expiresAt) < Date.now()) throw new AppError('The Google sign-in has expired (they last an hour). Connect again in Library → Apps.')
  return cfg.accessToken
}

const b64utf8 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))

function b64Wrapped(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return (btoa(bin).match(/.{1,76}/g) ?? []).join('\r\n')
}

/** An RFC 5322 message with plain-text and HTML alternatives, UTF-8 safe. */
export function buildMime(o: { to: string; cc?: string; subject: string; text: string; html: string; from?: string }): string {
  const boundary = `fusellm-${crypto.randomUUID()}`
  const head = [
    `To: ${o.to}`,
    o.cc ? `Cc: ${o.cc}` : '',
    o.from ? `From: ${o.from}` : '',
    `Subject: =?UTF-8?B?${b64utf8(o.subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean)
  const part = (type: string, body: string) => [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', b64Wrapped(body)].join('\r\n')
  return [...head, '', part('text/plain', o.text), part('text/html', o.html), `--${boundary}--`, ''].join('\r\n')
}

function base64Url(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const EMAIL_HTML = (body: string) =>
  `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#191b1f;max-width:680px">${body}<hr style="border:0;border-top:1px solid #e6e3dc;margin:28px 0 12px"><p style="font-size:12px;color:#8d9098">Sent with <a href="https://fusellm.lowkey.tools/" style="color:#b8621e">FuseLLM</a></p></body></html>`

const googleOps: OpDef[] = [
  {
    id: 'gmail.send',
    app: 'google',
    name: 'Send an email (Gmail)',
    summary: 'Send an email from the user’s own Gmail account. The body is Markdown and is sent as formatted HTML with a plain-text copy.',
    outward: true,
    params: [
      { key: 'to', label: 'To', placeholder: 'name@example.com, other@example.com' },
      { key: 'cc', label: 'Cc', optional: true },
      { key: 'subject', label: 'Subject', default: '{{circuit}}' },
      { key: 'body', label: 'Body (Markdown)', type: 'long', default: '{{final}}' },
    ],
    async run(p, { cfg, signal }) {
      const token = googleToken(cfg)
      const to = need(p.to, 'recipient')
      const body = String(p.body ?? '')
      const raw = base64Url(buildMime({ to, cc: p.cc, subject: need(p.subject, 'subject'), text: body, html: EMAIL_HTML(await renderHtml(body)) }))
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ raw }),
        signal,
        credentials: 'omit',
      })
      const sent = await json(res, 'Gmail')
      return { text: `Sent to ${to}${p.cc ? ` (cc ${p.cc})` : ''} from ${cfg.email || 'your Gmail'}.`, links: [{ label: 'Open in Gmail', url: `https://mail.google.com/mail/u/0/#sent/${sent.id}` }] }
    },
  },
  {
    id: 'gdocs.create',
    app: 'google',
    name: 'Save as a Google Doc',
    summary: 'Create a Google Doc in the user’s Drive from Markdown text and return its link.',
    params: [
      { key: 'title', label: 'Title', default: '{{circuit}} · {{date}}' },
      { key: 'content', label: 'Content (Markdown)', type: 'long', default: '{{final}}' },
    ],
    async run(p, { cfg, signal }) {
      const token = googleToken(cfg)
      const boundary = `fusellm-${Date.now()}`
      const meta = JSON.stringify({ name: need(p.title, 'title'), mimeType: 'application/vnd.google-apps.document' })
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${await renderHtml(String(p.content ?? ''))}</body></html>`
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
        body,
        signal,
        credentials: 'omit',
      })
      const doc = await json(res, 'Google Drive')
      return { text: `Created the Google Doc “${doc.name}”.`, links: [{ label: 'Open the Doc', url: doc.webViewLink }] }
    },
  },
  {
    id: 'gsheets.append',
    app: 'google',
    name: 'Append rows to a Sheet',
    summary: 'Append one or more rows to a Google Sheet. Rows is a JSON array of arrays, one inner array per row.',
    params: [
      { key: 'sheet', label: 'Spreadsheet ID or URL' },
      { key: 'range', label: 'Sheet and range', default: 'Sheet1!A:Z' },
      { key: 'rows', label: 'Rows (JSON)', type: 'long', default: '[["{{date}}", "{{circuit}}", "{{final}}"]]' },
    ],
    async run(p, { cfg, signal }) {
      const token = googleToken(cfg)
      const raw = need(p.sheet, 'spreadsheet')
      const id = raw.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1] ?? raw
      let rows: unknown[][]
      try {
        const parsed = typeof p.rows === 'string' ? JSON.parse(String(p.rows).replace(/^```(?:json)?\n?|\n?```$/g, '')) : p.rows
        rows = Array.isArray(parsed?.[0]) ? parsed : [parsed]
      } catch {
        throw new AppError('Rows must be a JSON array of arrays, e.g. [["a","b"]].')
      }
      const range = encodeURIComponent(String(p.range || 'Sheet1!A:Z'))
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ values: rows }),
        signal,
        credentials: 'omit',
      })
      const r = await json(res, 'Google Sheets')
      return { text: `Appended ${rows.length} row${rows.length > 1 ? 's' : ''} to ${r.updates?.updatedRange ?? p.range}.`, links: [{ label: 'Open the Sheet', url: `https://docs.google.com/spreadsheets/d/${id}` }] }
    },
  },
  {
    id: 'gslides.create',
    app: 'google',
    name: 'Build a Google Slides deck',
    summary: 'Create a slide deck from Markdown: each "## Heading" becomes a slide, and the bullets under it become its body.',
    params: [
      { key: 'title', label: 'Deck title', default: '{{circuit}} · {{date}}' },
      { key: 'content', label: 'Markdown', type: 'long', default: '{{final}}' },
    ],
    async run(p, { cfg, signal }) {
      const token = googleToken(cfg)
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
      const title = need(p.title, 'title')
      const deck = await json(await fetch('https://slides.googleapis.com/v1/presentations', { method: 'POST', headers, body: JSON.stringify({ title }), signal, credentials: 'omit' }), 'Google Slides')
      const slides = slidesFrom(String(p.content ?? ''))
      if (!slides.length) throw new AppError('Nothing to put on slides: the text has no headings or bullets.')
      const requests: unknown[] = []
      slides.forEach((s, i) => {
        const pageId = `fuse_${i}`
        const titleId = `${pageId}_t`
        const bodyId = `${pageId}_b`
        requests.push({ createSlide: { objectId: pageId, insertionIndex: i + 1, slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' }, placeholderIdMappings: [
          { layoutPlaceholder: { type: 'TITLE' }, objectId: titleId },
          { layoutPlaceholder: { type: 'BODY', index: 0 }, objectId: bodyId },
        ] } })
        requests.push({ insertText: { objectId: titleId, text: s.title.slice(0, 180) } })
        if (s.body) requests.push({ insertText: { objectId: bodyId, text: s.body.slice(0, 3000) } })
      })
      // The default first slide is empty; drop it once the real ones exist.
      const first = deck.slides?.[0]?.objectId
      if (first) requests.push({ deleteObject: { objectId: first } })
      await json(await fetch(`https://slides.googleapis.com/v1/presentations/${deck.presentationId}:batchUpdate`, { method: 'POST', headers, body: JSON.stringify({ requests }), signal, credentials: 'omit' }), 'Google Slides')
      return { text: `Built “${title}” with ${slides.length} slides.`, links: [{ label: 'Open the deck', url: `https://docs.google.com/presentation/d/${deck.presentationId}/edit` }] }
    },
  },
  {
    id: 'gdrive.upload',
    app: 'google',
    name: 'Save a file to Drive',
    summary: 'Save text, or a file an earlier stage generated, into Google Drive.',
    params: [
      { key: 'name', label: 'File name', default: '{{circuit}} {{date}}' },
      { key: 'file', label: 'Generated file', type: 'media', optional: true, help: 'Name a media stage, or leave empty for the newest file in the run. Ignored when text is given below.' },
      { key: 'content', label: 'Text instead', type: 'long', optional: true, help: 'Use this to save Markdown rather than a generated file.' },
    ],
    async run(p, { cfg, signal }) {
      const token = googleToken(cfg)
      const media = p.file as { blob: Blob; mime: string; name: string } | undefined
      const text = String(p.content ?? '').trim()
      if (!media && !text) throw new AppError('Nothing to save: no generated file and no text.')
      const mime = text ? 'text/markdown' : media!.mime
      const name = `${need(p.name, 'file name')}${text ? '.md' : `.${(media!.name.split('.').pop() ?? 'bin')}`}`
      const meta = JSON.stringify({ name, mimeType: mime })
      const boundary = `fusellm-${crypto.randomUUID()}`
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
        text || media!.blob,
        `\r\n--${boundary}--`,
      ])
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
        body,
        signal,
        credentials: 'omit',
      })
      const f = await json(res, 'Google Drive')
      return { text: `Saved “${f.name}” to Drive${f.size ? ` (${Math.round(Number(f.size) / 1024)} KB)` : ''}.`, links: [{ label: 'Open in Drive', url: f.webViewLink }] }
    },
  },
  {
    id: 'gcal.event',
    app: 'google',
    name: 'Create a Calendar event',
    summary: 'Add an event to the user’s Google Calendar. Times are ISO 8601, e.g. 2026-09-20T15:00:00.',
    params: [
      { key: 'summary', label: 'Title', default: '{{circuit}}' },
      { key: 'start', label: 'Start', placeholder: '2026-09-20T15:00:00' },
      { key: 'end', label: 'End', optional: true, help: 'Defaults to an hour after the start.' },
      { key: 'description', label: 'Description', type: 'long', optional: true, default: '{{final}}' },
      { key: 'attendees', label: 'Attendees', optional: true, placeholder: 'a@example.com, b@example.com' },
    ],
    async run(p, { cfg, signal }) {
      const token = googleToken(cfg)
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const start = need(p.start, 'start time')
      const end = String(p.end ?? '').trim() || new Date(new Date(start).getTime() + 3600_000).toISOString().slice(0, 19)
      const body: Record<string, unknown> = {
        summary: need(p.summary, 'title'),
        description: String(p.description ?? '').slice(0, 8000),
        start: { dateTime: start, timeZone: tz },
        end: { dateTime: end, timeZone: tz },
      }
      if (p.attendees) body.attendees = String(p.attendees).split(/[,;]/).map(e => ({ email: e.trim() })).filter(a => a.email)
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal, credentials: 'omit' })
      const ev = await json(res, 'Google Calendar')
      return { text: `Created “${ev.summary}” on ${String(ev.start?.dateTime ?? start).slice(0, 16).replace('T', ' ')}.`, links: [{ label: 'Open the event', url: ev.htmlLink }] }
    },
  },
  {
    id: 'youtube.upload',
    app: 'google',
    name: 'Upload a video to YouTube',
    summary: 'Upload a video an earlier stage generated to the user’s YouTube channel. Private unless told otherwise.',
    outward: true,
    params: [
      { key: 'video', label: 'Video', type: 'media', optional: true, help: 'Name the media stage, or leave empty for the newest video in the run.' },
      { key: 'title', label: 'Title', default: '{{circuit}}' },
      { key: 'description', label: 'Description', type: 'long', optional: true, default: '{{final}}' },
      { key: 'tags', label: 'Tags', optional: true, placeholder: 'ai, short film' },
      { key: 'privacy', label: 'Visibility', optional: true, default: 'private', help: 'private, unlisted or public. Private unless you change it.' },
    ],
    async run(p, { cfg, signal }) {
      const token = googleToken(cfg)
      const media = p.video as { blob: Blob; mime: string; name: string } | undefined
      if (!media) throw new AppError('No video to upload: run a media stage that makes one first.')
      if (!media.mime.startsWith('video/')) throw new AppError(`That file is ${media.mime}, not a video.`)
      const privacy = ['private', 'unlisted', 'public'].includes(String(p.privacy)) ? String(p.privacy) : 'private'
      const meta = JSON.stringify({
        snippet: { title: need(p.title, 'title').slice(0, 100), description: String(p.description ?? '').slice(0, 4900), tags: String(p.tags ?? '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 20) },
        status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
      })
      const boundary = `fusellm-${crypto.randomUUID()}`
      const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${media.mime}\r\n\r\n`, media.blob, `\r\n--${boundary}--`])
      const res = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
        body,
        signal,
        credentials: 'omit',
      })
      const v = await json(res, 'YouTube')
      return { text: `Uploaded “${v.snippet?.title}” to YouTube as ${privacy}.`, links: [{ label: 'Watch', url: `https://youtu.be/${v.id}` }, { label: 'YouTube Studio', url: `https://studio.youtube.com/video/${v.id}/edit` }] }
    },
  },
]

/** Markdown to slides: a heading starts a slide, the lines under it fill it. */
function slidesFrom(md: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = []
  let cur: { title: string; body: string } | null = null
  for (const line of md.replace(/```[\s\S]*?```/g, '').split('\n')) {
    const h = line.match(/^#{1,3}\s+(.*)$/)
    if (h) {
      if (cur) out.push(cur)
      cur = { title: h[1].replace(/[*`]/g, '').trim(), body: '' }
    } else if (cur && line.trim()) {
      cur.body += line.replace(/^\s*[-*]\s+/, '• ').replace(/[*`]/g, '').trimEnd() + '\n'
    }
  }
  if (cur) out.push(cur)
  return out.filter(s => s.title)
}

/* ── EmailJS: any mailbox, Zoho and Outlook included ─────────────────────── */

const emailjs: AppDef = {
  id: 'emailjs',
  name: 'EmailJS (Zoho, Outlook, any SMTP)',
  icon: '📮',
  blurb: 'Send mail through your own mailbox, including Zoho Mail, Outlook and any SMTP server.',
  docsUrl: 'https://dashboard.emailjs.com/admin',
  setup:
    'In EmailJS, add an email service (Zoho, Outlook, Gmail or custom SMTP) and a template whose To is {{to_email}}, Subject is {{subject}} and body is {{{message_html}}}. Paste the service ID, template ID and your Public Key. The public key is designed to live in web pages; turn on EmailJS’s domain allow-list for https://fusellm.lowkey.tools.',
  fields: [
    { key: 'serviceId', label: 'Service ID', placeholder: 'service_…' },
    { key: 'templateId', label: 'Template ID', placeholder: 'template_…' },
    { key: 'publicKey', label: 'Public key', placeholder: 'from Account → General' },
  ],
  ready: cfg => !!(cfg?.serviceId && cfg.templateId && cfg.publicKey),
}

const emailjsOps: OpDef[] = [
  {
    id: 'emailjs.send',
    app: 'emailjs',
    name: 'Send an email (EmailJS)',
    summary: 'Send an email through the user’s own mailbox (Zoho, Outlook or SMTP) via EmailJS. Body is Markdown.',
    outward: true,
    params: [
      { key: 'to', label: 'To', placeholder: 'name@example.com' },
      { key: 'subject', label: 'Subject', default: '{{circuit}}' },
      { key: 'body', label: 'Body (Markdown)', type: 'long', default: '{{final}}' },
    ],
    async run(p, { cfg, signal }) {
      const body = String(p.body ?? '')
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'omit',
        signal,
        body: JSON.stringify({
          service_id: need(cfg.serviceId, 'service ID'),
          template_id: need(cfg.templateId, 'template ID'),
          user_id: need(cfg.publicKey, 'public key'),
          template_params: { to_email: need(p.to, 'recipient'), subject: need(p.subject, 'subject'), message: body, message_html: EMAIL_HTML(await renderHtml(body)), from_name: 'FuseLLM' },
        }),
      })
      if (!res.ok) throw new AppError(`EmailJS ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status)
      return { text: `Sent to ${p.to} through EmailJS.` }
    },
  },
]

/* ── Webhooks: Zapier, Make, n8n, Pipedream, anything ────────────────────── */

async function postAnywhere(url: string, payload: unknown, extra: Record<string, string>, signal: AbortSignal): Promise<string> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(payload), signal, credentials: 'omit' })
    if (!res.ok) throw new AppError(`The webhook answered ${res.status}: ${(await res.text()).slice(0, 160)}`, res.status)
    return `Delivered (${res.status}).`
  } catch (e) {
    if (e instanceof AppError || signal.aborted || Object.keys(extra).length) throw e
    // The endpoint does not allow browser requests with a JSON body. A
    // "simple" request still reaches it; we just cannot read the reply.
    await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload), signal, credentials: 'omit' })
    return 'Sent. The service does not let browsers read its reply, so delivery could not be confirmed.'
  }
}

const webhook: AppDef = {
  id: 'webhook',
  name: 'Webhook (Zapier, Make, n8n…)',
  icon: '🪝',
  blurb: 'POST results to any URL. Point it at a Zapier, Make, n8n or Pipedream hook and reach thousands more apps.',
  docsUrl: 'https://www.make.com/en/help/tools/webhooks',
  setup: 'Create a “Catch hook” (Zapier), “Custom webhook” (Make), Webhook node (n8n) or HTTP trigger (Pipedream) and paste its URL. Optionally add a header the receiver checks.',
  fields: [
    { key: 'url', label: 'Webhook URL', secret: true, placeholder: 'https://hook.eu1.make.com/…' },
    { key: 'headerName', label: 'Header name', optional: true, placeholder: 'X-Signature' },
    { key: 'headerValue', label: 'Header value', secret: true, optional: true },
  ],
  ready: cfg => !!cfg?.url,
}

const webhookOps: OpDef[] = [
  {
    id: 'webhook.post',
    app: 'webhook',
    name: 'Send to webhook',
    summary: 'POST a JSON payload to the user’s automation webhook (Zapier, Make, n8n, Pipedream), which can forward it to any app.',
    outward: true,
    params: [
      { key: 'message', label: 'Message', type: 'long', default: '{{final}}' },
      { key: 'event', label: 'Event name', default: 'circuit.completed' },
      { key: 'subject', label: 'Subject', optional: true, default: '{{circuit}}' },
    ],
    async run(p, { cfg, signal, meta }) {
      const extra = cfg.headerName && cfg.headerValue ? { [cfg.headerName]: cfg.headerValue } : {}
      const text = await postAnywhere(
        need(cfg.url, 'webhook URL'),
        { source: 'FuseLLM', event: p.event || 'circuit.completed', subject: p.subject ?? meta.circuit, circuit: meta.circuit, brief: meta.brief, message: String(p.message ?? ''), sent_at: new Date().toISOString() },
        extra,
        signal,
      )
      return { text }
    },
  },
]

/* ── Chat apps: Slack, Discord, Telegram ─────────────────────────────────── */

/** Markdown → Slack mrkdwn, closely enough for reports. */
function toSlack(md: string): string {
  return md
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<$2|$1>')
}

const slack: AppDef = {
  id: 'slack',
  name: 'Slack',
  icon: '💬',
  blurb: 'Post results to a Slack channel through an incoming webhook.',
  docsUrl: 'https://api.slack.com/messaging/webhooks',
  setup: 'Create a Slack app, turn on Incoming Webhooks, add one for the channel and paste its URL.',
  fields: [{ key: 'url', label: 'Incoming webhook URL', secret: true, placeholder: 'https://hooks.slack.com/services/…' }],
  ready: cfg => !!cfg?.url,
}

const discord: AppDef = {
  id: 'discord',
  name: 'Discord',
  icon: '🎮',
  blurb: 'Post to a Discord channel; long results arrive as an attached .md file.',
  docsUrl: 'https://support.discord.com/hc/en-us/articles/228383668',
  setup: 'Channel settings → Integrations → Webhooks → New webhook → Copy URL.',
  fields: [{ key: 'url', label: 'Webhook URL', secret: true, placeholder: 'https://discord.com/api/webhooks/…' }],
  ready: cfg => !!cfg?.url,
}

const telegram: AppDef = {
  id: 'telegram',
  name: 'Telegram',
  icon: '✈️',
  blurb: 'Message yourself or a group from your own bot; long results come as a file.',
  docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
  setup: 'Create a bot with @BotFather and paste its token. For the chat ID, message the bot once, then open api.telegram.org/bot<token>/getUpdates and copy chat.id.',
  fields: [
    { key: 'token', label: 'Bot token', secret: true, placeholder: '123456:ABC…' },
    { key: 'chatId', label: 'Chat ID', placeholder: '123456789' },
  ],
  ready: cfg => !!(cfg?.token && cfg.chatId),
}

const chatOps: OpDef[] = [
  {
    id: 'slack.post',
    app: 'slack',
    name: 'Post to Slack',
    summary: 'Post a message to the user’s Slack channel.',
    outward: true,
    params: [{ key: 'text', label: 'Message (Markdown)', type: 'long', default: '*{{circuit}}*\n\n{{final}}' }],
    async run(p, { cfg, signal }) {
      // Slack does not answer CORS preflights; a form post is a "simple"
      // request it accepts, at the cost of an unreadable reply.
      const body = new URLSearchParams({ payload: JSON.stringify({ text: toSlack(String(p.text ?? '')).slice(0, 39000) }) })
      await fetch(need(cfg.url, 'webhook URL'), { method: 'POST', mode: 'no-cors', body, signal, credentials: 'omit' })
      return { text: 'Posted to Slack. (Slack does not confirm deliveries to browsers.)' }
    },
  },
  {
    id: 'discord.post',
    app: 'discord',
    name: 'Post to Discord',
    summary: 'Post a message to the user’s Discord channel. Long text is attached as a Markdown file.',
    outward: true,
    params: [{ key: 'content', label: 'Message (Markdown)', type: 'long', default: '**{{circuit}}**\n\n{{final}}' }],
    async run(p, { cfg, signal }) {
      const content = String(p.content ?? '')
      const url = need(cfg.url, 'webhook URL') + (cfg.url.includes('?') ? '&' : '?') + 'wait=true'
      let res: Response
      if (content.length <= 1900) {
        res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, username: 'FuseLLM' }), signal, credentials: 'omit' })
      } else {
        const form = new FormData()
        form.append('payload_json', JSON.stringify({ content: content.slice(0, 1500) + '\n\n… full text attached.', username: 'FuseLLM' }))
        form.append('files[0]', new Blob([content], { type: 'text/markdown' }), 'fusellm.md')
        res = await fetch(url, { method: 'POST', body: form, signal, credentials: 'omit' })
      }
      await json(res, 'Discord')
      return { text: `Posted to Discord${content.length > 1900 ? ' with the full text attached' : ''}.` }
    },
  },
  {
    id: 'telegram.send',
    app: 'telegram',
    name: 'Send a Telegram message',
    summary: 'Send a Telegram message to the user’s chat through their bot. Long text is sent as a file.',
    outward: true,
    params: [{ key: 'text', label: 'Message', type: 'long', default: '{{circuit}}\n\n{{final}}' }],
    async run(p, { cfg, signal }) {
      const text = String(p.text ?? '')
      const base = `https://api.telegram.org/bot${need(cfg.token, 'bot token')}`
      let res: Response
      if (text.length <= 4000) {
        res = await fetch(`${base}/sendMessage`, { method: 'POST', body: new URLSearchParams({ chat_id: need(cfg.chatId, 'chat ID'), text, disable_web_page_preview: 'true' }), signal, credentials: 'omit' })
      } else {
        const form = new FormData()
        form.append('chat_id', need(cfg.chatId, 'chat ID'))
        form.append('caption', text.slice(0, 900) + '…')
        form.append('document', new Blob([text], { type: 'text/markdown' }), 'fusellm.md')
        res = await fetch(`${base}/sendDocument`, { method: 'POST', body: form, signal, credentials: 'omit' })
      }
      const j = await json(res, 'Telegram')
      if (j && j.ok === false) throw new AppError(`Telegram: ${j.description}`)
      return { text: `Sent to Telegram chat ${cfg.chatId}.` }
    },
  },
]

/* ── Linear ──────────────────────────────────────────────────────────────── */

const linear: AppDef = {
  id: 'linear',
  name: 'Linear',
  icon: '📐',
  blurb: 'Turn plans and review findings into Linear issues.',
  docsUrl: 'https://linear.app/settings/account/security',
  setup: 'Settings → Security & access → Personal API keys → New key. Use the team key you see in issue IDs (ENG in ENG-42).',
  fields: [{ key: 'apiKey', label: 'Personal API key', secret: true, placeholder: 'lin_api_…' }],
  ready: cfg => !!cfg?.apiKey,
}

async function linearQuery(cfg: Record<string, string>, query: string, variables: Record<string, unknown>, signal: AbortSignal): Promise<any> {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { authorization: need(cfg.apiKey, 'Linear API key'), 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
    credentials: 'omit',
  })
  const j = await json(res, 'Linear')
  if (j?.errors?.length) throw new AppError(`Linear: ${j.errors[0].message}`)
  return j.data
}

const linearOps: OpDef[] = [
  {
    id: 'linear.issue',
    app: 'linear',
    name: 'Create a Linear issue',
    summary: 'Create an issue in the user’s Linear team.',
    params: [
      { key: 'team', label: 'Team key', placeholder: 'ENG' },
      { key: 'title', label: 'Title', default: '{{circuit}}' },
      { key: 'description', label: 'Description (Markdown)', type: 'long', default: '{{final}}' },
    ],
    async run(p, { cfg, signal }) {
      const key = need(p.team, 'team key').toUpperCase()
      const teams = await linearQuery(cfg, 'query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id name } } }', { key }, signal)
      const team = teams.teams.nodes[0]
      if (!team) throw new AppError(`No Linear team with key ${key}.`)
      const r = await linearQuery(
        cfg,
        'mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url title } } }',
        { input: { teamId: team.id, title: need(p.title, 'title'), description: String(p.description ?? '') } },
        signal,
      )
      const issue = r.issueCreate.issue
      return { text: `Created ${issue.identifier}: ${issue.title}`, links: [{ label: issue.identifier, url: issue.url }] }
    },
  },
]

/* ── Vercel ──────────────────────────────────────────────────────────────── */

const vercel: AppDef = {
  id: 'vercel',
  name: 'Vercel',
  icon: '▲',
  blurb: 'Deploy generated sites straight to a live URL. A plain report is published as a styled page.',
  docsUrl: 'https://vercel.com/account/settings/tokens',
  setup: 'Account settings → Tokens → Create. Scope it to the team you want deployments in, and paste the team ID if it is not your personal account.',
  fields: [
    { key: 'token', label: 'Access token', secret: true },
    { key: 'teamId', label: 'Team ID', optional: true, placeholder: 'team_…' },
  ],
  ready: cfg => !!cfg?.token,
}

async function pageFor(markdown: string, title: string): Promise<string> {
  const body = await renderHtml(markdown)
  const esc = title.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc}</title><style>body{max-width:760px;margin:40px auto;padding:0 20px;font:16px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#191b1f;background:#faf9f6}pre{background:#f3f1ec;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,Menlo,monospace}table{border-collapse:collapse}td,th{border:1px solid #e6e3dc;padding:6px 10px}a{color:#b8621e}footer{margin-top:48px;font-size:13px;color:#8d9098}</style></head><body>${body}<footer>Made with <a href="https://fusellm.lowkey.tools/">FuseLLM</a></footer></body></html>`
}

const vercelOps: OpDef[] = [
  {
    id: 'vercel.deploy',
    app: 'vercel',
    name: 'Deploy to Vercel',
    summary: 'Deploy files (a static site or a framework project) to Vercel production and return the live URL. Plain text is published as a single styled page.',
    outward: true,
    params: [
      { key: 'project', label: 'Project name', placeholder: 'my-fusellm-site' },
      { key: 'files', label: 'Files', type: 'files', default: '{{final}}', help: 'Code blocks with paths become the site. Anything else is published as index.html.' },
    ],
    async run(p, { cfg, signal, meta }) {
      let files = Array.isArray(p.files) ? filesOf(p.files) : parseFiles(String(p.files ?? ''))
      if (!files.length) files = [{ path: 'index.html', content: await pageFor(String(p.files ?? ''), meta.circuit ?? 'FuseLLM') }]
      const name = need(p.project, 'project name').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)
      const qs = cfg.teamId ? `?teamId=${encodeURIComponent(cfg.teamId)}` : ''
      const res = await fetch(`https://api.vercel.com/v13/deployments${qs}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${need(cfg.token, 'Vercel token')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name, target: 'production', files: files.map(f => ({ file: f.path, data: f.content })), projectSettings: files.some(f => f.path === 'package.json') ? undefined : { framework: null } }),
        signal,
        credentials: 'omit',
      })
      const d = await json(res, 'Vercel')
      const url = `https://${d.alias?.[0] ?? d.url}`
      return { text: `Deployed ${files.length} file${files.length > 1 ? 's' : ''} to ${url} (${d.readyState ?? 'building'}).`, links: [{ label: 'Live site', url }, ...(d.inspectorUrl ? [{ label: 'Build log', url: d.inspectorUrl }] : [])] }
    },
  },
]

/* ── registry ────────────────────────────────────────────────────────────── */

export const APPS: AppDef[] = [github, google, emailjs, webhook, slack, discord, telegram, linear, vercel, ...MORE_APPS]
export const APP_BY_ID: Record<string, AppDef> = Object.fromEntries(APPS.map(a => [a.id, a]))
export const OPS: OpDef[] = [...githubOps, ...googleOps, ...emailjsOps, ...webhookOps, ...chatOps, ...linearOps, ...vercelOps, ...MORE_OPS]
export const OP_BY_ID: Record<string, OpDef> = Object.fromEntries(OPS.map(o => [o.id, o]))

export function appReady(apps: Record<string, Record<string, string> | undefined>, appId: string): boolean {
  return APP_BY_ID[appId]?.ready(apps[appId]) ?? false
}

/** Runs an action with a time limit, so a hung API cannot stall a circuit forever. */
export async function runOp(opId: string, params: Record<string, any>, cfg: Record<string, string> | undefined, meta: OpContext['meta'], signal: AbortSignal): Promise<OpResult> {
  const op = OP_BY_ID[opId]
  if (!op) throw new AppError(`Unknown action ${opId}.`)
  const app = APP_BY_ID[op.app]
  if (!app.ready(cfg)) throw new AppError(`${app.name} is not connected. Set it up in Library → Apps.`)
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 120_000)
  const onAbort = () => ctl.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await op.run(params, { cfg: cfg ?? {}, signal: ctl.signal, meta })
  } catch (e) {
    if (ctl.signal.aborted && !signal.aborted) throw new AppError(`${op.name} timed out after 2 minutes.`)
    throw e
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}
