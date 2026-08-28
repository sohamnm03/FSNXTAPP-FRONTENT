<#
.SYNOPSIS
    Shared markdown-parsing helpers for scripts/check-suite.ps1 and
    scripts/build-dashboard.ps1 - both read the "- **Label:** value" bullet
    convention out of test-cases/*.md and results/*.md, and both need the same
    dash workaround to do it. Dot-source this file rather than copying it.
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
