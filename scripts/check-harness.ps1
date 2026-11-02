#Requires -Version 7.0
[CmdletBinding()]
param(
    [switch]$CheckEnvironment
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rootPrefix = $projectRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$failures = [Collections.Generic.List[string]]::new()
$warnings = [Collections.Generic.List[string]]::new()
$ignoredDirectories = @('.git', '.worktrees', 'generated', '.generated', 'node_modules', 'dist', 'build', 'out', 'coverage', '.cache', '.next', 'artifacts', 'release', 'target')
$requiredFiles = @(
    'AGENTS.md', 'README.md', 'docs/PRODUCT_PLAN.md', 'docs/ARCHITECTURE.md', 'docs/WORKFLOW.md', 'docs/FORMATS.md',
    '.github/pull_request_template.md', 'scripts/check-harness.ps1', '.github/workflows/harness.yml',
    '.gitignore', '.gitattributes', '.editorconfig'
)

function Get-RepositoryMarkdown {
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($projectRoot)
    while ($pending.Count -gt 0) {
        foreach ($entry in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
            if ($entry.PSIsContainer) {
                if ($entry.Name -notin $ignoredDirectories) { $pending.Push($entry.FullName) }
            } elseif ($entry.Extension -ieq '.md') {
                $entry.FullName
            }
        }
    }
}

function Get-MarkdownLines([string]$Path) {
    $fenceCharacter = ''
    $fenceLength = 0
    $lineNumber = 0
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        $lineNumber++
        $fence = [regex]::Match($line, '^ {0,3}(?<fence>`{3,}|~{3,})')
        if ($fenceCharacter) {
            if ($fence.Success -and $fence.Groups['fence'].Value[0] -eq $fenceCharacter -and
                $fence.Groups['fence'].Value.Length -ge $fenceLength -and
                $line -match '^ {0,3}(?:`+|~+)\s*$') {
                $fenceCharacter = ''
            }
            continue
        }
        if ($fence.Success) {
            $fenceCharacter = [string]$fence.Groups['fence'].Value[0]
            $fenceLength = $fence.Groups['fence'].Value.Length
            continue
        }
        [pscustomobject]@{ Text = $line; Number = $lineNumber }
    }
}

function Get-MarkdownAnchors([string]$Path) {
    $anchors = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $duplicates = @{}
    $previousLine = ''
    foreach ($line in Get-MarkdownLines $Path) {
        foreach ($match in [regex]::Matches($line.Text, '<(?:a|h[1-6])\b[^>]*\b(?:id|name)\s*=\s*["''](?<anchor>[^"'']+)["'']', 'IgnoreCase')) {
            [void]$anchors.Add($match.Groups['anchor'].Value)
        }
        $heading = [regex]::Match($line.Text, '^ {0,3}#{1,6}\s+(?<heading>.*?)(?:\s+#+)?\s*$')
        $headingText = if ($heading.Success) { $heading.Groups['heading'].Value } elseif (
            $previousLine.Trim() -and $line.Text -match '^ {0,3}(?:=+|-+)\s*$'
        ) { $previousLine.Trim() } else { $null }
        if ($null -ne $headingText) {
            $slug = [regex]::Replace($headingText, '!?\[(?<text>[^\]]*)\]\([^)]*\)', '${text}')
            $slug = [regex]::Replace($slug, '\[(?<text>[^\]]*)\]\[[^\]]*\]', '${text}')
            $slug = [regex]::Replace($slug, '<[^>]+>', '')
            $slug = [Net.WebUtility]::HtmlDecode($slug).ToLowerInvariant()
            $slug = [regex]::Replace($slug, '[^\p{L}\p{Nd}_\-\s]', '')
            $slug = [regex]::Replace($slug, '\s', '-')
            if ($duplicates.ContainsKey($slug)) {
                $duplicates[$slug]++
                [void]$anchors.Add("$slug-$($duplicates[$slug])")
            } else {
                $duplicates[$slug] = 0
                [void]$anchors.Add($slug)
            }
        }
        $previousLine = $line.Text
    }
    return ,$anchors
}

