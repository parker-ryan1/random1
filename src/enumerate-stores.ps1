$apiBase = "https://production-us-1.noq-servers.net/api/v1/application/stores"
$startId = 1
$endId = 1000
$found = [System.Collections.Generic.List[object]]::new()
$headers = @{
    "Accept"     = "application/json"
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
    "Origin"     = "https://orderonline.rouses.com"
    "Referer"    = "https://orderonline.rouses.com/"
}
Write-Host "Probing store IDs $startId to $endId..."
for ($id = $startId; $id -le $endId; $id++) {
    try {
        $resp = Invoke-RestMethod -Uri "$apiBase/$id/summary" -Headers $headers -TimeoutSec 8 -ErrorAction Stop
        $r = if ($resp.Result) { $resp.Result } else { $resp }
        $addr    = $r.Address
        $city    = if ($addr.Suburb)             { $addr.Suburb }            else { "" }
        $state   = if ($addr.State)              { $addr.State }             else { "" }
        $country = if ($addr.Country)            { $addr.Country }           else { "" }
        $slug    = if ($r.UrlSlug)               { $r.UrlSlug }              else { "" }
        $locName = if ($r.LocationBasedName)     { $r.LocationBasedName }    else { "" }
        $retailer = ""
        if ($locName -match "^(.+?) in (.+)$") { $retailer = $Matches[1].Trim() }
        if (-not $retailer) { $retailer = $r.Name }
        $entry = [PSCustomObject]@{
            id       = $id
            retailer = $retailer
            store    = $r.Name
            city     = $city
            state    = $state
            country  = $country
            slug     = $slug
        }
        $found.Add($entry)
        Write-Host "[$id] $($entry.retailer) -- $($entry.store) ($city, $state) slug=$slug"
    } catch {
        # no store at this ID
    }
    if ($id % 50 -eq 0) {
        Write-Host "--- $id/$endId probed, $($found.Count) found ---"
    }
}
$outputPath = Join-Path $PSScriptRoot "..\research\ps-store-enumeration.json"
$found | ConvertTo-Json -Depth 3 | Set-Content -Path $outputPath -Encoding UTF8
Write-Host "Done. Found $($found.Count) stores."
