param(
  [Parameter(Mandatory=$true)][string]$Sql,
  [int]$Rows = 5000,
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = 'D:\SAP Tool\SAP-Project-Development V1'
$cfg  = Get-Content (Join-Path $root 'config\sap-systems.json') -Raw | ConvertFrom-Json
$sys  = $cfg.systems | Where-Object { $_.id -eq 'DS4_100_NIIF' }
$pw   = [Environment]::GetEnvironmentVariable($sys.adt.passwordEnvVar)
if (-not $pw) { throw "env var $($sys.adt.passwordEnvVar) is not set" }

$base = $sys.adt.url
$cred = "$($sys.adt.user):$pw"
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($cred))
$hdr  = @{ Authorization = $auth }

# 1. CSRF fetch (carries cookies into the session)
$disc = Invoke-WebRequest -Uri "$base/sap/bc/adt/discovery?sap-client=$($sys.client)" `
        -Headers ($hdr + @{ 'X-CSRF-Token' = 'Fetch'; 'Accept' = 'application/atomsvc+xml' }) -SessionVariable ses -UseBasicParsing
$token = $disc.Headers['x-csrf-token']

# 2. Data preview
$uri = "$base/sap/bc/adt/datapreview/freestyle?rowNumber=$Rows&sap-client=$($sys.client)"
$post = Invoke-WebRequest -Uri $uri -Method Post -WebSession $ses -UseBasicParsing `
        -Headers ($hdr + @{ 'X-CSRF-Token' = $token; 'Accept' = 'application/vnd.sap.adt.datapreview.table.v1+xml' }) `
        -ContentType 'text/plain; charset=utf-8' -Body $Sql

[xml]$x = $post.Content
$ns = 'http://www.sap.com/adt/dataPreview'
$cols = @($x.DocumentElement.ChildNodes | Where-Object { $_.LocalName -eq 'columns' })
$names = @(); $data = @()
foreach ($c in $cols) {
  $meta = $c.ChildNodes | Where-Object { $_.LocalName -eq 'metadata' }
  $names += $meta.GetAttribute('name', $ns)
  $ds = $c.ChildNodes | Where-Object { $_.LocalName -eq 'dataSet' }
  $vals = @($ds.ChildNodes | Where-Object { $_.LocalName -eq 'data' } | ForEach-Object { $_.InnerText })
  $data += ,$vals
}
$n = if ($data.Count -gt 0) { $data[0].Count } else { 0 }
$out = New-Object System.Collections.ArrayList
for ($i = 0; $i -lt $n; $i++) {
  $row = [ordered]@{}
  for ($j = 0; $j -lt $names.Count; $j++) { $row[$names[$j]] = $data[$j][$i] }
  [void]$out.Add([pscustomobject]$row)
}
$json = ConvertTo-Json @($out) -Depth 5
if ($OutFile) {
  $dir = Split-Path $OutFile -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [IO.File]::WriteAllText($OutFile, $json, (New-Object Text.UTF8Encoding $false))
  Write-Output "rows=$n cols=$($names.Count) -> $OutFile"
} else {
  Write-Output $json
}
