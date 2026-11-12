// Hulpscript: draait Lighthouse mobiel op de home een paar keer en toont performance, CLS en de oorzaken.
// Gebruik: node tests/lh-cls.mjs [aantal]
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { spawn } from 'node:child_process';

const runs = Number(process.argv[2] || 3);
const server = spawn(process.execPath, ['tests/server.js'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new'] });
try {
  for (let i = 0; i < runs; i++) {
    const res = await lighthouse('http://localhost:4173/', { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance'] });
    const a = res.lhr.audits;
    const shifts = ((a['layout-shifts'] && a['layout-shifts'].details && a['layout-shifts'].details.items) || [])
      .map((it) => it.score.toFixed(3) + ' ' + it.node.selector.split('>').pop().trim() + ' [' + ((it.subItems && it.subItems.items) || []).map((s) => s.cause).join(', ') + ']');
    console.log(`perf ${Math.round(res.lhr.categories.performance.score * 100)}  CLS ${a['cumulative-layout-shift'].displayValue}  TBT ${a['total-blocking-time'].displayValue}  LCP ${a['largest-contentful-paint'].displayValue}  | ${shifts.join(' ; ') || 'geen verschuivingen'}`);
  }
} finally {
  await chrome.kill();
  server.kill();
}
