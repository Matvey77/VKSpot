import { expect, type Page } from '@playwright/test'

export async function openLibrary(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Коллекции', exact: true }).click()
  const state = await page.evaluate(() => window.vkspot.state())
  if (!state.ok) throw new Error(state.error)
  if (state.value.collections.length) {
    await page
      .locator('.collection-card')
      .first()
      .getByRole('button', { name: 'Открыть', exact: true })
      .click()
    await expect(page.getByRole('table')).toBeVisible()
  }
}

export async function confirmMatches(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Выделить совпадения/ }).click()
  await page.getByRole('button', { name: /Подтвердить выбранные/ }).click()
}
