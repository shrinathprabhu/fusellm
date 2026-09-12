import { zip } from 'fflate'
import { AppError, filesOf, json, need, renderHtml, type AppDef, type OpDef } from './kit.ts'

/*
 * The second shelf of connected apps: task trackers, drives, design, deploys
 * and error tracking. Every one was checked for a browser answer (a CORS
 * preflight that allows this origin) before it was added, and every one takes
 * a credential the user makes and can revoke.
 *
 * Deliberately absent, because their APIs refuse browser requests: Notion,
 * Jira and Confluence (reachable instead through their remote MCP servers,
 * which are in the MCP library), Cloudflare, CircleCI, HubSpot, Render and
 * Zoho Mail (use EmailJS). AWS has no browser-safe way to sign a request
 * without shipping a secret, so send it a webhook: a Lambda function URL, API
 * Gateway, or n8n.
 */

const bearer = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extra })

async function post(url: string, what: string, init: RequestInit, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, { method: 'POST', ...init, signal, credentials: 'omit' })
  return json(res, what)
}

/* ── Asana ───────────────────────────────────────────────────────────────── */

const asana: AppDef = {
  id: 'asana',
  name: 'Asana',
  icon: '🅰️',
  blurb: 'Turn plans, reviews and research into Asana tasks in a project you choose.',
  docsUrl: 'https://app.asana.com/0/my-apps',
  setup: 'A personal access token acts as you, across every workspace you can see. Create one, then copy the project ID from a project’s URL.',
  steps: [
    'Open app.asana.com and sign in.',
    'Go to My Settings → Apps → Manage developer apps, or open app.asana.com/0/my-apps.',
    'Choose Create new token, name it FuseLLM and accept the terms.',
    'Copy the token now: Asana shows it once.',
    'Open the project you want tasks in. Its URL ends with the project ID, as in /0/1201234567890123/list — copy that number.',
  ],
  fields: [
    { key: 'token', label: 'Personal access token', secret: true, placeholder: '2/12345…' },
    { key: 'project', label: 'Default project ID', optional: true, placeholder: '1201234567890123' },
  ],
  ready: cfg => !!cfg?.token,
}

const asanaOps: OpDef[] = [
  {
    id: 'asana.task',
    app: 'asana',
    name: 'Create an Asana task',
    summary: 'Create a task in an Asana project, with notes and an optional due date (YYYY-MM-DD).',
    params: [
      { key: 'name', label: 'Task name', default: '{{circuit}}' },
      { key: 'notes', label: 'Notes', type: 'long', default: '{{final}}' },
      { key: 'project', label: 'Project ID', optional: true, help: 'Defaults to the project saved with the connection.' },
      { key: 'due', label: 'Due date', optional: true, placeholder: 'YYYY-MM-DD' },
    ],
    async run(p, { cfg, signal }) {
      const project = String(p.project || cfg.project || '').trim()
      if (!project) throw new AppError('No Asana project ID: add one on the task or in the app settings.')
      const data: Record<string, unknown> = { name: need(p.name, 'task name'), notes: String(p.notes ?? '').slice(0, 60_000), projects: [project] }
      if (p.due) data.due_on = String(p.due)
      const r = await post('https://app.asana.com/api/1.0/tasks', 'Asana', { headers: { ...bearer(need(cfg.token, 'Asana token')), 'content-type': 'application/json' }, body: JSON.stringify({ data }) }, signal)
      const id = r?.data?.gid
      return { text: `Created the Asana task “${r?.data?.name}”.`, links: id ? [{ label: 'Open in Asana', url: `https://app.asana.com/0/${project}/${id}` }] : undefined }
    },
  },
]

/* ── Todoist ─────────────────────────────────────────────────────────────── */

