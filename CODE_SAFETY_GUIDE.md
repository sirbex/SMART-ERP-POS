# Code Safety & Commit Guidelines

## 🛡️ Multi-Layer Protection System

This application has **4 layers of protection** to prevent broken code from reaching production:

### Layer 1: Pre-Commit Hooks (Local Machine)
**When**: Before commit is created  
**Runs**: `.husky/pre-commit`

**Checks**:
- ✅ TypeScript compilation for backend & frontend
- ✅ ESLint linting for code quality
- ✅ Accounting integrity tests (backend only)
- ✅ Security checks for hardcoded secrets
- ✅ Format validation

**If it fails**: Commit is **BLOCKED** ❌

```bash
# Bypass (NOT RECOMMENDED)
git commit --no-verify

# Fix issues instead
npm run lint:fix      # Auto-fix lint issues
npm run build         # Check compilation
npm run test:accounting  # Fix accounting tests
```

---

### Layer 2: Staged File Linting (lint-staged)
**When**: During commit (after hook passes)  
**Runs**: Only on staged files

**Configuration**: `package.json`

**Example**:
```json
"lint-staged": {
  "SamplePOS.Server/src/**/*.{ts,js}": [
    "cd SamplePOS.Server && npm run lint --",
    "cd SamplePOS.Server && npm run format --"
  ],
  "samplepos.client/src/**/*.{ts,tsx}": [
    "cd samplepos.client && npm run lint --"
  ]
}
```

---

### Layer 3: GitHub Actions CI/CD Pipeline
**When**: On push to main/master/develop/staging  
**Location**: `.github/workflows/ci-cd-pipeline.yml`

**Comprehensive Checks** (8 jobs):

1. **Code Quality** ✅
   - TypeScript compilation
   - ESLint validation
   - Prettier format check

2. **Security** 🔒
   - Trivy vulnerability scanning
   - Secret detection
   - Dependency audit

3. **Backend Tests** 🧪
   - Unit tests with PostgreSQL
   - Accounting integrity tests
   - Coverage reports

4. **Frontend Tests** ⚛️
   - React component tests
   - Vitest coverage

5. **Build Verification** 🏗️
   - Production build test
   - Artifact verification

6. **Docker Build** 🐳
   - Backend container build
   - Frontend container build
   - Image caching

7. **Dependency Check** 📦
   - npm audit for vulnerabilities
   - Moderate+ severity warnings

8. **Pipeline Summary** 📊
   - All jobs status
   - Final pass/fail decision

**If any job fails**: PR **cannot be merged** 🚫

---

### Layer 4: Branch Protection Rules (Recommended)
**Location**: GitHub Settings → Branches → Branch Protection Rules

**Recommended Configuration**:

```
Branch: main/master/staging
├── Require pull request reviews before merging (2 reviewers)
├── Dismiss stale pull request approvals
├── Require branches to be up to date before merging
├── Require status checks to pass before merging
│   ├── code-quality
│   ├── security
│   ├── backend-tests
│   ├── frontend-tests
│   ├── build-verification
│   ├── docker-build
│   └── dependency-check
├── Require code reviews from code owners
└── Restrict who can push to matching branches
```

---

## 🚀 How to Make a Safe Commit

### Step 1: Make Changes
```bash
# Make your code changes
vim SamplePOS.Server/src/modules/sales/salesRoutes.ts
```

### Step 2: Stage Changes
```bash
# Add specific files
git add SamplePOS.Server/src/modules/sales/salesRoutes.ts

# Or add all changes
git add .
```

### Step 3: Pre-Commit Hook Runs
```bash
git commit -m "feat: Add sales validation"
```

**Output** (if all checks pass):
```
🔍 Running pre-commit checks...

🏗️  Checking backend TypeScript files...
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

### Step 4: Push to Remote
```bash
git push origin feature/my-feature
```

### Step 5: GitHub Actions Run
- 8 CI jobs execute automatically
- Results appear on PR
- All must pass to merge

---

## ⚠️ Common Failure Scenarios & Fixes

### Issue: TypeScript Compilation Error
```
❌ TypeScript compilation failed!
```

**Fix**:
```bash
# Check the full error
cd SamplePOS.Server
npm run build

