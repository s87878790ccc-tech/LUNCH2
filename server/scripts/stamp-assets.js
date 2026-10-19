'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const docs = path.join(__dirname, '../../docs');
const file = path.join(docs, 'index.html');
let html = fs.readFileSync(file, 'utf8');
for (const asset of ['app.js', 'styles.css']) {
  const version = crypto.createHash('sha256').update(fs.readFileSync(path.join(docs, asset))).digest('hex').slice(0, 12);
  html = html.replace(new RegExp(`(src|href)="${asset.replace('.', '\\.')}[^\"]*"`, 'g'), `$1="${asset}?v=${version}"`);
}
fs.writeFileSync(file, html);
console.log('Frontend asset versions updated.');