const todoist: AppDef = {
  id: 'todoist',
  name: 'Todoist',
  icon: '✅',
  blurb: 'Put the next actions from a plan straight into your own Todoist inbox or project.',
  docsUrl: 'https://app.todoist.com/app/settings/integrations/developer',
  setup: 'One API token from your Todoist settings. It can read and change your tasks, so keep it to your own account.',
  steps: [
    'Open Todoist on the web and sign in.',
    'Go to Settings → Integrations → Developer.',
    'Copy the API token shown there.',
    'Leave the project ID empty to file tasks in your Inbox, or copy the digits at the end of a project’s URL.',
  ],
  fields: [
    { key: 'token', label: 'API token', secret: true },
    { key: 'project', label: 'Default project ID', optional: true, placeholder: 'Inbox if empty' },
  ],
  ready: cfg => !!cfg?.token,
}

const todoistOps: OpDef[] = [
  {
    id: 'todoist.task',
    app: 'todoist',
    name: 'Create a Todoist task',
    summary: 'Add a task to Todoist, with an optional description, natural-language due date ("tomorrow 9am") and priority 1-4.',
    params: [
      { key: 'content', label: 'Task', default: '{{circuit}}' },
      { key: 'description', label: 'Description', type: 'long', optional: true, default: '{{final}}' },
      { key: 'due', label: 'Due', optional: true, placeholder: 'tomorrow 9am' },
      { key: 'priority', label: 'Priority 1-4', optional: true, placeholder: '1' },
    ],
    async run(p, { cfg, signal }) {
      const body: Record<string, unknown> = { content: need(p.content, 'task') }
      if (p.description) body.description = String(p.description).slice(0, 16_000)
      if (p.due) body.due_string = String(p.due)
      if (p.priority) body.priority = Math.min(4, Math.max(1, Number(p.priority) || 1))
      if (cfg.project || p.project) body.project_id = String(p.project || cfg.project)
      const t = await post('https://api.todoist.com/api/v1/tasks', 'Todoist', { headers: { ...bearer(need(cfg.token, 'Todoist token')), 'content-type': 'application/json' }, body: JSON.stringify(body) }, signal)
      return { text: `Added “${t.content}” to Todoist${t.due?.string ? `, due ${t.due.string}` : ''}.`, links: t.url ? [{ label: 'Open in Todoist', url: t.url }] : undefined }
    },
  },
]

/* ── Trello ──────────────────────────────────────────────────────────────── */

const trello: AppDef = {
  id: 'trello',
  name: 'Trello',
  icon: '📋',
  blurb: 'Drop cards onto a Trello list: findings, tasks, drafts, one card each.',
  docsUrl: 'https://trello.com/power-ups/admin',
  setup: 'Trello needs an API key from a Power-Up plus a token you generate for yourself. The list ID is the column the cards land in.',
  steps: [
    'Open trello.com/power-ups/admin and create a Power-Up (any name, your workspace).',
    'On its API key tab, generate an API key and copy it.',
    'On the same page choose Token, approve the request, and copy the token.',
    'For the list ID: open the board, add .json to the board URL, and find the list you want under "lists" — copy its id. (Or use the board menu → Share → Export JSON.)',
  ],
  fields: [
    { key: 'key', label: 'API key' },
    { key: 'token', label: 'Token', secret: true },
    { key: 'list', label: 'Default list ID', optional: true },
  ],
  ready: cfg => !!(cfg?.key && cfg.token),
}

const trelloOps: OpDef[] = [
  {
    id: 'trello.card',
    app: 'trello',
    name: 'Create a Trello card',
    summary: 'Add a card to a Trello list, with a description and an optional due date.',
    params: [
      { key: 'name', label: 'Card title', default: '{{circuit}}' },
      { key: 'desc', label: 'Description', type: 'long', default: '{{final}}' },
      { key: 'list', label: 'List ID', optional: true },
      { key: 'due', label: 'Due date', optional: true, placeholder: 'YYYY-MM-DD' },
    ],
    async run(p, { cfg, signal }) {
      const list = String(p.list || cfg.list || '').trim()
      if (!list) throw new AppError('No Trello list ID: add one on the action or in the app settings.')
      const qs = new URLSearchParams({ key: need(cfg.key, 'Trello key'), token: need(cfg.token, 'Trello token'), idList: list, name: need(p.name, 'card title'), desc: String(p.desc ?? '').slice(0, 16_000) })
      if (p.due) qs.set('due', String(p.due))
      const card = await post(`https://api.trello.com/1/cards?${qs}`, 'Trello', { headers: { accept: 'application/json' } }, signal)
      return { text: `Created the Trello card “${card.name}”.`, links: [{ label: 'Open the card', url: card.shortUrl ?? card.url }] }
    },
  },
]

