// Kritische rondgang: automatische controles plus schermafbeeldingen per sectie.
// Gebruik: node tests/audit.js [map]
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const out = path.resolve(__dirname, '../screenshots', process.argv[2] || 'audit');
const base = 'http://localhost:4173/';
const WIDTHS = [1440, 768, 390, 360];

const check = () => {
  const visible = (el) => el.getClientRects().length > 0 && !el.closest('.hp');
  const res = { scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, orphans: [], overflow: [], gutters: [] };
  const lineCounts = (el) => {
    const lines = new Map();
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const re = /\S+/g; let m;
      while ((m = re.exec(n.textContent))) {
        const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        const rect = r.getClientRects()[0]; if (!rect) continue;
        const top = Math.round(rect.top); lines.set(top, (lines.get(top) || 0) + 1);
      }
    }
    return [...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  };
  document.querySelectorAll('h1,h2,h3,p,li,label').forEach((el) => {
    if (!visible(el) || el.querySelector('p,li,div,ol,ul')) return;
    const c = lineCounts(el);
    const isHead = /^H\d$/.test(el.tagName) || /Space Grotesk/.test(el.getAttribute('style') || '');
    if (c.length > 1 && (isHead ? c.some((n) => n < 2) : c[c.length - 1] < 2)) res.orphans.push((isHead ? 'KOP ' : 'tekst ') + el.textContent.trim().slice(0, 60) + ' ' + JSON.stringify(c));
  });
  document.querySelectorAll('body *').forEach((el) => {
    if (!visible(el) || ['SCRIPT', 'STYLE', 'BR'].includes(el.tagName)) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth + 0.5 || r.left < -0.5) res.overflow.push('venster: ' + el.tagName + ' ' + el.textContent.trim().slice(0, 40));
    const par = el.parentElement.getBoundingClientRect();
    if (el.parentElement !== document.body && (r.right > par.right + 1 || r.left < par.left - 1) && getComputedStyle(el).position !== 'absolute') res.overflow.push('ouder: ' + el.tagName + ' ' + el.textContent.trim().slice(0, 40) + ' +' + Math.round(Math.max(r.right - par.right, par.left - r.left)));
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible' && el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') res.overflow.push('afgekapt: ' + el.tagName + ' ' + el.textContent.trim().slice(0, 40));
  });
  document.querySelectorAll('header, main > section, footer').forEach((sec) => {
    const els = [...sec.querySelectorAll('h1,h2,h3,p,a,button,img,label')].filter(visible);
    if (!els.length) return;
    const left = Math.min(...els.map((e) => e.getBoundingClientRect().left));
    const right = window.innerWidth - Math.max(...els.map((e) => e.getBoundingClientRect().right));
    res.gutters.push((sec.id || sec.tagName.toLowerCase()) + ':' + Math.round(left) + '/' + Math.round(right));
  });
  return res;
};

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: 'networkidle' });
      const settle = () => page.evaluate(async () => {
        for (const f of ["600 16px 'Space Grotesk'", "700 16px 'Space Grotesk'", "500 16px 'Space Grotesk'", '600 16px Inter', '500 16px Inter', '400 16px Inter']) await document.fonts.load(f);
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      await settle();
      const report = {};
      const steps = [['stap1', null], ['stap2', 'Lees de voorbeeldfactuur uit'], ['stap3', 'Verder'], ['stap4', 'In de kostprijs']];
      await page.locator('form#start button[type="submit"]').click();
      for (const [name, knop] of steps) {
        if (knop) await page.getByRole('button', { name: knop }).click();
        await settle();
        report[name] = await page.evaluate(check);
        await page.locator('#voorbeeld').screenshot({ path: path.join(out, `${width}-demo-${name}.png`) });
      }
      const all = { orphans: new Set(), overflow: new Set() };
      for (const r of Object.values(report)) { r.orphans.forEach((o) => all.orphans.add(o)); r.overflow.forEach((o) => all.overflow.add(o)); }
      console.log(`\n=== ${width} px  horizontale scroll: ${report.stap1.scroll}`);
      console.log('marges links/rechts:', report.stap1.gutters.join('  '));
      console.log('weeskinderen:', all.orphans.size ? '\n  ' + [...all.orphans].join('\n  ') : 'geen');
      console.log('uitlopend:', all.overflow.size ? '\n  ' + [...all.overflow].join('\n  ') : 'geen');
      const anchors = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')))]);
      const fixed = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position)).length);
      const tops = [];
      for (const h of anchors) {
        await page.evaluate((hash) => { location.hash = ''; location.hash = hash; }, h);
        tops.push(h + '=' + await page.evaluate((hash) => Math.round(document.querySelector(hash).getBoundingClientRect().top), h));
      }
      console.log('ankers (afstand doel tot bovenkant venster):', tops.join('  '), '| vaste of sticky elementen:', fixed);
      await page.evaluate(() => window.scrollTo(0, 0));
      const secs = page.locator('header, main > section, footer');
      const n = await secs.count();
      for (let i = 0; i < n; i++) await secs.nth(i).screenshot({ path: path.join(out, `${width}-sectie-${String(i).padStart(2, '0')}.png`) });
      await ctx.close();
    }
  } finally { await browser.close(); server.kill(); }
})();
