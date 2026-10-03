param(
    [string]$BackupDirectory = "$env:USERPROFILE\.qianqi-backups",
    [string]$RemoteDirectory = '/var/backups/qianqi-public',
    [string]$SshKey = "$env:USERPROFILE\.ssh\qianqi-ams-201-51-22-244"
)
$ErrorActionPreference = 'Stop'
if ($RemoteDirectory -notmatch '^/var/backups/[a-zA-Z0-9_-]+$') { throw 'Invalid remote backup directory' }
$targetRoot = [System.IO.Path]::GetFullPath($BackupDirectory)
New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
$ownerLock = $null
try {
    $ownerLock = [System.IO.File]::Open((Join-Path $targetRoot 'pull.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $sshArgs = @('-i', $SshKey, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15')
    # Filenames are validated before entering any subsequent remote shell command.
    $names = @(& ssh @sshArgs 'root@201.51.22.244' "if test -d '$RemoteDirectory'; then find '$RemoteDirectory' -maxdepth 1 -type f -name '*.sha256' -printf '%f\n'; fi")
    if ($LASTEXITCODE -ne 0) { throw 'Remote backup inventory unavailable' }
    $downloaded = 0
    foreach ($name in ($names | Sort-Object)) {
        if ($name -notmatch '^\d{8}T\d{6}Z\.sha256$') { throw 'Unexpected backup filename' }
        $baseName = $name -replace '\.sha256$', ''
        $archiveName = "$baseName.tar.gz"
        $checksum = (& ssh @sshArgs 'root@201.51.22.244' "cat '$RemoteDirectory/$name'") -join "`n"
        if ($LASTEXITCODE -ne 0 -or $checksum -notmatch "^([a-f0-9]{64})  $([regex]::Escape($archiveName))$") { throw 'Invalid remote checksum' }
        $expected = $Matches[1]
        $destination = Join-Path $targetRoot $archiveName
        if (Test-Path -LiteralPath $destination) {
            if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Existing local backup is corrupt; retained for inspection' }
            continue
        }
        $temporary = "$destination.partial"
        & scp @sshArgs "root@201.51.22.244:$RemoteDirectory/$archiveName" $temporary
        if ($LASTEXITCODE -ne 0) { throw 'Backup transfer failed; partial file retained' }
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Downloaded backup checksum mismatch' }
        Move-Item -LiteralPath $temporary -Destination $destination
        [System.IO.File]::WriteAllText((Join-Path $targetRoot $name), $checksum + "`n")
        $downloaded++
    }
    $status = @{ observedAt = [DateTime]::UtcNow.ToString('o'); status = $(if ($names.Count) {'verified'} else {'awaitingFirstBackup'}); archives = $names.Count; downloaded = $downloaded }
    $status | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $targetRoot 'last-pull.json')
    $status | ConvertTo-Json -Compress
} catch {
    @{ observedAt = [DateTime]::UtcNow.ToString('o'); status = 'failed'; detail = 'Inspect SSH access, transfer and backup integrity; existing files preserved' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $targetRoot 'last-pull.json')
    throw 'Off-server backup pull failed; inspect access and integrity'
} finally {
    if ($ownerLock) { $ownerLock.Dispose() }
}
