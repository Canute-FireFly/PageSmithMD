// Writes THIRD-PARTY-NOTICES.md: the licences of the libraries bundled into PageSmithMD,
// taken from each package's own licence file so it stays correct when they are updated.
// Run by `npm run package`; can also be run on its own with `node scripts/notices.js`.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

// Libraries copied into the app (see scripts/vendor.js), plus Electron itself
const bundled = [
  { pkg: 'electron', use: 'Application runtime' },
  { pkg: 'marked', use: 'Markdown to HTML' },
  { pkg: 'dompurify', use: 'HTML sanitising', note: 'Dual licensed (MPL-2.0 OR Apache-2.0); used under Apache-2.0.' },
  { pkg: 'turndown', use: 'HTML to Markdown' },
  { pkg: 'turndown-plugin-gfm', use: 'Tables, task lists and strikethrough for Turndown' },
  { pkg: '@highlightjs/cdn-assets', name: 'highlight.js', use: 'Code highlighting' },
  { pkg: 'katex', use: 'Maths typesetting (including its fonts)' },
];

function licenceText(dir) {
  const f = fs.readdirSync(dir).find((n) => /^licen[cs]e(\.md|\.txt)?$/i.test(n));
  return f ? fs.readFileSync(path.join(dir, f), 'utf8').trim() : null;
}

let out = `# Third-party notices

PageSmithMD is released under the MIT licence (see LICENSE). It includes the following
open-source software, each under its own licence, reproduced below.

Electron also includes Chromium and other components; their licences are listed in
\`LICENSES.chromium.html\`, which is shipped next to \`PageSmithMD.exe\`.

| Component | Version | Licence | Used for |
|---|---|---|---|
`;
const sections = [];
for (const b of bundled) {
  const dir = path.join(root, 'node_modules', b.pkg);
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const name = b.name || pj.name;
  const licence = typeof pj.license === 'string' ? pj.license : (pj.license && pj.license.type) || 'see below';
  const text = licenceText(dir);
  if (!text) throw new Error(`No licence file found for ${b.pkg}`);
  out += `| ${name} | ${pj.version} | ${licence} | ${b.use} |\n`;
  const home = pj.homepage || (pj.repository && (pj.repository.url || pj.repository)) || '';
  sections.push(`## ${name} ${pj.version}\n\n${home ? `<${String(home).replace(/^git\+/, '')}>\n\n` : ''}${b.note ? b.note + '\n\n' : ''}\`\`\`text\n${text}\n\`\`\`\n`);
}
out += '\n' + sections.join('\n');
fs.writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), out);
console.log('THIRD-PARTY-NOTICES.md written');
