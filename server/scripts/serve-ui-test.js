'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const docs = path.join(__dirname, '../../docs');
http.createServer((req, res) => {
  const name = req.url === '/' ? 'index.html' : req.url?.slice(1);
  if (!['index.html', 'app.js', 'styles.css'].includes(name)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  fs.createReadStream(path.join(docs, name)).pipe(res);
}).listen(4173, '127.0.0.1');
