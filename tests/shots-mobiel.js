// Mobiele controle op 375x812 en 390x844: screenshots, horizontale scroll, klikvoorbeeld stap 1 tot en met 4.
// Gebruik: node tests/shots-mobiel.js [basis-url]
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const base = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '') + '/';
const out = path.resolve(__dirname, '../screenshots/mobiel');

(async () => {
  let server;
  if (!process.argv[2]) { server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 800)); }
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [w, h] of [[375, 812], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const fouten = [];
      page.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
      page.on('pageerror', (e) => fouten.push(String(e)));
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const scroll = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const shot = (naam) => page.screenshot({ path: path.join(out, `${w}x${h}-${naam}.png`) });
      console.log(`${w}x${h} horizontale scroll bij start:`, await scroll());
      await shot('1-hero');
      await page.locator('#top a[href="#voorbeeld"]').scrollIntoViewIfNeeded(); await shot('2-link-onder-formulier');
      await page.locator('#top a[href="#voorbeeld"]').tap(); await page.waitForTimeout(300); await shot('3-na-tik-op-link');
      const stappen = ['Lees de voorbeeldfactuur uit', 'Verder', 'In de kostprijs'];
      for (let i = 0; i < stappen.length; i++) {
        const knop = page.getByRole('button', { name: stappen[i] });
        await knop.scrollIntoViewIfNeeded(); await knop.tap(); await page.waitForTimeout(200);
        const kaart = await page.locator('[data-demo]').boundingBox();
        console.log(`${w}x${h} stap ${i + 2}: kaart op ${Math.round(kaart.y)} px, scroll ${await scroll()}`);
        await shot(`4-demo-stap${i + 2}`);
      }
      console.log(`${w}x${h} keuze:`, await page.locator('#choice').innerText());
      await page.locator('#vragen').scrollIntoViewIfNeeded(); await page.evaluate(() => { location.hash = 'vragen'; }); await page.waitForTimeout(300); await shot('5-anker-vragen');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(200); await shot('6-footer');
      const hoogtes = await page.locator('footer a').evaluateAll((els) => els.map((a) => a.textContent + ' ' + Math.round(a.getBoundingClientRect().height)));
      console.log(`${w}x${h} footerlinks:`, hoogtes.join(' | '), '| scroll einde:', await scroll(), '| consolefouten:', fouten.length);
      await ctx.close();
    }
  } finally { await browser.close(); if (server) server.kill(); }
})();
