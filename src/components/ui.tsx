import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon.tsx'

/**
 * A modal sheet on the native <dialog>: focus is trapped and restored, Escape
 * closes it, and the backdrop is real. Slides up from the bottom on phones,
 * sits centred on wider screens.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={wide ? 'sheet wide' : 'sheet'}
      aria-labelledby={id}
      onClose={onClose}
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
      onClick={e => {
        if (e.target === ref.current) onClose()
      }}
    >
      {open && (
        <div className="sheet-inner">
          <header className="sheet-head">
            <h2 id={id}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </header>
          <div className="sheet-body">{children}</div>
          {footer && <footer className="sheet-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />
      <span className="switch-text">
        {label}
        {hint && <span className="hint">{hint}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.id} type="button" aria-pressed={value === o.id} title={o.title} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Confirm({
  open,
  title,
  body,
  confirm = 'Delete',
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirm?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'btn danger solid' : 'btn primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirm}
          </button>
        </>
      }
    >
      <div className="muted">{body}</div>
    </Sheet>
  )
}

/** Textarea that grows with its content up to a cap. */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number; ref?: React.RefObject<HTMLTextAreaElement | null> }) {
  const { maxRows = 10, ref: outer, ...rest } = props
  const inner = useRef<HTMLTextAreaElement>(null)
  const ref = outer ?? inner
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22
    el.style.height = Math.min(el.scrollHeight, line * maxRows + 20) + 'px'
  }
  useLayoutEffect(fit, [props.value, maxRows])
  // Re-fit when the width changes (first layout, rotation, sidebar), since
  // wrapping, and so the needed height, depends on it.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth
        fit()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <textarea ref={ref} {...rest} />
}

export function useNow(active: boolean, every = 100): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(t)
  }, [active, every])
  return now
}

export function Empty({ emoji, title, children, action }: { emoji: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="emoji" aria-hidden="true">
        {emoji}
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function PageHead({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="page-head">
      <div className="page-head-main">
        {back && (
          <a className="icon-btn back" href={back} aria-label="Back">
            <Icon name="back" />
          </a>
        )}
        <div className="grow">
          <h1 className="page-title">{title}</h1>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    // Content outside a modal dialog is inert and cannot be selected.
    ;(document.querySelector('dialog[open]') ?? document.body).appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function downloadFile(name: string, content: string, type = 'text/markdown') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
