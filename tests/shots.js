// Screenshots voor de beoordeling. Gebruik: node tests/shots.js [basis-url]
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const base = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '') + '/';
const out = path.resolve(__dirname, '../screenshots');

async function settle(page) {
  await page.evaluate(async () => {
    for (const f of ["600 16px 'Space Grotesk'", "700 16px 'Space Grotesk'", '600 16px Inter', '500 16px Inter', '400 16px Inter']) await document.fonts.load(f);
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
}

(async () => {
  let server;
  if (!process.argv[2]) { server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 800)); }
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    // 1. Logo in de header, 1440 px, dubbele pixeldichtheid
    let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    let page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'networkidle' }); await settle(page);
    const logo = await page.locator('header img').boundingBox();
    console.log('logo 1440:', JSON.stringify(logo));
    await page.screenshot({ path: path.join(out, '01-logo-header-1440.png'), clip: { x: 0, y: 0, width: 1440, height: 92 } });
    await page.screenshot({ path: path.join(out, '01b-logo-close-up.png'), clip: { x: logo.x - 16, y: logo.y - 10, width: logo.width + 32, height: logo.height + 20 }, scale: 'device' });
    await ctx.close();

    // 2. 1440 px volledig
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'networkidle' }); await settle(page);
    await page.screenshot({ path: path.join(out, '02-1440-volledig.png'), fullPage: true });
    await page.goto(base + 'privacy/', { waitUntil: 'networkidle' }); await settle(page);
    await page.screenshot({ path: path.join(out, '03-1440-privacy.png'), fullPage: true });
    await ctx.close();

    // 3. 390 px
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
    page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'networkidle' }); await settle(page);
    await page.screenshot({ path: path.join(out, '10-390-header-hero.png') });
    await page.locator('form#start button[type="submit"]').click(); await settle(page);
    await page.locator('#naam').blur();
    await page.locator('form#start').screenshot({ path: path.join(out, '11-390-intake-na-start.png') });
    const demo = page.locator('#voorbeeld');
    await demo.screenshot({ path: path.join(out, '12-390-demo-stap1.png') });
    await page.getByRole('button', { name: 'Lees de voorbeeldfactuur uit' }).click(); await settle(page);
    await demo.screenshot({ path: path.join(out, '13-390-demo-stap2.png') });
    await page.getByRole('button', { name: 'Verder' }).click(); await settle(page);
    await demo.screenshot({ path: path.join(out, '14-390-demo-stap3.png') });
    await page.getByRole('button', { name: 'In de kostprijs' }).click(); await settle(page);
    await demo.screenshot({ path: path.join(out, '15-390-demo-stap4-kostprijs.png') });
    await page.getByRole('button', { name: 'Opnieuw' }).click();
    await page.getByRole('button', { name: 'Lees de voorbeeldfactuur uit' }).click();
    await page.getByRole('button', { name: 'Verder' }).click();
    await page.getByRole('button', { name: 'Als kosten' }).click(); await settle(page);
    await demo.screenshot({ path: path.join(out, '16-390-demo-stap4-kosten.png') });
    await page.locator('section', { hasText: 'besluiten kwamen bij onze laatste implementatie' }).first().screenshot({ path: path.join(out, '17-390-blok-71.png') });
    await page.locator('footer').screenshot({ path: path.join(out, '18-390-footer.png') });
    await ctx.close();

    // 4. Bedank- en foutmelding (endpoint gemockt), 390 px
    for (const [status, file] of [[200, '19-390-bedankt.png'], [500, '20-390-foutmelding.png']]) {
      ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      page = await ctx.newPage();
      await page.route(/formspree\.io/, (r) => r.fulfill({ status, contentType: 'application/json', body: '{}' }));
      await page.goto(base, { waitUntil: 'networkidle' }); await settle(page);
      await page.locator('#intake').fill('Groothandel met 12 man en 4.000 artikelen.');
      await page.locator('form#start button[type="submit"]').click();
      await page.locator('#naam').fill('Test Tester'); await page.locator('#email').fill('test@example.com');
      await page.locator('form#start button[type="submit"]').click();
      await page.locator('#form-status').waitFor(); await settle(page);
      await page.locator('form#start').screenshot({ path: path.join(out, file) });
      await ctx.close();
    }
  } finally { await browser.close(); if (server) server.kill(); }
  console.log(fs.readdirSync(out).filter((f) => f.endsWith('.png')).join('\n'));
})();
