# Registers (or replaces) the Windows scheduled task that runs run.ps1 at a fixed interval.
#   pwsh -File install-task.ps1                 every 10 minutes
#   pwsh -File install-task.ps1 -EveryMinutes 5
#   pwsh -File install-task.ps1 -Remove
param(
    [int]$EveryMinutes = 10,
    [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$cfg = Get-Content "$Root\config.json" -Raw | ConvertFrom-Json
$name = $cfg.taskName

if ($Remove) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    "Task $name removed."
    return
}

$pwsh = (Get-Command pwsh).Source
# conhost --headless keeps the PowerShell console from flashing on screen at every run.
$action = New-ScheduledTaskAction -Execute 'conhost.exe' `
    -Argument "--headless `"$pwsh`" -NoProfile -ExecutionPolicy Bypass -File `"$Root\run.ps1`"" -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes) -RepetitionDuration (New-TimeSpan -Days 60)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
# Runs in the logged-in session: the check needs a real Chrome window (minimized).
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
"Task $name registered: every $EveryMinutes min, trip $($cfg.trip.label) on $($cfg.trip.date) ($($cfg.trip.slot))."
