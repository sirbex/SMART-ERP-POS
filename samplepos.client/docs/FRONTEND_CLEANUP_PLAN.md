# 🧹 FRONTEND CLEANUP PLAN

## Current Issues Identified

### 1. Backend Files in Frontend Directory ❌
**Location**: `C:\Users\Chase\source\repos\SamplePOS\samplepos.client`

**Files to DELETE**:
- `BACKEND_01_CONFIG.txt`
- `BACKEND_02_PRISMA_SCHEMA.prisma`
- `BACKEND_03_CORE_SERVER.ts`
- `BACKEND_04_UTILITIES.ts`
- `BACKEND_05_AUTH_USERS.ts`
- `BACKEND_06_PRODUCTS.ts`
- `BACKEND_07_SETUP_GUIDE.md`
- `BACKEND_08_SALES_MODULE.ts`
- `BACKEND_COMPLETE_SUMMARY.md`
- `BACKEND_SETUP_COMPLETE_NEXT_STEPS.md`
- `BACKEND_SETUP_STATUS.md`
- `PRISMA_SCHEMA.prisma`
- `package.server.json`
- `server/` directory (entire folder)
- `src/server.ts`
- `src/simple-server.ts`
- `src/controllers/` (backend logic)
- `src/db/` (backend database)
- `src/middleware/` (backend middleware)
- `src/models/` (backend models)
- `src/modules/` (backend modules)
- `src/repositories/` (backend repositories)

### 2. Conflicting CSS Files ❌
**Files to DELETE**:
- `src/emergency.css` ⚠️ **This was overriding Tailwind!**
- `inventory-check.css`
- `price-check.css`
- `test-output.css`
- Any duplicate CSS in `src/styles/`

**Files to KEEP**:
- `src/index.css` (main Tailwind imports)
- `src/App.css` (if minimal, or delete and use Tailwind only)
- `tailwind.config.js`
- `postcss.config.js`

### 3. Old Test/Development Files ❌
**Files to DELETE**:
- `api-test.html`
- `fix-inventory-from-receiving.html`
- `inventory-check.html`
- `price-check.html`
- `src/api-config-check.ts`
- `src/api-test.ts`
- `src/test-api-debug.ts`
- `src/test/` (if duplicate of `src/tests/`)
- `test-scripts/` (old scripts)

### 4. Build/Deployment Scripts ❌
**Files to DELETE** (we'll use proper npm scripts):
- `clean-and-create-backend.ps1`
- `init-pos-system.ps1`
- `move-server-out.ps1`
- `reorganize-project.ps1`
- `restart-dev.ps1`
- `start-api-server.bat`
- `start-api-server.ps1`
- `start-dev.ps1`
- `SETUP_BACKEND_IN_SERVER.ps1`

### 5. Documentation Files to Archive
**Files to MOVE to docs/**:
- `CLEANUP_SUMMARY.md`
- `FULL_REBUILD_PLAN.md`
- `NEXT_STEPS_ACTION_PLAN.md`
- `POST_REFACTORING_CHECKLIST.md`
- `POS_REBUILD_GUIDE.md`
- `PROJECT_REORGANIZATION.md`
- `REFACTORING_CLEANUP_REPORT.md`

### 6. Unnecessary Build Artifacts
**Directories to DELETE**:
- `dist/` (will be regenerated)
- `obj/` (VS project artifacts)
- `npm-global/` (why is this here?)

---

## Cleanup Strategy (Step-by-Step)

### Step 1: Delete Backend Files (Highest Priority) ✅
Remove all backend-related files from frontend directory

### Step 2: Remove Conflicting CSS ✅
Delete emergency.css and other conflicting stylesheets

### Step 3: Clean Up Test Files ✅
Remove old test HTML files and test scripts

### Step 4: Remove PowerShell Scripts ✅
Delete old build/deployment scripts

### Step 5: Archive Documentation ✅
Move markdown docs to docs/ folder

### Step 6: Clean Build Artifacts ✅
Delete dist/, obj/, npm-global/

### Step 7: Update Dependencies ✅
Remove unused packages from package.json

### Step 8: Configure API Client ✅
Create axios/fetch config pointing to localhost:3001

### Step 9: Test Frontend ✅
Ensure React app still runs and connects to backend

---

## Expected Final Structure

```
samplepos.client/
├── .vscode/
├── docs/              # All documentation
├── node_modules/
├── public/            # Static assets
├── src/
│   ├── assets/        # Images, fonts
│   ├── components/    # React components
│   ├── config/        # API config, constants
│   ├── context/       # React context (auth, etc)
│   ├── hooks/         # Custom hooks
│   ├── lib/           # Utility libraries
│   ├── pages/         # Page components
│   ├── routes/        # React Router config
│   ├── services/      # API services
│   ├── styles/        # Any custom CSS (minimal)
│   ├── types/         # TypeScript types
│   ├── utils/         # Helper functions
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── main.tsx
├── .env
├── .env.sample
├── components.json    # shadcn config
├── eslint.config.js
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

---

## Files to Review for Duplicates

After cleanup, we'll scan for:
1. Duplicate component definitions
2. Duplicate utility functions
3. Duplicate type definitions
4. Unused imports

---

## Safety Notes

- ✅ Backend is safe in `SamplePOS.Server/`
- ✅ We'll create a backup before deleting (just in case)
- ✅ All backend files are separate now
- ✅ Frontend will be clean React + Vite + Tailwind

---

**Ready to proceed with cleanup?** 🧹
