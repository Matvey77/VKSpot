import { useEffect, useState } from 'react'

// UI-only clock: no polling of Spotify or the database while waiting.
export default function useRetryClock(deadline: number): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    setNow(Date.now())
    if (deadline <= Date.now()) return
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
