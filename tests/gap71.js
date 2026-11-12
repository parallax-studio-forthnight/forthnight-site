// Close-up van het getal 71 op 1440 en 390 px, plus meting van de spleet tussen de cijfers.
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const { PNG } = require('pngjs');
const out = path.resolve(__dirname, '../screenshots');
(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  let ok = true;
  try {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
      await page.evaluate(async () => { await document.fonts.load("700 16px 'Space Grotesk'"); await document.fonts.ready; });
      const p = page.locator('main p', { hasText: /^71$/ });
      const style = await p.evaluate((el) => { const c = getComputedStyle(el); return c.letterSpacing + ' bij ' + c.fontSize; });
      await p.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      // meet op de tekst zelf: smalle uitsnede rond de twee cijfers
      const box = await p.evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
      const file = path.join(out, `21-71-close-up-${width}.png`);
      const buf = await page.screenshot({ path: file, clip: { x: Math.max(0, box.x - 12), y: box.y - 8, width: Math.min(box.width + 24, width - Math.max(0, box.x - 12)), height: box.height + 16 } });
      const png = PNG.sync.read(buf);
      const ink = (x) => { for (let y = 0; y < png.height * 0.7; y++) { const i = (y * png.width + x) * 4; if (png.data[i] < 128 && png.data[i + 1] < 160) return true; } return false; };
      const runs = []; let start = null;
      for (let x = 0; x < png.width; x++) { const on = ink(x); if (on && start === null) start = x; if (!on && start !== null) { runs.push([start, x - 1]); start = null; } }
      const gap = runs.length >= 2 ? (runs[1][0] - runs[0][1] - 1) / 2 : 0;
      if (runs.length !== 2 || gap < 1) ok = false;
      console.log(`${width} px: letter-spacing ${style}, inktblokken ${runs.length}, spleet tussen 7 en 1: ${gap} css-px ${runs.length === 2 && gap >= 1 ? 'GROEN' : 'ROOD'} -> ${path.basename(file)}`);
      await ctx.close();
    }
  } finally { await browser.close(); server.kill(); }
  process.exit(ok ? 0 : 1);
})();
