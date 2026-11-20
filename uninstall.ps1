# Removes PageSmithMD, its registry entries and shortcuts (current user).
$ErrorActionPreference = 'SilentlyContinue'
Get-Process -Name 'PageSmithMD' | Stop-Process -Force
Remove-Item (Join-Path $env:LOCALAPPDATA 'Programs\PageSmithMD') -Recurse -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'PageSmithMD.lnk') -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'PageSmithMD.lnk') -Force
$cls = 'HKCU:\Software\Classes'
Remove-Item "$cls\PageSmithMD.md" -Recurse -Force
Remove-Item "$cls\Applications\PageSmithMD.exe" -Recurse -Force
Remove-Item 'HKCU:\Software\PageSmithMD' -Recurse -Force
Remove-ItemProperty 'HKCU:\Software\RegisteredApplications' -Name 'PageSmithMD'
foreach ($ext in '.md', '.markdown', '.mdown', '.mkd') {
    Remove-ItemProperty "$cls\$ext\OpenWithProgids" -Name 'PageSmithMD.md'
}
Write-Host 'Uninstalled.'
