// Eén echte testinzending via het formulier op de live site. Gebruik: node tests/live-inzending.js https://forthnightagency.nl
const { chromium } = require('@playwright/test');
const base = (process.argv[2] || '').replace(/\/$/, '') + '/';
if (!/^https:\/\//.test(base)) { console.error('Geef de live-url op, met https.'); process.exit(2); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const antwoorden = [];
  page.on('response', (r) => { if (/formspree\.io/.test(r.url())) antwoorden.push(r.status() + ' ' + r.request().method() + ' ' + r.url()); });
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('#intake').fill('TESTINZENDING live-controle ' + new Date().toISOString() + '. Dit bericht is automatisch verstuurd om het formulier te testen en kan weg.');
    await page.locator('form#start button[type="submit"]').click();
    await page.locator('#naam').fill('Test live-controle');
    await page.locator('#email').fill('test@example.com');
    await page.locator('form#start button[type="submit"]').click();
    await page.locator('#form-status').waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    console.log('formspree:', antwoorden.join(' | ') || 'geen verzoek gezien');
    console.log('status:', await page.locator('#form-status').getAttribute('class'), '|', (await page.locator('#form-status').innerText()).replace(/\s+/g, ' '));
    await page.locator('form#start').screenshot({ path: 'screenshots/live-inzending.png' });
  } finally { await browser.close(); }
})();
