import { createStore, useStore, shallow } from '../lib/store'
import * as db from '../lib/db'
import { folderState, mirror, unmirror } from '../lib/folder'
import { open, seal, type Sealed } from '../lib/crypto'
import { uid } from '../lib/format'
import { DEFAULT_MCP, DEFAULT_ROLES, DEFAULT_SKILLS, TEMPLATES } from '../library/defaults'
import { MODELS, type ProviderId } from '../ai/catalog'
import { isReady } from '../ai/run'
import type { Chat, Circuit, McpServer, MediaProviderId, Role, Run, Settings, Skill, Stage } from '../types'

export interface AppState {
  ready: boolean
  /** Keys are sealed and the passphrase has not been entered this session. */
  locked: boolean
  settings: Settings
  roles: Role[]
  skills: Skill[]
  mcp: McpServer[]
  chats: Chat[]
  circuits: Circuit[]
  runs: Run[]
  toast?: { id: number; text: string; tone?: 'ok' | 'warn' | 'err' }
}

export const DEFAULT_SETTINGS: Settings = {
  keys: {},
  baseUrls: {},
  apps: {},
  models: {},
  defaultMode: 'balanced',
  chatBudget: 0,
  theme: 'system',
  creditFooter: true,
  claudeFallbacks: true,
  locked: false,
  onboarded: false,
}

export const app = createStore<AppState>({
  ready: false,
  locked: false,
  settings: DEFAULT_SETTINGS,
  roles: [],
  skills: [],
  mcp: [],
  chats: [],
  circuits: [],
  runs: [],
})

export function useApp<T>(select: (s: AppState) => T, eq: (a: T, b: T) => boolean = shallow): T {
  return useStore(app, select, eq)
}

/* ── persistence ─────────────────────────────────────────────────────────── */

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const queued = new Map<string, unknown>()

// Only these records are mirrored to a connected folder. Settings, keys, app
// credentials and the vault never leave IndexedDB.
const MIRRORED = /^(chat|circuit|run|lib):/

function persist(key: string, value: unknown) {
  void db.set(key, value).then(() => {
    if (MIRRORED.test(key)) void mirror(key, value)
  })
}

/** Coalesces rapid writes to the same record (typing, streaming) into one. */
function saveLater(key: string, value: unknown, ms = 350) {
  queued.set(key, value)
  clearTimeout(timers.get(key))
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      const v = queued.get(key)
      queued.delete(key)
      persist(key, v)
    }, ms),
  )
}

/** Writes everything still waiting. Called when the page is being hidden. */
export function flushSaves() {
  for (const [key, t] of timers) {
    clearTimeout(t)
    persist(key, queued.get(key))
    queued.delete(key)
  }
  timers.clear()
}

let passphrase: string | null = null

/*
 * Secrets (provider keys and connected-app credentials) never live in the
 * `settings` record. Unlocked, they sit in their own records; locked, both
 * are sealed together into `vault`.
 */
interface Secrets {
  keys: Settings['keys']
  apps: Settings['apps']
}

function persistSettings(s: Settings) {
  const { keys, apps, ...rest } = s
  saveLater('settings', { ...rest, keys: {}, apps: {} })
  if (s.locked) {
    if (passphrase) void seal({ keys, apps } satisfies Secrets, passphrase).then(v => db.set('vault', v))
  } else {
    saveLater('keys', keys)
    saveLater('apps', apps)
  }
}

function readSecrets(opened: unknown): Secrets {
  const o = opened as Partial<Secrets> & Record<string, unknown>
  // Vaults sealed before connected apps existed hold the provider keys only.
  if (o && typeof o === 'object' && 'keys' in o && typeof o.keys === 'object') return { keys: o.keys ?? {}, apps: o.apps ?? {} }
  return { keys: (o as Settings['keys']) ?? {}, apps: {} }
}

/* ── boot ────────────────────────────────────────────────────────────────── */