/* ── Airtable ────────────────────────────────────────────────────────────── */

const airtable: AppDef = {
  id: 'airtable',
  name: 'Airtable',
  icon: '🗂️',
  blurb: 'Append rows to a base: research findings, leads, content calendars, test results.',
  docsUrl: 'https://airtable.com/create/tokens',
  setup: 'A personal access token scoped to the bases you name. Field names in the action must match the column names in your table.',
  steps: [
    'Open airtable.com/create/tokens and choose Create new token.',
    'Add the scopes data.records:write (and data.records:read if you want reads).',
    'Under Access, add only the base FuseLLM should write to.',
    'Create the token and copy it. It is shown once.',
    'Open the base and copy its ID from the URL: it starts with app… (airtable.com/appXXXXXXXX/…).',
  ],
  fields: [
    { key: 'token', label: 'Personal access token', secret: true, placeholder: 'pat…' },
    { key: 'base', label: 'Base ID', placeholder: 'appXXXXXXXXXXXXXX' },
    { key: 'table', label: 'Default table name', optional: true, placeholder: 'Tasks' },
  ],
  ready: cfg => !!(cfg?.token && cfg.base),
}

const airtableOps: OpDef[] = [
  {
    id: 'airtable.record',
    app: 'airtable',
    name: 'Add an Airtable record',
    summary: 'Create a record in an Airtable table. Fields is a JSON object of column name to value, matching the table exactly.',
    params: [
      { key: 'table', label: 'Table', optional: true, help: 'Defaults to the table saved with the connection.' },
      { key: 'fields', label: 'Fields (JSON)', type: 'long', default: '{"Name": "{{circuit}}", "Notes": "{{final}}"}' },
    ],
    async run(p, { cfg, signal }) {
      const table = String(p.table || cfg.table || '').trim()
      if (!table) throw new AppError('No Airtable table: name one on the action or in the app settings.')
      let fields: Record<string, unknown>
      try {
        fields = typeof p.fields === 'object' && p.fields ? p.fields : JSON.parse(String(p.fields ?? '{}').replace(/^```(?:json)?\n?|\n?```$/g, ''))
      } catch {
        throw new AppError('Fields must be a JSON object of column name to value.')
      }
      await post(`https://api.airtable.com/v0/${encodeURIComponent(need(cfg.base, 'base ID'))}/${encodeURIComponent(table)}`, 'Airtable', {
        headers: { ...bearer(need(cfg.token, 'Airtable token')), 'content-type': 'application/json' },
        body: JSON.stringify({ fields, typecast: true }),
      }, signal)
      return { text: `Added a record to ${table}.`, links: [{ label: 'Open the base', url: `https://airtable.com/${cfg.base}` }] }
    },
  },
]

/* ── GitLab ──────────────────────────────────────────────────────────────── */

const gitlab: AppDef = {
  id: 'gitlab',
  name: 'GitLab',
  icon: '🦊',
  blurb: 'Open issues and start CI/CD pipelines on GitLab.com or your own instance.',
  docsUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
  setup: 'A personal access token with the api scope. For a self-managed instance, change the host below.',
  steps: [
    'Open GitLab → your avatar → Preferences → Access tokens (gitlab.com/-/user_settings/personal_access_tokens).',
    'Add a token named FuseLLM with the api scope and an expiry date.',
    'Create it and copy the token: it is shown once.',
    'The project is either its numeric ID (Settings → General) or the full path, as in group/subgroup/project.',
    'Self-managed GitLab: put your host below, for example https://gitlab.mycompany.com.',
  ],
  fields: [
    { key: 'token', label: 'Personal access token', secret: true, placeholder: 'glpat-…' },
    { key: 'host', label: 'Host', optional: true, placeholder: 'https://gitlab.com' },
    { key: 'project', label: 'Default project', optional: true, placeholder: 'group/project' },
  ],
  ready: cfg => !!cfg?.token,
}

