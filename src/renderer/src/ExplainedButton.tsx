import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'

export default function ExplainedButton({
  reason,
  hint,
  hintLabel,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'title'> & {
  reason?: string
  hint?: string
  hintLabel: string
}) {
  const help = reason ?? hint
  const id = useId()
  const trigger = useRef<HTMLSpanElement>(null)
  const tooltip = useRef<HTMLSpanElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dismissed = useRef(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const cancelHide = () => window.clearTimeout(hideTimer.current)
  const close = () => {
    cancelHide()
    setPosition(null)
  }
  const show = useCallback(() => {
    window.clearTimeout(hideTimer.current)
    if (!help || !trigger.current || !tooltip.current) return
    const box = trigger.current.getBoundingClientRect()
    const width = Math.min(340, window.innerWidth - 24)
    const height = tooltip.current.getBoundingClientRect().height
    setPosition({
      left: Math.max(12, Math.min(box.right - width, window.innerWidth - width - 12)),
      top:
        box.top >= height + 20
          ? box.top - height - 8
          : Math.min(box.bottom + 8, window.innerHeight - height - 12),
    })
  }, [help])
  const enter = () => {
    dismissed.current = false
    show()
  }
  const hide = () => {
    cancelHide()
    hideTimer.current = setTimeout(() => setPosition(null), 120)
  }
  useEffect(() => {
    if (!help) setPosition(null)
    else if (
      !dismissed.current &&
      (tooltip.current?.style.visibility === 'visible' ||
        trigger.current === document.activeElement)
    )
      show()
  }, [help, show])
  useEffect(() => {
    if (!position) return
    const dismiss = () => {
      dismissed.current = true
      setPosition(null)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }
    window.addEventListener('resize', dismiss)
    // Focus and layout updates can scroll after opening. Only user input closes help.
    document.addEventListener('wheel', dismiss, { passive: true })
    document.addEventListener('touchmove', dismiss, { passive: true })
    document.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('resize', dismiss)
      document.removeEventListener('wheel', dismiss)
      document.removeEventListener('touchmove', dismiss)
      document.removeEventListener('keydown', key)
    }
  }, [position])
  useEffect(() => () => window.clearTimeout(hideTimer.current), [])
  return (
    <span
      ref={trigger}
      className="explained-button"
      tabIndex={reason ? 0 : undefined}
      role={reason ? 'group' : undefined}
      aria-label={reason ? hintLabel : undefined}
      aria-describedby={help ? id : undefined}
      onMouseEnter={enter}
      onMouseMove={() => {
        if (!position && !dismissed.current) show()
      }}
      onMouseLeave={hide}
      onFocus={enter}
      onBlur={close}
    >
      <button {...props} disabled={!!reason} aria-describedby={help ? id : undefined}>
        {children}
      </button>
      {help &&
        createPortal(
          <span
            ref={tooltip}
            id={id}
            role="tooltip"
            className="button-tooltip"
            style={{
              left: position?.left ?? 12,
              top: position?.top ?? 12,
              visibility: position ? 'visible' : 'hidden',
            }}
            onMouseEnter={cancelHide}
            onMouseLeave={hide}
          >
            {help}
          </span>,
          document.body,
        )}
    </span>
  )
}
