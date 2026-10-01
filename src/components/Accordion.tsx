import { useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * A collapsible group built on <details>, so it is keyboard and screen-reader
 * friendly by default. Whether it is open is remembered per `id`.
 */
export function Accordion({ id, title, emoji, count, defaultOpen = false, children }: { id: string; title: string; emoji?: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  const key = `fusellm:open:${id}`
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved === null ? defaultOpen : saved === '1'
    } catch {
      return defaultOpen
    }
  })
  return (
    <details
      className="accordion"
      open={open}
      onToggle={e => {
        const now = (e.currentTarget as HTMLDetailsElement).open
        setOpen(now)
        try {
          localStorage.setItem(key, now ? '1' : '0')
        } catch {
          /* storage blocked */
        }
      }}
    >
      <summary className="accordion-head">
        {emoji && (
          <span className="accordion-emoji" aria-hidden="true">
            {emoji}
          </span>
        )}
        <span className="accordion-title">{title}</span>
        {count !== undefined && <span className="count">{count}</span>}
        <span className="grow" />
        <Icon name="down" className="accordion-chevron" />
      </summary>
      {/* Children render only while open, so a long library stays light. */}
      {open && <div className="accordion-body">{children}</div>}
    </details>
  )
}
