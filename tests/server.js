// Kleine statische server voor lokale tests. Geen afhankelijkheden.
const http = require('http');
const fs = require('fs');
const path = require('path');
const repo = path.resolve(__dirname, '..');
const root = path.join(repo, 'docs'); // alleen docs/ wordt gepubliceerd
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  // Het ontwerp staat buiten docs/ en is alleen lokaal bereikbaar, voor de pixelvergelijking.
  const file = p.startsWith('/design/') ? path.join(repo, p) : path.join(root, p);
  if (!file.startsWith(repo)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, () => console.log('http://localhost:' + port));