export async function boot(): Promise<void> {
  const [settings, keys, apps, vault, roles, skills, mcp, chats, circuits, runs] = await Promise.all([
    db.get<Settings>('settings'),
    db.get<Settings['keys']>('keys'),
    db.get<Settings['apps']>('apps'),
    db.get<Sealed>('vault'),
    db.get<Role[]>('lib:roles'),
    db.get<Skill[]>('lib:skills'),
    db.get<McpServer[]>('lib:mcp'),
    db.list<Chat>('chat:'),
    db.list<Circuit>('circuit:'),
    db.list<Run>('run:'),
  ])
  const merged: Settings = { ...DEFAULT_SETTINGS, ...(settings ?? {}), keys: {}, apps: {} }
  const locked = !!merged.locked && !!vault
  if (!locked) {
    merged.keys = keys ?? {}
    merged.apps = apps ?? {}
  }
  if (merged.locked && !vault) merged.locked = false

  // A run that was in flight when the tab closed did not finish; say so.
  const fixedRuns = runs.map(r => (r.status === 'running' ? { ...r, status: 'stopped' as const, error: 'The tab was closed while this run was in progress.', endedAt: r.endedAt ?? Date.now() } : r))

  // Built-ins added in later releases reach existing libraries once; ones
  // the user deleted on purpose are remembered and stay deleted.
  const seen = new Set((await db.get<string[]>('lib:seen')) ?? [...(roles ?? []), ...(skills ?? []), ...(mcp ?? [])].map(x => x.id))
  const fresh = <T extends { id: string }>(saved: T[] | undefined, defaults: T[]) => (saved ? [...saved, ...defaults.filter(d => !seen.has(d.id) && !saved.some(x => x.id === d.id))] : defaults)
  const nextRoles = fresh(roles, DEFAULT_ROLES)
  const nextSkills = fresh(skills, DEFAULT_SKILLS)
  const nextMcp = fresh(mcp, DEFAULT_MCP)
  void db.set('lib:seen', [...new Set([...seen, ...DEFAULT_ROLES.map(r => r.id), ...DEFAULT_SKILLS.map(r => r.id), ...DEFAULT_MCP.map(r => r.id)])])
  if (roles && nextRoles.length !== roles.length) void db.set('lib:roles', nextRoles)
  if (skills && nextSkills.length !== skills.length) void db.set('lib:skills', nextSkills)
  if (mcp && nextMcp.length !== mcp.length) void db.set('lib:mcp', nextMcp)

  app.set({
    ready: true,
    locked,
    settings: merged,
    roles: nextRoles,
    skills: nextSkills,
    mcp: nextMcp,
    chats: chats.sort((a, b) => b.updatedAt - a.updatedAt),
    circuits: circuits.sort((a, b) => b.updatedAt - a.updatedAt),
    runs: fixedRuns.sort((a, b) => b.startedAt - a.startedAt),
  })
  // Re-attach a folder mirror if the browser kept the permission.
  void folderState().catch(() => {})
  if (!roles) void db.set('lib:roles', DEFAULT_ROLES)
  if (!skills) void db.set('lib:skills', DEFAULT_SKILLS)
  if (!mcp) void db.set('lib:mcp', DEFAULT_MCP)
  try {
    if (merged.onboarded) localStorage.setItem('fusellm:returning', '1')
  } catch {
    /* storage blocked */
  }
}

/* ── toasts ──────────────────────────────────────────────────────────────── */

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(text: string, tone: 'ok' | 'warn' | 'err' = 'ok') {
  clearTimeout(toastTimer)
  app.set({ toast: { id: Date.now(), text, tone } })
  toastTimer = setTimeout(() => app.set({ toast: undefined }), tone === 'err' ? 6000 : 3200)
}

