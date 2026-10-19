'use strict';
const { test, expect } = require('@playwright/test');

test('pentest: a hostile cross-origin frame cannot expose the login or ordering interface', async ({ page }) => {
  const calls = [];
  // Two actual loopback servers use distinct ports/origins, preserving Chrome's
  // local-network protections while isolating the cross-origin frame behavior.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http://127.0.0.1:4173', 'http://127.0.0.1:4174'].includes(url.origin)) return route.continue();
    calls.push(url.origin); return route.abort();
  });
  await page.goto('http://127.0.0.1:4174/');
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: '請在獨立分頁開啟午餐系統' })).toBeVisible();
  await expect(frame.locator('#loginForm')).toHaveCount(0);
  await expect(frame.locator('#app')).toHaveCount(0);
  const link = frame.getByRole('link', { name: '在獨立分頁開啟系統' });
  await expect(link).toHaveAttribute('href', 'http://127.0.0.1:4173/');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(calls).toEqual([]);
});
