# Removes Markdown Viewer, its registry entries and shortcuts (current user).
$ErrorActionPreference = 'SilentlyContinue'
Get-Process -Name 'Markdown Viewer' | Stop-Process -Force
Remove-Item (Join-Path $env:LOCALAPPDATA 'Programs\Markdown Viewer') -Recurse -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'Markdown Viewer.lnk') -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Markdown Viewer.lnk') -Force
$cls = 'HKCU:\Software\Classes'
Remove-Item "$cls\MarkdownViewer.md" -Recurse -Force
Remove-Item "$cls\Applications\Markdown Viewer.exe" -Recurse -Force
Remove-Item 'HKCU:\Software\MarkdownViewer' -Recurse -Force
Remove-ItemProperty 'HKCU:\Software\RegisteredApplications' -Name 'Markdown Viewer'
foreach ($ext in '.md', '.markdown', '.mdown', '.mkd') {
    Remove-ItemProperty "$cls\$ext\OpenWithProgids" -Name 'MarkdownViewer.md'
}
Write-Host 'Uninstalled.'
