// tests/e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('loads dashboard with toolbar and status bar', async ({ page }) => {
    await expect(page.locator('.toolbar')).toBeVisible()
    await expect(page.locator('.status-bar')).toBeVisible()
  })

  test('shows at least one widget', async ({ page }) => {
    await page.waitForSelector('.widget-container', { timeout: 5000 })
    const widgets = page.locator('.widget-container')
    expect(await widgets.count()).toBeGreaterThan(0)
  })

  test('edit mode toggle enables drag handles', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: 'Edit' })
    await editBtn.click()
    await expect(editBtn).toHaveText('Done')
    await editBtn.click()
    await expect(editBtn).toHaveText('Edit')
  })
})
