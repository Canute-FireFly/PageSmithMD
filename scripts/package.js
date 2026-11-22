// Builds the portable Windows app into release/PageSmithMD-win32-x64
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { packager } = require('@electron/packager');

const root = path.join(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'vendor.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'make-icon.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'notices.js')], { stdio: 'inherit' });

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
}).then((paths) => {
  // Our licence and the third-party notices next to PageSmithMD.exe (Electron's own LICENSE is already there)
  for (const out of paths) {
    fs.copyFileSync(path.join(root, 'LICENSE'), path.join(out, 'LICENSE-PageSmithMD.txt'));
    fs.copyFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), path.join(out, 'THIRD-PARTY-NOTICES.md'));
  }
  console.log('Built:', paths.join('\n'));
});
