const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');

const FORMSPREE = /formspree\.io/;
const CHIPS = 3;
const LOCAL = 'http://localhost:4173'; // lokale server, ook voor het ontwerp bij een live-controle
const DOCS = path.resolve(__dirname, '../docs');

// Verzamelt console-fouten, pagina-fouten en mislukte eigen verzoeken.
function watch(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400 && !FORMSPREE.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
  page.on('request', (r) => { if (/googleapis|gstatic/.test(r.url())) errors.push('extern lettertype: ' + r.url()); });
  return errors;
}

async function ready(page, url = './') {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
}

const demo = {
  async goto(page, state) {
    if (state === 'step0') return;
    await page.getByRole('button', { name: 'Lees de voorbeeldfactuur uit' }).click();
    if (state === 'step1') return;
    await page.getByRole('button', { name: 'Verder' }).click();
    if (state === 'step2') return;
    await page.getByRole('button', { name: state === 'step3-kostprijs' ? 'In de kostprijs' : 'Als kosten' }).click();
  }
};
const STATES = ['step0', 'step1', 'step2', 'step3-kostprijs', 'step3-kosten'];

test.describe('desktop 1440', () => {
  test('geen console-fouten op home en privacy, ook niet tijdens de demo', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    await demo.goto(page, 'step3-kosten');
    await page.getByRole('button', { name: 'Opnieuw' }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await ready(page, './privacy/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacyverklaring');
    expect(errors).toEqual([]);
  });

  test('ankerlinks hebben een doel en scrollen ernaartoe', async ({ page }) => {
    await ready(page);
    const hrefs = await page.$$eval('a[href^="#"]', (as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThanOrEqual(6);
    for (const href of new Set(hrefs)) await expect(page.locator(href)).toHaveCount(1);
    const links = page.locator('a[href^="#"]');
    for (let i = 0; i < hrefs.length; i++) {
      const link = links.nth(i);
      if (!(await link.isVisible())) continue; // "Doe dit met mijn bedrijf" zit in demostap 4, zie demotest
      await link.click();
      expect(new URL(page.url()).hash).toBe(hrefs[i]);
      await expect(page.locator(hrefs[i])).toBeInViewport();
    }
  });

  test('de drie voorzetjes vullen het tekstvak', async ({ page }) => {
    await ready(page);
    const chips = page.locator('[data-chip]');
    await expect(chips).toHaveCount(CHIPS);
    for (let i = 0; i < CHIPS; i++) {
      const text = await chips.nth(i).getAttribute('data-chip');
      await chips.nth(i).click();
      await expect(page.locator('#intake')).toHaveValue(text);
      await expect(page.locator('#intake')).toBeFocused();
    }
  });

  test('demo loopt door vier stappen, beide keuzes, en "Opnieuw" zet hem terug', async ({ page }) => {
    await ready(page);
    const step = (i) => page.locator(`[data-if="isStep${i}"]`);
    const current = page.locator('[data-pill][aria-current="step"]');
    for (const [knop, tekst] of [['In de kostprijs', 'Verzekering telt mee in de kostprijs van de artikelen.'], ['Als kosten', 'Verzekering boek je als kosten, niet in de kostprijs.']]) {
      await expect(step(0)).toBeVisible();
      await expect(current).toHaveAttribute('data-pill', '0');
      await page.getByRole('button', { name: 'Lees de voorbeeldfactuur uit' }).click();
      await expect(step(1)).toBeVisible();
      await expect(step(0)).toBeHidden();
      await expect(current).toHaveAttribute('data-pill', '1');
      await page.getByRole('button', { name: 'Verder' }).click();
      await expect(step(2)).toBeVisible();
      await expect(current).toHaveAttribute('data-pill', '2');
      await page.getByRole('button', { name: knop }).click();
      await expect(step(3)).toBeVisible();
      await expect(current).toHaveAttribute('data-pill', '3');
      await expect(page.locator('#choice')).toHaveText(tekst);
      await expect(page.getByRole('link', { name: 'Doe dit met mijn bedrijf' })).toHaveAttribute('href', '#start');
      await page.getByRole('button', { name: 'Opnieuw' }).click();
      await expect(step(0)).toBeVisible();
      await expect(step(3)).toBeHidden();
    }
  });

  test('formulier: Start toont de velden, daarna heet de knop Verstuur', async ({ page }) => {
    await ready(page);
    const form = page.locator('form#start');
    const knop = form.locator('button[type="submit"]');
    await expect(knop).toHaveText('Start');
    await expect(page.locator('#naam')).toBeHidden();
    await knop.click();
    await expect(knop).toHaveText('Verstuur');
    for (const id of ['#naam', '#email', '#telefoon']) await expect(page.locator(id)).toBeVisible();
    await expect(page.locator('#naam')).toBeFocused();
    expect(await page.locator('#intake').getAttribute('required')).not.toBeNull();
    expect(await page.locator('#naam').getAttribute('required')).not.toBeNull();
    expect(await page.locator('#email').getAttribute('required')).not.toBeNull();
    expect(await page.locator('#telefoon').getAttribute('required')).toBeNull();
  });

  test('formuliervalidatie: lege en ongeldige velden versturen niets', async ({ page }) => {
    let posts = 0;
    await page.route(FORMSPREE, (route) => { posts++; route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await ready(page);
    const knop = page.locator('form#start button[type="submit"]');
    const status = page.locator('#form-status');
    await knop.click();
    await knop.click();
    await expect(status).toContainText('Vertel in een paar zinnen hoe je bedrijf werkt.');
    await expect(status).toContainText('Vul je naam in.');
    await expect(status).toContainText('Vul een geldig e-mailadres in.');
    await expect(page.locator('#intake')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#intake')).toBeFocused();
    await page.locator('#intake').fill('Groothandel met 12 man.');
    await page.locator('#naam').fill('Test Tester');
    await page.locator('#email').fill('geen-mailadres');
    await knop.click();
    await expect(status).toHaveText('Vul een geldig e-mailadres in.');
    await expect(page.locator('#email')).toBeFocused();
    await expect(page.locator('#naam')).not.toHaveAttribute('aria-invalid', 'true');
    expect(posts).toBe(0);
  });

  test('verzenden (endpoint gemockt) toont de bedankmelding zonder redirect; telefoon is optioneel', async ({ page }) => {
    const bodies = [];
    await page.route(FORMSPREE, (route) => {
      bodies.push({ method: route.request().method(), accept: route.request().headers()['accept'], body: route.request().postData() || '' });
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await ready(page);
    const url = page.url();
    const knop = page.locator('form#start button[type="submit"]');
    await page.locator('#intake').fill('Winkel met kassa en webshop.');
    await knop.click();
    await page.locator('#naam').fill('Test Tester');
    await page.locator('#email').fill('test@example.com');
    await knop.click();
    await expect(page.locator('#form-status')).toContainText('Bedankt, je bericht is binnen.');
    await expect(page.locator('#intake')).toBeHidden();
    await expect(knop).toBeHidden();
    expect(page.url()).toBe(url);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].method).toBe('POST');
    expect(bodies[0].accept).toContain('application/json');
    for (const veld of ['name="bericht"', 'Winkel met kassa en webshop.', 'name="naam"', 'Test Tester', 'name="email"', 'test@example.com', 'name="telefoon"', 'name="_gotcha"']) expect(bodies[0].body).toContain(veld);
  });

  test('een fout bij verzenden toont de foutmelding met het mailadres', async ({ page }) => {
    await page.route(FORMSPREE, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"kapot"}' }));
    await ready(page);
    const knop = page.locator('form#start button[type="submit"]');
    await page.locator('#intake').fill('Winkel met kassa en webshop.');
    await knop.click();
    await page.locator('#naam').fill('Test Tester');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#telefoon').fill('0612345678');
    await knop.click();
    const status = page.locator('#form-status');
    await expect(status).toContainText('Versturen is niet gelukt.');
    await expect(status.getByRole('link', { name: 'dennis@forthnightagency.com' })).toHaveAttribute('href', 'mailto:dennis@forthnightagency.com');
    await expect(knop).toBeEnabled();
    await expect(knop).toHaveText('Verstuur');
    await expect(page.locator('#intake')).toHaveValue('Winkel met kassa en webshop.');
  });

  test('ook een netwerkfout toont de foutmelding', async ({ page }) => {
    await page.route(FORMSPREE, (route) => route.abort());
    await ready(page);
    const knop = page.locator('form#start button[type="submit"]');
    await page.locator('#intake').fill('Test.');
    await knop.click();
    await page.locator('#naam').fill('Test');
    await page.locator('#email').fill('test@example.com');
    await knop.click();
    await expect(page.locator('#form-status')).toContainText('Versturen is niet gelukt.');
  });

  test('honeypot: gevuld veld verstuurt niets', async ({ page }) => {
    let posts = 0;
    await page.route(FORMSPREE, (route) => { posts++; route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await ready(page);
    const knop = page.locator('form#start button[type="submit"]');
    await expect(page.locator('#website')).not.toBeInViewport();
    await page.locator('#intake').fill('Spam.');
    await knop.click();
    await page.locator('#naam').fill('Bot');
    await page.locator('#email').fill('bot@example.com');
    await page.evaluate(() => { document.getElementById('website').value = 'http://spam.example'; });
    await knop.click();
    await expect(page.locator('#form-status')).toContainText('Bedankt');
    expect(posts).toBe(0);
  });

  test('endpoint-constante in het script is gelijk aan het action-attribuut', async ({ page }) => {
    await ready(page);
    const action = await page.locator('form#start').getAttribute('action');
    const html = await page.content();
    const constant = html.match(/var FORMSPREE_ENDPOINT = '([^']+)'/)[1];
    expect(action).toBe(constant);
    expect(action).toMatch(/^https:\/\/formspree\.io\/f\//);
    await expect(page.locator('form#start')).toHaveAttribute('method', /post/i);
  });

  test('alles bereikbaar met Tab', async ({ page }) => {
    await ready(page);
    await page.locator('form#start button[type="submit"]').click();
    await demo.goto(page, 'step2');
    const total = await page.evaluate(() => {
      const els = [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), textarea, select')]
        .filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.disabled);
      els.forEach((el, i) => { el.dataset.tabIndexTest = String(i); });
      document.activeElement.blur();
      els[0].focus();
      return els.length;
    });
    expect(total).toBeGreaterThan(15);
    const seen = new Set(['0']);
    for (let i = 0; i < total + 5; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement && document.activeElement.dataset.tabIndexTest);
      if (id !== undefined && id !== null) seen.add(id);
    }
    expect(seen.size).toBe(total);
    const honeypot = await page.evaluate(() => document.getElementById('website').tabIndex);
    expect(honeypot).toBe(-1);
  });

  test('favicon, og-afbeelding, robots, sitemap en privacy bestaan; head-tags kloppen', async ({ page, request }) => {
    for (const p of ['favicon.ico', 'assets/favicon-32.png', 'assets/apple-touch-icon.png', 'assets/og.png', 'assets/forthnight-logo.png', 'robots.txt', 'sitemap.xml', 'privacy/']) {
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
    }
    expect(await (await request.get('robots.txt')).text()).toContain('Sitemap: https://forthnightagency.nl/sitemap.xml');
    expect(await (await request.get('sitemap.xml')).text()).toContain('<loc>https://forthnightagency.nl/privacy/</loc>');
    await ready(page);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://forthnightagency.nl/assets/og.png');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Forthnight/);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://forthnightagency.nl/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://forthnightagency.nl/');
    const logo = page.locator('header img');
    await expect(logo).toHaveAttribute('src', 'assets/forthnight-logo.png');
    expect((await logo.boundingBox()).height).toBe(52);
    expect(await logo.evaluate((img) => img.naturalHeight)).toBeGreaterThanOrEqual(104);
    await page.locator('footer').getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy\/$/);
    await expect(page.locator('main')).not.toContainText('Google');
    for (const tekst of ['je bericht', 'je naam', 'je e-mailadres', 'Dit veld is optioneel', 'Formspree', 'twaalf maanden', 'dennis@forthnightagency.com']) await expect(page.locator('main')).toContainText(tekst);
  });

  test('eigen lettertypen: geladen uit assets/fonts, precies één main-landmark', async ({ page, request }) => {
    for (const f of ['inter-latin', 'inter-latin-ext', 'space-grotesk-latin', 'space-grotesk-latin-ext']) expect((await request.get(`assets/fonts/${f}.woff2`)).status(), f).toBe(200);
    for (const url of ['./', './privacy/']) {
      await ready(page, url);
      const html = await page.content();
      expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
      expect(html).toContain('font-display:swap');
      const loaded = await page.evaluate(async () => {
        const specs = ["400 16px Inter", "500 16px Inter", "600 16px Inter", "500 16px 'Space Grotesk'", "600 16px 'Space Grotesk'", "700 16px 'Space Grotesk'"];
        const out = {};
        for (const s of specs) out[s] = (await document.fonts.load(s)).length > 0 && document.fonts.check(s);
        return out;
      });
      for (const [spec, ok] of Object.entries(loaded)) expect(ok, `${url} ${spec}`).toBe(true);
      await expect(page.locator('main')).toHaveCount(1);
    }
    await ready(page);
    expect(await page.evaluate(() => [...document.querySelectorAll('section')].every((s) => s.closest('main')) && !document.querySelector('main header, main footer'))).toBe(true);
  });

  test('nergens een em dash', async ({ request }) => {
    for (const p of ['./', 'privacy/']) expect(await (await request.get(p)).text(), p).not.toContain('—');
  });

  // Alleen in de live-controle (stap 9): faalt zolang de Formspree-placeholder er nog staat.
  test('live: echte Formspree-endpoint, geen VERVANG_MIJ meer', async ({ request }) => {
    test.skip(!process.env.BASE_URL, 'draait alleen in de live-controle met BASE_URL');
    expect(fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8')).not.toContain('VERVANG_MIJ');
    expect(await (await request.get('./')).text()).not.toContain('VERVANG_MIJ');
  });

  if (!process.env.BASE_URL) {
    test('alleen de site zelf staat in docs/', () => {
      expect(fs.readdirSync(DOCS).sort()).toEqual(['.nojekyll', 'CNAME', 'assets', 'favicon.ico', 'index.html', 'privacy', 'robots.txt', 'sitemap.xml']);
      expect(fs.readdirSync(path.join(DOCS, 'privacy'))).toEqual(['index.html']);
    });
    test('CNAME wijst naar forthnightagency.nl', () => {
      expect(fs.readFileSync(path.join(DOCS, 'CNAME'), 'utf8').trim()).toBe('forthnightagency.nl');
    });
  }
});

test.describe('zonder JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('alle velden zichtbaar en het formulier post gewoon naar Formspree', async ({ page }) => {
    await page.goto('./');
    const form = page.locator('form#start');
    await expect(form).toHaveAttribute('action', /^https:\/\/formspree\.io\/f\//);
    await expect(form).toHaveAttribute('method', /post/i);
    for (const id of ['#intake', '#naam', '#email', '#telefoon']) await expect(page.locator(id)).toBeVisible();
    await expect(form.locator('button[type="submit"]')).toHaveText('Verstuur');
    expect(await form.getAttribute('novalidate')).toBeNull();
    for (const [id, name] of [['#intake', 'bericht'], ['#naam', 'naam'], ['#email', 'email'], ['#telefoon', 'telefoon']]) await expect(page.locator(id)).toHaveAttribute('name', name);
  });
});

// Vergelijking met het ontwerp op 1440 px. Alleen de tweede footerregel (mailadres plus privacylink) is in beide verborgen; het formulier ziet er in rust gelijk uit.
test.describe('pixelvergelijking met design/index.v3.html op 1440 px', () => {
  const outDir = path.resolve(__dirname, '../screenshots/compare');
  async function shot(browser, baseURL, url, state, file) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', baseURL });
    await page.route('**/design/assets/**', (route) => route.continue({ url: LOCAL + '/assets/' + route.request().url().split('/design/assets/')[1] }));
    await ready(page, url);
    if (state === 'started') await page.locator('#start [data-act="start"]').click();
    else await demo.goto(page, state);
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); document.querySelectorAll('footer p')[1].style.visibility = 'hidden'; });
    await page.mouse.move(0, 0);
    // Lettertypes laden pas als een gewicht zichtbaar wordt: wacht opnieuw na het wisselen van stap.
    await page.evaluate(async () => { await document.fonts.load("600 16px 'Space Grotesk'"); await document.fonts.load('600 16px Inter'); await document.fonts.load('500 16px Inter'); await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
    // Het ontwerp laadt lettertypen van Google met font-display: swap. Wacht tot twee opnamen achter elkaar gelijk zijn.
    let buf = await page.screenshot({ fullPage: true, animations: 'disabled' });
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(150);
      const next = await page.screenshot({ fullPage: true, animations: 'disabled' });
      const same = next.equals(buf);
      buf = next;
      if (same) break;
    }
    fs.writeFileSync(file, buf);
    await page.close();
    return PNG.sync.read(buf);
  }
  for (const state of [...STATES, 'started']) {
    test(`gelijk in toestand ${state}`, async ({ browser, baseURL }) => {
      fs.mkdirSync(outDir, { recursive: true });
      // De site zelf rendert elke keer identiek (zie tests/stable.js). Het ontwerp haalt zijn lettertypen nog bij Google
      // en rendert daardoor op twee manieren: komt een lettertype na de eerste weergave binnen, dan verschuiven de
      // subpixels van de tekst. De layout is in beide gevallen gelijk. Daarom: de site moet pixelgelijk zijn aan een
      // opname van het ontwerp; het ontwerp krijgt hooguit acht pogingen.
      const b = await shot(browser, baseURL, './', state, path.join(outDir, `${state}-index.png`));
      let n = -1;
      let attempts = 0;
      while (n !== 0 && attempts < 8) {
        attempts++;
        const a = await shot(browser, baseURL, LOCAL + '/design/index.v3.html', state, path.join(outDir, `${state}-design.png`));
        expect({ w: b.width, h: b.height }).toEqual({ w: a.width, h: a.height });
        const diff = new PNG({ width: a.width, height: a.height });
        n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
        fs.writeFileSync(path.join(outDir, `${state}-diff.png`), PNG.sync.write(diff));
      }
      test.info().annotations.push({ type: 'pogingen ontwerp', description: String(attempts) });
      console.log(`pixelvergelijking ${state}: 0 afwijkende pixels na ${attempts} opname(n) van het ontwerp`.replace('0 afwijkende', n + ' afwijkende'));
      expect(n, `afwijkende pixels in ${state}`).toBe(0);
    });
  }
});

