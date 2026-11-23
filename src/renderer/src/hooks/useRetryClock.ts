import { useEffect, useRef, useState } from 'react'

// UI-only clock: no polling of Spotify or the database while waiting.
export default function useRetryClock(deadline: number): number {
  const [now, setNow] = useState(Date.now)
  const nowRef = useRef(now)
  nowRef.current = now

  useEffect(() => {
    const current = Date.now()
    if (Math.abs(current - nowRef.current) >= 500) setNow(current)
    if (deadline <= current) return
    const update = () => setNow(Date.now())
    const timer = window.setInterval(() => {
      update()
      if (Date.now() >= deadline) window.clearInterval(timer)
    }, 1000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [deadline])

  return now
}
