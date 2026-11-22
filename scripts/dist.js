// Builds the downloads for a release into release/installer:
//   PageSmithMD-Setup-<version>.exe     per-user installer (no admin), Start menu + Desktop shortcuts,
//                                       .md file types, uninstall from Settings > Apps
//   PageSmithMD-<version>-portable.zip  unzip and run
//   latest.yml + .blockmap               what the app's update check reads
// Settings are in package.json under "build".
//
//   node scripts/dist.js            build only (what `npm run dist` does)
//   node scripts/dist.js --publish  build and upload to a draft GitHub release (needs GH_TOKEN;
//                                   used by .github/workflows/release.yml)
const { execFileSync } = require('child_process');
const path = require('path');

const publish = process.argv.includes('--publish');
if (publish && !process.env.GH_TOKEN) {
  console.error('--publish needs a GitHub token in GH_TOKEN');
  process.exit(1);
}

for (const step of ['vendor.js', 'make-icon.js', 'notices.js']) {
  execFileSync(process.execPath, [path.join(__dirname, step)], { stdio: 'inherit' });
}

const builder = require('electron-builder');
builder.build({ win: ['nsis', 'zip'], publish: publish ? 'always' : 'never' })
  .then((files) => console.log('Built:\n  ' + files.filter((f) => /\.(exe|zip)$/i.test(f)).join('\n  ')))
  .catch((err) => { console.error(err); process.exit(1); });
