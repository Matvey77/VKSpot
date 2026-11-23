import { expect, test } from '@playwright/test'
import { getAppState, installSpotifyApiMock } from './mocks'
import { setWindowContentSize, withTestApp } from './support'

test('Spotify profile denial stays disconnected; saved proxy retries the existing session', async () => {
  await withTestApp('vkspot-spotify-e2e-', async ({ app }) => {
    const page = await app.firstWindow()
    await app.evaluate(() => Reflect.set(globalThis, '__VKSPOT_TEST_DENIED__', true))
    await installSpotifyApiMock(app, {
      displayName: 'Test listener',
      denyGlobal: '__VKSPOT_TEST_DENIED__',
    })
    await page.getByRole('button', { name: 'Подключения', exact: true }).click()
    await page.getByText('Spotify API — подключение для переноса', { exact: true }).click()
    await page.getByLabel('Client ID', { exact: true }).fill('a'.repeat(32))
    await page.getByRole('button', { name: 'Сохранить настройки Spotify' }).click()
    await page.getByRole('button', { name: 'Войти в Spotify', exact: true }).click()
    await expect(
      page.getByText('Spotify недоступен из страны этого подключения.', { exact: false }),
    ).toBeVisible()
    let state = await getAppState(page)
    expect(state.spotify.connected).toBe(false)
    await expect(page.getByRole('button', { name: 'Войти в Spotify', exact: true })).toBeEnabled()
    await app.evaluate(() => Reflect.set(globalThis, '__VKSPOT_TEST_DENIED__', false))
    await page
      .getByLabel('Прокси Spotify (необязательно)', { exact: true })
      .fill('http://127.0.0.1:2080')
    await expect(page.getByRole('button', { name: 'Войти в Spotify', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Сохранить настройки Spotify' }).click()
    await expect(page.getByRole('button', { name: 'Отключить Spotify', exact: true })).toBeEnabled()
    state = await getAppState(page)
    expect(state.spotify.connected).toBe(true)
    expect(state.settings.spotifyProxy).toBe('http://127.0.0.1:2080')
    expect(
      await app.evaluate(({ session }) =>
        session.fromPartition('vkspot-spotify-api').resolveProxy('https://api.spotify.com/v1/me'),
      ),
    ).toBe('PROXY 127.0.0.1:2080')
    await page.screenshot({ path: '.local/evidence/e2e/spotify-proxy-desktop.png' })
    await setWindowContentSize(app, 1000, 760)
    await page.screenshot({ path: '.local/evidence/e2e/spotify-proxy-compact.png' })
  })
})
