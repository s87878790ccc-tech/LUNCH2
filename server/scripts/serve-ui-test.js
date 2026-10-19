'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const docs = path.join(__dirname, '../../docs');
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1:4173').pathname;
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!['index.html', 'app.js', 'styles.css'].includes(name)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  fs.createReadStream(path.join(docs, name)).pipe(res);
}).listen(4173, '127.0.0.1');

// A real second loopback origin is needed for frame tests. A fulfilled virtual
// public origin can trigger Chrome's local-network checks before loading the app.
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  const port = req.url === '/secure' ? 4175 : 4173;
  res.end(`<!doctype html><title>Isolated frame test</title><iframe title="embedded lunch" src="http://127.0.0.1:${port}/" width="380" height="800"></iframe>`);
}).listen(4174, '127.0.0.1');

// The actual Express UI handler and headers, without start()/seed()/DB access.
process.env.DATABASE_URL = 'postgres://isolated:isolated@127.0.0.1:1/lunch_test';
process.env.JWT_SECRET = 'isolated-ui-header-test-secret';
process.env.ADMIN_DEFAULT_PASS = 'isolated-ui-admin';
process.env.SEAT_DEFAULT_PASS = 'isolated-ui-seat';
require('../server').app.listen(4175, '127.0.0.1');
