# Read-only SQL through the ADT data preview (POST /sap/bc/adt/datapreview/freestyle), for when the change server's
# runQuery answers "Internal server error" (L-319). Keep each SQL line under 255 characters (L-606); use `n in -Sql.
# Prints the rows tab-separated with a header line. Password from $env:SAP_DS4_100_TFSIN_PASSWORD.
param(
  [Parameter(Mandatory)] [string]$Sql,
  [string]$Base = 'https://vhtfqds4ap01.sap.tfsin.co.in:44300',
  [string]$User = 'FS_DEV3',
  [int]$Rows = 100
)
$ErrorActionPreference = 'Stop'
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:$env:SAP_DS4_100_TFSIN_PASSWORD"))
$adt = "$Base/sap/bc/adt"; $ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$tok = (Invoke-WebRequest -Uri "$adt/discovery?sap-client=100" -Headers @{ Authorization = $auth; 'X-CSRF-Token' = 'Fetch'; Accept = 'application/atomsvc+xml' } -WebSession $ws -UseBasicParsing -TimeoutSec 60).Headers['x-csrf-token']
try {
  $r = Invoke-WebRequest -Uri "$adt/datapreview/freestyle?rowNumber=$Rows&sap-client=100" -Method Post -Body $Sql -ContentType 'text/plain' -Headers @{ Authorization = $auth; 'X-CSRF-Token' = $tok; Accept = 'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml' } -WebSession $ws -UseBasicParsing -TimeoutSec 300
} catch {
  $resp = $_.Exception.Response
  $body = if ($resp) { (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } else { $_.Exception.Message }
  Write-Output "ERROR HTTP $(if ($resp) { [int]$resp.StatusCode }): $body"; exit 1
}
$cols = @(([xml]$r.Content).tableData.columns)
Write-Output (($cols | ForEach-Object { $_.metadata.name }) -join "`t")
$n = @($cols[0].dataSet.data).Count
for ($i = 0; $i -lt $n; $i++) { Write-Output (($cols | ForEach-Object { [string]@($_.dataSet.data)[$i] }) -join "`t") }
