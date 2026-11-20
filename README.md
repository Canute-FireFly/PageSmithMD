# Markdown Viewer

Small Electron app: view and edit Markdown files locally. Preview / Split / Editor modes,
GitHub-style rendering, code highlighting, tables, task lists, relative images and links,
light/dark follows Windows, PDF export, drag and drop, multiple windows.

## Run from source
    npm install
    npm start [file.md]

## Build and install (current user, no admin)
    npm run package
    powershell -ExecutionPolicy Bypass -File install.ps1

Installs to `%LOCALAPPDATA%\Programs\Markdown Viewer`, adds Start menu and Desktop shortcuts and
registers .md/.markdown/.mdown/.mkd. Windows 11 won't let an app make itself the default, so do
once: right-click a .md file > Open with > Choose another app > Markdown Viewer > Always.

Remove with `uninstall.ps1`.

## Shortcuts
Ctrl+O open, Ctrl+S save, Ctrl+Shift+S save as, Ctrl+N new window, Ctrl+1/2/3 modes,
Ctrl+B / Ctrl+I bold / italic in the editor, Ctrl+P print.
