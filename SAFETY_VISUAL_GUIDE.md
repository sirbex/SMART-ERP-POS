# 🛡️ Code Safety System - Visual Guide

## 4-Layer Protection System

```
┌─────────────────────────────────────────────────────────────────────┐
│                    YOUR LOCAL MACHINE                               │
│                                                                     │
│  Layer 1: Pre-Commit Hooks (.husky/pre-commit)                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ✅ TypeScript Compilation                                   │  │
│  │ ✅ ESLint Validation                                        │  │
│  │ ✅ Accounting Integrity Tests                               │  │
│  │ ✅ Security Checks (Hardcoded Secrets)                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│          │                                                         │
│          ├─ ✅ PASS → Commit Created                              │
│          └─ ❌ FAIL → Commit BLOCKED                              │
│                                                                     │
│  Layer 2: Lint-Staged (package.json)                              │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ✅ ESLint on Staged Files Only                              │  │
│  │ ✅ Prettier Format Check                                    │  │
│  │ (Runs during commit phase)                                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│          │                                                         │
│          └─ ✅ PASS → Ready for push                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ git push origin branch-name
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GITHUB SERVER                                  │
│                                                                     │
│  Layer 3: GitHub Actions CI/CD (.github/workflows/ci-cd-pipeline.yml)
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Job 1: Code Quality                                         │  │
│  │   ├─ TypeScript Compilation (Backend)                       │  │
│  │   ├─ TypeScript Compilation (Frontend)                      │  │
│  │   ├─ ESLint (Backend)                                       │  │
│  │   ├─ ESLint (Frontend)                                      │  │
│  │   └─ Prettier Check                                         │  │
│  │                                                              │  │
│  │ Job 2: Security                                             │  │
│  │   ├─ Trivy Vulnerability Scanner                            │  │
│  │   ├─ Secret Detection                                       │  │
│  │   └─ SARIF Upload                                           │  │
│  │                                                              │  │
│  │ Job 3: Backend Tests (PostgreSQL + Redis)                   │  │
│  │   ├─ Database Migrations                                    │  │
│  │   ├─ Unit Tests                                             │  │
│  │   ├─ Accounting Integrity Tests                             │  │
│  │   └─ Coverage Report → Codecov                              │  │
│  │                                                              │  │
│  │ Job 4: Frontend Tests                                       │  │
│  │   ├─ React Tests                                            │  │
│  │   └─ Coverage Report                                        │  │
│  │                                                              │  │
│  │ Job 5: Build Verification                                   │  │
│  │   ├─ Production Build (Backend)                             │  │
│  │   ├─ Production Build (Frontend)                            │  │
│  │   └─ Artifact Verification                                  │  │
│  │                                                              │  │
│  │ Job 6: Docker Build                                         │  │
│  │   ├─ Backend Docker Image                                   │  │
│  │   └─ Frontend Docker Image                                  │  │
│  │                                                              │  │
│  │ Job 7: Dependency Check                                     │  │
│  │   ├─ Backend npm audit                                      │  │
│  │   └─ Frontend npm audit                                     │  │
│  │                                                              │  │
│  │ Job 8: Pipeline Summary                                     │  │
│  │   └─ Final Status Report                                    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│          │                                                         │
│          ├─ ✅ ALL PASS → PR Ready                                │
│          └─ ❌ ANY FAIL → PR Blocked                              │
│                                                                     │
│  Layer 4: Branch Protection Rules                                  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ✅ All CI Jobs Must Pass                                    │  │
│  │ ✅ Code Review Required (2+ approvals)                      │  │
│  │ ✅ Up-to-date with main branch                              │  │
│  │ ✅ Only specific users can push                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│          │                                                         │
│          └─ ✅ PASS → Can Merge to main                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Commit Workflow Timeline

```
TIME    EVENT                          STATUS    ACTION
────────────────────────────────────────────────────────────────
  T₀    Code Ready                      ✏️  Write code
  +1min  Stage Changes                  📦  git add .
  +2min  Run Commit                     📝  git commit -m "..."
         ↓
  +3min  Pre-Commit Hooks              🔄  Auto-run (10-30s)
         ├─ TypeScript                  ✅ or ❌
         ├─ ESLint                      ✅ or ❌
         ├─ Accounting Tests            ✅ or ❌
         └─ Security Checks             ✅ or ❌
         ↓
  +5min  Lint-Staged                   🔄  Auto-run (1-5s)
         └─ Format & lint staged files  ✅ or ❌
         ↓
  +6min  ✅ Commit Created              📊  Local commit done
         ↓
  +7min  Push to Remote                ⬆️  git push origin branch
         ↓
  +8min  GitHub Actions Start          🚀  8 jobs in parallel
         ├─ Code Quality
         ├─ Security
         ├─ Backend Tests
         ├─ Frontend Tests
         ├─ Build Verification
         ├─ Docker Build
         ├─ Dependency Check
         └─ Summary
         ↓
  +20min Actions Complete              ✅ or ❌
         ↓
  +21min Ready for Review               👥  PR shows status
```

---

## Error Response Time

```
Error Type              Caught At        Time to Fix  Block Location
───────────────────────────────────────────────────────────────────
Syntax Error            Pre-commit         <1 min      Commit
TypeScript Error        Pre-commit         <5 min      Commit
ESLint Violation        Pre-commit         <3 min      Commit (auto-fix)
Hardcoded Secret        Pre-commit         <2 min      Commit
Accounting Error        Pre-commit         <10 min     Commit
Build Failure           GitHub Actions     5-10 min    Push
Test Failure            GitHub Actions     5-20 min    Push
Security Vuln           GitHub Actions     variable    Push
Docker Build Error      GitHub Actions     5-15 min    Push
```

**Key**: Caught at commit = immediate feedback vs hours later in production

---

## Status Indicators

### Pre-Commit Hook Output

```
🔍 Running pre-commit checks...