const glHost = (cfg: Record<string, string>) => (cfg.host || 'https://gitlab.com').replace(/\/+$/, '')
const glProject = (p: Record<string, any>, cfg: Record<string, string>) => encodeURIComponent(String(p.project || cfg.project || '').trim() || need('', 'GitLab project'))

const gitlabOps: OpDef[] = [
  {
    id: 'gitlab.issue',
    app: 'gitlab',
    name: 'Create a GitLab issue',
    summary: 'Open an issue on a GitLab project, with a Markdown description and optional labels.',
    params: [
      { key: 'project', label: 'Project', optional: true, placeholder: 'group/project' },
      { key: 'title', label: 'Title', default: '{{circuit}}' },
      { key: 'description', label: 'Description (Markdown)', type: 'long', default: '{{final}}' },
      { key: 'labels', label: 'Labels', optional: true, placeholder: 'bug,needs-review' },
    ],
    async run(p, { cfg, signal }) {
      const body: Record<string, unknown> = { title: need(p.title, 'title'), description: String(p.description ?? '') }
      if (p.labels) body.labels = String(p.labels)
      const issue = await post(`${glHost(cfg)}/api/v4/projects/${glProject(p, cfg)}/issues`, 'GitLab', { headers: { ...bearer(need(cfg.token, 'GitLab token')), 'content-type': 'application/json' }, body: JSON.stringify(body) }, signal)
      return { text: `Opened GitLab issue #${issue.iid}: ${issue.title}`, links: [{ label: `#${issue.iid}`, url: issue.web_url }] }
    },
  },
  {
    id: 'gitlab.pipeline',
    app: 'gitlab',
    name: 'Run a GitLab pipeline',
    summary: 'Start a CI/CD pipeline on a branch, optionally passing variables as a JSON object.',
    outward: true,
    params: [
      { key: 'project', label: 'Project', optional: true, placeholder: 'group/project' },
      { key: 'ref', label: 'Branch or tag', default: 'main' },
      { key: 'variables', label: 'Variables (JSON)', type: 'long', optional: true, placeholder: '{"DEPLOY_ENV":"staging"}' },
    ],
    async run(p, { cfg, signal }) {
      let vars: { key: string; value: string }[] = []
      if (p.variables) {
        try {
          vars = Object.entries(JSON.parse(String(p.variables))).map(([key, value]) => ({ key, value: String(value) }))
        } catch {
          throw new AppError('Variables must be a JSON object.')
        }
      }
      const run = await post(`${glHost(cfg)}/api/v4/projects/${glProject(p, cfg)}/pipeline`, 'GitLab', {
        headers: { ...bearer(need(cfg.token, 'GitLab token')), 'content-type': 'application/json' },
        body: JSON.stringify({ ref: need(p.ref, 'branch'), variables: vars }),
      }, signal)
      return { text: `Started pipeline #${run.id} on ${run.ref} (${run.status}).`, links: [{ label: 'Pipeline', url: run.web_url }] }
    },
  },
]

/* ── Netlify ─────────────────────────────────────────────────────────────── */