/* ── settings and keys ───────────────────────────────────────────────────── */

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  const cur = app.get().settings
  const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }
  if (!next.onboarded && Object.values(next.keys).some(Boolean)) {
    next.onboarded = true
    try {
      localStorage.setItem('fusellm:returning', '1')
    } catch {
      /* ignore */
    }
  }
  app.set({ settings: next })
  persistSettings(next)
}

export function setKey(provider: ProviderId | MediaProviderId, key: string) {
  updateSettings(s => ({ keys: { ...s.keys, [provider]: key.trim() || undefined } }))
}

/** Saves (or, with `null`, forgets) one connected app's settings and secrets. */
export function setApp(appId: string, cfg: Record<string, string> | null) {
  updateSettings(s => {
    const apps = { ...s.apps }
    if (cfg) apps[appId] = cfg
    else delete apps[appId]
    return { apps }
  })
}

export async function lockKeys(pass: string) {
  const s = app.get().settings
  const vault = await seal({ keys: s.keys, apps: s.apps } satisfies Secrets, pass)
  await db.set('vault', vault)
  await db.del('keys')
  await db.del('apps')
  passphrase = pass
  const next = { ...s, locked: true }
  app.set({ settings: next })
  saveLater('settings', { ...next, keys: {}, apps: {} }, 0)
}

export async function unlock(pass: string): Promise<boolean> {
  const vault = await db.get<Sealed>('vault')
  if (!vault) return false
  try {
    const { keys, apps } = readSecrets(await open<unknown>(vault, pass))
    passphrase = pass
    app.set({ locked: false, settings: { ...app.get().settings, keys, apps } })
    return true
  } catch {
    return false
  }
}

export async function removeLock() {
  const s = app.get().settings
  passphrase = null
  await db.del('vault')
  await db.set('keys', s.keys)
  await db.set('apps', s.apps)
  const next = { ...s, locked: false }
  app.set({ settings: next })
  saveLater('settings', { ...next, keys: {}, apps: {} }, 0)
}

/** For a forgotten passphrase: drop the sealed keys and start over. */
export async function resetVault() {
  passphrase = null
  await db.del('vault')
  const next = { ...app.get().settings, locked: false, keys: {}, apps: {} }
  app.set({ locked: false, settings: next })
  saveLater('settings', { ...next, keys: {}, apps: {} }, 0)
}

export function readyModels(s: Settings): string[] {
  return MODELS.filter(m => isReady(s, m.id)).map(m => m.id)
}

/* ── library ─────────────────────────────────────────────────────────────── */

type LibKind = 'roles' | 'skills' | 'mcp'
const LIB_KEY: Record<LibKind, string> = { roles: 'lib:roles', skills: 'lib:skills', mcp: 'lib:mcp' }
const LIB_DEFAULTS = { roles: DEFAULT_ROLES, skills: DEFAULT_SKILLS, mcp: DEFAULT_MCP }

export function upsertLib<K extends LibKind>(kind: K, item: AppState[K][number]) {
  const list = app.get()[kind] as AppState[K][number][]
  const next = { ...item, updatedAt: Date.now() }
  const i = list.findIndex(x => x.id === item.id)
  const arr = i < 0 ? [next, ...list] : list.map(x => (x.id === item.id ? next : x))
  app.set({ [kind]: arr } as Partial<AppState>)
  saveLater(LIB_KEY[kind], arr, 0)
}

export function deleteLib(kind: LibKind, id: string) {
  const arr = (app.get()[kind] as { id: string }[]).filter(x => x.id !== id)
  app.set({ [kind]: arr } as Partial<AppState>)
  saveLater(LIB_KEY[kind], arr, 0)
}

/** Puts back missing or edited built-ins; leaves the user's own items alone. */
export function restoreDefaults(kind: LibKind) {
  const defaults = LIB_DEFAULTS[kind] as { id: string }[]
  const ids = new Set(defaults.map(d => d.id))
  const mine = (app.get()[kind] as { id: string }[]).filter(x => !ids.has(x.id))
  const arr = [...defaults, ...mine]
  app.set({ [kind]: arr } as Partial<AppState>)
  saveLater(LIB_KEY[kind], arr, 0)
}

