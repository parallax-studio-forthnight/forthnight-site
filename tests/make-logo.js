// Maakt docs/assets/forthnight-logo.png (216 px breed) uit tests/forthnight-logo-origineel.png.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
(async () => {
  const bron = fs.readFileSync(path.resolve(__dirname, 'forthnight-logo-origineel.png')).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const uit = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const doelB = 216, doelH = Math.round(img.naturalHeight * doelB / img.naturalWidth);
    // in stappen halveren geeft een scherper resultaat dan in één keer verkleinen
    let bron = img, b = img.naturalWidth, h = img.naturalHeight;
    while (b / 2 > doelB) {
      b = Math.round(b / 2); h = Math.round(h / 2);
      const c = document.createElement('canvas'); c.width = b; c.height = h;
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bron, 0, 0, b, h); bron = c;
    }
    const c = document.createElement('canvas'); c.width = doelB; c.height = doelH;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bron, 0, 0, doelB, doelH);
    return c.toDataURL('image/png').split(',')[1];
  }, bron);
  fs.writeFileSync(path.resolve(__dirname, '../docs/assets/forthnight-logo.png'), Buffer.from(uit, 'base64'));
  await browser.close();
})();
