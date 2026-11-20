# Installs Markdown Viewer for the current user (no admin needed):
#  - copies the built app to %LOCALAPPDATA%\Programs\Markdown Viewer
#  - registers it as an app for .md / .markdown / .mdown / .mkd files ("Open with")
#  - creates Start menu and Desktop shortcuts
# Run:  powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'dist\Markdown Viewer-win32-x64'
if (-not (Test-Path (Join-Path $src 'Markdown Viewer.exe'))) {
    throw "Build not found. Run 'npm run package' first."
}
$dest = Join-Path $env:LOCALAPPDATA 'Programs\Markdown Viewer'
$exe  = Join-Path $dest 'Markdown Viewer.exe'

Get-Process -Name 'Markdown Viewer' -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item "$src\*" $dest -Recurse -Force

# --- file association registration (per user) ---
$progId = 'MarkdownViewer.md'
$cls = 'HKCU:\Software\Classes'
New-Item -Path "$cls\$progId" -Force | Out-Null
Set-ItemProperty -Path "$cls\$progId" -Name '(default)' -Value 'Markdown document'
New-Item -Path "$cls\$progId\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$cls\$progId\DefaultIcon" -Name '(default)' -Value "`"$exe`",0"
New-Item -Path "$cls\$progId\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$cls\$progId\shell\open\command" -Name '(default)' -Value "`"$exe`" `"%1`""

$appKey = "$cls\Applications\Markdown Viewer.exe"
New-Item -Path "$appKey\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$appKey\shell\open\command" -Name '(default)' -Value "`"$exe`" `"%1`""

$capKey = 'HKCU:\Software\MarkdownViewer\Capabilities'
New-Item -Path "$capKey\FileAssociations" -Force | Out-Null
Set-ItemProperty -Path $capKey -Name 'ApplicationName' -Value 'Markdown Viewer'
Set-ItemProperty -Path $capKey -Name 'ApplicationDescription' -Value 'Simple Markdown viewer and editor'
New-Item -Path 'HKCU:\Software\RegisteredApplications' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\RegisteredApplications' -Name 'Markdown Viewer' -Value 'Software\MarkdownViewer\Capabilities'

foreach ($ext in '.md', '.markdown', '.mdown', '.mkd') {
    New-Item -Path "$cls\$ext\OpenWithProgids" -Force | Out-Null
    New-ItemProperty -Path "$cls\$ext\OpenWithProgids" -Name $progId -Value ([byte[]]@()) -PropertyType None -Force | Out-Null
    Set-ItemProperty -Path "$capKey\FileAssociations" -Name $ext -Value $progId
}

# --- shortcuts ---
$ws = New-Object -ComObject WScript.Shell
$targets = @(
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Markdown Viewer.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Markdown Viewer.lnk')
)
foreach ($t in $targets) {
    $s = $ws.CreateShortcut($t)
    $s.TargetPath = $exe
    $s.WorkingDirectory = $dest
    $s.IconLocation = "$exe,0"
    $s.Description = 'Markdown viewer and editor'
    $s.Save()
}

# Tell Explorer the associations changed
Add-Type -Namespace Win32 -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, int f, IntPtr a, IntPtr b);'
[Win32.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "Installed to $dest"
Write-Host "Shortcuts: Start menu + Desktop."
Write-Host "Last step: right-click any .md file > Open with > Choose another app > Markdown Viewer > 'Always'."
