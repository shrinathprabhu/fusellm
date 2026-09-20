import { app, getChat, saveChat, toast } from './app'
import { canBrowse, chatHistory, LINK_REVIEW_RULES } from '../ai/chat-input'
import { validateAttachments } from '../ai/input-capabilities'
import { attachmentLimit } from '../lib/attachment-content'
import { endLive, patchLive, startLive } from './live'
import { buildSystem } from '../ai/prompt'
import { resolveEndpoint, runTurn } from '../ai/run'
import type { NeutralMessage } from '../ai/types'
import { clip, uid } from '../lib/format'
import type { Attachment, Chat, ChatMessage } from '../types'

const controllers = new Map<string, AbortController>()

export function isStreaming(chatId: string): boolean {
  return controllers.has(chatId)
}

function systemFor(chat: Chat): string {
  const s = app.get()
  const role = s.roles.find(r => r.id === chat.roleId)
  const skills = s.skills.filter(k => chat.skillIds.includes(k.id))
  return buildSystem({ role, skills, mode: chat.mode, context: [LINK_REVIEW_RULES, 'When generating files, put each file in a fenced code block with its relative path in the fence header, e.g. ```ts src/main.ts. Do not claim a downloadable binary file was created unless a tool actually created it.'] })
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
  try {
    const endpoint = resolveEndpoint(s.settings, modelId)
    if ('error' in endpoint) throw new Error(endpoint.error)
    const replyIndex = chat.messages.findIndex(m => m.id === msgId)
    const attachments = chat.messages.slice(0, replyIndex).filter(m => m.role === 'user').flatMap(m => m.attachments ?? [])
    await validateAttachments(attachments, endpoint, ctl.signal)
    if (ctl.signal.aborted) throw new DOMException('Stopped', 'AbortError')
    const webSearch = chat.webSearch || !!history.at(-1)?.links?.length
    if (webSearch && !canBrowse(endpoint)) throw new Error('Web search and public-link reading are not supported on this direct route. Switch this model to OpenRouter, use Claude or Perplexity, or upload the content instead.')
    const res = await runTurn({
      settings: s.settings,
      modelId,
      system: systemFor(chat),
      messages: history,
      mode: chat.mode,
      webSearch,
      mcp: s.mcp.filter(m => chat.mcpIds.includes(m.id)),
      appTools: chat.appTools,
      budget: chat.budget,
      signal: ctl.signal,
      onLive: p => patchLive(msgId, p),
    })
    patchMessage(chatId, msgId, {
      content: res.text,
      thinking: res.thinking || undefined,
      tools: res.tools.length ? res.tools : undefined,
      sources: res.sources,
      stopped: res.stopped,
      error: res.error,
      metrics: { startedAt, endedAt: Date.now(), usage: res.usage },
    })
  } catch (e) {
    patchMessage(chatId, msgId, { error: ctl.signal.aborted ? undefined : e instanceof Error ? e.message : String(e), stopped: ctl.signal.aborted ? 'user' : 'error', metrics: { startedAt, endedAt: Date.now(), usage: { input: 0, output: 0 } } })
  } finally { endLive(msgId) }
}

export async function send(chatId: string, text: string, attachments: Attachment[] = []): Promise<void> {
  const chat = getChat(chatId)
  if (!chat || (!text.trim() && !attachments.length) || controllers.has(chatId)) return
  if (!chat.models.length) {
    toast('Pick at least one model first.', 'warn')
    return
  }
  const limit = attachmentLimit(attachments)
  if (limit) { toast(limit, 'warn'); return }
  const user: ChatMessage = { id: uid('m'), role: 'user', content: text.trim(), attachments: attachments.length ? attachments : undefined, createdAt: Date.now() }
  const replies: ChatMessage[] = chat.models.map(modelId => ({ id: uid('m'), role: 'assistant', modelId, content: '', createdAt: Date.now() }))
  const next: Chat = {
    ...chat,
    title: chat.messages.length ? chat.title : clip(text || attachments.map(a => a.name).join(', '), 60),
    messages: [...chat.messages, user, ...replies],
    updatedAt: Date.now(),
  }
  // Register the run before the first store update so the UI sees it as live.
  const ctl = new AbortController()
  controllers.set(chatId, ctl)
  saveChat(next, true)
  try {
    await Promise.all(replies.map(r => answer(chatId, r.id, r.modelId!, chatHistory(next, r.modelId!), ctl)))
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
  const history = chatHistory(chat, msg.modelId, i)
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
