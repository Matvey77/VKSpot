import { test, expect } from '@playwright/test'
import { cleanupTestProfile, createTestProfile, launchTestApp } from './support'

test('Spotify profile denial stays disconnected; saved proxy retries the existing session', async () => {
  const directory = await createTestProfile('vkspot-spotify-e2e-')
  const app = await launchTestApp(directory)
  try {
    const page = await app.firstWindow()
    await app.evaluate(async ({ session, shell }) => {
      Reflect.set(globalThis, '__VKSPOT_TEST_DENIED__', true)
      await session.fromPartition('vkspot-spotify-api').protocol.handle('https', (request) => {
        const url = new URL(request.url)
        if (url.hostname === 'accounts.spotify.com' && url.pathname === '/api/token')
          return Response.json({
            access_token: 'synthetic-access',
            refresh_token: 'synthetic-refresh',
            expires_in: 3600,
          })
        if (url.hostname === 'api.spotify.com' && url.pathname === '/v1/me')
          return Reflect.get(globalThis, '__VKSPOT_TEST_DENIED__')
            ? Response.json(
                { error: { status: 403, message: 'Spotify is unavailable in this country' } },
                { status: 403 },
              )
            : Response.json({ id: 'synthetic-user', display_name: 'Test listener' })
        return new Response('', { status: 404 })
      })
      shell.openExternal = async (address) => {
        const url = new URL(address)
        await fetch(
          'http://127.0.0.1:43823/callback?' +
            new URLSearchParams({
              code: 'synthetic-code',
              state: url.searchParams.get('state')!,
            }),
        )
      }
    })
    await page.getByRole('button', { name: 'Подключения', exact: true }).click()
    await page.getByText('Spotify API — подключение для переноса', { exact: true }).click()
    await page.getByLabel('Client ID', { exact: true }).fill('a'.repeat(32))
    await page.getByRole('button', { name: 'Сохранить настройки Spotify' }).click()
    await page.getByRole('button', { name: 'Войти в Spotify', exact: true }).click()
    await expect(
      page.getByText('Spotify недоступен из страны этого подключения.', { exact: false }),
    ).toBeVisible()
    let state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.spotify.connected).toBe(false)
    await expect(page.getByRole('button', { name: 'Войти в Spotify', exact: true })).toBeEnabled()
    await app.evaluate(() => Reflect.set(globalThis, '__VKSPOT_TEST_DENIED__', false))
    await page
      .getByLabel('Прокси Spotify (необязательно)', { exact: true })
      .fill('http://127.0.0.1:2080')
    await expect(page.getByRole('button', { name: 'Войти в Spotify', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Сохранить настройки Spotify' }).click()
    await expect(page.getByRole('button', { name: 'Отключить Spotify', exact: true })).toBeEnabled()
    state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.spotify.connected).toBe(true)
    expect(state.value.settings.spotifyProxy).toBe('http://127.0.0.1:2080')
    expect(
      await app.evaluate(({ session }) =>
        session.fromPartition('vkspot-spotify-api').resolveProxy('https://api.spotify.com/v1/me'),
      ),
    ).toBe('PROXY 127.0.0.1:2080')
    await page.screenshot({ path: '.local/evidence/e2e/spotify-proxy-desktop.png' })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760))
    await page.screenshot({ path: '.local/evidence/e2e/spotify-proxy-compact.png' })
  } finally {
    await app.close()
    await cleanupTestProfile(directory, 'vkspot-spotify-e2e-')
  }
})
