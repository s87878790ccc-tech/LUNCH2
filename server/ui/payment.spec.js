'use strict';
const { test, expect } = require('@playwright/test');

// Only synthetic data is used. Every production API request is intercepted;
// the real Supabase / Render application is never contacted by these tests.
async function fixture(page) {
  const date = '2026-10-19', batch = 'isolated-browser-batch';
  const empty = seat => ({ seat, orderId: seat, version: 0, date, batch, submitted: false, internalOnly: false, paid: false, items: [] });
  const model = { fail: false, writes: 0, orders: Array.from({ length: 36 }, (_, i) => empty(i + 1)) };
  model.orders[0] = { ...empty(1), submitted: true, items: [{ id: 1, name: '測試雞腿飯', unitPrice: 95, qty: 2 }] };
  model.orders[1] = { ...empty(2), submitted: true, paid: true, items: [{ id: 2, name: '測試排骨飯', unitPrice: 100, qty: 1 }] };
  const user = { id: 1, username: 'admin', role: 'admin' };
  const cors = { 'access-control-allow-origin': 'http://127.0.0.1:4173', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    if (url.origin !== 'https://lunch2.onrender.com') return route.abort();
    const method = request.method(), path = url.pathname.replace(/^\/api/, '');
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = request.postData() ? request.postDataJSON() : {};
    let response;
    if (path === '/auth/login') response = { user, token: 'isolated-browser-token' };
    else if (path === '/auth/me') response = { user };
    else if (path === '/auth/logout') response = { ok: true };
    else if (path === '/open-status') response = { open: true };
    else if (path === '/settings/preorder') response = { enabled: true, dates: ['2026-10-20'] };
    else if (path === '/settings/manual-order') response = { locked: false };
    else if (path === '/menus') response = { menus: [{ id: 1, name: '隔離測試菜單', note: '', items: [{ id: 1, code: 1, name: '測試雞腿飯', price: 95 }] }], activeMenuId: 1 };
    else if (path === '/orders') response = { date, batch, orders: model.orders };
    else if (/^\/orders\/\d+(?:\/paid)?$/.test(path)) {
      const seat = Number(path.split('/')[2]), order = model.orders[seat - 1];
      if (method === 'PUT') {
        model.writes++;
        if (model.fail) return route.fulfill({ status: 500, json: { message: '隔離測試：付款儲存失敗' }, headers: cors });
        if (body.version !== order.version || body.orderId !== order.orderId || body.date !== date || body.batch !== batch)
          return route.fulfill({ status: 409, json: { message: '訂單已變更' }, headers: cors });
        order.paid = body.paid; order.version++;
        response = { ok: true, order };
      } else response = order;
    } else if (path === '/reports/aggregate') response = { items: [], classTotal: 290 };
    else if (path === '/reports/missing') response = { missing: [] };
    else if (path === '/reports/unpaid') response = { list: [] };
    else if (path === '/logs') response = { logs: [] };
    else if (path === '/settings/open-window') response = { openDays: [1,2,3,4,5], openStart: '07:00', openEnd: '12:00' };
    else return route.fulfill({ status: 500, json: { message: 'Unmocked isolated route: ' + path }, headers: cors });
    return route.fulfill({ json: structuredClone(response), headers: cors });
  });
  await page.goto('/');
  await page.getByLabel('帳號', { exact: true }).fill('admin');
  await page.getByLabel('密碼', { exact: true }).fill('isolated-browser-password');
  await page.getByRole('button', { name: '登入', exact: true }).click();
  await expect(page.locator('#adminAllSeats')).toBeVisible();
  await expect(page.locator('#allSeatsGrid .seat-card')).toHaveCount(36);
  return model;
}

test('one-click payment and cancellation work on desktop and touch-sized screens', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const model = await fixture(page);
  const checkbox = page.locator('#seat-paid-1');
  const label = page.locator('#seat-card-1 .payment-control');
  await expect(page.locator('#seat-paid-3')).toBeDisabled();
  const box = await label.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  const act = () => info.project.name === 'mobile' ? label.tap() : label.click();
  await act(); await expect(checkbox).toBeChecked(); await expect(checkbox).toBeEnabled();
  await expect(label).toContainText('已付款');
  await expect(page.locator('#paymentSummary > div').nth(4)).toContainText('NT$ 290');
  await page.locator('#refreshAllSeats').click(); await expect(checkbox).toBeChecked();
  await act(); await expect(checkbox).not.toBeChecked(); await expect(checkbox).toBeEnabled();
  expect(model.writes).toBe(2);
  await act(); await expect(checkbox).toBeChecked(); await expect(checkbox).toBeEnabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.locator('#adminAllSeats h3').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getElementById('adminAllSeats').scrollIntoView({ block: 'start' }));
  const screenshot = info.outputPath(`payment-${info.project.name}.png`);
  await page.screenshot({ path: screenshot });
  await info.attach(`付款介面-${info.project.name}-隔離測試資料`, { path: screenshot, contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('an actual browser restores the previous checkbox after a rejected save', async ({ page }) => {
  const model = await fixture(page); model.fail = true;
  await page.locator('#seat-card-1 .payment-control').click();
  await expect(page.locator('#appNotice')).toContainText('已載入伺服器最新狀態');
  await expect(page.locator('#seat-paid-1')).not.toBeChecked();
  await expect(page.locator('#seat-paid-1')).toBeEnabled();
  await expect(page.locator('#paymentSummary > div').nth(4)).toContainText('NT$ 100');
});
