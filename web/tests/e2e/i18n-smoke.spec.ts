import { test, expect } from '@playwright/test';

test.describe('i18n smoke — locale provider renders', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('page loads with English and switches to German via localStorage', async ({ page }) => {
    // Clear any persisted locale
    await page.context().clearCookies();

    await page.goto('http://localhost:3000');

    // Wait for the app shell to mount (dynamic import + GSDAppShell)
    // The first visible marker is the mobile nav toggle in WorkspaceChrome
    await expect(page.locator('[data-testid="mobile-nav-toggle"]')).toBeVisible({ timeout: 15000 });

    // Phase 1: Verify English — the loading toast says "Connecting to workspace…"
    await expect(page.getByText('Connecting to workspace')).toBeVisible({ timeout: 10000 });

    // Phase 2: Switch to German via localStorage + reload
    await page.evaluate(() => localStorage.setItem('gsd:locale', 'de'));
    await page.reload();
    await expect(page.locator('[data-testid="mobile-nav-toggle"]')).toBeVisible({ timeout: 15000 });

    // Phase 3: After German reload the toast should say "Verbinde mit Workspace…"
    await expect(page.getByText('Verbinde mit Workspace')).toBeVisible({ timeout: 10000 });
  });

  test('locale persists across page navigations', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('gsd:locale', 'de'));
    await page.goto('http://localhost:3000');
    await expect(page.locator('[data-testid="mobile-nav-toggle"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Verbinde mit Workspace')).toBeVisible({ timeout: 10000 });

    // Second reload — should still be German
    await page.reload();
    await expect(page.locator('[data-testid="mobile-nav-toggle"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Verbinde mit Workspace')).toBeVisible({ timeout: 10000 });
  });
});
