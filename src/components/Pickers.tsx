import { useState } from 'react'
import { FAMILIES, MODELS, MODEL_BY_ID, MODES, type Mode } from '../ai/catalog'
import { isReady, modelConfig } from '../ai/run'
import { price, tokens } from '../lib/format'
import { useApp } from '../state/app'
import { Icon } from './Icon'
import { Segmented, Sheet } from './ui'

export function ModelDot({ id }: { id: string }) {
  return <span className="dot" style={{ ['--c' as string]: MODEL_BY_ID[id]?.color ?? 'var(--accent)' }} aria-hidden="true" />
}

export function ModelName({ id }: { id: string }) {
  return (
    <span className="model-name">
      <ModelDot id={id} />
      {MODEL_BY_ID[id]?.name ?? id}
    </span>
  )
}

/** Choose one model, or several. Models without a usable key are shown but disabled. */
export function ModelPicker({
  open,
  onClose,
  value,
  onChange,
  multi,
  title,
}: {
  open: boolean
  onClose: () => void
  value: string[]
  onChange: (ids: string[]) => void
  multi?: boolean
  title?: string
}) {
  const settings = useApp(s => s.settings)
  const [sel, setSel] = useState<string[]>(value)
  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setSel(value)
  }

  const toggle = (id: string) => {
    if (!multi) {
      onChange([id])
      onClose()
      return
    }
    setSel(s => (s.includes(id) ? s.filter(x => x !== id) : s.length >= 4 ? s : [...s, id]))
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title ?? (multi ? 'Models' : 'Model')}
      footer={
        multi ? (
          <>
            <span className="muted small grow">{sel.length ? `${sel.length} selected · each answers side by side` : 'Pick up to 4'}</span>
            <button
              type="button"
              className="btn primary"
              disabled={!sel.length}
              onClick={() => {
                onChange(sel)
                onClose()
              }}
            >
              Use {sel.length > 1 ? `${sel.length} models` : 'model'}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="picker">
        {FAMILIES.map(fam => (
          <div key={fam} className="picker-group">
            <div className="picker-group-title">{fam}</div>
            {MODELS.filter(m => m.family === fam).map(m => {
              const ready = isReady(settings, m.id)
              const enabled = modelConfig(settings, m.id).enabled
              const on = multi ? sel.includes(m.id) : value[0] === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  className={on ? 'picker-item on' : 'picker-item'}
                  disabled={!ready}
                  onClick={() => toggle(m.id)}
                  aria-pressed={on}
                >
                  <ModelDot id={m.id} />
                  <span className="grow">
                    <span className="picker-name">{m.name}</span>
                    <span className="picker-sub">{m.blurb}</span>
                  </span>
                  <span className="picker-meta mono tiny">
                    {!enabled ? 'off' : !ready ? 'no key' : m.price.in === 0 ? 'free' : `${price(m.price.in)}/${price(m.price.out)}`}
                    <span className="faint"> · {tokens(m.context)}</span>
                  </span>
                  {on && <Icon name="check" className="picker-check" />}
                </button>
              )
            })}
          </div>
        ))}
        <p className="hint">
          Greyed out means no key reaches that model yet. Add one in <a href="/models">Models</a>. Prices are USD per million tokens, in/out.
        </p>
      </div>
    </Sheet>
  )
}

interface LibItem {
  id: string
  name: string
  emoji: string
  description: string
}

/** Pick roles, skills or MCP servers from the library. */
export function LibraryPicker({
  open,
  onClose,
  title,
  items,
  value,
  onChange,
  multi,
  manageHref,
  noneLabel,
}: {
  open: boolean
  onClose: () => void
  title: string
  items: LibItem[]
  value: string[]
  onChange: (ids: string[]) => void
  multi?: boolean
  manageHref: string
  noneLabel?: string
}) {
  const [q, setQ] = useState('')
  const list = items.filter(i => !q || (i.name + ' ' + i.description).toLowerCase().includes(q.toLowerCase()))
  const toggle = (id: string) => {
    if (!multi) {
      onChange(id ? [id] : [])
      onClose()
      return
    }
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <a className="btn ghost small" href={manageHref} onClick={onClose}>
            <Icon name="edit" /> Manage
          </a>
          <span className="grow" />
          {multi && (
            <button type="button" className="btn primary" onClick={onClose}>
              Done{value.length ? ` · ${value.length}` : ''}
            </button>
          )}
        </>
      }
    >
      <div className="picker">
        {items.length > 6 && <input className="input" placeholder="Filter…" value={q} onChange={e => setQ(e.target.value)} aria-label="Filter" />}
        {!multi && noneLabel && (
          <button type="button" className={!value.length ? 'picker-item on' : 'picker-item'} onClick={() => toggle('')}>
            <span className="picker-emoji">∅</span>
            <span className="grow">
              <span className="picker-name">{noneLabel}</span>
            </span>
          </button>
        )}
        {list.map(i => {
          const on = value.includes(i.id)
          return (
            <button key={i.id} type="button" className={on ? 'picker-item on' : 'picker-item'} onClick={() => toggle(i.id)} aria-pressed={on}>
              <span className="picker-emoji" aria-hidden="true">
                {i.emoji}
              </span>
              <span className="grow">
                <span className="picker-name">{i.name}</span>
                <span className="picker-sub">{i.description}</span>
              </span>
              {on && <Icon name="check" className="picker-check" />}
            </button>
          )
        })}
        {!items.length && <p className="muted small">Nothing here yet.</p>}
      </div>
    </Sheet>
  )
}

export function ModeSwitch({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <Segmented
      label="Thinking mode"
      value={value}
      onChange={onChange}
      options={MODES.map(m => ({ id: m.id, label: m.label, title: m.hint }))}
    />
  )
}

const BUDGETS = [0, 20_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]

export function BudgetInput({ value, onChange, label = 'Stop-loss', hint }: { value: number; onChange: (n: number) => void; label?: string; hint?: string }) {
  const [custom, setCustom] = useState(!BUDGETS.includes(value))
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row wrap">
        {BUDGETS.map(b => (
          <button
            key={b}
            type="button"
            className={!custom && value === b ? 'chip on' : 'chip'}
            onClick={() => {
              setCustom(false)
              onChange(b)
            }}
          >
            {b ? tokens(b) : 'None'}
          </button>
        ))}
        <button type="button" className={custom ? 'chip on' : 'chip'} onClick={() => setCustom(true)}>
          Custom
        </button>
      </div>
      {custom && (
        <input
          className="input mono"
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          value={value || ''}
          placeholder="tokens"
          onChange={e => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
          aria-label="Custom stop-loss in tokens"
        />
      )}
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}
