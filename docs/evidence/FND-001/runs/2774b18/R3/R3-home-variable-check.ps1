# R3 independent check: the documented isolated-home snippet must use a
# dedicated variable and must never assign to $HOME / $home.
# Run in a fresh Windows PowerShell process:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File <this file>
# (This machine has Windows PowerShell 5.1 only; pwsh 7 is not installed.)
$knowledgeosRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..\..\..')).Path
$dshTestHome = Join-Path $knowledgeosRepo '.cache\dsh-home-fnd001'

$homeBefore = $HOME
$homeVarBefore = Get-Variable -Name HOME
$lowerHomeVarBefore = Get-Variable -Name home

$env:DSH_HOME = $dshTestHome

$homeAfter = $HOME
$homeVarAfter = Get-Variable -Name HOME

$result = [ordered]@{
  sampled_at = (Get-Date).ToString('o')
  powershell_version = $PSVersionTable.PSVersion.ToString()
  process_id = $PID
  repo = $knowledgeosRepo
  home_before = $homeBefore
  home_after = $homeAfter
  home_unchanged = ($homeBefore -eq $homeAfter)
  home_variable_options = (@($homeVarBefore.Options) -join ',')
  lowercase_home_same_variable = [object]::ReferenceEquals($homeVarBefore, $lowerHomeVarBefore)
  home_variable_options_after = (@($homeVarAfter.Options) -join ',')
  dsh_home = $env:DSH_HOME
  dsh_test_home = $dshTestHome
  dsh_home_is_isolated = ($env:DSH_HOME -eq $dshTestHome)
  dsh_home_under_repo = $env:DSH_HOME.StartsWith($knowledgeosRepo, [System.StringComparison]::OrdinalIgnoreCase)
  dsh_home_exists = Test-Path -LiteralPath $env:DSH_HOME
  used_lowercase_home_assignment = $false
}
$result | ConvertTo-Json -Depth 4