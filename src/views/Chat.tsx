import NotFound from './NotFound'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Sources } from '../components/Sources'
import { withSources } from '../state/engine'
import { Icon } from '../components/Icon'
import { Markdown, preloadMarkdown } from '../components/Markdown'
import { Lightbox } from '../components/FileViewer'
import { DoneLine, StatusLine } from '../components/Meter'
import { BudgetInput, LibraryPicker, ModeSwitch, ModelDot, ModelName, ModelPicker } from '../components/Pickers'
import { AutoTextarea, Confirm, copyText, downloadFile, Empty, Sheet, Toggle } from '../components/ui'
import { MODEL_BY_ID, MODES } from '../ai/catalog'
import { ago, slug, tokens } from '../lib/format'
import { go } from '../lib/router'
import { deleteChat, newChat, readyModels, saveChat, toast, useApp } from '../state/app'
import { isStreaming, regenerate, send, stop } from '../state/chat'
import { useLive } from '../state/live'
import { withCredit } from '../lib/credit'
import { chatVault, saveBytes } from '../lib/export'
import { OPS } from '../apps/registry'
import type { Chat, ChatMessage, ToolTrace } from '../types'

export default function ChatView({ id }: { id?: string }) {
  const chat = useApp(s => s.chats.find(c => c.id === id), Object.is)
  const [draft, setDraft] = useState<Chat>(() => newChat())
  useEffect(preloadMarkdown, [])

  // On phones the list is a drawer over the conversation; on wide screens it
  // is a permanent column and this flag does nothing.
  const [drawer, setDrawer] = useState(false)
  useEffect(() => setDrawer(false), [id])

  if (id && !chat) return <NotFound item="Chat" />

  const active = chat ?? draft
  return (
    <div className={drawer ? 'chat-layout drawer-open' : 'chat-layout'}>
      <ChatList activeId={id} onClose={() => setDrawer(false)} />
      {drawer && <button type="button" className="drawer-backdrop" aria-label="Close chat list" onClick={() => setDrawer(false)} />}
      <Conversation key={active.id} chat={active} isDraft={!chat} onDraftChange={setDraft} onOpenList={() => setDrawer(true)} />
    </div>
  )
}

