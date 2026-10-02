'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const port = 4175;
const origin = `http://127.0.0.1:${port}`;
const assets = path.join(__dirname, 'wallet-probe');
const logs = path.join(__dirname, '..', '.local', 'logs');
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403).end(); return; }
  if (req.method === 'GET' && ['/', '/probe.js'].includes(req.url)) {
    res.setHeader('Content-Type', req.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
    res.end(fs.readFileSync(path.join(assets, req.url === '/' ? 'index.html' : 'probe.js'))); return;
  }
  if (req.method === 'POST' && req.url === '/report' && req.headers.origin === origin) {
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 65536) { res.writeHead(413).end(); return; } }
      const report = JSON.parse(body);
      if (report.schema !== 'qianqi-wallet-capabilities-v1' || report.admitted !== false || report.targetChain !== '0x1237') throw Error('Invalid report');
      fs.mkdirSync(logs, {recursive:true});
      const file = `metamask-capabilities-${Date.now()}-${require('node:crypto').randomUUID()}.json`;
      fs.writeFileSync(path.join(logs, file), JSON.stringify(report, null, 2), {flag:'wx'});
      console.log(`Saved untrusted wallet observation: .local/logs/${file}`);
      res.writeHead(201).end('saved');
    } catch { res.writeHead(400).end('invalid report'); }
    return;
  }
  res.writeHead(404).end();
});
server.listen(port, '127.0.0.1', () => console.log(`Wallet probe: ${origin}`));
