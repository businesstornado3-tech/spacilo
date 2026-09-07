# Builds the EarnRoom Video Worker app and its installer on a Windows machine.
# The GitHub Actions workflow .github/workflows/windows-worker.yml runs exactly
# these steps on a clean Windows runner; this script is for building locally.
#
# The output is NOT code-signed, so Windows shows an "unknown publisher"
# warning until a code-signing certificate is added.

$ErrorActionPreference = "Stop"

python -m pip install --upgrade pip pyinstaller

pyinstaller --onefile --noconsole --name earnroom-worker `
  --hidden-import earnroom_core earnroom_app.py

$env:EARNROOM_WORKER_VERSION = if ($env:EARNROOM_WORKER_VERSION) { $env:EARNROOM_WORKER_VERSION } else { "1.0.0" }
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "installer\earnroom-worker.iss"

Write-Host "Installer: $(Resolve-Path '.\dist\EarnRoom-Video-Worker-Setup.exe')"
Write-Host "Publish it, then set EARNROOM_WORKER_INSTALLER_URL to its address."
