'use strict';
const { test, expect } = require('@playwright/test');
const { fixture } = require('./fixture');

test('assessment: stored order and account markup stays literal in an actual browser', async ({ page }) => {
  const model = await fixture(page);
  const payload = '<img src=x onerror=window.assessmentXss=1>';
  model.orders[0].items[0].name = payload;
  model.users.push({ id: 100, username: payload, role: 'user', status: 'active' });
  await page.locator('#refreshAllSeats').click();
  await expect(page.locator('#seat-card-1')).toContainText(payload);
  await expect(page.locator('#seat-card-1 img')).toHaveCount(0);
  await page.locator('#tabUsers').click();
  await page.locator('#refreshUsers').click();
  await page.locator('#userSearch').fill(payload);
  await expect(page.locator('#usersTableBody')).toContainText(payload);
  await expect(page.locator('#usersTableBody img')).toHaveCount(0);
  expect(await page.evaluate(() => window.assessmentXss)).toBeUndefined();
});

test('pentest: a hostile cross-origin frame cannot expose the login or ordering interface', async ({ page }) => {
  const calls = [];
  // Two actual loopback servers use distinct ports/origins, preserving Chrome's
  // local-network protections while isolating the cross-origin frame behavior.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['https://127.0.0.1:4173', 'https://127.0.0.1:4174'].includes(url.origin)) return route.continue();
    calls.push(url.origin); return route.abort();
  });
  await page.goto('https://127.0.0.1:4174/');
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: '請在獨立分頁開啟午餐系統' })).toBeVisible();
  await expect(frame.locator('#loginForm')).toHaveCount(0);
  await expect(frame.locator('#app')).toHaveCount(0);
  const link = frame.getByRole('link', { name: '在獨立分頁開啟系統' });
  await expect(link).toHaveAttribute('href', 'https://127.0.0.1:4173/');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(calls).toEqual([]);
});


test('maintenance: actual Express CSP allows existing ordering UI and blocks cross-origin framing', async ({ page, request }) => {
  const response = await request.get('https://127.0.0.1:4175/');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['x-frame-options']).toBe('DENY');
  await fixture(page, 'https://127.0.0.1:4175');
  await expect(page.locator('#allSeatsGrid .seat-card')).toHaveCount(36);
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const loadedScripts = [];
  page.on('request', req => { if (new URL(req.url()).pathname === '/app.js') loadedScripts.push(req.url()); });
  await page.unroute('**/*');
  await page.goto('https://127.0.0.1:4174/secure', { waitUntil:'domcontentloaded' });
  await expect.poll(() => errors.join(' ')).toMatch(/frame-ancestors|X-Frame-Options|refused to frame/i);
  // Firefox intentionally has no execution context for a CSP-blocked frame.
  // Inspecting its DOM can hang; assert the browser denial and no app loading.
  expect(loadedScripts).toEqual([]);
});
