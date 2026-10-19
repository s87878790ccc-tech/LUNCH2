'use strict';
const https = require('node:https');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const docs = path.join(__dirname, '../../docs');
const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunch-ui-tls-'));
const keyFile = path.join(certDir, 'local.key'), certFile = path.join(certDir, 'local.crt');
execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'], { stdio:'ignore' });
const tls = { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
fs.rmSync(certDir, { recursive:true, force:true });
https.createServer(tls, (req, res) => {
  const pathname = new URL(req.url, 'https://127.0.0.1:4173').pathname;
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!['index.html', 'app.js', 'styles.css'].includes(name)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  fs.createReadStream(path.join(docs, name)).pipe(res);
}).listen(4173, '127.0.0.1');

// A real second loopback origin is needed for frame tests. A fulfilled virtual
// public origin can trigger Chrome's local-network checks before loading the app.
https.createServer(tls, (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  const port = req.url === '/secure' ? 4175 : 4173;
  res.end(`<!doctype html><title>Isolated frame test</title><iframe title="embedded lunch" src="https://127.0.0.1:${port}/" width="380" height="800"></iframe>`);
}).listen(4174, '127.0.0.1');

// The actual Express UI handler and headers, without start()/seed()/DB access.
process.env.DATABASE_URL = 'postgres://isolated:isolated@127.0.0.1:1/lunch_test';
process.env.JWT_SECRET = 'isolated-ui-header-test-secret';
process.env.ADMIN_DEFAULT_PASS = 'isolated-ui-admin';
process.env.SEAT_DEFAULT_PASS = 'isolated-ui-seat';
https.createServer(tls, require('../server').app).listen(4175, '127.0.0.1');
