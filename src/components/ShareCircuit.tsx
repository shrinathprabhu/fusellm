import { useEffect, useMemo, useState } from 'react'
import { readShare, shareUrl, withoutPersonal, type SharedCircuit } from '../lib/share'
import { go } from '../lib/router'
import { track } from '../lib/analytics'
import { circuitFile, importCircuitFile, toast } from '../state/app'
import type { Circuit } from '../types'
import { Icon } from './Icon'
import { ShareLinkButtons } from './ShareLink'
import { Sheet, Toggle } from './ui'

/** Share a circuit as a link that carries the whole circuit in its fragment. */
export function ShareCircuitSheet({ circuit, open, onClose }: { circuit: Circuit; open: boolean; onClose: () => void }) {
  const [strip, setStrip] = useState(true)
  const url = useMemo(() => {
    if (!open) return ''
    const file = circuitFile(circuit) as SharedCircuit
    return shareUrl(strip ? withoutPersonal(file) : file)
  }, [open, circuit, strip])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Share this circuit as a link"
      footer={
        <>
          <span className="muted tiny">{url.length.toLocaleString()} characters</span>
          <span className="grow" />
          <ShareLinkButtons
            url={url}
            title={`${circuit.name} · FuseLLM circuit`}
            text={`${circuit.emoji} ${circuit.name}: a circuit for FuseLLM.`}
            onShared={via => track('circuit_shared', { template: circuit.templateId ?? 'custom', stages: circuit.stages.length, stripped: strip, via })}
          />
        </>
      }
    >
      <div className="stack">
        <p className="muted small">The whole circuit, with the roles and skills it uses, is packed into the link itself. Nothing is uploaded anywhere: whoever opens it gets their own copy. Your keys, runs and briefs are never included.</p>
        <Toggle checked={strip} onChange={setStrip} label="Leave out my app details" hint="Blanks fixed values in app steps, such as email addresses, sheet, repo and project ids. Placeholders like {{final}} stay." />
        <input className="input mono" readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label="Share link" />
        {url.length > 30_000 && <p className="warn-text">This link is long. Some chat apps cut long links; the exported file (download icon) is safer for big circuits.</p>}
      </div>
    </Sheet>
  )
}

/** On the Circuits page: offers to add a circuit someone shared as a link. */
export function SharedCircuitPrompt() {
  // Read once, when the page first renders: the effect below clears the
  // fragment, and an effect that runs twice must not lose the circuit.
  const [initial] = useState(() => {
    try {
      return { shared: readShare() }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })
  const [shared, setShared] = useState<SharedCircuit | undefined>(initial.shared)
  useEffect(() => {
    if (initial.error) toast(initial.error, 'err')
    // Keep the address bar clean whatever happens next.
    if (/share=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search)
  }, [initial])
  if (!shared) return null
  const c = shared.circuit
  return (
    <Sheet
      open
      onClose={() => setShared(undefined)}
      title="Someone shared a circuit with you"
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
              const copy = importCircuitFile(shared)
              setShared(undefined)
              toast('Added to your circuits')
              go({ name: 'circuit', id: copy.id })
            }}
          >
            <Icon name="plus" /> Add to my circuits
          </button>
        </>
      }
    >
      <div className="stack">
        <h3 className="lib-name">
          {c.emoji} {c.name}
        </h3>
        {c.description && <p className="muted small">{c.description}</p>}
        <ol className="shared-stages small">
          {c.stages.map(st => (
            <li key={st.id}>
              <strong>{st.name}</strong> <span className="faint">{st.kind === 'action' ? `· app step ${st.action?.op}` : st.kind === 'media' ? `· ${st.media?.kind}` : st.kind === 'decision' ? '· Jev decision' : st.kind === 'review' ? '· your review' : `· ${st.modelId}`}</span>
            </li>
          ))}
        </ol>
        <p className="muted small">Adding makes your own copy. Check app steps before running: they act with your connected apps{shared.roles.length || shared.skills.length ? `, and ${shared.roles.length + shared.skills.length} roles or skills it uses will be added to your library` : ''}.</p>
      </div>
    </Sheet>
  )
}