function ChatList({ activeId, onClose }: { activeId?: string; onClose: () => void }) {
  const chats = useApp(s => s.chats, Object.is)
  const [q, setQ] = useState('')
  const [del, setDel] = useState<Chat | null>(null)
  const list = q ? chats.filter(c => (c.title + ' ' + c.messages.map(m => m.content).join(' ')).toLowerCase().includes(q.toLowerCase())) : chats
  return (
    <aside className="chat-list" aria-label="Chats">
      <div className="chat-list-head">
        <a
          className="btn primary block"
          href="/chat"
          onClick={() => {
            if (!activeId) window.dispatchEvent(new Event('fusellm:newchat'))
            onClose()
          }}
        >
          <Icon name="plus" /> New chat
        </a>
        {chats.length > 4 && <input className="input" placeholder="Search chats" value={q} onChange={e => setQ(e.target.value)} aria-label="Search chats" />}
      </div>
      {list.length ? (
        <ul className="list chat-items">
          {list.map(c => (
            <li key={c.id} className={c.id === activeId ? 'on' : undefined}>
              <a className="list-row" href={`/chat/${encodeURIComponent(c.id)}`} aria-current={c.id === activeId ? 'page' : undefined}>
                <span className="grow">
                  <span className="list-title">{c.title}</span>
                  <span className="list-sub">
                    {c.models.map(m => (
                      <ModelDot key={m} id={m} />
                    ))}
                    <span className="faint">{ago(c.updatedAt)}</span>
                  </span>
                </span>
              </a>
              <button type="button" className="icon-btn sm danger" aria-label={`Delete ${c.title}`} onClick={() => setDel(c)}>
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small chat-list-empty">{q ? 'No matches.' : 'Your chats stay on this device.'}</p>
      )}
      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        title="Delete chat?"
        body={`"${del?.title}" and all of its replies will be removed from this device.`}
        onConfirm={() => {
          if (!del) return
          deleteChat(del.id)
          if (del.id === activeId) go({ name: 'chat' })
        }}
      />
    </aside>
  )
}

function Conversation({ chat, isDraft, onDraftChange, onOpenList }: { chat: Chat; isDraft: boolean; onDraftChange: (c: Chat) => void; onOpenList: () => void }) {
  const { roles, skills, mcp, settings } = useApp(s => ({ roles: s.roles, skills: s.skills, mcp: s.mcp, settings: s.settings }))
  const [text, setText] = useState('')
  const [sheet, setSheet] = useState<null | 'models' | 'role' | 'skills' | 'mcp' | 'apps' | 'tune'>(null)
  const streaming = useApp(() => isStreaming(chat.id), Object.is)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const ready = readyModels(settings)

  useEffect(() => {
    const reset = () => onDraftChange(newChat())
    window.addEventListener('fusellm:newchat', reset)
    return () => window.removeEventListener('fusellm:newchat', reset)
  }, [onDraftChange])

  const update = (patch: Partial<Chat>) => {
    const next = { ...chat, ...patch }
    if (isDraft) onDraftChange(next)
    else saveChat({ ...next, updatedAt: chat.updatedAt })
  }

  const submit = () => {
    const t = text.trim()
    if (!t || streaming) return
    if (!chat.models.length) {
      setSheet('models')
      return
    }
    setText('')
    stick.current = true
    if (isDraft) {
      saveChat(chat, true)
      go({ name: 'chat', id: chat.id })
    }
    void send(chat.id, t)
  }

  // Follow the stream while the reader is at the bottom; stop following the
  // moment they scroll up to read.
  // Replies grow inside their own components, so watch the list's size
  // rather than this component's renders.
  useLayoutEffect(() => {
    const box = scroller.current
    const el = document.scrollingElement
    if (!box || !el) return
    const follow = () => {
      if (stick.current) el.scrollTop = el.scrollHeight
    }
    follow()
    const ro = new ResizeObserver(follow)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const onScroll = () => {
      const el = document.scrollingElement
      if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const groups = useMemo(() => group(chat.messages), [chat.messages])
  const role = roles.find(r => r.id === chat.roleId)
  const mode = MODES.find(m => m.id === chat.mode)!

  const exportMd = () => {
    const body = chat.messages
      .map(m => (m.role === 'user' ? `## You\n\n${m.content}` : `## ${MODEL_BY_ID[m.modelId!]?.name ?? 'Model'}\n\n${m.content || m.error || ''}`))
      .join('\n\n')
    downloadFile(`${slug(chat.title)}.md`, withCredit(`# ${chat.title}\n\n${body}`, settings.creditFooter))
  }

  return (
    <section className="convo" aria-label={chat.title}>
      <div className="convo-head">
        <button type="button" className="icon-btn only-mobile" aria-label="Open chat list" onClick={onOpenList}>
          <Icon name="menu" />
        </button>
        <h1 className="convo-title">{isDraft ? 'New chat' : chat.title}</h1>
        {!isDraft && chat.messages.length > 0 && (
          <>
            <button
              type="button"
              className="icon-btn"
              aria-label="Export as a Superbrain vault"
              title="Superbrain vault (.zip)"
              onClick={async () => {
                const v = await chatVault(chat, settings.creditFooter)
                saveBytes(v.name, v.bytes)
                toast('Saved. Import it in Superbrain as a vault.')
              }}
            >
              <Icon name="library" />
            </button>
            <button type="button" className="icon-btn" aria-label="Download chat as Markdown" onClick={exportMd}>
              <Icon name="download" />
            </button>
          </>
        )}
      </div>

      <div className="messages" ref={scroller}>
        {!chat.messages.length && (
          <Empty emoji="💬" title={ready.length ? 'Ask one model, or several at once' : 'Add a key to start chatting'}>
            {ready.length
              ? 'Pick up to four models and they answer side by side. Give them a role, stack skills, attach MCP tools, and set a stop-loss.'
              : 'Paste an OpenRouter key in Models and every model here comes alive.'}
          </Empty>
        )}
        {groups.map(g =>
          g.type === 'user' ? (
            <UserBubble key={g.msg.id} msg={g.msg} />
          ) : (
            <div key={g.msgs[0].id} className={g.msgs.length > 1 ? 'replies multi' : 'replies'}>
              {g.msgs.map(m => (
                <Reply key={m.id} chatId={chat.id} msg={m} busy={streaming} />
              ))}
            </div>
          ),
        )}
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <div className="composer-chips" role="toolbar" aria-label="Chat settings">
            <button type="button" className="chip" onClick={() => setSheet('models')}>
              {chat.models.length ? (
                <>
                  {chat.models.map(m => (
                    <ModelDot key={m} id={m} />
                  ))}
                  <span className="chip-ellipsis">{chat.models.length === 1 ? MODEL_BY_ID[chat.models[0]]?.name : `${chat.models.length} models`}</span>
                </>
              ) : (
                'Choose model'
              )}
              <Icon name="down" />
            </button>
            <button type="button" className={role ? 'chip on' : 'chip'} onClick={() => setSheet('role')}>
              {role ? `${role.emoji} ${role.name}` : '🎭 Role'}
            </button>
            <button type="button" className={chat.skillIds.length ? 'chip on' : 'chip'} onClick={() => setSheet('skills')}>
              🧩 Skills{chat.skillIds.length ? ` · ${chat.skillIds.length}` : ''}
            </button>
            <button type="button" className={chat.mcpIds.length ? 'chip on' : 'chip'} onClick={() => setSheet('mcp')}>
              <Icon name="tool" /> MCP{chat.mcpIds.length ? ` · ${chat.mcpIds.length}` : ''}
            </button>
            <button type="button" className={chat.appTools?.length ? 'chip on' : 'chip'} onClick={() => setSheet('apps')}>
              🔌 Apps{chat.appTools?.length ? ` · ${chat.appTools.length}` : ''}
            </button>
            <button type="button" className={chat.webSearch ? 'chip on' : 'chip'} onClick={() => update({ webSearch: !chat.webSearch })} aria-pressed={chat.webSearch}>
              <Icon name="globe" /> Web
            </button>
            <button type="button" className="chip" onClick={() => setSheet('tune')}>
              {mode.icon} {mode.label}
              {chat.budget ? ` · ⛔ ${tokens(chat.budget)}` : ''}
            </button>
          </div>
          <form
            className="composer-row"
            onSubmit={e => {
              e.preventDefault()
              submit()
            }}
          >
            <AutoTextarea
              className="composer-input"
              rows={1}
              maxRows={9}
              placeholder={chat.models.length > 1 ? `Ask ${chat.models.length} models…` : 'Message…'}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !matchMedia('(pointer: coarse)').matches) {
                  e.preventDefault()
                  submit()
                }
              }}
              aria-label="Message"
            />
            {streaming ? (
              <button type="button" className="send stop" onClick={() => stop(chat.id)} aria-label="Stop generating">
                <Icon name="stop" />
              </button>
            ) : (
              <button type="submit" className="send" disabled={!text.trim()} aria-label="Send">
                <Icon name="send" />
              </button>
            )}
          </form>
        </div>
      </div>

      <ModelPicker open={sheet === 'models'} onClose={() => setSheet(null)} value={chat.models} onChange={models => update({ models })} multi />
      <LibraryPicker
        open={sheet === 'role'}
        onClose={() => setSheet(null)}
        title="Role"
        items={roles}
        value={chat.roleId ? [chat.roleId] : []}
        onChange={ids => update({ roleId: ids[0] || undefined })}
        manageHref="/library/roles"
        noneLabel="No role"
      />
      <LibraryPicker open={sheet === 'skills'} onClose={() => setSheet(null)} title="Skills" items={skills} value={chat.skillIds} onChange={skillIds => update({ skillIds })} multi manageHref="/library/skills" />
      <LibraryPicker
        open={sheet === 'mcp'}
        onClose={() => setSheet(null)}
        title="MCP servers"
        items={mcp.map(m => ({ ...m, emoji: '🧰' }))}
        value={chat.mcpIds}
        onChange={mcpIds => update({ mcpIds })}
        multi
        manageHref="/library/mcp"
      />
      <LibraryPicker
        open={sheet === 'apps'}
        onClose={() => setSheet(null)}
        title="Apps the models may use"
        items={OPS.map(o => ({ id: o.id, name: o.name, emoji: o.outward ? '📤' : '🔌', description: `${settings.apps[o.app] ? '' : 'Not connected · '}${o.summary}` }))}
        value={chat.appTools ?? []}
        onChange={appTools => update({ appTools })}
        multi
        manageHref="/library/apps"
      />
      <Sheet open={sheet === 'tune'} onClose={() => setSheet(null)} title="Mode and stop-loss">
        <div className="stack">
          <div className="field">
            <span className="label">Mode</span>
            <ModeSwitch value={chat.mode} onChange={m => update({ mode: m })} />
            <p className="hint">{mode.hint}. Tunes reasoning effort and answer length for each model.</p>
          </div>
          <BudgetInput value={chat.budget} onChange={budget => update({ budget })} hint="Per request, input included. The reply stops when it would go past this. Enforced as closely as each provider allows." />
          <Toggle checked={chat.webSearch} onChange={webSearch => update({ webSearch })} label="Web search" hint="OpenRouter web plugin or Claude's web search tool. Adds a small per-search fee at the provider." />
        </div>
      </Sheet>
    </section>
  )
}

type Group = { type: 'user'; msg: ChatMessage } | { type: 'replies'; msgs: ChatMessage[] }

function group(messages: ChatMessage[]): Group[] {
  const out: Group[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ type: 'user', msg: m })
    else {
      const last = out[out.length - 1]
      if (last?.type === 'replies') last.msgs.push(m)
      else out.push({ type: 'replies', msgs: [m] })
    }
  }
  return out
}

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="user-msg">
      <div className="user-bubble">{msg.content}</div>
    </div>
  )
}

