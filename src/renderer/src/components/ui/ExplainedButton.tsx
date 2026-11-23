import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
} from 'react'
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
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  const cancelHide = useCallback(() => window.clearTimeout(hideTimer.current), [])

  const close = useCallback(() => {
    cancelHide()
    setOpen(false)
    setPosition(null)
  }, [cancelHide])

  const updatePosition = useCallback(() => {
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

  const enter = useCallback(() => {
    cancelHide()
    if (!help) return
    dismissed.current = false
    setOpen(true)
  }, [cancelHide, help])

  const hide = useCallback(() => {
    cancelHide()
    hideTimer.current = setTimeout(() => {
      setOpen(false)
      setPosition(null)
    }, 120)
  }, [cancelHide])

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLSpanElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) close()
    },
    [close],
  )

  useLayoutEffect(() => {
    if (!open || !help) return
    updatePosition()
  }, [open, help, updatePosition])

  useEffect(() => {
    if (!help) {
      setOpen(false)
      setPosition(null)
    } else if (
      !dismissed.current &&
      (open || trigger.current?.contains(document.activeElement) === true)
    ) {
      setOpen(true)
    }
  }, [help, open])

  useEffect(() => {
    if (!open) return
    const dismiss = () => {
      dismissed.current = true
      setOpen(false)
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
  }, [open])

  useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  const showPortal = open && !!help

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
        if (!open && !dismissed.current && help) setOpen(true)
      }}
      onMouseLeave={hide}
      onFocus={enter}
      onBlur={handleBlur}
    >
      <button {...props} disabled={!!reason} aria-describedby={help ? id : undefined}>
        {children}
      </button>
      {help && !showPortal && (
        <span id={id} hidden>
          {help}
        </span>
      )}
      {showPortal &&
        createPortal(
          <span
            ref={tooltip}
            id={id}
            role="tooltip"
            className="button-tooltip"
            style={
              position
                ? { left: position.left, top: position.top }
                : { left: 12, top: 12, visibility: 'hidden' }
            }
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
