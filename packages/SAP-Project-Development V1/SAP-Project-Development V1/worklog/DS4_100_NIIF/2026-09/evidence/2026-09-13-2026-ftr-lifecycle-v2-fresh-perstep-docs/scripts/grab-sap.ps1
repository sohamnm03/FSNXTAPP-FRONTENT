<#
  Capture a SPECIFIC SAP GUI window to a PNG, selected BY TITLE.

  Why by title. This machine has several SAP session windows open at once - the operator's
  own sessions alongside the one the MCP server drives. Picking "the largest window"
  silently captured the WRONG session five times in a row on 2026-09-13: the files looked
  like real screenshots and showed a real SAP screen, just not the one that had been
  navigated to. A screenshot of the wrong window is worse than no screenshot, because
  nothing about it looks wrong.

  So the caller must state the title it expects, and this script fails loudly if no visible
  window matches. Among matches it takes the LARGEST, and always prints the title it
  actually captured so the caller can check.

  -Maximize maximizes the matched window before capturing, so an SE16 list shows all its
  columns instead of being clipped at the default window width.
#>
param(
    [Parameter(Mandatory)] [string] $Name,
    [Parameter(Mandatory)] [string] $TitleContains,
    [string] $OutDir = "D:\SAP Tool\SAP-Project-Development V1\worklog\DS4_100_NIIF\2026-09\evidence\2026-09-13-2026-ftr-lifecycle-v2-fresh-perstep-docs\screenshots",
    [switch] $Maximize
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class WT {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }

  public class Win { public IntPtr H; public string Title; public int W; public int Ht; }

  public static List<Win> Windows(uint want) {
    List<Win> o = new List<Win>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == want && IsWindowVisible(h)) {
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(h, sb, 512);
        RECT r; GetWindowRect(h, out r);
        Win w = new Win(); w.H = h; w.Title = sb.ToString(); w.W = r.R-r.L; w.Ht = r.B-r.T;
        o.Add(w);
      }
      return true;
    }, IntPtr.Zero);
    return o;
  }
}
"@

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$proc = Get-Process -Name "saplogon" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Error "saplogon is not running"; exit 1 }

$all = [WT]::Windows([uint32]$proc.Id)
$match = @($all | Where-Object { $_.Title -and $_.Title.Contains($TitleContains) -and $_.W -gt 400 -and $_.Ht -gt 300 } |
          Sort-Object -Property W -Descending)

if ($match.Count -eq 0) {
    Write-Host "no visible SAP window title contains '$TitleContains'. Titles seen:" -ForegroundColor Red
    $all | Where-Object { $_.Title } | ForEach-Object { "   [{0}x{1}] {2}" -f $_.W, $_.Ht, $_.Title }
    Write-Error "refusing to capture - the wrong window would be saved"
    exit 1
}
$m = $match[0]
$h = $m.H

# SW_SHOW (5), never SW_RESTORE - restoring would un-maximize a window the operator
# maximized on purpose, and the next capture would silently be clipped again.
if ($Maximize) { [void][WT]::ShowWindow($h, 3) } else { [void][WT]::ShowWindow($h, 5) }

# CopyFromScreen photographs whatever pixels are on the glass, not the window we
# matched. SetForegroundWindow is ADVISORY - Windows refuses it while another process
# holds the foreground lock, and the capture then silently saves that other app's
# window under an SAP file name. On 2026-09-13 that put a screenshot of the editor in
# an evidence folder labelled FB03. So: raise it, then VERIFY it actually came forward,
# and refuse to save if it did not.
$ok = $false
for ($try = 1; $try -le 6; $try++) {
    [void][WT]::BringWindowToTop($h)
    [void][WT]::SetForegroundWindow($h)
    Start-Sleep -Milliseconds 600
    if ([WT]::GetForegroundWindow() -eq $h) { $ok = $true; break }
}
if (-not $ok) {
    Write-Error ("'{0}' would not come to the foreground after 6 attempts - refusing to " +
                 "capture, because the saved image would be whatever app is on top instead." -f $m.Title)
    exit 1
}
Start-Sleep -Milliseconds 500

$r = New-Object WT+RECT
[void][WT]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $ht = $r.B - $r.T

$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
# Second belt: an SAP GUI screen is a light theme (mean channel value ~210-235). A dark
# image means we photographed something else entirely - do not leave it on disk.
$sum = 0.0; $n = 0
for ($y = 0; $y -lt $bmp.Height; $y += 17) { for ($x = 0; $x -lt $bmp.Width; $x += 17) {
    $c = $bmp.GetPixel($x, $y); $sum += ($c.R + $c.G + $c.B) / 3.0; $n++ } }
$mean = [math]::Round($sum / $n, 1)

$path = Join-Path $OutDir "$Name.png"
if ($mean -lt 120) {
    $g.Dispose(); $bmp.Dispose()
    Write-Error ("captured image has mean brightness $mean - that is a dark window, not an " +
                 "SAP GUI screen. Refusing to save '$Name.png'.")
    exit 1
}
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

"saved: $path  ($w x $ht)  mean brightness $mean"
"captured window title: '$($m.Title)'   [matches considered: $($match.Count)]"
