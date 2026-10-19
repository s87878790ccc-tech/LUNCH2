'use strict';
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './ui', timeout: 30_000, fullyParallel: true, retries: 0,
  outputDir: 'ui-results', reporter: [['list'], ['html', { open: 'never', outputFolder: 'ui-report' }]],
  use: { ignoreHTTPSErrors: true, baseURL: 'https://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'firefox-desktop', use: { browserName: 'firefox', viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit-desktop', use: { browserName: 'webkit', viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit-mobile', use: { browserName: 'webkit', viewport: { width: 390, height: 1000 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 1000 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
  webServer: { command: 'node scripts/serve-ui-test.js', url: 'https://127.0.0.1:4173', reuseExistingServer: false },
});
