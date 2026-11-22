# Contributing to PageSmithMD

Thanks for helping! Bug reports, ideas and code are all welcome.

## Reporting bugs and asking for features
- Search the [existing issues](https://github.com/Canute-FireFly/PageSmithMD/issues) first.
- Use the **Bug report** or **Feature request** form when you open a new issue. For bugs, the
  PageSmithMD version (Help > About), your Windows version and the steps to reproduce help a lot;
  attaching a small `.md` file that shows the problem helps even more.
- Security problems: please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Before you write code
For anything bigger than a small fix, open an issue first so we can agree on the approach. It saves
everyone time and avoids two people working on the same thing.

## Getting set up
You need Windows 10 or 11 and [Node.js](https://nodejs.org/) 20 or later.

    git clone https://github.com/Canute-FireFly/PageSmithMD.git
    cd PageSmithMD
    npm install              also copies the browser libraries into renderer/vendor
    npm start                run from source (add a file path to open it)
    npm start -- docs/example.md

Developer tools are available when running from source (View > Toggle Developer Tools); they are
left out of the installed app.

To build what we ship:

    npm run dist             release/installer: Setup .exe and portable .zip

If the build stops with "Cannot create symbolic link … A required privilege is not held by the
client", that's a known electron-builder issue on Windows without Developer Mode: turn on Developer
Mode (Settings > System > For developers), or run the build once from an administrator terminal.

## How the code is organised
There's no framework and no bundler, just plain JavaScript:

| Path | What it does |
|---|---|
| `main.js` | Electron main process: windows, menus, files, settings, auto-save and recovery storage, image saving |
| `preload.js` | The small, explicit bridge between the page and the main process |
| `renderer/index.html` | The window's layout |
| `renderer/app.js` | Everything on the page: rendering, editing, toolbar, sidebar, find, tables, maths, links, menu bar |
| `renderer/style.css` | Styles, with light and dark themes as CSS variables |
| `renderer/vendor/` | Libraries copied from `node_modules` by `scripts/vendor.js` (not committed) |
| `scripts/` | Build helpers: vendor copy, icon, third-party notices, packaging |
| `docs/` | The example document and README screenshots |

How editing works: the Markdown text is the source of truth. It's turned into HTML with
[marked](https://marked.js.org/) for display; when you edit the page, the HTML is turned back into
Markdown with [Turndown](https://github.com/mixmark-io/turndown) and tidied.

## Ground rules for changes
- **Never change a user's file unexpectedly.** Opening and saving a file without editing it must
  leave it byte-for-byte the same, and editing one paragraph shouldn't rewrite others. Check the
  Markdown in Split view after your change.
- **Keep files portable.** Anything PageSmithMD writes should still read well on GitHub and in other
  Markdown editors.
- **Safety first:** treat every document as untrusted. HTML from documents is always sanitised with
  DOMPurify, and the page has no direct access to Node.js; anything that reaches outside the app
  (opening links, files or programs) goes through `main.js` and must stay deliberate and limited.
- Match the style of the surrounding code; keep functions small and add a short comment where the
  *why* isn't obvious.
- Update the README (and the third-party notices, via `node scripts/notices.js`) when you add a
  feature or a library.

## Testing your change
There are no automated tests yet, so please try your change in the app:
1. Open `docs/example.md` and a few of your own files in Read, Edit and Split.
2. Make an edit, save, and check the Markdown in Split view is what you expect.
3. Check both light and dark themes.
4. Run `npm run dist` once to make sure the installer still builds.

## Making a release (maintainers)
1. Update `version` in `package.json` (for example `0.9.1`) and add a section for it to
   `CHANGELOG.md`; commit both.
2. Tag the commit with the same version and push the tag:

       git tag v0.9.1
       git push origin v0.9.1

3. GitHub Actions ([release.yml](.github/workflows/release.yml)) builds the Setup .exe, the portable
   .zip and the update files on Windows and uploads them to a **draft** release. The build fails if
   the tag doesn't match `package.json`.
4. Open the draft on the [Releases page](https://github.com/Canute-FireFly/PageSmithMD/releases),
   paste in the changelog section as the description, try the Setup, then press **Publish**.
   Installed copies see the update only once it's published.

## Sending a pull request
1. Fork the repository and create a branch from `main`.
2. Keep each pull request to one change, with a clear title and a description of what and why.
3. Fill in the checklist in the pull request template.

By contributing, you agree that your contribution is licensed under the project's
[MIT licence](LICENSE).

Please be kind and constructive; see the [Code of Conduct](CODE_OF_CONDUCT.md).
