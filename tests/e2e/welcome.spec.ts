import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

async function cleanup(directory: string): Promise<void> {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('vkspot-welcome-'))
    throw new Error('Unsafe test cleanup target')
  await rm(target, { recursive: true, force: true })
}

test('welcome is the first view, explains the flow and links to working sections', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-welcome-'))
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    VKSPOT_DATA_DIR: directory,
    VKSPOT_BACKGROUND_TEST: '1',
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    executablePath: process.env.VKSPOT_TEST_EXECUTABLE,
    args: process.env.VKSPOT_TEST_EXECUTABLE ? [] : ['.'],
    env,
  })
  try {
    const page = await app.firstWindow()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: 'Нужна помощь? Открыть инструкцию' }).click()
    await expect(
      page.getByRole('heading', { name: 'Добро пожаловать в VKSpot', exact: true }),
    ).toBeVisible()
    await expect(page.locator('nav button').first()).toHaveText('Начало')
    await expect(page.getByRole('heading', { name: 'Как это работает', exact: true })).toBeVisible()
    await expect(page.locator('.welcome-steps > li')).toHaveCount(6)
    await expect(page.locator('.guide-canvas > img')).toHaveCount(1)
    await expect
      .poll(() =>
        page
          .locator('.guide-canvas > img')
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(1000)
    await expect(page.locator('.brand-mark [data-brand="vkspot"]')).toBeVisible()
    await page.screenshot({ path: '.local/evidence/e2e/welcome-desktop.png' })
    await page.getByRole('link', { name: 'Посмотреть все шаги' }).click()
    await expect(
      page.getByRole('heading', { name: 'Твой маршрут — прямо по интерфейсу', exact: true }),
    ).toBeInViewport()
    await expect
      .poll(() => page.locator('.welcome-page').evaluate((element) => element.scrollTop))
      .toBeGreaterThan(400)
    await page.screenshot({ path: '.local/evidence/e2e/welcome-roadmap.png' })
    await page.locator('.guide-marker').first().click()
    await expect(page.locator('.guide-bubble')).toContainText('Подключения')
    await page.screenshot({ path: '.local/evidence/e2e/welcome-callout.png' })
    await page.getByRole('button', { name: 'Закрыть пояснение', exact: true }).click()
    for (let index = 0; index < 6; index++) {
      await page.locator('.route-tabs button').nth(index).click()
      const sceneButtons = page.locator('.guide-scenes button')
      const scenes = await sceneButtons.count()
      for (let scene = 0; scene < Math.max(1, scenes); scene++) {
        if (scenes) await sceneButtons.nth(scene).click()
        await expect
          .poll(() =>
            page
              .locator('.guide-canvas > img')
              .evaluate((image) => (image as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(1000)
        await expect(page.locator('.guide-marker').first()).toBeVisible()
        if (index === 3 && scene === 1) {
          await expect(
            page.getByRole('button', { name: 'Пояснение 1: Фоновый поиск', exact: true }),
          ).toBeVisible()
          await page
            .getByRole('button', { name: 'Пояснение 1: Фоновый поиск', exact: true })
            .click()
          await expect(page.locator('.guide-bubble')).toContainText('Автопродолжение')
          await page.getByRole('button', { name: 'Закрыть пояснение', exact: true }).click()
          await page.screenshot({ path: '.local/evidence/e2e/welcome-search-guide.png' })
        }
      }
    }
    await page.getByRole('button', { name: 'Открыть снимок крупнее', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog').locator('img')).toBeVisible()
    await page.getByRole('button', { name: 'Закрыть снимок', exact: true }).click()
    await page.locator('.route-tabs button').nth(1).click()
    await page.getByRole('button', { name: 'Открыть архив и экспорт', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Архив и экспорт', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Начало', exact: true }).click()
    await page.getByRole('button', { name: 'Нужна помощь? Открыть инструкцию' }).click()
    await page.getByRole('button', { name: 'Начать с VK', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'VK Музыка', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Начало', exact: true }).click()
    await page.getByRole('button', { name: 'Нужна помощь? Открыть инструкцию' }).click()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760))
    await page.screenshot({ path: '.local/evidence/e2e/welcome-compact.png' })
    await page.getByRole('link', { name: 'Посмотреть все шаги' }).click()
    await page.screenshot({ path: '.local/evidence/e2e/welcome-guide-compact.png' })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (state.ok) await window.vkspot.saveSettings({ ...state.value.settings, theme: 'dark' })
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.guide-capture figcaption')).toContainText('тёмное оформление')
    await page.screenshot({ path: '.local/evidence/e2e/welcome-dark.png' })
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Guide navigation fixture',
        origin: 'Synthetic test',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ artist: 'Artist', title: 'Song' }],
      } as never),
    )
    await page.locator('.route-tabs button').nth(2).click()
    await page
      .locator('.guide-step-heading')
      .getByRole('button', { name: 'Открыть коллекцию', exact: true })
      .click()
    await expect(page.getByRole('tabpanel', { name: 'Таблица', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Начало', exact: true }).click()
    await page.getByRole('button', { name: 'Нужна помощь? Открыть инструкцию' }).click()
    await page.locator('.route-tabs button').nth(3).click()
    await page.getByRole('button', { name: 'Фоновый поиск', exact: true }).click()
    await page.getByRole('button', { name: 'Открыть фоновый поиск', exact: true }).click()
    await expect(page.getByRole('tabpanel', { name: 'Таблица', exact: true })).toBeVisible()
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
