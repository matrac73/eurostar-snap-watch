# One check of the Eurostar Snap site for the trip in config.json, with an email when tickets open.
# Run by the scheduled task (see install-task.ps1), or by hand:
#   pwsh -File run.ps1                      normal check
#   pwsh -File run.ps1 -Date 2026-11-25 -Test   full dry run on another date: mail marked [TEST], no state saved
param(
    [string]$Date,
    [switch]$Test,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$cfg = Get-Content "$Root\config.json" -Raw | ConvertFrom-Json
$trip = $cfg.trip
if ($Date) { $trip.date = $Date }

New-Item -ItemType Directory -Force "$Root\state", "$Root\logs" | Out-Null
$logFile = "$Root\logs\$(Get-Date -Format 'yyyy-MM-dd').log"
function Log($m) { "$(Get-Date -Format 'HH:mm:ss') $m" | Add-Content $logFile -Encoding utf8 }

$key = "$($trip.origin)-$($trip.destination)-$($trip.date)"
$stateFile = "$Root\state\$key.json"
$state = if ((Test-Path $stateFile) -and -not $Test) { Get-Content $stateFile -Raw | ConvertFrom-Json } else { $null }
if (-not $state) { $state = [pscustomobject]@{ notified = $false; otherSlotNotified = $false; errors = 0; errorAlertSent = $false } }

function Save-State { if (-not $Test) { $state | ConvertTo-Json | Set-Content $stateFile -Encoding utf8 } }

function Send-Mail($subject, $html) {
    $cred = Import-Clixml $cfg.mail.credentialFile   # DPAPI-encrypted, readable only by this Windows user
    $msg = New-Object Net.Mail.MailMessage
    $msg.From = $cfg.mail.from
    foreach ($to in $cfg.mail.to) { $msg.To.Add($to) }
    $msg.Subject = $(if ($Test) { "[TEST] $subject" } else { $subject })
    $msg.SubjectEncoding = [Text.Encoding]::UTF8
    $msg.BodyEncoding = [Text.Encoding]::UTF8
    $msg.IsBodyHtml = $true
    $msg.Body = $html
    $smtp = New-Object Net.Mail.SmtpClient($cfg.mail.smtpHost, [int]$cfg.mail.smtpPort)
    $smtp.EnableSsl = $true
    $smtp.Credentials = $cred.GetNetworkCredential()
    try { $smtp.Send($msg) } finally { $msg.Dispose(); $smtp.Dispose() }
}

# The trip is over or already notified: nothing left to do, switch the task off.
$tripDate = [datetime]::ParseExact($trip.date, 'yyyy-MM-dd', $null)
if (-not $Test -and ($state.notified -or (Get-Date).Date -ge $tripDate)) {
    Log "done (notified=$($state.notified)), disabling task"
    Disable-ScheduledTask -TaskName $cfg.taskName -ErrorAction SilentlyContinue | Out-Null
    return
}

$nodeArgs = @("$Root\watch.mjs", '--origin', $trip.origin, '--destination', $trip.destination,
    '--date', $trip.date, '--adults', $trip.adults, '--shot', "$Root\state\last.png")
$raw = & node @nodeArgs 2>&1 | Select-Object -Last 1
try { $r = "$raw" | ConvertFrom-Json } catch { $r = [pscustomobject]@{ status = 'error'; error = "unreadable output: $raw"; slots = @() } }
Log "$($trip.date) $($trip.slot): $($r.status) $(($r.slots | ForEach-Object { "$($_.period)=$($_.price)" }) -join ' ') $($r.error)"

$fr = [Globalization.CultureInfo]::GetCultureInfo('fr-FR')
$dateLabel = $tripDate.ToString('dddd d MMMM', $fr)
$periodLabel = @{ morning = 'matin'; afternoon = 'après-midi' }

function Slot-Lines($slots) {
    ($slots | ForEach-Object {
        $range = if ($_.to) { "départ entre $($_.from) et $($_.to)" } else { "départ à partir de $($_.from)" }
        "<li><b>$($periodLabel[$_.period])</b> ($range) : <b>$($_.price)</b> par personne &ndash; <a href=`"$($_.url)`">ouvrir ce créneau</a></li>"
    }) -join "`n"
}

if ($r.status -eq 'error') {
    $state.errors++
    # Six failed checks in a row: say so once, so a broken watcher is never silent.
    if ($state.errors -ge 6 -and -not $state.errorAlertSent) {
        Send-Mail "⚠️ Veille Eurostar Snap en panne ($dateLabel)" "<p>La veille Snap échoue depuis $($state.errors) vérifications.</p><p>Dernière erreur : <code>$($r.error)</code></p><p>Vérifie à la main : <a href=`"$($r.url)`">$($r.url)</a></p>"
        $state.errorAlertSent = $true
        Log 'error alert sent'
    }
    Save-State
    return
}
if ($state.errorAlertSent) {
    Send-Mail "✅ Veille Eurostar Snap repartie ($dateLabel)" "<p>La veille fonctionne à nouveau. Les billets du $dateLabel ne sont pas encore en vente.</p>"
    Log 'recovery mail sent'
}
$state.errors = 0
$state.errorAlertSent = $false

if ($r.status -eq 'available') {
    $wanted = @($r.slots | Where-Object period -eq $trip.slot)
    $others = @($r.slots | Where-Object period -ne $trip.slot)
    if ($wanted.Count -gt 0) {
        $s = $wanted[0]
        $html = @"
<p>Les billets <b>Eurostar Snap</b> du <b>$dateLabel</b> ($($trip.label)) sont en vente.</p>
<p style="font-size:16px">Créneau $($periodLabel[$s.period]) : <b>$($s.price) par personne</b>, $($trip.adults) adulte(s), départ entre $($s.from) et $($s.to).</p>
<p><a href="$($s.url)" style="background:#00286a;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px">Ouvrir la réservation pré-remplie</a></p>
<p>Le lien ouvre la page Snap avec la date, $($trip.adults) adulte(s) et le créneau $($periodLabel[$s.period]) déjà choisis : il reste à cliquer sur « Continuer », saisir les voyageurs et payer. Rien n'est réservé tant que ce n'est pas payé, et les places peuvent partir vite.</p>
<p>Tous les créneaux :</p><ul>
$(Slot-Lines $r.slots)
</ul>
<p style="color:#666;font-size:12px">Billets Snap : ni échangeables, ni remboursables. L'heure exacte du train est communiquée au plus tard 48 h avant le départ.<br>Vérifié le $(Get-Date -Format 'dd/MM/yyyy à HH:mm').</p>
"@
        Send-Mail "🚄 Eurostar Snap ouvert : $dateLabel $($periodLabel[$s.period]), $($s.price) par personne" $html
        Log "notification sent to $($cfg.mail.to.Count) recipient(s)"
        $state.notified = $true
        if ($cfg.openBrowserOnHit -and -not $NoBrowser) { Start-Process $s.url }
    }
    elseif (-not $state.otherSlotNotified) {
        $html = @"
<p>Les billets <b>Eurostar Snap</b> du <b>$dateLabel</b> ($($trip.label)) sont en vente, mais <b>pas sur le créneau $($periodLabel[$trip.slot])</b> pour l'instant.</p>
<ul>
$(Slot-Lines $others)
</ul>
<p>La veille continue pour le créneau $($periodLabel[$trip.slot]) et préviendra s'il apparaît.</p>
"@
        Send-Mail "🚄 Eurostar Snap $dateLabel : seulement l'autre créneau pour l'instant" $html
        Log 'other-slot notification sent'
        $state.otherSlotNotified = $true
    }
}
Save-State
