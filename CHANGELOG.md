# Changelog

Notable changes to PageSmithMD. The format follows [Keep a Changelog](https://keepachangelog.com/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.0] - first public beta

### Reading and editing
- Read, Edit (type on the formatted page) and Split (Markdown and page side by side, in sync) modes.
- Tabs, drag and drop to open files, and a formatting toolbar.
- Markdown shortcuts while typing: headings, lists, tasks, quotes, rules and code blocks at the start
  of a line; bold, italic, strikethrough, code, highlight, links and maths as you close them.
- Pasted Markdown is formatted; Ctrl+Shift+V pastes plain text.
- Find and replace with match case and whole word.

### Content
- Tables with tools to add or delete rows and columns and set alignment; Tab and Enter move between cells.
- Maths with KaTeX (`$…$`, `$$…$$` and ```` ```math ```` blocks).
- GitHub-style callouts (`> [!NOTE]` and friends) and highlights.
- Paste or drop images; they're saved in an `images` folder next to the document.
- Link dialog to add, edit and remove links; paste a web address over words to link them.
- YAML front matter is shown as a panel and never changed by editing the page.
- Code highlighting, printing and PDF export.

### Workspace
- Outline sidebar with the current section highlighted, and recent files.
- Reopen last session, light/dark/follow-Windows theme and a larger menu bar that follows the theme.
- Auto-save (pauses if another program changed the file) and crash recovery for unsaved changes.

### Safety
- Links in documents never start programs or scripts; pictures, PDFs, office documents and folders
  open only after you confirm.

### Install and updates
- Update check against GitHub releases: asks before downloading, installs on restart; can be turned
  off; the portable version links to the download page.
- Windows installer (per user, no admin, .md file types, uninstall from Settings > Apps) and a portable zip.

[Unreleased]: https://github.com/Canute-FireFly/PageSmithMD/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/Canute-FireFly/PageSmithMD/releases/tag/v0.9.0
