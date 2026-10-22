import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { openLibrary } from './navigation'

async function cleanup(directory: string): Promise<void> {
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('vkspot-range-')
  )
    throw new Error('Unsafe cleanup target')
  await rm(directory, { recursive: true, force: true })
}

test('Shift selects and deselects filtered ranges across virtual rows without changing tracks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-range-'))
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
    const original = await page.evaluate(async () => {
      const imported = await window.vkspot.importCollection({
        name: 'Range selection fixture',
        origin: 'Synthetic',
        completeness: { expected: 300, status: 'verified-count', message: 'Test only' },
        tracks: Array.from({ length: 300 }, (_, index) => ({
          artist: index % 2 ? 'Group Even' : 'Group Odd',
          title: `Track ${String(index + 1).padStart(3, '0')}`,
          duration: 180,
        })),
      } as never)
      if (!imported.ok) throw new Error(imported.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      return state.value.collections[0]
    })
    await openLibrary(page)
    const checkbox = (position: number) =>
      page.getByRole('checkbox', { name: `Выбрать запись ${position}`, exact: true })
    const row = (position: number) =>
      page.getByRole('row', {
        name: `Запись ${position}: Track ${String(position).padStart(3, '0')}`,
        exact: true,
      })
    const selection = page.locator('.selection-bar')
    await checkbox(1).check()
    await row(5).click({ modifiers: ['Shift'] })
    await expect(row(5)).toBeFocused()
    await expect(selection).toContainText('Выбрано 5')
    for (const position of [1, 2, 3, 4, 5]) await expect(checkbox(position)).toBeChecked()
    await expect(page.locator('.inspector')).toHaveCount(0)
    await checkbox(3).click({ modifiers: ['Shift'] })
    await expect(selection).toContainText('Выбрано 2')
    for (const position of [1, 2, 3]) await expect(checkbox(position)).not.toBeChecked()
    await row(8).click({ modifiers: ['Shift'] })
    await expect(selection).toContainText('Выбрано 8')
    await checkbox(12).check()
    await row(10).click({ modifiers: ['Shift'] })
    await expect(selection).toContainText('Выбрано 11')
    await expect(checkbox(9)).not.toBeChecked()
    await mkdir('.local/evidence/selection', { recursive: true })
    await page.screenshot({ path: '.local/evidence/selection/shift-range.png' })

    await page.getByRole('button', { name: 'Снять выделение', exact: true }).click()
    await checkbox(1).check()
    await page.locator('.table-scroll').evaluate((element) => {
      element.scrollTop = 190 * 60
    })
    await checkbox(200).click({ modifiers: ['Shift'] })
    await expect(selection).toContainText('Выбрано 200')
    expect(await page.locator('.table-row').count()).toBeLessThan(80)
    await page.locator('.table-scroll').evaluate((element) => {
      element.scrollTop = 95 * 60
    })
    await expect(checkbox(100)).toBeChecked()
    await page.locator('.table-scroll').evaluate((element) => {
      element.scrollTop = 0
    })
    await expect(checkbox(1)).toBeChecked()
    await page.getByRole('button', { name: 'Снять выделение', exact: true }).click()
    await checkbox(1).check()
    await page.getByLabel('Найти запись', { exact: true }).fill('Group Even')
    await expect(page.locator('.table-panel')).toHaveAttribute('aria-rowcount', '151')
    await checkbox(2).check()
    await row(8).click({ modifiers: ['Shift'] })
    await expect(selection).toContainText('Выбрано 5')
    await expect(selection).toContainText('вне выборки 1')
    await page.getByLabel('Найти запись', { exact: true }).fill('')
    for (const position of [1, 2, 4, 6, 8]) await expect(checkbox(position)).toBeChecked()
    for (const position of [3, 5, 7]) await expect(checkbox(position)).not.toBeChecked()
    await page.getByRole('button', { name: 'Снять выделение', exact: true }).click()
    await page.getByLabel('Найти запись', { exact: true }).fill('Group Odd')
    await expect(page.locator('.table-panel')).toHaveAttribute('aria-rowcount', '151')
    await checkbox(3).click({ modifiers: ['Shift'] })
    await expect(selection).toContainText('Выбрано 1')
    await row(7).focus()
    await page.keyboard.press('Shift+Space')
    await expect(selection).toContainText('Выбрано 3')
    await expect(checkbox(5)).toBeChecked()
    await expect(page.locator('.inspector')).toHaveCount(0)
    await page.getByRole('button', { name: 'Снять выделение', exact: true }).click()
    await checkbox(3).focus()
    await page.keyboard.press('Space')
    await checkbox(7).focus()
    await page.keyboard.press('Shift+Space')
    await expect(selection).toContainText('Выбрано 3')
    await expect(checkbox(5)).toBeChecked()
    await row(7).click()
    await expect(page.locator('.inspector-track-heading')).toContainText('Track 007')
    await expect(selection).toContainText('Выбрано 3')
    const final = await page.evaluate(() => window.vkspot.state())
    if (!final.ok) throw new Error(final.error)
    expect(final.value.collections[0]).toEqual(original)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
