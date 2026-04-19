// tests/e2e/widget-error-overlay.spec.ts
import { test, expect, chromium } from '@playwright/test'

test('widget shows error overlay when module is offline', async ({ page }) => {
  // Intercept WS to inject a system status with offline module
  await page.route('**/api/**', route => route.continue())

  await page.goto('/')
  await page.waitForSelector('.widget-container', { timeout: 5000 })

  // Inject a system status payload with offline exchange-core
  await page.evaluate(() => {
    const event = new MessageEvent('message', {
      data: JSON.stringify({
        channel: 'system:status',
        data: {
          ts: Date.now(),
          modules: [
            { id: 'exchange-core', status: 'offline', lastHeartbeat: 0, restarts: 0, uptimeMs: 0 }
          ],
          exchanges: [],
          activePairs: 0,
          activeClients: 0
        }
      })
    })
    // Dispatch to window so composable can pick it up
    window.dispatchEvent(event)
  })

  // Chart widget depends on exchange-core — should show red dot
  const dot = page.locator('.widget-container .w-2.h-2.rounded-full').first()
  await expect(dot).toHaveClass(/bg-red-500/, { timeout: 2000 })
})
