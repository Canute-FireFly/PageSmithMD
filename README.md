# PageSmithMD

Small Electron app for Windows: view and edit Markdown files locally.

- Tabs: every file opens in a new tab in the same window
- Modes: Read (read-only), Edit (type on the rendered page, Word-style) and Split (Markdown source + editable page)
- Formatting toolbar: bold, italic, strikethrough, highlight, code, headings, lists, task list, quote, callout, link, image, code block, table, rule, undo
- Sidebar: document outline (click a heading to jump; the current section is highlighted) and recent files; hide it with the slim edge button or Ctrl+Shift+L
- Front matter: a YAML block (`---` ... `---`) at the top is shown as a read-only panel, left out of the outline, and kept exactly as written when you edit the page; change it in Split view
- Highlight: saved as `<mark>text</mark>` so GitHub shows it too; `==text==` (Typora/Obsidian) is also shown and kept
- Callouts: GitHub alerts `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`; insert one with the Callout button
- Paste images: paste a screenshot (Ctrl+V) or drop an image file while editing; it is saved in an `images` folder next to the document and linked with a relative path (a new document is saved first)
- Table tools: with the cursor in a table (Edit/Split), a small bar adds or deletes rows and columns, aligns a column (saved as :--- / :---: / ---:) or deletes the table; Tab / Shift+Tab move between cells (Tab in the last cell adds a row), Enter moves down a row
- Find and replace (Ctrl+F / Ctrl+H): highlights every match, match case and whole word options, Enter / Shift+Enter or F3 to step; replacing keeps formatting and works in Edit and Split mode
- Reopen last session: the files you had open come back next time, in the same mode (File > Reopen last session on start)
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
Theme, sidebar open/closed, the recent files list and the last session are saved per Windows user in
`%APPDATA%\PageSmithMD\settings.json`. Delete that file to reset them.

## Shortcuts
Ctrl+O open, Ctrl+N new document, Ctrl+W close tab, Ctrl+Tab next tab, Ctrl+S save, Ctrl+Shift+S save as,
Ctrl+1/2/3 Read/Edit/Split, Ctrl+B / Ctrl+I / Ctrl+K bold / italic / link, Ctrl+F find, Ctrl+H replace, Ctrl+Shift+H highlight, Ctrl+P print, Ctrl+Shift+L show/hide sidebar.