const netlify: AppDef = {
  id: 'netlify',
  name: 'Netlify',
  icon: '🌐',
  blurb: 'Publish a generated site to Netlify and get the live URL back.',
  docsUrl: 'https://app.netlify.com/user/applications#personal-access-tokens',
  setup: 'A personal access token, and the site to deploy into. Leave the site empty and a new one is created for you.',
  steps: [
    'Open app.netlify.com → avatar → User settings → Applications.',
    'Under Personal access tokens choose New access token, name it FuseLLM and copy it.',
    'For an existing site, open it and copy the Site ID from Site configuration → General.',
    'Leave the site ID empty and FuseLLM creates a new site on the first deploy.',
  ],
  fields: [
    { key: 'token', label: 'Personal access token', secret: true },
    { key: 'site', label: 'Site ID', optional: true, placeholder: 'Creates a new site if empty' },
  ],
  ready: cfg => !!cfg?.token,
}

async function zipFiles(files: { path: string; content: string }[]): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {}
  const enc = new TextEncoder()
  for (const f of files) entries[f.path] = enc.encode(f.content)
  return new Promise((resolve, reject) => zip(entries, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out))))
}

const netlifyOps: OpDef[] = [
  {
    id: 'netlify.deploy',
    app: 'netlify',
    name: 'Deploy to Netlify',
    summary: 'Deploy files as a static site on Netlify and return the live URL. Plain text is published as a single page.',
    outward: true,
    params: [
      { key: 'files', label: 'Files', type: 'files', default: '{{final}}', help: 'Code blocks with paths become the site. Anything else is published as index.html.' },
      { key: 'site', label: 'Site ID', optional: true },
    ],
    async run(p, { cfg, signal, meta }) {
      const token = need(cfg.token, 'Netlify token')
      let files = filesOf(p.files, 'index.html')
      if (!files.some(f => /^index\.html?$/i.test(f.path))) {
        const html = `<!doctype html><meta charset="utf-8"><title>${(meta.circuit ?? 'FuseLLM').replace(/[<>&]/g, '')}</title><body style="max-width:760px;margin:40px auto;padding:0 20px;font:16px/1.65 system-ui,sans-serif">${await renderHtml(files.map(f => f.content).join('\n\n'))}</body>`
        files = [{ path: 'index.html', content: html }, ...files]
      }
      let site = String(p.site || cfg.site || '').trim()
      if (!site) {
        const created = await post('https://api.netlify.com/api/v1/sites', 'Netlify', { headers: bearer(token) }, signal)
        site = created.id
      }
      const res = await fetch(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(site)}/deploys`, {
        method: 'POST',
        headers: { ...bearer(token), 'content-type': 'application/zip' },
        body: (await zipFiles(files)) as BodyInit,
        signal,
        credentials: 'omit',
      })
      const d = await json(res, 'Netlify')
      const url = d.ssl_url || d.deploy_ssl_url || d.url
      return { text: `Deployed ${files.length} file${files.length > 1 ? 's' : ''} to Netlify (${d.state ?? 'processing'}).`, links: [{ label: 'Live site', url }, ...(d.admin_url ? [{ label: 'Netlify dashboard', url: d.admin_url }] : [])] }
    },
  },
]

/* ── Figma ───────────────────────────────────────────────────────────────── */

const figma: AppDef = {
  id: 'figma',
  name: 'Figma',
  icon: '🎨',
  blurb: 'Read a file’s structure for a design review, and leave the findings as comments on the file.',
  docsUrl: 'https://www.figma.com/developers/api#access-tokens',
  setup: 'A personal access token with file content read and comments write. The file key is the code in a Figma URL.',
  steps: [
    'In Figma, open your avatar → Settings → Security.',
    'Under Personal access tokens choose Generate new token.',
    'Give it File content: Read-only and Comments: Write, then generate it.',
    'Copy the token straight away: Figma shows it once.',
    'The file key is the code in the URL: figma.com/design/<file key>/Some-Name.',
  ],
  fields: [{ key: 'token', label: 'Personal access token', secret: true, placeholder: 'figd_…' }],
  ready: cfg => !!cfg?.token,
}

const fileKey = (v: unknown) => {
  const s = need(v, 'Figma file key')
  return /figma\.com/.test(s) ? (s.match(/(?:file|design|board|proto)\/([A-Za-z0-9]+)/)?.[1] ?? s) : s
}

const figmaOps: OpDef[] = [
  {
    id: 'figma.read',
    app: 'figma',
    name: 'Read a Figma file',
    summary: 'Fetch the page and frame names of a Figma file, so a model can talk about the design by name.',
    params: [{ key: 'file', label: 'File key or URL' }],
    async run(p, { cfg, signal }) {
      const key = fileKey(p.file)
      const res = await fetch(`https://api.figma.com/v1/files/${key}?depth=2`, { headers: { 'x-figma-token': need(cfg.token, 'Figma token') }, signal, credentials: 'omit' })
      const f = await json(res, 'Figma')
      const pages = (f.document?.children ?? []).map((pg: any) => `- ${pg.name}: ${(pg.children ?? []).map((c: any) => c.name).slice(0, 40).join(', ') || 'empty'}`)
      return { text: `**${f.name}** (last edited ${String(f.lastModified).slice(0, 10)})\n\n${pages.join('\n') || 'No pages.'}`, links: [{ label: 'Open in Figma', url: `https://www.figma.com/design/${key}` }] }
    },
  },
  {
    id: 'figma.comment',
    app: 'figma',
    name: 'Comment on a Figma file',
    summary: 'Leave a comment on a Figma file, for design review notes.',
    outward: true,
    params: [
      { key: 'file', label: 'File key or URL' },
      { key: 'message', label: 'Comment', type: 'long', default: '{{final}}' },
    ],
    async run(p, { cfg, signal }) {
      const key = fileKey(p.file)
      const c = await post(`https://api.figma.com/v1/files/${key}/comments`, 'Figma', { headers: { 'x-figma-token': need(cfg.token, 'Figma token'), 'content-type': 'application/json' }, body: JSON.stringify({ message: need(p.message, 'comment').slice(0, 10_000) }) }, signal)
      return { text: `Left a comment on the Figma file.`, links: [{ label: 'Open the comment', url: `https://www.figma.com/design/${key}?comment-id=${c.id ?? ''}` }] }
    },
  },
]