/* ── chats ───────────────────────────────────────────────────────────────── */

export function newChat(partial: Partial<Chat> = {}): Chat {
  const s = app.get().settings
  const ready = readyModels(s)
  const model = partial.models?.[0] ?? (s.defaultModel && ready.includes(s.defaultModel) ? s.defaultModel : ready[0])
  const chat: Chat = {
    id: uid('c'),
    title: 'New chat',
    models: model ? [model] : [],
    skillIds: [],
    mcpIds: [],
    mode: s.defaultMode,
    webSearch: false,
    budget: s.chatBudget,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  }
  return chat
}

export function saveChat(chat: Chat, immediate = false) {
  const chats = app.get().chats
  const i = chats.findIndex(c => c.id === chat.id)
  const arr = i < 0 ? [chat, ...chats] : chats.map(c => (c.id === chat.id ? chat : c))
  arr.sort((a, b) => b.updatedAt - a.updatedAt)
  app.set({ chats: arr })
  if (chat.messages.length || immediate) saveLater('chat:' + chat.id, chat, immediate ? 0 : 350)
}

export function getChat(id: string): Chat | undefined {
  return app.get().chats.find(c => c.id === id)
}

export function deleteChat(id: string) {
  app.set({ chats: app.get().chats.filter(c => c.id !== id) })
  void db.del('chat:' + id)
  void unmirror('chat:' + id)
}

/* ── circuits ────────────────────────────────────────────────────────────── */

export function saveCircuit(c: Circuit) {
  const next = { ...c, updatedAt: Date.now() }
  const list = app.get().circuits
  const i = list.findIndex(x => x.id === c.id)
  const arr = i < 0 ? [next, ...list] : list.map(x => (x.id === c.id ? next : x))
  app.set({ circuits: arr })
  saveLater('circuit:' + c.id, next)
}

export function deleteCircuit(id: string) {
  app.set({ circuits: app.get().circuits.filter(c => c.id !== id) })
  void db.del('circuit:' + id)
  void unmirror('circuit:' + id)
}

/**
 * Copies a template into the user's circuits. A stage whose model has no key
 * is moved to the closest model that does, so the first run just works.
 */
export function fromTemplate(tplId: string): Circuit {
  const tpl = TEMPLATES.find(t => t.id === tplId)!
  const ready = readyModels(app.get().settings)
  const c: Circuit = structuredClone(tpl)
  c.id = uid('f')
  c.createdAt = c.updatedAt = Date.now()
  const idMap = new Map<string, string>()
  c.stages = c.stages.map(st => {
    const id = uid('s')
    idMap.set(st.id, id)
    if (st.kind && st.kind !== 'model') return { ...st, id }
    return { ...st, id, modelId: ready.includes(st.modelId) ? st.modelId : substitute(st.modelId, ready) }
  })
  const fix = (id?: string) => (id ? idMap.get(id) ?? id : id)
  c.stages = c.stages.map(st => ({
    ...st,
    loop: st.loop ? { ...st.loop, to: fix(st.loop.to)! } : undefined,
    media: st.media ? { ...st.media, refStage: fix(st.media.refStage), sources: st.media.sources && { clips: fix(st.media.sources.clips), narration: fix(st.media.sources.narration), music: fix(st.media.sources.music) } } : undefined,
  }))
  saveCircuit(c)
  return c
}

