// Lighthouse op home en privacy, mobiel en desktop. Faalt onder 90.
// Gebruik: node tests/lighthouse.mjs [basis-url]. Zonder url start de lokale server.
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const base = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '');
let server;
if (!process.argv[2]) {
  server = spawn(process.execPath, ['tests/server.js'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
}
const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new'] });
fs.mkdirSync('.lighthouse', { recursive: true });
let ok = true;
try {
  for (const page of ['/', '/privacy/']) {
    for (const [name, config] of [['mobiel', undefined], ['desktop', desktopConfig]]) {
      const res = await lighthouse(base + page, { port: chrome.port, output: 'json', logLevel: 'error' }, config);
      const scores = Object.fromEntries(Object.entries(res.lhr.categories).map(([k, c]) => [k, Math.round(c.score * 100)]));
      fs.writeFileSync(`.lighthouse/${name}${page.replace(/\//g, '_')}.json`, res.report);
      const low = Object.values(scores).some((s) => s < 90);
      if (low) ok = false;
      console.log(`${low ? 'ROOD ' : 'GROEN'} ${name.padEnd(8)} ${page.padEnd(10)} ${JSON.stringify(scores)}`);
      if (low) for (const a of Object.values(res.lhr.audits)) if (a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable') console.log('   -', a.id, a.score, a.displayValue || '');
    }
  }
} finally {
  await chrome.kill();
  if (server) server.kill();
}
process.exit(ok ? 0 : 1);