# Fix type errors in the code
# Then try again
git add .
git commit -m "fix: TypeScript compilation"
```

---

### Issue: ESLint Violations
```
❌ Linting warnings found
```

**Fix**:
```bash
# Auto-fix common issues
cd SamplePOS.Server
npm run lint:fix

# Stage fixed files
git add .
git commit -m "fix: ESLint violations"
```

---

### Issue: Accounting Integrity Failed
```
❌ COMMIT BLOCKED: Accounting integrity tests failed!
```

**Fix**:
```bash
cd SamplePOS.Server

# Run detailed test to see issues
npm run test:accounting

# Fix the accounting logic
# Then try again
cd ..
git commit -m "fix: Accounting integrity"
```

---

### Issue: Hardcoded Secrets Detected
```
⚠️ Possible hardcoded secrets found
```

**Fix**:
```bash
# Remove hardcoded values
vim SamplePOS.Server/src/config.ts

# Use environment variables instead
const apiKey = process.env.API_KEY;

# Stage and commit
git add .
git commit -m "refactor: Use env vars for secrets"
```

---

### Issue: GitHub Actions Fails
```
CI/CD Pipeline - Code Quality & Safety: FAILED
```

**View Details**:
1. Go to GitHub repository
2. Click "Pull requests"
3. Find your PR
4. Scroll to "Checks" section
5. Click failing job for details

**Example Failure**:
```
docker-build: Build backend Docker image FAILED

Error: npm ERR! code EWORKUNKNOWN
npm ERR! Unknown error

Fix: Check Docker build context, ensure all dependencies resolve
```

---

## 🔧 Setup Instructions

### Initial Setup (First Time)
```bash
# Install all dependencies
npm install

# Install Husky hooks
npm run prepare

# Make pre-commit hook executable
chmod +x .husky/pre-commit
chmod +x .husky/prepare-commit-msg

# Test the pre-commit hook
git diff  # Should show staged files
```

### Install lint-staged (if not already installed)
```bash
npm install --save-dev lint-staged

# Update package.json with lint-staged config (done above)
```

---

## 📋 Commit Message Best Practices

Follow conventional commit format:

```
<type>(<scope>): <subject>
<blank line>
<body>
<blank line>
<footer>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`  
**Scope**: `accounting`, `sales`, `inventory`, `auth`, etc.

**Examples**:
```bash
git commit -m "feat(accounting): Add GL reconciliation endpoint"
git commit -m "fix(sales): Correct profit calculation in reports"
git commit -m "refactor(inventory): Extract FEFO logic to service"
git commit -m "docs: Update deployment guide"
```

---

## 🚫 When to Use --no-verify (AVOID)

```bash
# Only in emergency situations
git commit --no-verify -m "emergency: Critical hotfix"
```

⚠️ **Use only if**:
- Production is down
- Pre-commit hooks are broken
- You'll fix issues in next commit

❌ **Never use**:
- On main/master/staging branches
- To bypass security checks
- For regular development

---

## 📊 GitHub Actions Badges

Add to `README.md`:

```markdown
[![CI/CD Pipeline](https://github.com/YOUR_REPO/actions/workflows/ci-cd-pipeline.yml/badge.svg)](https://github.com/YOUR_REPO/actions/workflows/ci-cd-pipeline.yml)
```

---

## 🔍 Debugging Pre-Commit Hooks

### Check if Husky is installed:
```bash
ls -la .husky/pre-commit
```

### Test hook manually:
```bash
bash .husky/pre-commit
```

### Enable debug mode:
```bash
export DEBUG=*
git commit -m "test"
```

### Re-install Husky:
```bash
npm install husky --save-dev
npm run prepare
chmod +x .husky/pre-commit
```

---

## 📞 Support

For issues with:
- **Pre-commit hooks**: Check `.husky/pre-commit` script
- **TypeScript**: See `SamplePOS.Server/tsconfig.json` and `samplepos.client/tsconfig.json`
- **ESLint**: Check `.eslintrc` in each module
- **GitHub Actions**: View logs in PR "Checks" tab
- **Accounting tests**: Run `npm run test:accounting` locally

---

**Last Updated**: January 27, 2026  
**Maintained By**: Development Team
