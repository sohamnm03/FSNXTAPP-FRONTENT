<#
.SYNOPSIS
    Shared markdown-parsing helpers for scripts/build-dashboard.ps1 - reads the
    "- **Label:** value" bullet convention out of worklog/<system-id>/*.md.
#>

# Dash characters from code points, never literals: Windows PowerShell 5.1 reads
# a BOM-less .ps1 as ANSI, so a literal en/em dash here would arrive mojibake'd
# and the regexes would silently never match.
$DASH = '[-' + [char]0x2013 + [char]0x2014 + ']'   # hyphen, en dash, em dash

function Get-Field {
    # Pulls "- **Label:** value" out of a markdown bullet list.
    param([string] $Text, [string] $Label)
    $m = [regex]::Match($Text, "(?m)^\s*[-*]\s*\*\*$([regex]::Escape($Label)):\*\*\s*(.+?)\s*$")
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
    return $null
}
