# Points the watcher at another trip: rewrites trip.json and the schedule of the GitHub workflow,
# then commits, pushes and re-enables the workflow.
#   pwsh -File set-trip.ps1 -Date 2027-02-14
#   pwsh -File set-trip.ps1 -Date 2027-02-14 -Slot afternoon -Adults 1 -Origin 7015400 -Destination 8727100 -Label "Londres → Paris"
#   pwsh -File set-trip.ps1 -Date 2027-02-14 -StartDate 2027-02-01 -NoPush
param(
    [Parameter(Mandatory)][string]$Date,
    [ValidateSet('morning', 'afternoon')][string]$Slot,
    [ValidateRange(1, 4)][int]$Adults,
    [string]$Origin,
    [string]$Destination,
    [string]$Label,
    [string]$StartDate,
    [int]$EveryMinutes = 15,
    [switch]$NoPush
)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$trip = Get-Content "$Root/trip.json" -Raw | ConvertFrom-Json
$d = [datetime]::ParseExact($Date, 'yyyy-MM-dd', $null)

# Default start: the Friday before sales are expected to open (Snap says up to 10 days ahead).
if ($StartDate) { $start = [datetime]::ParseExact($StartDate, 'yyyy-MM-dd', $null) }
else {
    $start = $d.AddDays(-11)
    while ($start.DayOfWeek -ne 'Friday') { $start = $start.AddDays(-1) }
}
$end = $d.AddDays(-1)
if ($start -gt $end) { throw "startDate $($start.ToString('yyyy-MM-dd')) is after the last day of watching." }

$trip.date = $Date
$trip.startDate = $start.ToString('yyyy-MM-dd')
if ($Slot) { $trip.slot = $Slot }
if ($Adults) { $trip.adults = $Adults }
if ($Origin) { $trip.origin = $Origin }
if ($Destination) { $trip.destination = $Destination }
if ($Label) { $trip.label = $Label }
$trip | ConvertTo-Json | Set-Content "$Root/trip.json" -Encoding utf8

# One cron line per calendar month between the start and the day before the trip (UTC).
$crons = @()
$m = Get-Date -Year $start.Year -Month $start.Month -Day 1
while ($m -le $end) {
    $from = if ($m.Year -eq $start.Year -and $m.Month -eq $start.Month) { $start.Day } else { 1 }
    $to = if ($m.Year -eq $end.Year -and $m.Month -eq $end.Month) { $end.Day } else { [datetime]::DaysInMonth($m.Year, $m.Month) }
    $crons += "    - cron: '*/$EveryMinutes * $from-$to $($m.Month) *'"
    $m = $m.AddMonths(1)
}
$wf = "$Root/.github/workflows/watch.yml"
$yml = Get-Content $wf -Raw
$yml = [regex]::Replace($yml, "(?m)(^    - cron: .*\r?\n)+", (($crons -join "`n") + "`n"), 1)
Set-Content $wf $yml -NoNewline

"Trip: $($trip.label), $Date ($($trip.slot)), $($trip.adults) adult(s). Watching from $($trip.startDate) to $($end.ToString('yyyy-MM-dd')), every $EveryMinutes min."
if ($NoPush) { return }
git -C $Root add trip.json .github/workflows/watch.yml
git -C $Root commit -q -m "Watch $($trip.label) on $Date"
git -C $Root push -q
gh workflow enable watch.yml --repo (git -C $Root remote get-url origin) 2>&1 | Out-Null
"Pushed, workflow enabled."
