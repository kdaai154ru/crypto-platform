// tests/e2e/layout-persist.spec.ts
import { test, expect } from '@playwright/test'

test('layout persists across page reload', async ({ page }) => {
  await page.goto('/')
  // Wait for layout to load from IndexedDB
  await page.waitForSelector('.widget-container', { timeout: 5000 })
  const widgetCount = await page.locator('.widget-container').count()

  await page.reload()
  await page.waitForSelector('.widget-container', { timeout: 5000 })
  const widgetCountAfter = await page.locator('.widget-container').count()

  expect(widgetCountAfter).toBe(widgetCount)
})
