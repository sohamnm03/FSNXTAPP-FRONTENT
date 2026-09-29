# Shared helper for the TRM deal API live tests (dot-source it).
# One fresh cookie session per call: a GET reusing the session of a PATCH/DELETE answered 501 (L-569).
# Needs $env:SAP_DS4_100_NIIF_PASSWORD; sap-client=100 on every URL (L-253).
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$script:SapHost = 'https://vhnlqds4ap01.sap.niififl.in:44300'
if (-not $env:SAP_DS4_100_NIIF_PASSWORD) { throw 'SAP_DS4_100_NIIF_PASSWORD not set' }
$script:Auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("FS_DEV3:$($env:SAP_DS4_100_NIIF_PASSWORD)"))

function Invoke-Trm {
  param([string]$Service, [string]$Step, [string]$Method, [string]$Path, [string]$Body, [string]$Log)
  $base = "$script:SapHost/sap/opu/odata4/sap/$($Service.ToLower())"
  $ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $h = @{ Authorization = $script:Auth; Accept = 'application/json' }
  if ($Path -eq '$metadata') { $h['Accept'] = 'application/xml' }
  if ($Method -ne 'GET') {
    $t = Invoke-WebRequest -UseBasicParsing -Uri "$base/`$metadata?sap-client=100" -Headers @{ Authorization = $script:Auth; 'x-csrf-token' = 'Fetch'; Accept = 'application/xml' } -WebSession $ws
    $h['x-csrf-token'] = $t.Headers['x-csrf-token']
    if ($Method -in 'PATCH', 'DELETE') { $h['If-Match'] = '*' }
  }
  $sep = if ($Path.Contains('?')) { '&' } else { '?' }
  $u = "$base/$Path${sep}sap-client=100"
  $status = 0; $content = ''; $msgs = ''
  try {
    if ($Body) { $r = Invoke-WebRequest -UseBasicParsing -Uri $u -Method $Method -Headers $h -WebSession $ws -Body ([Text.Encoding]::UTF8.GetBytes($Body)) -ContentType 'application/json' }
    else       { $r = Invoke-WebRequest -UseBasicParsing -Uri $u -Method $Method -Headers $h -WebSession $ws }
    $status = [int]$r.StatusCode; $content = $r.Content; $msgs = $r.Headers['sap-messages']
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 }
    $content = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
  }
  $entry = "### $Step`n$Method $u`n"; if ($Body) { $entry += "Body: $Body`n" }
  $entry += "Status: $status`nsap-messages: $msgs`n$content`n`n"
  if ($Log) { Add-Content -Path $Log -Value $entry -Encoding UTF8 }
  Write-Host "[$Step] $status"
  return [pscustomobject]@{ Status = $status; Content = $content; Messages = $msgs }
}

# Build an OData key predicate from an entity JSON object and the key names.
# Edm.Date values (yyyy-mm-dd) are unquoted, everything else is a quoted string.
function Get-KeyPredicate {
  param($Row, [string[]]$KeyNames)
  $parts = foreach ($k in $KeyNames) {
    $v = [string]$Row.$k
    if ($v -match '^\d{4}-\d{2}-\d{2}$') { "$k=$v" } else { "$k='$v'" }
  }
  return '(' + ($parts -join ',') + ')'
}
