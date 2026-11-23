import { session, type Session } from 'electron'
import { z } from 'zod'
import { proxySchema } from '../../shared/model'
import { humanizeNetworkError } from '../../shared/ru'

const PROXY_BYPASS_RULES = '<local>,127.0.0.1,localhost'
const TEST_PROXY_PARTITION = 'vkspot-proxy-test'
let proxyTestQueue: Promise<void> = Promise.resolve()

function fixedProxyConfig(proxy: string): Electron.ProxyConfig {
  const url = new URL(proxy)
  const protocol = url.protocol === 'socks5h:' ? 'socks5:' : url.protocol
  return {
    mode: 'fixed_servers',
    proxyRules: `${protocol}//${url.host}`,
    proxyBypassRules: PROXY_BYPASS_RULES,
  }
}

async function applyProxy(
  network: Session,
  proxy: string,
  emptyMode: 'system' | 'direct',
): Promise<void> {
  const validated = proxySchema.parse(proxy)
  await network.setProxy(validated ? fixedProxyConfig(validated) : { mode: emptyMode })
}

async function withProxyTestLock<T>(action: () => Promise<T>): Promise<T> {
  const previous = proxyTestQueue
  let release!: () => void
  proxyTestQueue = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await action()
  } finally {
    release()
  }
}

export async function configureSpotifyNetwork(proxy: string): Promise<void> {
  const networks = [
    session.defaultSession,
    session.fromPartition('vkspot-spotify-api'),
    session.fromPartition('persist:vkspot-spotify-browser'),
  ]
  for (const network of networks) {
    await applyProxy(network, proxy, 'system')
    await network.closeAllConnections()
  }
}

export async function configureVKNetwork(useProxy: boolean, proxy: string): Promise<void> {
  const vkSession = session.fromPartition('persist:vkspot-vk')
  if (!useProxy) {
    await vkSession.setProxy({ mode: 'direct' })
  } else {
    await applyProxy(vkSession, proxy, 'system')
  }
  await vkSession.closeAllConnections()
}

export async function testProxy(
  proxyUrl: unknown,
  target: unknown,
): Promise<{ ok: true; latencyMs: number; status: number } | { ok: false; error: string }> {
  const pUrl = proxySchema.parse(proxyUrl)
  const pTarget = z.enum(['spotify', 'vk']).default('spotify').parse(target)

  return withProxyTestLock(async () => {
    const testSession = session.fromPartition(TEST_PROXY_PARTITION)
    let timedOut = false
    try {
      await applyProxy(testSession, pUrl, 'direct')
      const testUrl = pTarget === 'vk' ? 'https://vk.com/favicon.ico' : 'https://open.spotify.com'
      const start = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, 8000)
      try {
        const response = await testSession.fetch(testUrl, {
          method: 'HEAD',
          signal: controller.signal,
        })
        const latencyMs = Date.now() - start
        return { ok: true, latencyMs, status: response.status }
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      if (timedOut) return { ok: false, error: humanizeNetworkError('ERR_TIMED_OUT') }
      const direct = humanizeNetworkError(err, '')
      if (direct) return { ok: false, error: direct }
      const cause = err instanceof Error ? err.cause : undefined
      if (cause instanceof Error) {
        const causeCode = (cause as NodeJS.ErrnoException).code
        const translated = humanizeNetworkError(
          causeCode ? `${cause.message} ${causeCode}` : cause,
          '',
        )
        if (translated) return { ok: false, error: translated }
      }
      if (err instanceof Error && err.name) {
        return { ok: false, error: humanizeNetworkError(err.name) }
      }
      return { ok: false, error: humanizeNetworkError(err) }
    } finally {
      await testSession.closeAllConnections().catch(() => {})
    }
  })
}
