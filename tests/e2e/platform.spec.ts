import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { cleanupTestProfile, createTestProfile, launchTestApp } from './support'

test('desktop integration exposes supported actions and opens Spotify through the system', async () => {
  const directory = await createTestProfile('vkspot-platform-')
  const app = await launchTestApp(directory)
  try {
    const page = await app.firstWindow()
    const platform = await app.evaluate(() => process.platform)
    if (platform === 'linux') {
      expect(await app.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false)
    }
    expect(await page.evaluate(() => window.vkspot.canInspectSpotify)).toBe(platform === 'win32')
    await page.getByRole('button', { name: 'Подключения', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Открыть Spotify', exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Проверить доступность управления', exact: true }),
    ).toHaveCount(platform === 'win32' ? 1 : 0)
    await mkdir('.local/evidence/e2e', { recursive: true })
    await page.screenshot({ path: `.local/evidence/e2e/platform-${platform}.png` })
    await app.evaluate(({ shell }) => {
      shell.openExternal = async (url: string) => {
        if (url !== 'spotify:') throw new Error('Unexpected URL')
      }
    })
    const result = await page.evaluate(() => window.vkspot.helper('open-spotify'))
    expect(result.ok).toBe(true)
  } finally {
    await app.close()
    await cleanupTestProfile(directory, 'vkspot-platform-')
  }
})
