# PageSmithMD

Small Electron app for Windows: view and edit Markdown files locally.

- Tabs: every file opens in a new tab in the same window
- Modes: Read (read-only), Edit (type on the rendered page, Word-style) and Split (Markdown source + editable page)
- Formatting toolbar: bold, italic, strikethrough, code, headings, lists, task list, quote, link, image, code block, table, rule, undo
- GitHub-style rendering, code highlighting, relative images and links, light/dark follows Windows
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

## Shortcuts
Ctrl+O open, Ctrl+N new tab, Ctrl+W close tab, Ctrl+Tab next tab, Ctrl+S save, Ctrl+Shift+S save as,
Ctrl+1/2/3 Read/Edit/Split, Ctrl+B / Ctrl+I / Ctrl+K bold / italic / link, Ctrl+P print.
