import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../state/api'

export type ProxyTestOutcome = { ok: true; latencyMs: number } | { ok: false; error: string }

export const PROXY_VALIDATION_ERROR =
  'Укажите HTTP или SOCKS5 адрес прокси без логина, пароля и пути.'

const ALLOWED_PROXY_PROTOCOLS = new Set(['http:', 'https:', 'socks5:', 'socks5h:'])
const MAX_PROXY_LENGTH = 1000

/** Mirrors shared `proxySchema` rules without importing Zod into the renderer bundle. */
export function validateProxyUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_PROXY_LENGTH) return PROXY_VALIDATION_ERROR
  try {
    const url = new URL(trimmed)
    const valid =
      ALLOWED_PROXY_PROTOCOLS.has(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      (!url.pathname || url.pathname === '/') &&
      !url.search &&
      !url.hash
    return valid ? null : PROXY_VALIDATION_ERROR
  } catch {
    return PROXY_VALIDATION_ERROR
  }
}

export function useProxyTester(target: 'spotify' | 'vk') {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ProxyTestOutcome | null>(null)
  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const clearResult = useCallback(() => {
    requestIdRef.current += 1
    setResult(null)
  }, [])

  const testProxy = useCallback(
    async (rawProxyUrl: string) => {
      const trimmed = rawProxyUrl.trim()
      const validationError = validateProxyUrl(trimmed)
      if (validationError) {
        setResult({ ok: false, error: validationError })
        return
      }
      const requestId = ++requestIdRef.current
      setTesting(true)
      setResult(null)
      try {
        const response = await api.testProxy(trimmed, target)
        if (!mountedRef.current || requestId !== requestIdRef.current) return
        if (response.ok) {
          setResult(
            response.value.ok
              ? { ok: true, latencyMs: response.value.latencyMs }
              : { ok: false, error: response.value.error },
          )
        } else {
          setResult({ ok: false, error: response.error })
        }
      } catch (error) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return
        setResult({
          ok: false,
          error: error instanceof Error ? error.message : 'Ошибка проверки',
        })
      } finally {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setTesting(false)
        }
      }
    },
    [target],
  )

  return { testing, result, testProxy, clearResult }
}
