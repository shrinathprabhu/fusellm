import { useEffect, useState } from 'react'
import { AlsoOnLowkey, Credits } from '../components/Brand'
import { Icon } from '../components/Icon'
import { Confirm, PageHead, Sheet, Toggle } from '../components/ui'
import Apps from './Apps'
import { probe } from '../ai/mcp'
import { uid } from '../lib/format'
import { deleteLib, restoreDefaults, toast, upsertLib, useApp } from '../state/app'
import type { McpServer, Role, Skill } from '../types'
import { GROUPS, LIB_CATEGORIES, LIB_CATEGORY_LABEL, groupOfLib } from '../library/categories'
import { Accordion } from '../components/Accordion'
import { ShareLibSheet, SharedLibPrompt } from '../components/ShareLink'

type Tab = 'roles' | 'skills' | 'mcp' | 'apps'
type ListTab = Exclude<Tab, 'apps'>

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'roles', label: 'Roles', blurb: 'Instructions prepended to every prompt: who the model is. A student researcher, a professor, a staff reviewer.' },
  { id: 'skills', label: 'Skills', blurb: 'What the model does and how: write code, review, fact check. Stack several on one model. Review skills end with a verdict a loop can read.' },
  { id: 'mcp', label: 'MCP', blurb: 'Remote tool servers over Streamable HTTP. Attach one to a chat or a stage and the model can call its tools.' },
  { id: 'apps', label: 'Apps', blurb: 'GitHub, Gmail, Google Docs, any mailbox through EmailJS, Slack, Discord, Telegram, Linear, Vercel and webhooks. Use them as action steps in a circuit, or let models call them as tools.' },
]


