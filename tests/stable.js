// Hulpscript: rendert elke pagina meerdere keren en telt hoeveel verschillende beelden dat oplevert.
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const L = 'http://localhost:4173';
(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ args: process.argv.slice(2) });
  for (const url of [L + '/design/index.v3.html', L + '/']) {
    const hashes = {};
    await Promise.all(Array.from({ length: 12 }, async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await page.route('**/design/assets/**', (route) => route.continue({ url: L + '/assets/' + route.request().url().split('/design/assets/')[1] }));
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => [...document.fonts].map((f) => f.family + ' ' + f.weight + ' ' + f.status + ' ' + (f.unicodeRange || '').slice(0, 12)).filter((s) => /loaded/.test(s)).sort().join(' | '));
      const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } });
      const h = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
      hashes[h] = hashes[h] || { n: 0, info };
      hashes[h].n++;
      await page.close();
    }));
    console.log(url);
    for (const [h, v] of Object.entries(hashes)) console.log('  ', h, 'x' + v.n, v.info);
  }
  await browser.close(); server.kill();
})();
