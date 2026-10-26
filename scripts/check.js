const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === '.git' || e.name === 'website' || e.name === 'archives' || e.name === '.local-study' ? [] : e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
let count = 0;
for (const file of walk(root)) {
  if (file.endsWith('.js')) { execFileSync(process.execPath, ['--check', file]); count++; }
  if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file,'utf8'));
}
console.log('Checked '+count+' active JavaScript files and JSON configuration; archives excluded.');
