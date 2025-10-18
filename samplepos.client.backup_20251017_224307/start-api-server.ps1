$serverModulePath = Join-Path $PSScriptRoot "src\server.ts"

Write-Host "Starting API server from: $serverModulePath" -ForegroundColor Cyan

# Check if nodemon is installed
$nodemonPath = "npx nodemon"
$nodeModulesPath = Join-Path $PSScriptRoot "node_modules\.bin\nodemon.cmd"
if (Test-Path $nodeModulesPath) {
    $nodemonPath = $nodeModulesPath
}

# Start the server with nodemon for auto-reloading
Write-Host "Running API server with nodemon for auto-reloading..."
& npx nodemon --exec npx tsx $serverModulePath