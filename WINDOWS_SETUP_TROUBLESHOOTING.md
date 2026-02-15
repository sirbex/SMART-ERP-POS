# 🪟 Windows Git/Husky Troubleshooting Guide

## Common Issues on Windows

### Issue 1: Hooks Not Running on Commit

**Symptom**: You commit code but pre-commit hooks don't execute

**Cause**: Husky not properly installed or shell configuration issue

**Solution**:
```powershell
# 1. Check if Husky is installed
npm run prepare

# 2. Verify hook file exists
Test-Path .husky/pre-commit

# 3. Force reinstall
npm install husky --save-dev
npm run prepare

# 4. Check git config
git config core.hooksPath
# Should show: .husky

# 5. Test manually
bash .husky/pre-commit
```

---

### Issue 2: "Permission denied" or "cannot execute"

**Symptom**: `bash: ./pre-commit: Permission denied`

**Cause**: File permissions in Windows Git

**Solution**:
```powershell
# Windows doesn't enforce Unix permissions, but Git does
# Fix by resetting line endings

# 1. Configure Git for Windows
git config core.autocrlf true
git config core.safecrlf warn

# 2. Reset all hooks
git rm --cached .husky/pre-commit
git add .husky/pre-commit

# 3. Commit
git commit -m "fix: Reset hook permissions"

# 4. Reinstall
npm run prepare
```

---

### Issue 3: Hooks Run but TypeScript Check Fails with No Error

**Symptom**: 
```
📝 Checking TypeScript compilation...
❌ TypeScript compilation failed!
```
But no details shown

**Cause**: npm run build output not captured properly in bash

**Solution**:
```powershell
# Run manually to see full error
cd SamplePOS.Server
npm run build 2>&1

# Fix the reported errors
# Example: Missing type definitions
npm install --save-dev @types/node

# Try again
cd ..
git add .
git commit -m "fix: TypeScript errors"
```

---

### Issue 4: "LF will be replaced by CRLF" Warning

**Symptom**: Multiple warnings during commit about line endings

**Cause**: Git converts Unix (LF) to Windows (CRLF) line endings

**Solution**:
```powershell
# Option 1: Accept it (recommended for Windows)
git config --global core.autocrlf true

# Option 2: Force LF in Git
git config --global core.autocrlf input

# Option 3: Configure per-repo
git config core.autocrlf true
git config core.safecrlf warn

# Then reset working directory
git rm --cached -r .
git reset --hard HEAD
```

---

### Issue 5: npm run prepare Doesn't Work

**Symptom**: `npm run prepare` fails silently or shows no output

**Cause**: PowerShell execution policy or npm issue

**Solution**:
```powershell
# 1. Check npm works
npm --version

# 2. Run directly
npx husky install

# 3. Verify hook folder
ls -la .husky/

# 4. Run full setup
npm install
npm run prepare

# 5. If still fails, clear npm cache
npm cache clean --force
npm install
npm run prepare
```

---

### Issue 6: "CRLF/LF" Mismatch in Hook Files

**Symptom**: Hooks fail with strange bash errors

**Cause**: File has Windows line endings (CRLF) but bash expects Unix (LF)

**Solution - Using Git**:
```powershell
# Convert all hook files to LF
$files = ".husky/pre-commit", ".husky/prepare-commit-msg"

foreach ($file in $files) {
    # Read file with Windows encoding
    $content = [System.IO.File]::ReadAllBytes($file)
    
    # Replace CRLF with LF
    $content = $content -replace "`r`n", "`n"
    
    # Write back
    [System.IO.File]::WriteAllBytes($file, $content)
}

# Or use Git
git config --global core.safecrlf false
git add .
git commit -m "fix: Line endings"
```

**Solution - Using EditorConfig** (Recommended):
```
Create or update .editorconfig:

[*.sh]
end_of_line = lf
insert_final_newline = true
charset = utf-8

[*.{ts,tsx,js,json}]
end_of_line = lf
```

---

### Issue 7: Node Modules Permission Issues

**Symptom**: 
```
npm ERR! eacces: permission denied
npm ERR! error: ENOENT: no such file or directory
```

**Cause**: Node_modules corruption or permission issues

**Solution**:
```powershell
# 1. Clear npm cache
npm cache clean --force

# 2. Remove node_modules
rm -r node_modules -Force
rm package-lock.json

# 3. Reinstall
npm install

# 4. Or for Windows-specific issues
npm install --no-optional --legacy-peer-deps