export function blankCircuit(): Circuit {
  const ready = readyModels(app.get().settings)
  const c: Circuit = {
    id: uid('f'),
    name: 'Untitled circuit',
    emoji: '⚡',
    description: '',
    stages: [newStage(ready[0] ?? MODELS[0].id, 'Stage 1')],
    budget: 200_000,
    onBudget: 'squeeze',
    maxSteps: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  saveCircuit(c)
  return c
}

export function newStage(modelId: string, name: string): Stage {
  return {
    id: uid('s'),
    name,
    modelId,
    skillIds: [],
    mcpIds: [],
    mode: app.get().settings.defaultMode,
    webSearch: false,
    task: '',
    wires: { input: true, output: true, context: false, memory: false },
    remember: true,
    budget: 0,
  }
}

export function duplicateCircuit(id: string): Circuit | undefined {
  const src = app.get().circuits.find(c => c.id === id)
  if (!src) return
  const c = structuredClone(src)
  c.id = uid('f')
  c.name = src.name + ' (copy)'
  c.createdAt = Date.now()
  saveCircuit(c)
  return c
}

const TIER: Record<string, string[]> = {
  'claude-fable': ['gpt-astra', 'claude-opus', 'kimi-k3', 'deepseek-v4-pro'],
  'gpt-astra': ['claude-fable', 'claude-opus', 'deepseek-v4-pro', 'grok'],
  'claude-opus': ['gpt-astra', 'claude-fable', 'deepseek-v4-pro', 'gpt-terra'],
  'claude-sonnet': ['gpt-sol', 'kimi-k3', 'glm', 'gemini-flash'],
  'gpt-sol': ['claude-sonnet', 'gpt-terra', 'grok', 'gemini-flash'],
  'gpt-terra': ['gpt-sol', 'claude-sonnet', 'grok', 'deepseek-v4-pro'],
  'gemini-flash': ['gpt-luna', 'qwen-flash', 'grok', 'minimax-m3'],
  'sonar-pro': ['gemini-flash', 'grok', 'gpt-terra', 'claude-sonnet'],
  'sonar-deep-research': ['sonar-pro', 'gpt-terra', 'claude-opus', 'grok'],
  grok: ['gpt-terra', 'deepseek-v4-pro', 'gemini-flash'],
  'deepseek-v4-pro': ['grok', 'kimi-k3', 'glm', 'minimax-m3'],
  'kimi-k3': ['glm', 'deepseek-v4-pro', 'claude-sonnet'],
}

function substitute(want: string, ready: string[]): string {
  for (const alt of TIER[want] ?? []) if (ready.includes(alt)) return alt
  return ready[0] ?? want
}

/* ── runs ────────────────────────────────────────────────────────────────── */

export function saveRun(r: Run, immediate = false) {
  const list = app.get().runs
  const i = list.findIndex(x => x.id === r.id)
  const arr = i < 0 ? [r, ...list] : list.map(x => (x.id === r.id ? r : x))
  app.set({ runs: arr })
  saveLater('run:' + r.id, r, immediate ? 0 : 500)
}

export function deleteRun(id: string) {
  app.set({ runs: app.get().runs.filter(r => r.id !== id) })
  void db.del('run:' + id)
  void unmirror('run:' + id)
}

/* ── backup ──────────────────────────────────────────────────────────────── */

export function exportData(includeKeys: boolean) {
  const s = app.get()
  return {
    app: 'FuseLLM',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...s.settings, keys: includeKeys ? s.settings.keys : {}, apps: includeKeys ? s.settings.apps : {} },
    roles: s.roles,
    skills: s.skills,
    mcp: s.mcp.map(m => (includeKeys ? m : { ...m, token: undefined, headerValue: undefined })),
    circuits: s.circuits,
    chats: s.chats,
    runs: s.runs,
  }
}

