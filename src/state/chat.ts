import { app, getChat, saveChat, toast } from './app'
import { sourcesMarkdown } from '../ai/sources'
import { endLive, patchLive, startLive } from './live'
import { buildSystem } from '../ai/prompt'
import { runTurn } from '../ai/run'
import type { NeutralMessage } from '../ai/types'
import { clip, uid } from '../lib/format'
import type { Chat, ChatMessage } from '../types'

const controllers = new Map<string, AbortController>()

export function isStreaming(chatId: string): boolean {
  return controllers.has(chatId)
}

/**
 * The conversation as one model saw it: every user message, plus only that
 * model's own replies. With several models in a chat each keeps its own
 * thread, the way side-by-side comparisons should work. Consecutive user
 * messages (where a model failed to answer) are merged so turns alternate.
 */
function historyFor(chat: Chat, modelId: string, upTo?: number): NeutralMessage[] {
  const out: NeutralMessage[] = []
  const msgs = upTo == null ? chat.messages : chat.messages.slice(0, upTo)
  for (const m of msgs) {
    if (m.role === 'user') {
      const last = out[out.length - 1]
      if (last?.role === 'user') last.content += '\n\n' + m.content
      else out.push({ role: 'user', content: m.content })
    } else if (m.modelId === modelId && m.content && !m.error) {
      // Keep the sources in view so a follow-up can ask about them.
      const content = m.sources?.length ? `${m.content}\n\n**Sources**\n${sourcesMarkdown(m.sources.slice(0, 20))}` : m.content
      const last = out[out.length - 1]
      if (last?.role === 'assistant') last.content += '\n\n' + content
      else out.push({ role: 'assistant', content })
    }
  }
  while (out.length && out[out.length - 1].role === 'assistant') out.pop()
  return out
}

function systemFor(chat: Chat): string {
  const s = app.get()
  const role = s.roles.find(r => r.id === chat.roleId)
  const skills = s.skills.filter(k => chat.skillIds.includes(k.id))
  return buildSystem({ role, skills, mode: chat.mode })
}

function patchMessage(chatId: string, msgId: string, patch: Partial<ChatMessage>) {
  const chat = getChat(chatId)
  if (!chat) return
  saveChat({ ...chat, updatedAt: Date.now(), messages: chat.messages.map(m => (m.id === msgId ? { ...m, ...patch } : m)) })
}

async function answer(chatId: string, msgId: string, modelId: string, history: NeutralMessage[], ctl: AbortController) {
  const chat = getChat(chatId)!
  const s = app.get()
  const startedAt = Date.now()
  startLive(msgId, startedAt)
  const res = await runTurn({
    settings: s.settings,
    modelId,
    system: systemFor(chat),
    messages: history,
    mode: chat.mode,
    webSearch: chat.webSearch,
    mcp: s.mcp.filter(m => chat.mcpIds.includes(m.id)),
    appTools: chat.appTools,
    budget: chat.budget,
    signal: ctl.signal,
    onLive: p => patchLive(msgId, p),
  })
  endLive(msgId)
  patchMessage(chatId, msgId, {
    content: res.text,
    thinking: res.thinking || undefined,
    tools: res.tools.length ? res.tools : undefined,
    sources: res.sources,
    stopped: res.stopped,
    error: res.error,
    metrics: { startedAt, endedAt: Date.now(), usage: res.usage },
  })
}

export async function send(chatId: string, text: string): Promise<void> {
  const chat = getChat(chatId)
  if (!chat || !text.trim() || controllers.has(chatId)) return
  if (!chat.models.length) {
    toast('Pick at least one model first.', 'warn')
    return
  }
  const user: ChatMessage = { id: uid('m'), role: 'user', content: text.trim(), createdAt: Date.now() }
  const replies: ChatMessage[] = chat.models.map(modelId => ({ id: uid('m'), role: 'assistant', modelId, content: '', createdAt: Date.now() }))
  const next: Chat = {
    ...chat,
    title: chat.messages.length ? chat.title : clip(text, 60),
    messages: [...chat.messages, user, ...replies],
    updatedAt: Date.now(),
  }
  // Register the run before the first store update so the UI sees it as live.
  const ctl = new AbortController()
  controllers.set(chatId, ctl)
  saveChat(next, true)
  try {
    await Promise.all(replies.map(r => answer(chatId, r.id, r.modelId!, historyFor(next, r.modelId!), ctl)))
  } finally {
    controllers.delete(chatId)
    const done = getChat(chatId)
    if (done) saveChat(done, true)
  }
}

/** Re-asks one model the question its reply answered, replacing the reply. */
export async function regenerate(chatId: string, msgId: string): Promise<void> {
  const chat = getChat(chatId)
  if (!chat || controllers.has(chatId)) return
  const i = chat.messages.findIndex(m => m.id === msgId)
  const msg = chat.messages[i]
  if (!msg?.modelId) return
  const history = historyFor(chat, msg.modelId, i)
  const ctl = new AbortController()
  controllers.set(chatId, ctl)
  patchMessage(chatId, msgId, { content: '', thinking: undefined, error: undefined, stopped: undefined, tools: undefined, metrics: undefined })
  try {
    await answer(chatId, msgId, msg.modelId, history, ctl)
  } finally {
    controllers.delete(chatId)
    const done = getChat(chatId)
    if (done) saveChat(done, true)
  }
}

export function stop(chatId: string) {
  controllers.get(chatId)?.abort()
}

export function stopAll() {
  for (const c of controllers.values()) c.abort()
}
