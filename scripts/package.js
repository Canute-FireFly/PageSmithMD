// Builds the portable Windows app into release/PageSmithMD-win32-x64
const { execFileSync } = require('child_process');
const path = require('path');
const { packager } = require('@electron/packager');

const root = path.join(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'vendor.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'make-icon.js')], { stdio: 'inherit' });

packager({
  dir: root,
  name: 'PageSmithMD',
  platform: 'win32',
  arch: 'x64',
  out: path.join(root, 'release'),
  overwrite: true,
  prune: true,
  icon: path.join(root, 'build', 'icon.ico'),
  ignore: [/^\/dist/, /^\/release/,/^\/scripts/, /^\/build\/icon\.png/, /^\/\.git/, /^\/README/],
}).then((paths) => console.log('Built:', paths.join('\n')));
