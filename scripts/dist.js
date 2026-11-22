// Builds the downloads for a release into release/installer:
//   PageSmithMD-Setup-<version>.exe   per-user installer (no admin), Start menu + Desktop shortcuts,
//                                     .md file types, uninstall from Settings > Apps
//   PageSmithMD-<version>-portable.zip  unzip and run
// Settings are in package.json under "build".
const { execFileSync } = require('child_process');
const path = require('path');

for (const step of ['vendor.js', 'make-icon.js', 'notices.js']) {
  execFileSync(process.execPath, [path.join(__dirname, step)], { stdio: 'inherit' });
}

const builder = require('electron-builder');
builder.build({ win: ['nsis', 'zip'], publish: 'never' })
  .then((files) => console.log('Built:\n  ' + files.filter((f) => /\.(exe|zip)$/i.test(f)).join('\n  ')))
  .catch((err) => { console.error(err); process.exit(1); });
