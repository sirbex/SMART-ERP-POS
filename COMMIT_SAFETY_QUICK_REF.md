# 🛡️ Commit Safety - Quick Reference

## Initial Setup (One Time)
```powershell
# Run setup script
.\setup-commit-safety.ps1

# Or manual setup
npm install
npm run prepare
```

---

## Safe Commit Workflow

### 1️⃣ Make Changes
```bash
# Edit your code
vim SamplePOS.Server/src/modules/sales/salesController.ts
```

### 2️⃣ Stage Changes
```bash
# Stage specific files
git add SamplePOS.Server/src/modules/sales/salesController.ts

# Or stage everything
git add .

# View staged changes
git diff --cached
```

### 3️⃣ Commit (Hooks Run Here)
```bash
git commit -m "feat(sales): Add order validation"

# If checks fail:
#   ❌ Fix the errors
#   git add .
#   git commit -m "fix: TypeScript errors"
```

### 4️⃣ Push (CI/CD Runs)
```bash
# Push to remote
git push origin my-feature

# GitHub Actions will run 8 tests
# PR shows test results
```

---

## Common Commands

### Fix Issues
```bash
# Auto-fix linting issues
npm run lint:fix

# Check TypeScript compilation
npm run build

# Run accounting tests
npm run test:accounting

# Run all tests
npm run test
```

### View Commit Hooks Status
```bash
# Check if hooks exist
ls -la .husky/

# Test pre-commit hook manually
bash .husky/pre-commit
```

### Bypass Checks (Emergency Only)
```bash
# Skip pre-commit hooks
git commit --no-verify -m "emergency: Critical fix"

# ⚠️ DO NOT USE for regular development
```

---

## Error Messages & Solutions

### "TypeScript compilation failed"
```bash
cd SamplePOS.Server
npm run build  # See full errors
# Fix type errors
git add .
git commit -m "fix: TypeScript errors"
```

### "ESLint violations found"
```bash
cd SamplePOS.Server
npm run lint:fix  # Auto-fix
git add .
git commit -m "fix: ESLint issues"
```

### "Accounting integrity test failed"
```bash
cd SamplePOS.Server
npm run test:accounting  # See details
# Fix accounting logic
git add .
git commit -m "fix: Accounting logic"
```

### "Hardcoded secrets detected"
```bash
# Use environment variables instead
# .env.example
API_KEY=your_key_here

# Code
const apiKey = process.env.API_KEY;

git add .
git commit -m "fix: Use env vars for secrets"
```

### "GitHub Actions failed"
```bash
# View error in PR → Checks tab
# Fix locally and re-push
git push origin my-feature
```

---

## Layer Details

| Layer | When | Status |
|-------|------|--------|
| Pre-commit hooks | On `git commit` | Local check |
| Lint-staged | During commit | Local staging check |
| GitHub Actions | On `git push` | 8 automated tests |
| Branch protection | On PR merge | Requires approvals |

---

## File Locations

```
.husky/pre-commit              # Main hook script
.husky/prepare-commit-msg      # Commit message hook
.github/workflows/ci-cd-pipeline.yml  # GitHub Actions
CODE_SAFETY_GUIDE.md           # Full documentation
setup-commit-safety.ps1        # Setup script
package.json                   # lint-staged config
```

---

## Quick Diagnostics

```bash
# Is Husky installed?
npm run prepare

# Are hooks executable?
ls -la .husky/pre-commit

# Can backend build?
cd SamplePOS.Server && npm run build

# Can frontend build?
cd samplepos.client && npm run build

# Do tests pass?
cd SamplePOS.Server && npm run test:accounting

# Any linting issues?
cd SamplePOS.Server && npm run lint
```

---

## Commit Message Format

```
<type>(<scope>): <description>

Example: feat(accounting): Add GL reconciliation

Types:   feat | fix | docs | style | refactor | test | chore
Scope:   accounting | sales | inventory | auth | pos | etc.
```

---

## When Something Breaks

1. **Check error message** → Pre-commit hook output
2. **Understand issue** → Read error details
3. **Fix locally** → Make code changes
4. **Re-stage** → `git add .`
5. **Re-commit** → `git commit -m "fix: ..."`
6. **If still broken** → Read CODE_SAFETY_GUIDE.md

---

## Success Indicators ✅

```
✅ Pre-commit hook passes
✅ All staged files pass linting
✅ TypeScript compilation succeeds
✅ Accounting tests pass
✅ No hardcoded secrets
✅ Git commit created
✅ GitHub Actions all green
✅ PR ready to merge
```

---

**For full details**: Read [CODE_SAFETY_GUIDE.md](CODE_SAFETY_GUIDE.md)
