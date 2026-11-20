// Copies browser-ready libraries from node_modules into renderer/vendor
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'renderer', 'vendor');
fs.mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/marked/lib/marked.umd.js', 'marked.js'],
  ['node_modules/dompurify/dist/purify.min.js', 'purify.js'],
  ['node_modules/turndown/lib/turndown.browser.umd.js', 'turndown.js'],
  ['node_modules/turndown-plugin-gfm/dist/turndown-plugin-gfm.js', 'turndown-gfm.js'],
  ['node_modules/@highlightjs/cdn-assets/highlight.min.js', 'highlight.js'],
  ['node_modules/@highlightjs/cdn-assets/styles/github.min.css', 'hljs-light.css'],
  ['node_modules/@highlightjs/cdn-assets/styles/github-dark.min.css', 'hljs-dark.css'],
];
for (const [from, to] of files) fs.copyFileSync(path.join(root, from), path.join(out, to));
console.log('vendor files copied');
