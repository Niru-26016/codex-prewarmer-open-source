import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const password = 'fake-dashboard-password-e2e-only';
async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Dashboard password').fill(password);
  await page.getByRole('button', { name: 'Unlock dashboard' }).click();
  await expect(page.getByRole('heading', { name: /Good to have/ })).toBeVisible();
}
async function navigate(page, name) {
  await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
}

test('complete phone flow: schedule CRUD, mock run, history, reconnect screen and logout', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await navigate(page, 'Schedules');
  await page
    .getByRole('button', { name: /New alarm|Add your first alarm/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Alarm name').fill('E2E morning');
  await dialog.getByRole('button', { name: 'Weekdays', exact: true }).click();
  await dialog.getByLabel('Trigger time').fill('04:00');
  await dialog.getByRole('button', { name: 'Save schedule' }).click();
  const card = page.locator('.schedule-card').filter({ hasText: 'E2E morning' });
  await expect(card).toContainText('4:00 AM');
  await card.getByRole('checkbox').uncheck();
  await expect(card).toContainText('Paused');
  await card.getByRole('checkbox').check();
  await expect(card).toContainText('Next:');
  await card.getByRole('button', { name: 'Edit E2E morning' }).click();
  await page.getByLabel('Alarm name').fill('E2E edited');
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Good to have/ })).toBeVisible();
  await expect(page.locator('.compact-row').filter({ hasText: 'E2E edited' })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-overview.png`, fullPage: true });
  await page.getByRole('button', { name: 'Run now', exact: true }).click();
  await navigate(page, 'History');
  await expect(page.locator('.history-row').first()).toContainText('Successful', {
    timeout: 15000,
  });
  await navigate(page, 'Settings');
  await expect(page.getByText(/Connection locked:/)).toBeVisible();
  await page.getByRole('button', { name: 'Install on your phone' }).click();
  await expect(page.getByText(/On Android, open this app/)).toBeVisible();
  await navigate(page, 'Schedules');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete E2E edited' }).click();
  await expect(page.locator('.schedule-card').filter({ hasText: 'E2E edited' })).toHaveCount(0);
  await navigate(page, 'Settings');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByLabel('Dashboard password')).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/${info.project.name}-login.png`, fullPage: true });
});
test('keyboard dialog trapping, accessibility and narrow viewport', async ({ page }, info) => {
  await signIn(page);
  await navigate(page, 'Schedules');
  await page
    .getByRole('button', { name: /New alarm|Add your first alarm/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-schedules.png`,
    fullPage: true,
  });
});
test('offline screen, cached app shell and session expiration recover safely', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
  });
  await context.setOffline(true);
  await expect(page.getByText(/Connection lost. Showing/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offline', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel('Dashboard password')).toBeVisible();
  await context.setOffline(false);
  await page.getByLabel('Dashboard password').fill(password);
  await page.getByRole('button', { name: 'Unlock dashboard' }).click();
  await expect(page.getByRole('heading', { name: /Good to have/ })).toBeVisible();
  const session = await page.evaluate(async () => {
    const r = await fetch('/api/session');
    return r.json();
  });
  await page.evaluate(async (csrf) => {
    await fetch('/api/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf } });
  }, session.csrf);
  await expect(page.getByLabel('Dashboard password')).toBeVisible({ timeout: 7000 });
});

test('login accessibility, install manifest and API cache isolation', async ({ page }) => {
  await page.goto('/');
  const loginAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(loginAudit.violations).toEqual([]);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);
  await signIn(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const urls = await page.evaluate(async () => {
    const result = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      result.push(...(await cache.keys()).map((request) => request.url));
    }
    return result;
  });
  expect(urls.some((url) => new URL(url).pathname.startsWith('/api/'))).toBe(false);
});