/* ── Sentry ──────────────────────────────────────────────────────────────── */

const sentry: AppDef = {
  id: 'sentry',
  name: 'Sentry',
  icon: '🚨',
  blurb: 'Pull the latest unresolved errors into a circuit that triages them and writes the fix.',
  docsUrl: 'https://sentry.io/settings/account/api/auth-tokens/',
  setup: 'A user auth token with event and project read access, plus your organisation and project slugs from the Sentry URL.',
  steps: [
    'Open sentry.io → Settings → Account → User Auth Tokens.',
    'Create a new token with the scopes event:read and project:read.',
    'Copy the token.',
    'The organisation and project slugs are in the URL of any issue page: sentry.io/organizations/<org>/issues/?project=… — the project slug is on the project’s settings page.',
    'Self-hosted or an EU account: change the host below to match your Sentry URL.',
  ],
  fields: [
    { key: 'token', label: 'Auth token', secret: true, placeholder: 'sntryu_…' },
    { key: 'org', label: 'Organisation slug', placeholder: 'my-company' },
    { key: 'project', label: 'Project slug', placeholder: 'frontend' },
    { key: 'host', label: 'Host', optional: true, placeholder: 'https://sentry.io' },
  ],
  ready: cfg => !!(cfg?.token && cfg.org && cfg.project),
}