function Reply({ chatId, msg, busy }: { chatId: string; msg: ChatMessage; busy: boolean }) {
  const live = useLive(msg.id)
  const text = live ? live.text : msg.content
  const thinking = live ? live.thinking : msg.thinking
  const tools = live ? live.tools : msg.tools
  const [copied, setCopied] = useState(false)
  const [viewing, setViewing] = useState(false)
  return (
    <article className={live ? 'reply live' : 'reply'} aria-busy={!!live}>
      <header className="reply-head">
        <ModelName id={msg.modelId!} />
      </header>
      {live && <StatusLine item={live} />}
      {thinking && <Thinking text={thinking} live={!!live && live.phase === 'thinking'} />}
      {tools && tools.length > 0 && <Tools tools={tools} />}
      {text && <Markdown text={text} streaming={!!live} />}
      {!live && <Sources sources={msg.sources} />}
      {live?.notices.map((n, i) => (
        <p key={i} className="notice">
          {n}
        </p>
      ))}
      {!live && msg.error && (
        <div className="error-box" role="alert">
          <Icon name="info" />
          <span>{msg.error}</span>
        </div>
      )}
      {!live && (
        <footer className="reply-foot">
          <DoneLine metrics={msg.metrics} stopped={msg.stopped} />
          <div className="reply-actions">
            {msg.content && (
              <button
                type="button"
                className="icon-btn sm"
                aria-label="Copy reply"
                onClick={async () => {
                  if (await copyText(withSources(msg))) {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1200)
                  } else toast('Could not copy', 'err')
                }}
              >
                <Icon name={copied ? 'check' : 'copy'} />
              </button>
            )}
            {msg.content && (
              <button type="button" className="icon-btn sm" aria-label="Open in viewer" title="Open in viewer" onClick={() => setViewing(true)}>
                <Icon name="expand" />
              </button>
            )}
            <button type="button" className="icon-btn sm" aria-label="Regenerate" disabled={busy} onClick={() => void regenerate(chatId, msg.id)}>
              <Icon name="refresh" />
            </button>
          </div>
        </footer>
      )}
      <Lightbox source={viewing ? { type: 'text', name: `${slug(MODEL_BY_ID[msg.modelId ?? '']?.name ?? 'reply') || 'reply'}.md`, text: withSources(msg) } : null} onClose={() => setViewing(false)} />
    </article>
  )
}