export default function Library({ tab }: { tab: Tab }) {
  const { roles, skills, mcp } = useApp(s => ({ roles: s.roles, skills: s.skills, mcp: s.mcp }))
  const [editing, setEditing] = useState<Role | Skill | McpServer | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [del, setDel] = useState<{ id: string; name: string } | null>(null)
  const [restore, setRestore] = useState(false)
  const [sharing, setSharing] = useState<Role | Skill | null>(null)
  const [q, setQ] = useState('')
  const [shelf, setShelf] = useState('')
  useEffect(() => {
    setQ('')
    setShelf('')
  }, [tab])
  const current = TABS.find(t => t.id === tab)!
  const items: (Role | Skill | McpServer)[] = tab === 'roles' ? roles : tab === 'skills' ? skills : tab === 'mcp' ? mcp : []
  const connected = useApp(s => Object.keys(s.settings.apps).length, Object.is)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shelfOf = (i: Role | Skill | McpServer) => ('category' in i && i.category && LIB_CATEGORY_LABEL[i.category] ? i.category : '')
  const shown = items.filter(i => words.every(w => `${i.name} ${i.description} ${LIB_CATEGORY_LABEL[shelfOf(i)] ?? ''}`.toLowerCase().includes(w)) && (!shelf || shelfOf(i) === shelf))
  // Browsing: the six shared groups, with the user's own entries first. Searching: one flat list.
  const grouped = tab !== 'mcp' && !words.length
  const shelved = grouped
  const groups = [
    { id: 'yours', emoji: '✏️', title: `Your own ${current.label.toLowerCase()}`, items: shown.filter(i => i.origin === 'user') },
    ...GROUPS.map(g => ({ id: g.id, emoji: g.emoji, title: g.label, items: shown.filter(i => i.origin !== 'user' && groupOfLib(shelfOf(i)) === g.id) })),
    { id: 'other', emoji: '📦', title: 'Other', items: shown.filter(i => i.origin !== 'user' && !groupOfLib(shelfOf(i))) },
  ].filter(g => g.items.length)

  const create = () => {
    const now = Date.now()
    const base = { id: uid(tab === 'roles' ? 'role-' : tab === 'skills' ? 'skill-' : 'mcp-'), origin: 'user' as const, updatedAt: now }
    if (tab === 'roles') setEditing({ ...base, name: '', emoji: '🧑', description: '', prompt: '' })
    else if (tab === 'skills') setEditing({ ...base, name: '', emoji: '🧩', description: '', prompt: '', category: 'code' })
    else setEditing({ ...base, name: '', url: 'https://', description: '' })
    setIsNew(true)
  }

  const card = (item: Role | Skill | McpServer) => (
          <li key={item.id} className="lib-card card">
            <button
              type="button"
              className="lib-main"
              onClick={() => {
                setEditing(item)
                setIsNew(false)
              }}
            >
              <span className="lib-emoji" aria-hidden="true">
                {'emoji' in item ? item.emoji : '🧰'}
              </span>
              <span className="grow">
                <span className="lib-name">
                  {item.name}
                  {item.origin === 'system' && <span className="badge">built-in</span>}
                  {'verdict' in item && item.verdict && <span className="badge accent">verdict</span>}
                  {!shelved && 'category' in item && item.category && <span className="badge">{LIB_CATEGORY_LABEL[item.category] ?? item.category}</span>}
                </span>
                <span className="lib-desc">{item.description || ('url' in item ? item.url : '')}</span>
              </span>
            </button>
            <div className="lib-actions">
              {tab !== 'mcp' && (
                <button type="button" className="icon-btn sm" aria-label={`Share ${item.name} as a link`} title="Share as a link" onClick={() => setSharing(item as Role | Skill)}>
                  <Icon name="link" />
                </button>
              )}
              <button
                type="button"
                className="icon-btn sm"
                aria-label={`Duplicate ${item.name}`}
                onClick={() => {
                  upsertLib(tab as ListTab, { ...item, id: uid(tab + '-'), name: item.name + ' (copy)', origin: 'user' } as never)
                  toast('Duplicated')
                }}
              >
                <Icon name="duplicate" />
              </button>
              <button type="button" className="icon-btn sm danger" aria-label={`Delete ${item.name}`} onClick={() => setDel({ id: item.id, name: item.name })}>
                <Icon name="trash" />
              </button>
            </div>
          </li>
  )

  return (
    <div className="page">
      <PageHead
        title="Library"
        sub="Reusable pieces for chats and circuits. Everything here is editable, including the built-ins."
        actions={
          tab === 'apps' ? undefined : (
            <button type="button" className="btn primary" onClick={create}>
              <Icon name="plus" /> New {tab === 'roles' ? 'role' : tab === 'skills' ? 'skill' : 'server'}
            </button>
          )
        }
      />
      <nav className="tabs-inline" aria-label="Library sections">
        {TABS.map(t => (
          <a key={t.id} href={`/library/${t.id}`} className={t.id === tab ? 'on' : undefined} aria-current={t.id === tab ? 'page' : undefined}>
            {t.label}
            <span className="count">{t.id === 'roles' ? roles.length : t.id === 'skills' ? skills.length : t.id === 'mcp' ? mcp.length : connected}</span>
          </a>
        ))}
      </nav>
      <p className="muted small lib-blurb">{current.blurb}</p>

      {tab === 'apps' ? (
        <Apps />
      ) : (
        <>
      {items.length > 8 && (
        <div className="model-filters">
          <div className="model-filters-row">
            <input className="input grow" type="search" placeholder={`Search ${items.length} ${current.label.toLowerCase()}…`} value={q} onChange={e => setQ(e.target.value)} aria-label={`Search ${current.label.toLowerCase()}`} />
            <span className="muted tiny" aria-live="polite">
              {shown.length} of {items.length}
            </span>
          </div>
        </div>
      )}
      {!shown.length && <p className="muted small">Nothing matches.</p>}
      {grouped ? (
        <div className="accordions">
          {groups.map(g => (
            <Accordion key={g.id} id={`lib-${tab}-${g.id}`} emoji={g.emoji} title={g.title} count={g.items.length} defaultOpen={g.id === 'yours'}>
              <ul className="lib-grid">{g.items.map(card)}</ul>
            </Accordion>
          ))}
        </div>
      ) : (
        <ul className="lib-grid">{shown.map(card)}</ul>
      )}

      <div className="row lib-foot">
        <button type="button" className="btn ghost small" onClick={() => setRestore(true)}>
          <Icon name="refresh" /> Restore built-in {current.label.toLowerCase()}
        </button>
      </div>
        </>
      )}

      <AlsoOnLowkey where={tab === 'apps' ? 'apps' : 'circuits'} />

      <footer className="page-foot">
        <Credits />
      </footer>

      {editing && (
        <Editor
          key={editing.id}
          tab={tab}
          item={editing}
          isNew={isNew}
          onClose={() => setEditing(null)}
          onSave={item => {
            upsertLib(tab as ListTab, item as never)
            setEditing(null)
            toast(isNew ? 'Created' : 'Saved')
          }}
        />
      )}
      {tab !== 'mcp' && tab !== 'apps' && <ShareLibSheet kind={tab === 'roles' ? 'role' : 'skill'} item={sharing} onClose={() => setSharing(null)} />}
      {tab !== 'mcp' && tab !== 'apps' && <SharedLibPrompt key={tab} />}
      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        title={`Delete ${del?.name}?`}
        body="Chats and circuits that use it will simply stop including it. Built-ins can be restored later."
        onConfirm={() => del && deleteLib(tab as ListTab, del.id)}
      />
      <Confirm
        open={restore}
        onClose={() => setRestore(false)}
        title={`Restore built-in ${current.label.toLowerCase()}?`}
        body="Missing built-ins come back and edited ones are reset. Anything you created yourself is untouched."
        confirm="Restore"
        danger={false}
        onConfirm={() => {
          restoreDefaults(tab as ListTab)
          toast('Built-ins restored')
        }}
      />
    </div>
  )
}