const sentryOps: OpDef[] = [
  {
    id: 'sentry.issues',
    app: 'sentry',
    name: 'List Sentry issues',
    summary: 'Fetch the most recent unresolved issues for the project, with counts, so a model can triage them.',
    params: [
      { key: 'query', label: 'Search', optional: true, default: 'is:unresolved', help: 'Sentry search syntax, e.g. is:unresolved level:error.' },
      { key: 'limit', label: 'How many', optional: true, default: '10' },
    ],
    async run(p, { cfg, signal }) {
      const host = (cfg.host || 'https://sentry.io').replace(/\/+$/, '')
      const qs = new URLSearchParams({ query: String(p.query || 'is:unresolved'), limit: String(Math.min(50, Number(p.limit) || 10)), statsPeriod: '14d' })
      const res = await fetch(`${host}/api/0/projects/${encodeURIComponent(need(cfg.org, 'organisation'))}/${encodeURIComponent(need(cfg.project, 'project'))}/issues/?${qs}`, {
        headers: bearer(need(cfg.token, 'Sentry token')),
        signal,
        credentials: 'omit',
      })
      const issues: any[] = await json(res, 'Sentry')
      if (!issues.length) return { text: 'No matching Sentry issues.' }
      const lines = issues.map(i => `- **${i.title}** (${i.count} events, ${i.userCount} users, last seen ${String(i.lastSeen).slice(0, 16).replace('T', ' ')})\n  ${i.culprit ?? ''} · ${i.permalink}`)
      return { text: `${issues.length} Sentry issues:\n\n${lines.join('\n')}`, links: issues.slice(0, 5).map(i => ({ label: i.shortId ?? 'Issue', url: i.permalink })) }
    },
  },
]

/* ── Dropbox ─────────────────────────────────────────────────────────────── */

const dropbox: AppDef = {
  id: 'dropbox',
  name: 'Dropbox',
  icon: '📦',
  blurb: 'Save reports, transcripts and generated files into a Dropbox folder.',
  docsUrl: 'https://www.dropbox.com/developers/apps',
  setup: 'An app with scoped access and a generated access token. Tokens from the console are short-lived, so generate one when you need it, or use a refresh-token setup outside FuseLLM.',
  steps: [
    'Open dropbox.com/developers/apps → Create app.',
    'Choose Scoped access, then App folder (safest: it can only touch its own folder).',
    'On the Permissions tab, tick files.content.write, then Submit.',
    'On the Settings tab, under OAuth 2, press Generate for an access token and copy it.',
    'Generated tokens expire after four hours; press Generate again when a run fails with an expired token.',
  ],
  fields: [
    { key: 'token', label: 'Access token', secret: true, placeholder: 'sl.…' },
    { key: 'folder', label: 'Folder', optional: true, placeholder: '/FuseLLM' },
  ],
  ready: cfg => !!cfg?.token,
}

const dropboxOps: OpDef[] = [
  {
    id: 'dropbox.upload',
    app: 'dropbox',
    name: 'Save a file to Dropbox',
    summary: 'Write text to a file in Dropbox, creating or overwriting it.',
    params: [
      { key: 'path', label: 'File name', default: '{{circuit}} {{date}}.md' },
      { key: 'content', label: 'Content', type: 'long', default: '{{final}}' },
    ],
    async run(p, { cfg, signal }) {
      const folder = (cfg.folder || '/FuseLLM').replace(/\/+$/, '')
      const name = need(p.path, 'file name').replace(/^\/+/, '')
      const path = `${folder.startsWith('/') ? folder : '/' + folder}/${name}`
      const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          ...bearer(need(cfg.token, 'Dropbox token')),
          'content-type': 'application/octet-stream',
          'dropbox-api-arg': JSON.stringify({ path, mode: 'overwrite', mute: true }),
        },
        body: new TextEncoder().encode(String(p.content ?? '')) as BodyInit,
        signal,
        credentials: 'omit',
      })
      const f = await json(res, 'Dropbox')
      return { text: `Saved ${f.path_display} to Dropbox (${f.size} bytes).`, links: [{ label: 'Open Dropbox', url: 'https://www.dropbox.com/home' + folder }] }
    },
  },
]

export const MORE_APPS: AppDef[] = [asana, todoist, trello, airtable, gitlab, netlify, figma, sentry, dropbox]
export const MORE_OPS: OpDef[] = [...asanaOps, ...todoistOps, ...trelloOps, ...airtableOps, ...gitlabOps, ...netlifyOps, ...figmaOps, ...sentryOps, ...dropboxOps]
