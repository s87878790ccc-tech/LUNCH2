'use strict';
const { test, expect } = require('@playwright/test');

// Only synthetic data is used. Every production API request is intercepted;
// the real Supabase / Render application is never contacted by these tests.
const { fixture } = require('./fixture');

test('one-click payment and cancellation work on desktop and touch-sized screens', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const model = await fixture(page);
  const checkbox = page.locator('#seat-paid-1');
  const label = page.locator('#seat-card-1 .payment-control');
  await expect(page.locator('#seat-paid-3')).toBeDisabled();
  const box = await label.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  const act = () => Boolean(info.project.use.hasTouch) ? label.tap() : label.click();
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