export async function importData(raw: unknown): Promise<string> {
  const d = raw as ReturnType<typeof exportData>
  if (!d || d.app !== 'FuseLLM') throw new Error('This is not a FuseLLM backup file.')
  const cur = app.get()
  const mergeById = <T extends { id: string }>(a: T[], b: T[] = []) => {
    const m = new Map(a.map(x => [x.id, x]))
    for (const x of b) m.set(x.id, x)
    return [...m.values()]
  }
  const roles = mergeById(cur.roles, d.roles)
  const skills = mergeById(cur.skills, d.skills)
  const mcp = mergeById(cur.mcp, d.mcp)
  const circuits = mergeById(cur.circuits, d.circuits)
  const chats = mergeById(cur.chats, d.chats)
  const runs = mergeById(cur.runs, d.runs)
  app.set({ roles, skills, mcp, circuits, chats, runs })
  await Promise.all([
    db.set('lib:roles', roles),
    db.set('lib:skills', skills),
    db.set('lib:mcp', mcp),
    ...(d.circuits ?? []).map(c => db.set('circuit:' + c.id, c)),
    ...(d.chats ?? []).map(c => db.set('chat:' + c.id, c)),
    ...(d.runs ?? []).map(r => db.set('run:' + r.id, r)),
  ])
  const keyCount = Object.values(d.settings?.keys ?? {}).filter(Boolean).length
  if (keyCount) updateSettings(s => ({ keys: { ...s.keys, ...d.settings.keys } }))
  if (d.settings?.apps && Object.keys(d.settings.apps).length) updateSettings(s => ({ apps: { ...s.apps, ...d.settings.apps } }))
  return `Imported ${d.circuits?.length ?? 0} circuits, ${d.chats?.length ?? 0} chats, ${(d.roles?.length ?? 0) + (d.skills?.length ?? 0)} roles and skills${keyCount ? ` and ${keyCount} keys` : ''}.`
}

export async function wipeEverything() {
  await db.clearAll()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  location.reload()
}

/* ── circuits as files ───────────────────────────────────────────────────── */

export interface CircuitFile {
  app: 'FuseLLM'
  kind: 'circuit'
  version: 1
  circuit: Circuit
  roles: Role[]
  skills: Skill[]
}

/** A circuit plus the roles and skills it uses, so it runs the same anywhere. */
export function circuitFile(c: Circuit): CircuitFile {
  const s = app.get()
  const roleIds = new Set(c.stages.map(st => st.roleId).filter(Boolean))
  const skillIds = new Set(c.stages.flatMap(st => st.skillIds))
  return { app: 'FuseLLM', kind: 'circuit', version: 1, circuit: { ...c, lastBrief: undefined }, roles: s.roles.filter(r => roleIds.has(r.id)), skills: s.skills.filter(k => skillIds.has(k.id)) }
}

export function importCircuitFile(raw: unknown): Circuit {
  const f = raw as CircuitFile
  if (!f || f.app !== 'FuseLLM' || f.kind !== 'circuit' || !Array.isArray(f.circuit?.stages)) throw new Error('This is not a FuseLLM circuit file.')
  const s = app.get()
  // Bring along roles and skills this library does not have yet; keep any the user already has.
  for (const r of f.roles ?? []) if (!s.roles.some(x => x.id === r.id)) upsertLib('roles', { ...r, origin: 'user' })
  for (const k of f.skills ?? []) if (!s.skills.some(x => x.id === k.id)) upsertLib('skills', { ...k, origin: 'user' })
  const idMap = new Map<string, string>()
  const stages = f.circuit.stages.map(st => {
    const id = uid('s')
    idMap.set(st.id, id)
    return { ...st, id }
  })
  const fix = (id?: string) => (id ? idMap.get(id) ?? id : id)
  const c: Circuit = {
    ...f.circuit,
    id: uid('f'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stages: stages.map(st => ({
      ...st,
      loop: st.loop ? { ...st.loop, to: fix(st.loop.to)! } : undefined,
      media: st.media ? { ...st.media, refStage: fix(st.media.refStage), sources: st.media.sources && { clips: fix(st.media.sources.clips), narration: fix(st.media.sources.narration), music: fix(st.media.sources.music) } } : undefined,
    })),
  }
  saveCircuit(c)
  return c
}
