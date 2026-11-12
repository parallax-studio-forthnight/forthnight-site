// Maakt assets/og.png (1200 x 630) uit tests/og.html.
const { chromium } = require('@playwright/test');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(require('url').pathToFileURL(path.resolve(__dirname, 'og.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.resolve(__dirname, '../docs/assets/og.png') });
  await browser.close();
})();