# 5. Run prepare again
npm run prepare
```

---

### Issue 8: Bash Command Not Found

**Symptom**: 
```
'bash' is not recognized as an internal or external command
```

**Cause**: Git Bash not in PATH

**Solution**:
```powershell
# 1. Check if git bash is installed
Get-Command bash -ErrorAction SilentlyContinue

# 2. If not found, use full path (assuming Git installed)
$gitBashPath = "C:\Program Files\Git\bin\bash.exe"

# 3. Test
& $gitBashPath --version

# 4. Add to PATH (restart terminal after)
$env:PATH += ";C:\Program Files\Git\bin"
[Environment]::SetEnvironmentVariable("PATH", $env:PATH, "User")

# 5. Verify
bash --version
```

---

### Issue 9: ESLint Not Found in Hook

**Symptom**:
```
npm run lint: command not found
```

**Cause**: ESLint not installed in backend/frontend

**Solution**:
```powershell
# Install backend eslint
cd SamplePOS.Server
npm install

# Install frontend eslint
cd ../samplepos.client
npm install

# Verify it works
npm run lint

# Try commit again
cd ../..
git add .
git commit -m "fix: Install ESLint"
```

---

### Issue 10: Hook Script Timeouts

**Symptom**: Pre-commit hook hangs or takes forever

**Cause**: Slow database connection, large test suite, or network issue

**Solution**:
```powershell
# 1. Run hook manually with timeout
timeout /T 30 bash .husky/pre-commit

# 2. Or modify hook to skip slow checks
# Edit .husky/pre-commit and comment out:
# npm run test:accounting

# 3. Check what's slow
# Run each step separately:
cd SamplePOS.Server
npm run build       # Check this
npm run lint        # Check this
npm run test:accounting  # Check this

# 4. If tests are slow, investigate:
npm run test:accounting -- --verbose

# 5. Consider splitting into GitHub Actions only
# See CODE_SAFETY_GUIDE.md for layer options
```

---

## Manual Hook Installation (Nuclear Option)

If all else fails:

```powershell
# 1. Create manual pre-commit hook
mkdir -p .husky
$hookContent = @'
#!/usr/bin/env sh
echo "🔍 Pre-commit check..."
cd SamplePOS.Server
npm run build
if ($LASTEXITCODE -ne 0) {
  echo "❌ Build failed"
  exit 1
}
cd ..
echo "✅ Pre-commit passed"
'@

# 2. Save with proper encoding
[System.IO.File]::WriteAllText(".husky/pre-commit", $hookContent, [System.Text.Encoding]::UTF8)

# 3. Configure Git
git config core.hooksPath .husky

# 4. Test
git commit -m "test: Manual hook"
```

---

## Verification Checklist

```powershell
# ✅ Git is installed
git --version

# ✅ Node.js is installed
node --version

# ✅ npm works
npm --version

# ✅ Husky installed
npm list husky

# ✅ Hooks exist
ls -la .husky/

# ✅ Hooks are executable
git config core.hooksPath
# Should output: .husky

# ✅ Bash is available
bash --version

# ✅ npm scripts work
cd SamplePOS.Server && npm run build && cd ..

# ✅ Can stage files
git add .

# ✅ Can commit
git commit -m "test: Verify setup"
```

If all pass: ✅ **Setup is correct!**

---

## PowerShell-Specific Tips

### Running Bash Scripts in PowerShell

```powershell
# Method 1: Direct bash
bash .husky/pre-commit

# Method 2: Via Git Bash
& 'C:\Program Files\Git\bin\bash.exe' .husky/pre-commit

# Method 3: WSL (if installed)
wsl bash .husky/pre-commit
```

### Setting Execution Policy (if needed)

```powershell
# Check current policy
Get-ExecutionPolicy

# For current user only (recommended)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# For current session only
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```

---

## Still Having Issues?

1. **Enable verbose logging**:
   ```powershell
   $env:DEBUG = "husky"
   git commit -m "test"
   ```

2. **Check Git configuration**:
   ```powershell
   git config --list | grep husky
   ```

3. **Reset everything**:
   ```powershell
   npm run prepare
   git config core.hooksPath .husky
   ```

4. **Create issue with details**:
   - Output of `npm --version`
   - Output of `git --version`
   - Output of `bash --version`
   - Output of `npm run prepare`
   - Full error message from failed commit

---

**Last Updated**: January 27, 2026  
**For general issues**: See [CODE_SAFETY_GUIDE.md](CODE_SAFETY_GUIDE.md)
