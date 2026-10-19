'use strict';
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './ui', timeout: 30_000, fullyParallel: true, retries: 0,
  outputDir: 'ui-results', reporter: [['list'], ['html', { open: 'never', outputFolder: 'ui-report' }]],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 1000 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
  webServer: { command: 'node scripts/serve-ui-test.js', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