export function Thinking({ text, live }: { text: string; live?: boolean }) {
  return (
    <details className="thinking" open={live}>
      <summary>
        <Icon name="brain" /> {live ? 'Thinking' : 'Thought process'}
        <span className="faint mono tiny">~{tokens(text.length / 4)} tok</span>
      </summary>
      <div className="thinking-body">{text}</div>
    </details>
  )
}

export function Tools({ tools }: { tools: ToolTrace[] }) {
  return (
    <details className="tools">
      <summary>
        <Icon name="tool" /> {tools.length} tool call{tools.length > 1 ? 's' : ''}
        <span className="faint tiny">{tools.map(t => t.name).slice(0, 3).join(', ')}</span>
      </summary>
      <ul>
        {tools.map(t => (
          <li key={t.id}>
            <div className="tool-name mono">
              {t.server && <span className="faint">{t.server} · </span>}
              {t.name}
              {t.ms != null ? <span className="faint"> · {t.ms}ms</span> : <span className="badge accent">running</span>}
            </div>
            <pre className="tool-args">{t.args}</pre>
            {t.result && <pre className="tool-result">{t.result.slice(0, 1500)}{t.result.length > 1500 ? '…' : ''}</pre>}
          </li>
        ))}
      </ul>
    </details>
  )
}
