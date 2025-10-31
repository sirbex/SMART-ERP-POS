# Smart Rename Strategy:
# 1. For duplicates, keep LARGEST version (most complete code)
# 2. Delete smaller duplicates
# 3. Rename the keeper to proper name

$mapping = @()
Get-ChildItem -Filter "*.tsx" | ForEach-Object {
    $oldName = $_.Name
    $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -match "export\s+default\s+(?:function\s+)?(\w+)") {
        $newName = $matches[1]
        if ($oldName -ne "$newName.tsx") {
            $mapping += [PSCustomObject]@{
                Old = $oldName
                New = "$newName.tsx"
                Size = $_.Length
                FullPath = $_.FullName
            }
        }
    }
}

# Group by target name
$groups = $mapping | Group-Object New

$renamed = 0
$deleted = 0

foreach ($group in $groups) {
    if ($group.Count -eq 1) {
        # Simple rename
        $file = $group.Group[0]
        Rename-Item -Path $file.FullPath -NewName $group.Name
        $renamed++
        Write-Host " $($file.Old)  $($group.Name)"
    } else {
        # Keep largest, delete others
        $sorted = $group.Group | Sort-Object Size -Descending
        $keeper = $sorted[0]
        
        Write-Host "`n $($group.Name) - keeping largest:"
        Write-Host " $($keeper.Old) ($([math]::Round($keeper.Size/1KB,2)) KB)  $($group.Name)"
        Rename-Item -Path $keeper.FullPath -NewName $group.Name
        $renamed++
        
        # Delete duplicates
        for ($i = 1; $i -lt $sorted.Count; $i++) {
            $dupe = $sorted[$i]
            Write-Host "   Deleting: $($dupe.Old) ($([math]::Round($dupe.Size/1KB,2)) KB)"
            Remove-Item -Path $dupe.FullPath -Force
            $deleted++
        }
    }
}

Write-Host "`n=== COMPLETE ==="
Write-Host "Renamed: $renamed files"
Write-Host "Deleted: $deleted duplicate files"