function Editor({ tab, item, isNew, onClose, onSave }: { tab: Tab; item: Role | Skill | McpServer; isNew: boolean; onClose: () => void; onSave: (i: Role | Skill | McpServer) => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...item })
  const [testing, setTesting] = useState<string | null>(null)
  const set = (k: string, v: unknown) => setDraft(d => ({ ...d, [k]: v }))
  const valid = String(draft.name ?? '').trim() && (tab === 'mcp' ? /^https?:\/\/.+/.test(String(draft.url)) : String(draft.prompt ?? '').trim())
  const noun = tab === 'roles' ? 'role' : tab === 'skills' ? 'skill' : 'MCP server'

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={isNew ? `New ${noun}` : `Edit ${noun}`}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!valid} onClick={() => onSave({ ...draft, name: String(draft.name).trim() } as unknown as Role | Skill | McpServer)}>
            <Icon name="check" /> Save
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row">
          {tab !== 'mcp' && (
            <label className="field emoji-field">
              <span className="label">Icon</span>
              <input className="input" value={String(draft.emoji ?? '')} maxLength={4} onChange={e => set('emoji', e.target.value)} />
            </label>
          )}
          <label className="field grow">
            <span className="label">Name</span>
            <input className="input" value={String(draft.name ?? '')} onChange={e => set('name', e.target.value)} autoFocus={isNew} />
          </label>
        </div>
        <label className="field">
          <span className="label">Short description</span>
          <input className="input" value={String(draft.description ?? '')} onChange={e => set('description', e.target.value)} />
        </label>

        {tab !== 'mcp' && (
          <div className="row wrap">
            <label className="field grow">
              <span className="label">Shelf</span>
              <select className="select" value={String(draft.category ?? '')} onChange={e => set('category', e.target.value || undefined)}>
                {tab === 'roles' && <option value="">Other</option>}
                {LIB_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            {tab === 'skills' && (
            <div className="field grow">
              <span className="label">Loop support</span>
              <Toggle checked={!!draft.verdict} onChange={v => set('verdict', v)} label="Ends with a VERDICT line" hint="Lets a loop stop when this skill approves." />
            </div>
            )}
          </div>
        )}

        {tab !== 'mcp' ? (
          <label className="field">
            <span className="label">{tab === 'roles' ? 'Instruction (prepended to every prompt)' : 'Skill prompt'}</span>
            <textarea className="textarea tall" value={String(draft.prompt ?? '')} onChange={e => set('prompt', e.target.value)} placeholder={tab === 'roles' ? 'You are a…' : 'When doing this, …'} />
            <span className="hint">Say who to be and what good looks like. Current models follow plain guidance well; long rule lists make them worse.</span>
          </label>
        ) : (
          <>
            <label className="field">
              <span className="label">Server URL (Streamable HTTP)</span>
              <input className="input mono" value={String(draft.url ?? '')} onChange={e => set('url', e.target.value)} placeholder="https://example.com/mcp" inputMode="url" />
              <span className="hint">The server must allow browser (CORS) requests. Local servers on http://localhost work in most browsers.</span>
            </label>
            <label className="field">
              <span className="label">Bearer token (optional)</span>
              <input className="input mono" type="password" autoComplete="off" value={String(draft.token ?? '')} onChange={e => set('token', e.target.value || undefined)} />
            </label>
            <div className="row wrap">
              <label className="field grow">
                <span className="label">Extra header name (optional)</span>
                <input className="input mono" value={String(draft.headerName ?? '')} onChange={e => set('headerName', e.target.value || undefined)} placeholder="X-API-Key" />
              </label>
              <label className="field grow">
                <span className="label">Header value</span>
                <input className="input mono" type="password" autoComplete="off" value={String(draft.headerValue ?? '')} onChange={e => set('headerValue', e.target.value || undefined)} />
              </label>
            </div>
            <div className="row wrap">
              <button
                type="button"
                className="btn small"
                disabled={!valid || testing === '…'}
                onClick={async () => {
                  setTesting('…')
                  const r = await probe(draft as unknown as McpServer)
                  setTesting(r.ok ? `✓ Connected · ${r.tools.length} tools: ${r.tools.slice(0, 8).join(', ')}${r.tools.length > 8 ? '…' : ''}` : `✗ ${r.error}`)
                }}
              >
                <Icon name="wire" /> Test connection
              </button>
              {testing && <span className={testing.startsWith('✓') ? 'ok-text small' : testing === '…' ? 'muted small' : 'error-text small'}>{testing === '…' ? 'Connecting…' : testing}</span>}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