for (const width of [390, 360]) {
  test.describe(`mobiel ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('header: alleen logo (40 px) en Start op één regel', async ({ page }) => {
      await ready(page);
      const logo = await page.locator('header img').boundingBox();
      expect(logo.height).toBe(40);
      for (const naam of ['Probeer het', 'Hoe het werkt', 'Vragen']) await expect(page.locator('header nav').getByRole('link', { name: naam, exact: true })).toBeHidden();
      const start = page.locator('header nav a[href="#start"]');
      await expect(start).toBeVisible();
      const s = await start.boundingBox();
      expect(s.y).toBeLessThan(logo.y + logo.height);
      expect(s.y + s.height).toBeGreaterThan(logo.y);
      expect(s.x).toBeGreaterThan(logo.x + logo.width);
      expect(s.x + s.width).toBeLessThanOrEqual(width);
    });

    test('stap-pillen op één regel, label alleen bij de actieve stap', async ({ page }) => {
      await ready(page);
      for (const [i, state] of [[0, 'step0'], [1, 'step1'], [2, 'step2'], [3, 'step3-kosten']]) {
        if (i === 1) await page.getByRole('button', { name: 'Lees de voorbeeldfactuur uit' }).click();
        if (i === 2) await page.getByRole('button', { name: 'Verder' }).click();
        if (i === 3) await page.getByRole('button', { name: 'Als kosten' }).click();
        const info = await page.evaluate(() => [...document.querySelectorAll('[data-pill]')].map((li) => {
          const r = li.getBoundingClientRect();
          const spans = li.querySelectorAll('span');
          return { top: Math.round(r.top), left: r.left, right: r.right, cijfer: spans[0].getClientRects().length > 0, label: spans[1].getClientRects().length > 0, current: li.getAttribute('aria-current') === 'step' };
        }));
        const box = await page.locator('.demo-head').boundingBox();
        expect(new Set(info.map((p) => p.top)).size, state).toBe(1);
        info.forEach((p, n) => {
          expect(p.cijfer).toBe(true);
          expect(p.label, `${state} pil ${n}`).toBe(n === i);
          expect(p.current).toBe(n === i);
          expect(p.right).toBeLessThanOrEqual(box.x + box.width);
        });
      }
    });

    test('in elke demostap: geen horizontale scroll, tekst minstens 14 px, knoppen minstens 44 px, geen kop op een los woord', async ({ page }) => {
      await ready(page);
      await page.locator('form#start button[type="submit"]').click();
      const check = () => page.evaluate(() => {
        const visible = (el) => el.getClientRects().length > 0 && !el.closest('.hp');
        const out = { scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [], low: [], orphans: [], wide: [] };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!n.textContent.trim() || seen.has(el) || !visible(el) || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
          seen.add(el);
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 14) out.small.push(size + 'px: ' + n.textContent.trim().slice(0, 40));
          const r = el.getBoundingClientRect();
          if (r.right > window.innerWidth + 0.5 || r.left < -0.5) out.wide.push(n.textContent.trim().slice(0, 40));
        }
        document.querySelectorAll('button, a[style*="border-radius: 999px"]').forEach((el) => {
          if (visible(el) && el.getBoundingClientRect().height < 44) out.low.push(Math.round(el.getBoundingClientRect().height) + 'px: ' + el.textContent.trim());
        });
        document.querySelectorAll('h1, h2, h3, p[style*="Space Grotesk"]').forEach((el) => {
          if (!visible(el)) return;
          const lines = new Map();
          const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = tw.nextNode(); n; n = tw.nextNode()) {
            const re = /\S+/g; let m;
            while ((m = re.exec(n.textContent))) {
              const range = document.createRange();
              range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
              const top = Math.round(range.getClientRects()[0].top);
              lines.set(top, (lines.get(top) || 0) + 1);
            }
          }
          const counts = [...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
          if (counts.length > 1 && counts.some((c) => c < 2)) out.orphans.push(el.textContent.trim().slice(0, 50) + ' ' + JSON.stringify(counts));
        });
        return out;
      });
      const run = async (label) => {
        const r = await check();
        expect(r.scroll, `${label}: horizontale scroll`).toBeLessThanOrEqual(0);
        expect(r.wide, `${label}: tekst buiten beeld`).toEqual([]);
        expect(r.small, `${label}: tekst kleiner dan 14 px`).toEqual([]);
        expect(r.low, `${label}: knoppen lager dan 44 px`).toEqual([]);
        expect(r.orphans, `${label}: kop met los woord`).toEqual([]);
      };
      await run('stap 1');
      await page.getByRole('button', { name: 'Lees de voorbeeldfactuur uit' }).click();
      await run('stap 2');
      await page.getByRole('button', { name: 'Verder' }).click();
      await run('stap 3');
      await page.getByRole('button', { name: 'In de kostprijs' }).click();
      await run('stap 4 kostprijs');
      await page.getByRole('button', { name: 'Opnieuw' }).click();
      await demo.goto(page, 'step3-kosten');
      await run('stap 4 kosten');
    });

    test('demo: na een stapwissel staat de kaart weer in beeld en heeft de kop van de nieuwe stap focus', async ({ page }) => {
      await ready(page);
      const card = page.locator('[data-demo]');
      const head = (i) => page.locator(`[data-if="isStep${i}"] [data-step-head]`);
      const cardTop = async () => Math.round((await card.boundingBox()).y);
      expect(await card.evaluate((el) => getComputedStyle(el).scrollMarginTop)).toBe('16px');
      const stappen = [['Lees de voorbeeldfactuur uit', 1], ['Verder', 2], ['Als kosten', 3], ['Opnieuw', 0]];
      for (const [knop, i] of stappen) {
        const btn = page.getByRole('button', { name: knop });
        await btn.scrollIntoViewIfNeeded();
        // zet de knop onderaan het venster, zodat de bovenkant van de kaart zo ver mogelijk uit beeld is
        await btn.evaluate((el) => el.scrollIntoView({ block: 'end' }));
        const before = await cardTop();
        await btn.click();
        await expect(head(i)).toBeFocused();
        await expect(head(i)).toBeInViewport({ ratio: 1 });
        if (before < 0) expect(await cardTop(), `kaart na "${knop}"`).toBe(16);
        expect(await head(i).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
        expect(await head(i).getAttribute('tabindex')).toBe('-1');
      }
      // "Verder" in stap 2 is de eis uit de review: daar valt de kaart echt boven het venster
      await page.getByRole('button', { name: 'Lees de voorbeeldfactuur uit' }).click();
      const verder = page.getByRole('button', { name: 'Verder' });
      await verder.evaluate((el) => el.scrollIntoView({ block: 'end' }));
      expect(await cardTop()).toBeLessThan(0);
      await verder.click();
      await expect(head(2)).toBeInViewport({ ratio: 1 });
      await expect(head(2)).toBeFocused();
      expect(await cardTop()).toBe(16);
    });

    test('demo: staat de kaart al in beeld, dan verspringt de pagina niet', async ({ page }) => {
      await page.setViewportSize({ width, height: 1600 }); // hoog venster: kaart en knop passen samen in beeld
      await ready(page);
      await page.locator('[data-demo]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -60));
      const y = await page.evaluate(() => window.scrollY);
      await page.getByRole('button', { name: 'Lees de voorbeeldfactuur uit' }).click();
      await expect(page.locator('[data-if="isStep1"] [data-step-head]')).toBeFocused();
      expect(await page.evaluate(() => window.scrollY)).toBe(y);
    });

    test('contactvelden staan onder elkaar en passen in beeld', async ({ page }) => {
      await ready(page);
      await page.locator('form#start button[type="submit"]').click();
      const boxes = [];
      for (const id of ['#intake', '#naam', '#email', '#telefoon']) boxes.push(await page.locator(id).boundingBox());
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height);
        expect(Math.round(boxes[i].x)).toBe(Math.round(boxes[1].x));
      }
      for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(width); }
    });

    test('privacypagina: geen horizontale scroll', async ({ page }) => {
      await ready(page, './privacy/');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  });
}
