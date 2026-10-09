import { useEffect, useMemo, useState } from 'react'
import { track } from '../lib/analytics'
import { uid } from '../lib/format'
import { LIB_TAB, libShareUrl, readLibShare, type SharedLib, type SharedLibKind } from '../lib/share'
import { LIB_CATEGORY_LABEL } from '../library/categories'
import { toast, upsertLib } from '../state/app'
import type { Role, Skill } from '../types'
import { Icon } from './Icon'
import { copyText, Sheet } from './ui'

export type ShareVia = 'copy' | 'share'

/**
 * The two ways out for any share link: copy it, or hand it to the device's
 * own share sheet where the browser has one.
 */
export function ShareLinkButtons({ url, title, text, onShared }: { url: string; title: string; text: string; onShared?: (via: ShareVia) => void }) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <>
      <button
        type="button"
        className={canShare ? 'btn' : 'btn primary'}
        onClick={async () => {
          if (!(await copyText(url))) return
          toast('Link copied')
          onShared?.('copy')
        }}
      >
        <Icon name="copy" /> Copy link
      </button>
      {canShare && (
        <button
          type="button"
          className="btn primary"
          onClick={async () => {
            try {
              await navigator.share({ title, text, url })
              onShared?.('share')
            } catch (e) {
              // Closing the share sheet is not a failure.
              if (!(e instanceof DOMException && e.name === 'AbortError')) toast('This device could not share the link. Copy it instead.', 'warn')
            }
          }}
        >
          <Icon name="send" /> Share
        </button>
      )}
    </>
  )
}

/** Share a role or a skill as a link that carries it in its fragment. */
export function ShareLibSheet({ kind, item, onClose }: { kind: SharedLibKind; item: Role | Skill | null; onClose: () => void }) {
  const url = useMemo(() => (item ? libShareUrl(kind, item) : ''), [kind, item])
  if (!item) return null
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Share this ${kind} as a link`}
      footer={
        <>
          <span className="muted tiny">{url.length.toLocaleString()} characters</span>
          <span className="grow" />
          <ShareLinkButtons url={url} title={`${item.name} · FuseLLM ${kind}`} text={`${item.emoji} ${item.name}: a ${kind} for FuseLLM.`.trim()} onShared={via => track('library_shared', { kind: LIB_TAB[kind], via })} />
        </>
      }
    >
      <div className="stack">
        <h3 className="lib-name">
          {item.emoji} {item.name}
        </h3>
        <p className="muted small">The {kind} is packed into the link itself: its name, description and prompt. Nothing is uploaded anywhere, and whoever opens it gets their own copy to keep or change.</p>
        <input className="input mono" readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label="Share link" />
      </div>
    </Sheet>
  )
}

/** On the Library: offers to add a role or skill someone shared as a link. */
export function SharedLibPrompt() {
  // Read once, when the page first renders: the effect below clears the
  // fragment, and an effect that runs twice must not lose the item.
  const [initial] = useState(() => {
    try {
      return { shared: readLibShare() }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })
  const [shared, setShared] = useState<SharedLib | undefined>(initial.shared)
  useEffect(() => {
    if (initial.error) toast(initial.error, 'err')
    // Keep the address bar clean whatever happens next.
    if (/share=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search)
  }, [initial])
  if (!shared) return null
  const { kind, item } = shared
  const category = item.category && LIB_CATEGORY_LABEL[item.category] ? item.category : undefined
  return (
    <Sheet
      open
      wide
      onClose={() => setShared(undefined)}
      title={`Someone shared a ${kind} with you`}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={() => setShared(undefined)}>
            Not now
          </button>
          <span className="grow" />
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const base = { id: uid(`${kind}-`), origin: 'user' as const, updatedAt: Date.now(), name: item.name, emoji: item.emoji || (kind === 'role' ? '🧑' : '🧩'), description: item.description, prompt: item.prompt }
              if (kind === 'role') upsertLib('roles', { ...base, category })
              else upsertLib('skills', { ...base, category: category ?? 'code', verdict: item.verdict })
              setShared(undefined)
              toast(`Added to your ${LIB_TAB[kind]}`)
            }}
          >
            <Icon name="plus" /> Add to my {LIB_TAB[kind]}
          </button>
        </>
      }
    >
      <div className="stack">
        <h3 className="lib-name">
          {item.emoji} {item.name}
          {category && <span className="badge">{LIB_CATEGORY_LABEL[category]}</span>}
          {item.verdict && <span className="badge accent">verdict</span>}
        </h3>
        {item.description && <p className="muted small">{item.description}</p>}
        <div className="field">
          <span className="label">{kind === 'role' ? 'Instruction it adds to every prompt' : 'Skill prompt'}</span>
          <pre className="shared-prompt">{item.prompt}</pre>
        </div>
        <p className="muted small">Read it before adding: this text is sent to the model whenever you use the {kind}. Adding makes your own copy, which you can edit or delete.</p>
      </div>
    </Sheet>
  )
}
