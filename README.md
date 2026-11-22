# PageSmithMD

Small Electron app for Windows: view and edit Markdown files locally.

- Tabs: every file opens in a new tab in the same window
- Modes: Read (read-only), Edit (type on the rendered page, Word-style) and Split (Markdown source + editable page)
- Formatting toolbar: bold, italic, strikethrough, code, headings, lists, task list, quote, link, image, code block, table, rule, undo
- Sidebar: document outline (click a heading to jump; the current section is highlighted) and recent files; hide it with the slim edge button or Ctrl+Shift+L
- Theme: follow Windows, Light or Dark (status bar button or View > Theme), remembered between runs
- GitHub-style rendering, code highlighting, relative images and links
- PDF export, drag and drop, keeps a file's line endings

## Run from source
    npm install
    npm start [file.md]

## Build and install (current user, no admin)
    npm run package
    powershell -ExecutionPolicy Bypass -File install.ps1

Installs to `%LOCALAPPDATA%\Programs\PageSmithMD`, adds Start menu and Desktop shortcuts and
registers .md/.markdown/.mdown/.mkd. Windows 11 won't let an app make itself the default, so do
once: right-click a .md file > Open with > Choose another app > PageSmithMD > Always.

Remove with `uninstall.ps1`.

## Settings
Theme, sidebar open/closed and the recent files list are saved per Windows user in
`%APPDATA%\PageSmithMD\settings.json`. Delete that file to reset them.

## Shortcuts
Ctrl+O open, Ctrl+N new document, Ctrl+W close tab, Ctrl+Tab next tab, Ctrl+S save, Ctrl+Shift+S save as,
Ctrl+1/2/3 Read/Edit/Split, Ctrl+B / Ctrl+I / Ctrl+K bold / italic / link, Ctrl+P print, Ctrl+Shift+L show/hide sidebar.
