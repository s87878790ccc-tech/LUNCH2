const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../..'));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = files.filter(file => {
  const parts = file.toLowerCase().split('/');
  const name = parts.at(-1);
  return parts.some(part => ['node_modules', 'logs', 'uploads'].includes(part)) ||
    /^\.env(?:\.|$)/.test(name) && name !== '.env.example' ||
    /\.(?:log|db|sqlite\d*|dump|pem|key|sql\.gz)$/.test(name) ||
    /^(?:credentials|passwords)\./.test(name);
});
const unsafeDefaults = [];
for (const file of files.filter(name => /\.[cm]?[jt]s$/.test(name) && !name.startsWith('server/test/'))) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const fallback = /process\.env\.(?:JWT_SECRET|ADMIN_DEFAULT_PASS|SEAT_DEFAULT_PASS)\s*\|\|\s*['"`]/g;
  for (const match of source.matchAll(fallback)) unsafeDefaults.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
}
if (forbidden.length || unsafeDefaults.length) {
  console.error('禁止公開的檔案類型（僅列檔名，不輸出內容）：\n' + forbidden.map(file => JSON.stringify(file)).join('\n'));
  if (unsafeDefaults.length) console.error('不可寫死正式登入預設值：\n' + unsafeDefaults.join('\n'));
  process.exitCode = 1;
} else console.log(`Public file boundary passed: ${files.length} tracked files`);
