import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * A small ⓘ that explains something. Hovering (mouse) or focusing it opens
 * the panel; tapping or clicking pins it open until a tap elsewhere or
 * Escape. The panel is fixed-positioned and clamped to the viewport, so it
 * never runs off a phone screen, and it can hold links.
 */
export function InfoTip({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const id = useId()
  const show = open || pinned

  const place = () => {
    const b = btn.current?.getBoundingClientRect()
    const p = panel.current
    if (!b || !p) return
    const w = p.offsetWidth
    const h = p.offsetHeight
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const left = Math.max(8, Math.min(vw - w - 8, b.left + b.width / 2 - w / 2))
    const up = b.bottom + 8 + h > vh - 8 && b.top - 8 - h > 8
    setPos({ top: up ? b.top - 8 - h : b.bottom + 8, left, up })
  }

  useLayoutEffect(() => {
    if (show) place()
    else setPos(null)
  }, [show])

  useEffect(() => {
    if (!show) return
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !panel.current?.contains(t)) {
        setPinned(false)
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false)
        setOpen(false)
        btn.current?.focus()
      }
    }
    const onMove = () => place()
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [show])

  const enter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    closeTimer.current = window.setTimeout(() => setOpen(false), 180)
  }

  return (
    <span className="infotip">
      <button
        ref={btn}
        type="button"
        className="infotip-btn"
        aria-label={label}
        aria-expanded={show}
        aria-controls={id}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={() => setOpen(true)}
        onBlur={e => {
          if (!panel.current?.contains(e.relatedTarget as Node)) setOpen(false)
        }}
        onClick={() => setPinned(p => !p)}
      >
        <Icon name="info" size={15} />
      </button>
      {show && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={label}
          className={`infotip-panel${wide ? ' wide' : ''}${pos?.up ? ' up' : ''}`}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onBlur={e => {
            if (!panel.current?.contains(e.relatedTarget as Node) && e.relatedTarget !== btn.current) setOpen(false)
          }}
        >
          {children}
        </div>
      )}
    </span>
  )
}
