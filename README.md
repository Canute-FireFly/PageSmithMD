# PageSmithMD

Small Electron app for Windows: view and edit Markdown files locally.

- Tabs: every file opens in a new tab in the same window
- Modes: Read (read-only), Edit (type on the rendered page, Word-style) and Split (Markdown source + editable page)
- Markdown shortcuts while typing on the page: `# ` to `###### ` headings, `- ` / `1. ` lists, `[ ] ` tasks, `> ` quotes, `---` + Enter for a rule, `` ```lang `` + Enter for a code block, and `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `==highlight==`, `[text](url)` as you close them (Ctrl+Z right after puts the characters back; Edit > Markdown shortcuts while typing turns it off)
- Formatting toolbar: bold, italic, strikethrough, highlight, code, headings, lists, task list, quote, callout, link, image, code block, table, rule, undo
- Sidebar: document outline (click a heading to jump; the current section is highlighted) and recent files; hide it with the slim edge button or Ctrl+Shift+L
- Maths (KaTeX): `$E = mc^2$` inline, `$$ ... $$` on their own lines or a ```math fence for display formulas; the Σ toolbar button inserts one, double-click a formula to edit it, and typing `$x^2$` converts as you close it. Prices like $5 and $10 stay as text
- Front matter: a YAML block (`---` ... `---`) at the top is shown as a read-only panel, left out of the outline, and kept exactly as written when you edit the page; change it in Split view
- Highlight: saved as `<mark>text</mark>` so GitHub shows it too; `==text==` (Typora/Obsidian) is also shown and kept
- Callouts: GitHub alerts `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`; insert one with the Callout button
- Links: Ctrl+K (or the Link button) asks for the address and the text to show; with the cursor in a link it opens it to change, with Remove link. Paste a web address over selected words to link them. Hover a link to see where it goes; click (Read) or Ctrl+click (Edit) opens websites in your browser. Website links get a small ↗ (View > Mark links to websites)
- Paste Markdown: text pasted onto the page is read as Markdown (formulas, bold, lists, headings...); Ctrl+Shift+V pastes it literally
- Paste images: paste a screenshot (Ctrl+V) or drop an image file while editing; it is saved in an `images` folder next to the document and linked with a relative path (a new document is saved first)
- Table tools: with the cursor in a table (Edit/Split), a small bar adds or deletes rows and columns, aligns a column (saved as :--- / :---: / ---:) or deletes the table; Tab / Shift+Tab move between cells (Tab in the last cell adds a row), Enter moves down a row
- Find and replace (Ctrl+F / Ctrl+H): highlights every match, match case and whole word options, Enter / Shift+Enter or F3 to step; replacing keeps formatting and works in Edit and Split mode
- Auto-save (File > Auto-save, on by default): a named file is saved about 2 seconds after you stop typing, and when you switch tab or window; if another program changed the file on disk, auto-save pauses for it until you press Ctrl+S
- Recovery: unsaved changes (including Untitled documents) are copied to `%APPDATA%\PageSmithMD\recovery` as you work; if PageSmithMD or Windows closes unexpectedly, the next start offers to restore them. A normal exit clears the copies
- Reopen last session: the files you had open come back next time, in the same mode (File > Reopen last session on start)
- Menu bar: drawn by the app in a larger font that follows the theme (Alt, Alt+F/E/V and arrow keys work as usual)
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
