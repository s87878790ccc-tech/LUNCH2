'use strict';
const { test, expect } = require('@playwright/test');

test('pentest: a hostile cross-origin frame cannot expose the login or ordering interface', async ({ page }) => {
  const calls = [];
  // Both origins are loopback, with distinct hostnames. This models two public
  // origins without Chrome's unrelated public-to-local network restriction.
  // The hostile document and every external request are synthetic/intercepted.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    if (url.origin === 'http://localhost:4173')
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated frame test</title><iframe title="embedded lunch" src="http://127.0.0.1:4173/" width="380" height="800"></iframe>' });
    calls.push(url.origin); return route.abort();
  });
  await page.goto('http://localhost:4173/');
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: '請在獨立分頁開啟午餐系統' })).toBeVisible();
  await expect(frame.locator('#loginForm')).toHaveCount(0);
  await expect(frame.locator('#app')).toHaveCount(0);
  const link = frame.getByRole('link', { name: '在獨立分頁開啟系統' });
  await expect(link).toHaveAttribute('href', 'http://127.0.0.1:4173/');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(calls).toEqual([]);
});