function Test-RepositoryLink([string]$Source, [int]$Line, [string]$Destination) {
    $label = "$([IO.Path]::GetRelativePath($projectRoot, $Source)):${Line}"
    $destinationText = $Destination.Trim('<', '>') -replace '\\([ ()\[\]#])', '$1'
    if (-not $destinationText -or $destinationText.StartsWith('#') -or $destinationText.StartsWith('//')) { return }
    if ($destinationText -match '^file:' -or $destinationText -match '^[A-Za-z]:[\\/]') {
        $failures.Add("$label uses an absolute filesystem link: $Destination")
        return
    }
    if ($destinationText -match '^[A-Za-z][A-Za-z0-9+.-]*:') { return }

    $parts = $destinationText.Split('#', 2)
    $path = [Uri]::UnescapeDataString($parts[0].Split('?', 2)[0])
    if ($path -match '^[\\/]*[A-Za-z]:' -or $path.StartsWith('\') -or $path.StartsWith('~')) {
        $failures.Add("$label uses an absolute filesystem link: $Destination")
        return
    }
    try {
        $base = if ($path.StartsWith('/')) { $projectRoot } else { [IO.Path]::GetDirectoryName($Source) }
        $target = [IO.Path]::GetFullPath((Join-Path $base $path.TrimStart('/')))
    } catch {
        $failures.Add("$label has an invalid local link: $Destination")
        return
    }
    if ($target -ne $projectRoot -and -not $target.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        $failures.Add("$label links outside the repository: $Destination")
        return
    }
    if (-not (Test-Path -LiteralPath $target)) {
        $failures.Add("$label has a broken local link: $Destination")
        return
    }
    $ancestor = $target
    while ($ancestor -and $ancestor -ne $projectRoot) {
        if ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            $failures.Add("$label links through a symbolic link: $Destination")
            return
        }
        $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
    if ($parts.Count -gt 1 -and $parts[1] -and [IO.Path]::GetExtension($target) -ieq '.md' -and
        (Test-Path -LiteralPath $target -PathType Leaf)) {
        $fragment = [Uri]::UnescapeDataString($parts[1])
        if (-not $anchorCache.ContainsKey($target)) { $anchorCache[$target] = Get-MarkdownAnchors $target }
        if (-not $anchorCache[$target].Contains($fragment)) {
            $failures.Add("$label has a missing Markdown anchor: $Destination")
        }
    }
}

function Test-UserSkillReferences {
    $codexDirectory = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
    $instructionPaths = @((Join-Path $projectRoot 'AGENTS.md'), (Join-Path $codexDirectory 'AGENTS.md')) | Select-Object -Unique
    $seenReferences = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($instructionPath in $instructionPaths) {
        if (-not (Test-Path -LiteralPath $instructionPath -PathType Leaf)) { continue }
        $content = [IO.File]::ReadAllText($instructionPath)
        foreach ($match in [regex]::Matches($content, '@(?<path>(?:~[\\/]|[A-Za-z]:[\\/]|\.{1,2}[\\/])[^\r\n]*?SKILL\.md)')) {
            $skillReference = $match.Groups['path'].Value
            $skillPath = if ($skillReference -match '^~[\\/]') {
                Join-Path $HOME $skillReference.Substring(2)
            } elseif ([IO.Path]::IsPathRooted($skillReference)) {
                $skillReference
            } else {
                Join-Path ([IO.Path]::GetDirectoryName($instructionPath)) $skillReference
            }
            if ($seenReferences.Add([IO.Path]::GetFullPath($skillPath)) -and -not (Test-Path -LiteralPath $skillPath -PathType Leaf)) {
                $warnings.Add("Optional skill reference unavailable in $([IO.Path]::GetFileName($instructionPath)): $skillReference")
            }
        }
    }
}

function Test-LocalTool([string]$Name, [int]$ExpectedMajor = 0, [switch]$Optional) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    $problem = $null
    if (-not $command) {
        $problem = "$Name is unavailable."
    } else {
        $previousCorepackNetwork = $env:COREPACK_ENABLE_NETWORK
        try {
            # A Corepack shim must not download pnpm during an offline diagnostic.
            $env:COREPACK_ENABLE_NETWORK = '0'
            $global:LASTEXITCODE = 0
            $versionOutput = @(& $command.Source --version 2>&1)
            if ($LASTEXITCODE -ne 0 -or $versionOutput.Count -eq 0) { throw 'Version check failed.' }
            $version = [string]$versionOutput[0]
            Write-Host "INFO $Name : $version"
            if ($ExpectedMajor -gt 0 -and $version -notmatch "^v?$ExpectedMajor\.") {
                $problem = "$Name $ExpectedMajor.x is expected; found $version."
            }
        } catch {
            $problem = "$Name could not report its version."
        } finally {
            $env:COREPACK_ENABLE_NETWORK = $previousCorepackNetwork
        }
    }
    if ($problem) {
        if ($CheckEnvironment -and -not $Optional) { $failures.Add($problem) } else { $warnings.Add($problem) }
    }
}

foreach ($relativePath in $requiredFiles) {
    $requiredPath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        $failures.Add("Missing required file: $relativePath")
    } elseif ([string]::IsNullOrWhiteSpace([IO.File]::ReadAllText($requiredPath))) {
        $failures.Add("Required file is empty: $relativePath")
    }
}

$anchorCache = @{}
$markdownFiles = @(Get-RepositoryMarkdown)
# Intentionally handles ordinary single-line inline links and reference definitions,
# not a full CommonMark parser. Use <path> for spaces; avoid nested link labels.
# Fenced code and inline code are ignored. Anchor-only links are intentionally skipped.
$inlinePattern = '!?(?:\[[^\]\r\n]*\])\(\s*(?<destination><[^>\r\n]+>|(?:\\.|[^\s()]|\([^()\r\n]*\))+)(?:\s+(?:"[^"\r\n]*"|''[^''\r\n]*''|\([^()\r\n]*\)))?\s*\)'
$referencePattern = '^ {0,3}\[[^\]\r\n]+\]:\s*(?<destination><[^>\r\n]+>|\S+)'
foreach ($markdownFile in $markdownFiles) {
    foreach ($line in Get-MarkdownLines $markdownFile) {
        $content = [regex]::Replace($line.Text, '(`+).*?\1', '')
        foreach ($pattern in @($inlinePattern, $referencePattern)) {
            foreach ($match in [regex]::Matches($content, $pattern)) {
                Test-RepositoryLink $markdownFile $line.Number $match.Groups['destination'].Value
            }
        }
    }
}

Test-UserSkillReferences
Test-LocalTool 'git'
Test-LocalTool 'node' 24
Test-LocalTool 'pnpm' 10
Test-LocalTool 'gh' -Optional

foreach ($warning in $warnings) { Write-Host "WARN $warning" }
foreach ($failure in $failures) { Write-Host "FAIL $failure" }
Write-Host "Harness: $($markdownFiles.Count) Markdown files checked; $($failures.Count) error(s), $($warnings.Count) warning(s)."
if ($failures.Count -gt 0) { exit 1 }
exit 0