🏗️  Checking backend TypeScript files...
   📝 Checking TypeScript compilation...
   ✅ TypeScript compilation passed
   🧹 Running ESLint...
   ✅ ESLint check passed

⚛️  Checking frontend React files...
   📝 Checking TypeScript compilation...
   ✅ TypeScript compilation passed
   🧹 Running ESLint...
   ✅ ESLint check passed

🔍 Running accounting integrity checks...
   ✅ Accounting integrity checks passed

🔒 Security checks...
   📋 Checking for hardcoded secrets...
   ✅ No hardcoded secrets detected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All pre-commit checks passed! Proceeding with commit...
```

### GitHub Actions Badge in PR

```
All checks passed ✅

✓ code-quality  ✓ security  ✓ backend-tests  ✓ frontend-tests
✓ build-verification  ✓ docker-build  ✓ dependency-check
```

---

## Error Scenarios

### Scenario 1: TypeScript Error (Most Common)

```
🏗️  Checking backend TypeScript files...
   📝 Checking TypeScript compilation...
   ❌ TypeScript compilation failed!

❌ COMMIT BLOCKED - Fix the errors above

To bypass (NOT RECOMMENDED): git commit --no-verify
```

**Fix**:
```bash
cd SamplePOS.Server
npm run build  # See full error
# Fix type error in code
git add .
git commit -m "fix: TypeScript error"  # Try again
```

---

### Scenario 2: Accounting Integrity Test Failed

```
🔍 Running accounting integrity checks...
   ❌ COMMIT BLOCKED: Accounting integrity tests failed!
   Run 'npm run test:accounting' in SamplePOS.Server for details.
```

**Fix**:
```bash
cd SamplePOS.Server
npm run test:accounting  # See test failures
# Fix GL posting logic
git add .
git commit -m "fix: Accounting logic"  # Try again
```

---

### Scenario 3: Hardcoded Secret Detected

```
🔒 Security checks...
   📋 Checking for hardcoded secrets...
   ⚠️ Possible hardcoded secrets found:
   API_KEY = "secret123"
```

**Fix**:
```bash
# Use environment variables instead
# .env: API_KEY=secret123
# code: const apiKey = process.env.API_KEY;

git add .
git commit -m "fix: Use env vars for secrets"  # Try again
```

---

## Performance Profile

```
Check                Duration    Impact
─────────────────────────────────────────────
TypeScript (backend)   8-12s     Required
TypeScript (frontend)  2-4s      Required
ESLint (backend)       3-5s      Required
ESLint (frontend)      1-2s      Required
Accounting Tests       5-15s     Required
Security Checks        1-2s      Required
─────────────────────────────────────────────
TOTAL PRE-COMMIT      20-40s     All must pass

Lint-Staged           1-5s       On staged files
─────────────────────────────────────────────
TOTAL COMMIT           ~30-50s    If all pass

GitHub Actions:
  Total Runtime        15-25min   In parallel
  Critical Path        ~12min     Backend tests
```

---

## Decision Tree: Should I Bypass Hooks?

```
                        ┌─ Pre-commit hook failed
                        │
                        ├─ Do I understand the error?
                        │  ├─ YES → Fix it (recommended)
                        │  └─ NO → Read error, learn, fix
                        │
                        ├─ Will fixing it take <15 min?
                        │  ├─ YES → Fix it now
                        │  └─ NO → Ask team for help
                        │
                        ├─ Is production completely down?
                        │  ├─ YES → Can bypass with --no-verify
                        │  └─ NO → Fix it properly
                        │
                        ├─ Will you fix it in next commit?
                        │  ├─ YES → Can bypass temporarily
                        │  └─ NO → DO NOT BYPASS
                        │
                        └─ ✅ Only bypass if:
                            1. Production is down
                            2. Emergency fix required
                            3. You'll fix it immediately
```

---

## Git Hook File Locations

```
.husky/
├── pre-commit           ← Main validation hook (enhanced)
├── prepare-commit-msg   ← Message validation hook
└── _/
    └── husky.sh         ← Husky framework

.github/workflows/
├── accounting-integrity.yml  ← Existing test job
├── product-consistency.yml   ← Existing check job
└── ci-cd-pipeline.yml        ← NEW comprehensive pipeline

Configuration:
├── package.json              ← lint-staged config
├── SamplePOS.Server/package.json
└── samplepos.client/package.json
```

---

## Critical Paths

### Blocking Paths (Prevents Commit)
```
Pre-Commit Hook
  ├─ TypeScript (MUST PASS)
  ├─ Accounting Tests (MUST PASS)
  └─ Security Checks (MUST PASS)
```

### Blocking Paths (Prevents Push)
```
GitHub Actions
  ├─ Code Quality (MUST PASS)
  ├─ Backend Tests (MUST PASS)
  ├─ Build Verification (MUST PASS)
  └─ Docker Build (MUST PASS)
```

### Blocking Paths (Prevents Merge)
```
Branch Protection
  ├─ All CI jobs PASS
  ├─ Code review approved
  └─ Up-to-date with main
```

---

**Visual Guide Updated**: January 27, 2026  
**For detailed info**: See [CODE_SAFETY_GUIDE.md](CODE_SAFETY_GUIDE.md)
