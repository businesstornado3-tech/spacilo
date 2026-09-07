# Builds the EarnRoom desktop video worker into a single Windows executable and
# starts it at logon. Run from this folder in PowerShell.
#
# There is no signed installer yet: this script is the packaging step a person
# still has to run on the machine.

$ErrorActionPreference = "Stop"

python -m pip install --upgrade pip
python -m pip install -r requirements.txt pyinstaller

pyinstaller --onefile --name earnroom-worker --console earnroom_worker.py

$exe = Join-Path (Resolve-Path ".\dist") "earnroom-worker.exe"
Write-Host "Built $exe"

$task = "EarnRoom video worker"
$action = New-ScheduledTaskAction -Execute $exe
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Force | Out-Null
Write-Host "Registered '$task' to start at logon."
Write-Host "Pair it once with: $exe --pair <setup code> --site https://earnroom.co.uk"
