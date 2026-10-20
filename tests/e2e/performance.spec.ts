import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { openLibrary } from './navigation'

async function cleanup(directory: string): Promise<void> {
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('vkspot-performance-')
  )
    throw new Error('Unsafe cleanup')
  await rm(directory, { recursive: true, force: true })
}

test('large library updates use bounded deltas and resizing keeps the table virtual', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-performance-'))
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
    const fixture = await page.evaluate(async () => {
      const imported = await window.vkspot.importCollection({
        name: 'Delta fixture',
        origin: 'Synthetic test',
        completeness: { expected: 9000, status: 'verified-count', message: 'Test only' },
        tracks: Array.from({ length: 9000 }, (_, index) => ({
          artist: 'Artist',
          title: `Song ${index + 1}`,
          rawText: 'Synthetic evidence. '.repeat(20),
        })),
      } as never)
      if (!imported.ok) throw new Error(imported.error)
      const initial = await window.vkspot.syncState(null)
      if (!initial.ok) throw new Error(initial.error)
      const replacement = initial.value.updates[0]
      if (replacement.kind !== 'replace') throw new Error('Expected initial collection')
      return {
        id: imported.value,
        row: replacement.collection.rows[0].id,
        cursor: initial.value.cursor,
        initialBytes: JSON.stringify(initial.value).length,
      }
    })
    await openLibrary(page)
    // State() remains available for archives/diagnostics, but the renderer must not poll it.
    await app.evaluate(({ ipcMain }) => {
      Reflect.set(globalThis, '__fullStateCalls', 0)
      ipcMain.removeHandler('vkspot:state')
      ipcMain.handle('vkspot:state', () => {
        Reflect.set(globalThis, '__fullStateCalls', Reflect.get(globalThis, '__fullStateCalls') + 1)
        return { ok: false, error: 'Unexpected full-state request' }
      })
    })
    const delta = await page.evaluate(async (fixture) => {
      const saved = await window.vkspot.patchRows(fixture.id, [fixture.row], {
        title: 'Edited immediately',
      })
      if (!saved.ok) throw new Error(saved.error)
      const delta = await window.vkspot.syncState(fixture.cursor)
      if (!delta.ok) throw new Error(delta.error)
      return delta.value
    }, fixture)
    expect(delta.updates).toHaveLength(1)
    expect(delta.updates[0].kind).toBe('patch')
    if (delta.updates[0].kind !== 'patch') throw new Error('Expected row delta')
    expect(delta.updates[0].rows).toHaveLength(1)
    expect(JSON.stringify(delta).length).toBeLessThan(fixture.initialBytes / 100)
    await expect(
      page.getByRole('row', { name: 'Запись 1: Edited immediately', exact: true }),
    ).toBeVisible()
    await page.getByLabel('Найти запись', { exact: true }).fill('Song 8999')
    await expect(
      page.getByRole('row', { name: 'Запись 8999: Song 8999', exact: true }),
    ).toBeVisible()
    await page.getByLabel('Найти запись', { exact: true }).fill('')
    const resize = page.getByRole('separator', { name: 'Ширина столбца: Запись', exact: true })
    await resize.focus()
    const before = Number(await resize.getAttribute('aria-valuenow'))
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(async () => Number(await resize.getAttribute('aria-valuenow')))
      .toBeGreaterThan(before)
    expect(await page.locator('.table-row').count()).toBeLessThan(80)
    await page.getByRole('row', { name: 'Запись 1: Edited immediately', exact: true }).click()
    const inspector = page.locator('.inspector')
    const initialWidth = (await inspector.boundingBox())!.width
    const handle = await page
      .getByRole('separator', { name: 'Ширина инспектора', exact: true })
      .boundingBox()
    if (!handle) throw new Error('Missing inspector resize control')
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x - 40, handle.y + handle.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect
      .poll(async () => (await inspector.boundingBox())!.width)
      .toBeGreaterThan(initialWidth)
    expect(await page.evaluate(() => document.body.style.cursor)).toBe('')
    expect(await app.evaluate(() => Reflect.get(globalThis, '__fullStateCalls'))).toBe(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
