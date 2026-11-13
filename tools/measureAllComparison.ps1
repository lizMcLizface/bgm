param(
    [Parameter(Mandatory=$true)][int[]]$ProcessIds,
    [Parameter(Mandatory=$true)][string]$OutputPath,
    [string]$Scope = 'Explicit renderer process IDs for All comparison',
    [switch]$ScopeConfirmed,
    [ValidateRange(5,1800)][int]$DurationSeconds = 240,
    [ValidateRange(250,5000)][int]$IntervalMs = 500
)
$ErrorActionPreference='Stop'
if(($ProcessIds | Select-Object -Unique).Count -ne $ProcessIds.Count -or ($ProcessIds | Where-Object {$_ -le 0})){throw 'Process IDs must be distinct positive integers'}
# Read-only process statistics. No browser control, content, command lines, or
# machine-wide CPU averaging. PID scope must be identified before sampling.
$rows=[System.Collections.Generic.List[object]]::new()
$watch=[System.Diagnostics.Stopwatch]::StartNew()
function Read-ComparisonProcesses {
    $found=@{}; $missing=[System.Collections.Generic.List[int]]::new()
    foreach($processNumber in $ProcessIds){
        try {
            $item=Get-Process -Id $processNumber -ErrorAction Stop
            $found[$processNumber]=@{cpu=$item.TotalProcessorTime.TotalSeconds;private=[double]$item.PrivateMemorySize64;born=$item.StartTime.ToUniversalTime().ToString('o')}
            $item.Dispose()
        }catch{$missing.Add($processNumber)}
    }
    return @{utc=[DateTime]::UtcNow.ToString('o');found=$found;missing=@($missing)}
}
$previous=Read-ComparisonProcesses
while($watch.Elapsed.TotalSeconds -lt $DurationSeconds){
    Start-Sleep -Milliseconds $IntervalMs
    $current=Read-ComparisonProcesses
    $elapsed=([DateTime]::Parse($current.utc)-[DateTime]::Parse($previous.utc)).TotalSeconds
    $cpu=0.0; $private=0.0; $missing=[System.Collections.Generic.List[int]]::new()
    foreach($processNumber in $ProcessIds){
        $before=$previous.found[$processNumber];$after=$current.found[$processNumber]
        if($null -eq $before -or $null -eq $after -or $before.born -ne $after.born){$missing.Add($processNumber);continue}
        $cpu += [Math]::Max(0,$after.cpu-$before.cpu);$private += $after.private
    }
    $rows.Add(@{startUtc=$previous.utc;endUtc=$current.utc;cpuCorePercent=100*$cpu/$elapsed;privateBytes=$private;missing=@($missing)})
    $previous=$current
}
$report=@{version=1;kind='all-comparison-process-samples';scope=$Scope;scopeConfirmed=[bool]$ScopeConfirmed;processIds=$ProcessIds;intervalMs=$IntervalMs;samples=@($rows);note='100% CPU is one logical core; private bytes are process commit. PID loss/reuse is flagged; Native audio service and other processes are excluded unless explicitly listed. ScopeConfirmed is operator attestation, not automatic tab attribution.'}
$resolved=[System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolved)) | Out-Null
[System.IO.File]::WriteAllText($resolved,($report | ConvertTo-Json -Depth 10),[System.Text.UTF8Encoding]::new($false))
Write-Output "Saved $($rows.Count) scoped process samples to $resolved"
