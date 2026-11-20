// Builds the portable Windows app into dist/Markdown Viewer-win32-x64
const { execFileSync } = require('child_process');
const path = require('path');
const { packager } = require('@electron/packager');

const root = path.join(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'vendor.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'make-icon.js')], { stdio: 'inherit' });

packager({
  dir: root,
  name: 'Markdown Viewer',
  platform: 'win32',
  arch: 'x64',
  out: path.join(root, 'dist'),
  overwrite: true,
  prune: true,
  icon: path.join(root, 'build', 'icon.ico'),
  ignore: [/^\/dist/, /^\/scripts/, /^\/build\/icon\.png/, /^\/\.git/, /^\/README/],
}).then((paths) => console.log('Built:', paths.join('\n')));
