import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn } from 'lucide-react'
import type { GuideCapture } from './GuideAssets'
import type { GuideScene } from './guide-steps'

type BubbleState = {
  index: number
  left: number
  top: number
  anchorRect: { left: number; right: number; top: number; bottom: number }
}

type GuideCaptureStageProps = {
  scene: GuideScene
  capture: GuideCapture
  theme: 'light' | 'dark'
  markIndex: number
  onSelectMark: (index: number) => void
  onOpenZoom: () => void
}

function computeInitialBubblePosition(
  anchor: { left: number; right: number; top: number; bottom: number },
  bubbleWidth = 310,
  bubbleHeight = 220,
) {
  const maxLeft = Math.max(12, window.innerWidth - bubbleWidth - 12)
  const fitsRight = anchor.right + 12 + bubbleWidth <= window.innerWidth - 12
  const rawLeft = fitsRight ? anchor.right + 12 : anchor.left - bubbleWidth - 12
  const left = Math.min(maxLeft, Math.max(12, rawLeft))

  const maxTop = Math.max(12, window.innerHeight - bubbleHeight - 12)
  const fitsBelow = anchor.bottom + 10 + bubbleHeight <= window.innerHeight - 12
  const rawTop = fitsBelow ? anchor.bottom + 10 : anchor.top - bubbleHeight - 10
  const top = Math.min(maxTop, Math.max(12, rawTop))

  return { left, top }
}

export function GuideCaptureStage({
  scene,
  capture,
  theme,
  markIndex,
  onSelectMark,
  onOpenZoom,
}: GuideCaptureStageProps) {
  const [bubble, setBubble] = useState<BubbleState | null>(null)
  const bubbleRef = useRef<HTMLElement>(null)
  const markerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const instructionRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    setBubble(null)
  }, [scene.key, theme])

  useEffect(() => {
    const close = () => setBubble(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    // Native focus may finish scrolling after click. Only user scrolling closes help.
    document.addEventListener('wheel', close, { passive: true })
    document.addEventListener('touchmove', close, { passive: true })
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('wheel', close)
      document.removeEventListener('touchmove', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [])

  useLayoutEffect(() => {
    if (!bubble || !bubbleRef.current) return
    const rect = bubbleRef.current.getBoundingClientRect()
    const next = computeInitialBubblePosition(bubble.anchorRect, rect.width, rect.height)
    if (Math.abs(next.left - bubble.left) > 1 || Math.abs(next.top - bubble.top) > 1) {
      setBubble((current) => (current ? { ...current, left: next.left, top: next.top } : null))
    }
  }, [bubble])

  const openBubbleAt = useCallback((index: number, element: HTMLElement | null) => {
    if (!element) return
    const box = element.getBoundingClientRect()
    const anchorRect = { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
    const { left, top } = computeInitialBubblePosition(anchorRect)
    setBubble({ index, left, top, anchorRect })
  }, [])

  const handleMarkKeyDown = useCallback(
    (
      event: React.KeyboardEvent<HTMLButtonElement>,
      index: number,
      source: 'marker' | 'instruction',
    ) => {
      const total = capture.marks.length
      if (!total) return
      let nextIndex = -1
      if (event.key === 'ArrowRight' || (source === 'instruction' && event.key === 'ArrowDown')) {
        nextIndex = (index + 1) % total
      } else if (
        event.key === 'ArrowLeft' ||
        (source === 'instruction' && event.key === 'ArrowUp')
      ) {
        nextIndex = (index - 1 + total) % total
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = total - 1
      }
      if (nextIndex < 0) return
      event.preventDefault()
      onSelectMark(nextIndex)
      if (source === 'marker') {
        const nextMarker = markerRefs.current[nextIndex] ?? null
        nextMarker?.focus()
        if (bubble) openBubbleAt(nextIndex, nextMarker)
      } else {
        instructionRefs.current[nextIndex]?.focus()
      }
    },
    [bubble, capture.marks.length, onSelectMark, openBubbleAt],
  )

  return (
    <>
      <figure className="guide-capture">
        <div className="guide-canvas" style={{ aspectRatio: capture.width + '/' + capture.height }}>
          <img
            src={capture.src}
            width={capture.width}
            height={capture.height}
            alt={'Настоящий экран VKSpot: ' + scene.name + '. Демонстрационные данные.'}
          />
          {capture.marks.map((mark, index) => (
            <div
              className={'guide-highlight ' + (markIndex === index ? 'selected' : '')}
              key={mark.label}
              style={{
                left: mark.x + '%',
                top: mark.y + '%',
                width: mark.width + '%',
                height: mark.height + '%',
              }}
            >
              <button
                ref={(node) => {
                  markerRefs.current[index] = node
                }}
                type="button"
                className="guide-marker"
                aria-label={'Пояснение ' + (index + 1) + ': ' + mark.label}
                aria-pressed={markIndex === index}
                aria-expanded={bubble?.index === index}
                onClick={(event) => {
                  onSelectMark(index)
                  openBubbleAt(index, event.currentTarget)
                }}
                onKeyDown={(event) => handleMarkKeyDown(event, index, 'marker')}
              >
                {index + 1}
              </button>
            </div>
          ))}
        </div>
        <figcaption>
          <span>
            Реальный интерфейс · демонстрационные записи · {theme === 'dark' ? 'тёмное' : 'светлое'}{' '}
            оформление
          </span>
          <button type="button" onClick={onOpenZoom}>
            <ZoomIn size={15} aria-hidden="true" />
            Открыть снимок крупнее
          </button>
        </figcaption>
      </figure>
      <ol className="guide-instructions">
        {scene.instructions.map((text, index) => {
          const markLabel = capture.marks[index]?.label
          return (
            <li className={markIndex === index ? 'selected' : ''} key={text}>
              <button
                ref={(node) => {
                  instructionRefs.current[index] = node
                }}
                type="button"
                aria-label={
                  markLabel
                    ? 'Пояснение ' + (index + 1) + ': ' + markLabel
                    : 'Пояснение ' + (index + 1)
                }
                aria-pressed={markIndex === index}
                onClick={() => {
                  onSelectMark(index)
                  setBubble(null)
                }}
                onKeyDown={(event) => handleMarkKeyDown(event, index, 'instruction')}
              >
                {index + 1}
              </button>
              <p>
                <strong>{markLabel}</strong>
                {text}
              </p>
            </li>
          )
        })}
      </ol>
      {bubble &&
        createPortal(
          <aside
            ref={bubbleRef}
            className="guide-bubble"
            style={{ left: bubble.left, top: bubble.top }}
            role="status"
          >
            <button
              type="button"
              className="icon-button"
              aria-label="Закрыть пояснение"
              onClick={() => setBubble(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
            <strong>
              {bubble.index + 1}. {capture.marks[bubble.index]?.label}
            </strong>
            <p>{scene.instructions[bubble.index]}</p>
          </aside>,
          document.body,
        )}
    </>
  )
}
