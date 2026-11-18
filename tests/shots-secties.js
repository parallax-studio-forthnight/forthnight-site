// Screenshots per sectie op 1440 en 390 px. Gebruik: node tests/shots-secties.js
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const base = 'http://localhost:4173/';
const out = path.resolve(__dirname, '../screenshots/secties');

const secties = [
  ['hero', (p) => p.locator('section').first()],
  ['stappen', (p) => p.locator('section', { hasText: 'Vier stappen.' }).last()],
  ['vergelijking', (p) => p.locator('section', { hasText: 'Klassiek traject' }).last()],
  ['waarom-wij', (p) => p.locator('section[aria-label="Wie erachter zit"]')],
  ['vragen', (p) => p.locator('#vragen')],
  ['footer', (p) => p.locator('footer')]
];

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [w, h, mobiel] of [[1440, 900, false], [390, 844, true]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', isMobile: mobiel, hasTouch: mobiel });
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(w, 'horizontale scroll:', scroll);
      for (const [naam, loc] of secties) {
        const l = loc(page);
        console.log(w, naam, await l.count());
        await l.screenshot({ path: path.join(out, `${w}-${naam}.png`) });
      }
      await page.locator('#vragen summary').first().click();
      await page.locator('#vragen').screenshot({ path: path.join(out, `${w}-vragen-open.png`) });
      await ctx.close();
    }
  } finally { await browser.close(); server.kill(); }
})();
