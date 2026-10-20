import { session } from 'electron'

export async function configureSpotifyNetwork(proxy: string): Promise<void> {
  const networks = [
    session.defaultSession,
    session.fromPartition('vkspot-spotify-api'),
    session.fromPartition('persist:vkspot-spotify-browser'),
  ]
  for (const network of networks) {
    if (proxy) {
      const url = new URL(proxy)
      const protocol = url.protocol === 'socks5h:' ? 'socks5:' : url.protocol
      await network.setProxy({
        mode: 'fixed_servers',
        proxyRules: `${protocol}//${url.host}`,
        proxyBypassRules: '<local>,127.0.0.1,localhost',
      })
    } else {
      await network.setProxy({ mode: 'system' })
    }
    await network.closeAllConnections()
  }
}

export async function configureVKNetwork(useProxy: boolean, proxy: string): Promise<void> {
  const vkSession = session.fromPartition('persist:vkspot-vk')
  if (!useProxy) {
    await vkSession.setProxy({ mode: 'direct' })
  } else if (proxy) {
    const url = new URL(proxy)
    const protocol = url.protocol === 'socks5h:' ? 'socks5:' : url.protocol
    await vkSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: `${protocol}//${url.host}`,
      proxyBypassRules: '<local>,127.0.0.1,localhost',
    })
  } else {
    await vkSession.setProxy({ mode: 'system' })
  }
  await vkSession.closeAllConnections()
}

export async function testProxy(
  proxyUrl: unknown,
  target: unknown,
): Promise<{ ok: true; latencyMs: number; status: number } | { ok: false; error: string }> {
  const pUrl = typeof proxyUrl === 'string' ? proxyUrl.trim() : ''
  const pTarget = target === 'vk' ? 'vk' : 'spotify'
  const testSession = session.fromPartition('in-memory:test-proxy-' + Date.now())
  try {
    if (pUrl) {
      const url = new URL(pUrl)
      const protocol = url.protocol === 'socks5h:' ? 'socks5:' : url.protocol
      await testSession.setProxy({
        mode: 'fixed_servers',
        proxyRules: `${protocol}//${url.host}`,
      })
    } else {
      await testSession.setProxy({ mode: 'direct' })
    }
    const testUrl = pTarget === 'vk' ? 'https://vk.com/favicon.ico' : 'https://open.spotify.com'
    const start = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
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
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    await testSession.closeAllConnections()
  }
}
