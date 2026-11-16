# R4 independent launch: run the documented fixed-source command once and
# capture the real process argv, version, entry and authenticated route.
# This script starts and stops only the isolated 3099 test Host.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..\..\..')).Path
$dshRoot = Join-Path $repo '.cache\build\dsh-39163dd'
$dshTestHome = Join-Path $repo '.cache\dsh-home-fnd001'
$out = $PSScriptRoot
$env:DSH_HOME = $dshTestHome
$env:DSH_CLIENT_COMMIT_HASH = '39163dd30f703a79079e2d2446545cff3c453738'

$stdout = Join-Path $out 'host.stdout.log'
$stderr = Join-Path $out 'host.stderr.log'
Remove-Item -LiteralPath $stdout, $stderr -ErrorAction SilentlyContinue

# Exactly the documented run command: no `web` positional, no init flag.
$cliArgs = @('--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'knowledgeos-test', '--port', '3099', '--no-open')
$node = (Get-Command node).Source
$started = Get-Date
$process = $null
$processInfo = $null
$children = @()
$url = $null
$probe = $null
$versionRaw = $null
try {
  $process = Start-Process -FilePath $node -ArgumentList $cliArgs -WorkingDirectory $dshRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  $deadline = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $deadline) {
    $text = ''
    if (Test-Path -LiteralPath $stdout) { $text += (Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue) }
    if (Test-Path -LiteralPath $stderr) { $text += (Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue) }
    $match = [regex]::Match($text, 'dsh web:\s*(http://\S+)')
    if ($match.Success) { $url = $match.Groups[1].Value; break }
    if ($process.HasExited) { break }
    Start-Sleep -Milliseconds 250
  }

  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)" -ErrorAction SilentlyContinue
  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($process.Id)" -ErrorAction SilentlyContinue | Select-Object ProcessId, Name, CommandLine)
  if ($url) {
    $probeRaw = & $node (Join-Path $out 'R4-status-probe.mjs') $url 2>&1
    $probe = ($probeRaw | Out-String)
  }
  $versionRaw = & $node (Join-Path $out 'R4-version-probe.mjs') $dshRoot 2>&1
} catch {
  $probe = @{ error = $_.Exception.Message } | ConvertTo-Json
  $versionRaw = "wrapper error: $($_.Exception.Message)"
} finally {
  # Stop the isolated Host tree; never touch the desktop DSH.
  foreach ($child in $children) { Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue }
  if ($null -ne $process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  $stopDeadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $stopDeadline) {
    $listening = @(Get-NetTCPConnection -LocalPort 3099 -State Listen -ErrorAction SilentlyContinue)
    if ($listening.Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
  }
  foreach ($log in @($stdout, $stderr)) {
    if (Test-Path -LiteralPath $log) {
      $redacted = (Get-Content -LiteralPath $log -Raw) -replace 'token=[^\s&]+', 'token=<redacted>'
      Set-Content -LiteralPath "$log.redacted" -Value $redacted -Encoding UTF8
    }
  }
}

$commandLine = if ($null -ne $processInfo) { $processInfo.CommandLine } else { $null }
$result = [ordered]@{
  sampled_at = (Get-Date).ToString('o')
  repo = $repo
  dsh_root = $dshRoot
  dsh_home = $dshTestHome
  started_at = $started.ToString('o')
  documented_command = "node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --port 3099 --no-open"
  process_id = if ($null -ne $process) { $process.Id } else { $null }
  exit_used = 'stopped by the probe after the route check'
  actual_command_line = $commandLine
  actual_argv_contains_web_positional = [bool]($commandLine -match '(^|\s)web(\s|$)')
  actual_argv_contains_init_flag = [bool]($commandLine -match 'from-default-profile')
  entry_url_shape = if ($url) { $url -replace 'token=[^&]+', 'token=<redacted>' } else { $null }
  entry_url_obtained = [bool]$url
  entry_host = if ($url) { ([uri]$url).Host } else { $null }
  entry_port = if ($url) { ([uri]$url).Port } else { $null }
  children = $children
  status_probe = $probe
  cli_version = $versionRaw
  port_3099_listening_after_stop = @(Get-NetTCPConnection -LocalPort 3099 -State Listen -ErrorAction SilentlyContinue).Count
  desktop_pid_51900_start = (Get-Process -Id 51900 -ErrorAction SilentlyContinue).StartTime.ToString('o')
}
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'R4-launch.json') -Encoding UTF8
$result | ConvertTo-Json -Depth 6
exit 0