# DEFECT REPORT & VERIFICATION — Session Death → Login Screen

| Field | Value |
|-------|--------|
| **Title** | Server/session logout leaves SPA on protected UI (token-expired errors) |
| **Severity** | **Critical** (security + usability — unauthenticated UI state) |
| **Module** | Client auth session lifecycle (`samplepos.client`) |
| **Report date** | 2026-08-09 |
| **Status** | **FIXED + VERIFIED PASS** |
| **Regression #** | Second recurrence of same user-facing failure |

---

## 1. Executive summary

When the **server ended the session** (refresh revoked/expired, token invalid, force-logout idle sessions, etc.), the **SPA stayed on the protected module**. Users saw **“token expired” / auth error toasts** and had to manually recover instead of landing on the **login screen**.

**Root cause was client policy + redirect wiring**, not “server forgot to return 401”.  
**Fix** forces login on definitive auth death and hard-navigates the **originating tab** (BroadcastChannel never notifies self).

**Regression suite (just re-run): 162/162 PASS.**  
Dedicated proof: **11/11 PASS** → `PROOF_SESSION_FORCE_LOGIN.md` / `.json`.

---

## 2. Symptoms (user / operator view)

| Observed | Expected |
|----------|----------|
| Session ends on server | Client leaves authenticated UI |
| Still viewing Sales/POS/Dashboard | Hard navigate to `/login` |
| Toasts: token expired, unauthorized, auth gate errors | Banner “session expired” on login only |
| Manual reload or clicking around sometimes recovered | Automatic, consistent every time |

This matched a **second time fixing** the same class of bug — prior work covered refresh/idle locks but left a policy hole when the user was “active”.

---

## 3. Root cause analysis (expert)

### Failure chain

```
Server revokes/expires refresh (or returns 401 on /auth/token/refresh)
        ↓
Client refresh fails → classifyRefreshError() → definitive_auth
        ↓
shouldPerformAutoLogout({ activeOrGuarded: true, errorKind: definitive_auth })
        ↓
OLD: returned FALSE ("defer until idle")   ← BUG A
        ↓
Tokens left in localStorage; React isAuthenticated stays true
        ↓
API calls keep failing → toast "token expired"
        ↓
Even when SESSION_EXPIRED was broadcast → BroadcastChannel does NOT echo
to the originating tab → no hard redirect                 ← BUG B
```

### Bug A — incorrect logout policy

**File:** `samplepos.client/src/lib/sessionLogoutPolicy.ts` (previous logic)

Intent was SAP/Odoo style: **never logout on network/5xx while the user is typing.**

**Defect:** That “preserve while active” rule was also applied to **`definitive_auth`**.

If the server says the refresh token is dead:

- Typing **cannot revive** the session.
- Deferring logout only leaves a **zombie authenticated shell**.

Activity window was up to **60 minutes** of recent input — so in normal use the user is almost always “active”, making force-login effectively **never fire**.

### Bug B — originating tab never hard-navigated

**File:** `samplepos.client/src/lib/authBroadcast.ts`

Documented contract: *originating tab does NOT receive BroadcastChannel events*.

Refresh failure path often:

1. set auth EXPIRED  
2. `broadcastAuthEvent({ type: 'SESSION_EXPIRED' })`  

…and relied on **other** tabs / AuthContext listeners.

The **tab that hit the 401** frequently **never** ran `window.location` → login.  
`forceLogoutRedirect` was gated by the bad policy (Bug A), so both bugs stacked.

### Bug C (secondary) — peer tab ignore + idle soft logout

- Cross-tab `SESSION_EXPIRED` was **ignored** if that tab was “active” (`shouldIgnoreCrossTabSessionExpired`).
- Idle logout called `logout()` without **hard** navigation (react state only — lag / race risk).

---

## 4. Solution (what we changed)

### 4.1 Policy SSOT — definitive death always logs out

**File:** `samplepos.client/src/lib/sessionLogoutPolicy.ts`

| Error kind | Active user | Idle user |
|------------|-------------|-----------|
| `network` | **Stay** (retry) | **Stay** (retry) |
| `transient_server` (5xx) | **Stay** | **Stay** |
| `definitive_auth` | **Logout + login** | **Logout + login** |
| manual logout | Logout | Logout |
| no refresh token | Logout | Logout |

`shouldIgnoreCrossTabSessionExpired()` → **always `false`**.

### 4.2 Same-tab hard redirect

**File:** `samplepos.client/src/hooks/useTokenRefresh.ts`

- Exported **`forceLogoutRedirect(reason)`**:
  - sets auth machine **EXPIRED**
  - **`clearTokens()`** (access, refresh, expiry, user, rbac)
  - broadcasts **`LOGOUT`** to peer tabs
  - sets `sessionStorage.session_expired = '1'`
  - **`window.location.replace(.../login)`** (not soft React-only)
  - skips replace if already on `/login`, `/quick-login`, `/platform`
  - idempotent guard against double-fire

- Refresh failure path (**`_refreshOnce` catch**): on policy allow → **calls `forceLogoutRedirect`** (same tab; not broadcast-only).

- 401 handler still calls `forceLogoutRedirect` after failed refresh (belt + suspenders).

### 4.3 AuthContext consistency

**File:** `samplepos.client/src/contexts/AuthContext.tsx`

- Peer **LOGOUT** / **SESSION_EXPIRED** → clear state + **location.replace('/login')**
- Idle / post-guard idle logout → clear + **location.replace('/login')**

### 4.4 Intentionally preserved (non-bugs)

- Network blips and **5xx** must **not** eject an active cashier mid-entry.
- Idle timer still requires true inactivity (no input in the idle window).

---

## 5. Test plan & evidence

### 5.1 Automated suites (this machine — 2026-08-09 T16:19 local / run started 16:19:30)

```text
npx vitest run \
  src/__tests__/session-force-login-redirect.proof.test.ts \
  src/__tests__/session-reliability.spec.ts \
  src/__tests__/session-active-enterprise.spec.ts

Test Files  3 passed (3)
Tests       162 passed (162)
```

| Suite | Role | Result |
|-------|------|--------|
| `session-force-login-redirect.proof.test.ts` | Dedicated defect proof + artifact | **5 tests / 11 gates PASS** |
| `session-active-enterprise.spec.ts` | Module matrix + cross-tab activity + policy | **70 PASS** |
| `session-reliability.spec.ts` | Token storage, mutex, idle, state machine | **87 PASS** |

### 5.2 Dedicated proof artifact

| Artifact | Content |
|----------|---------|
| `PROOF_SESSION_FORCE_LOGIN.md` | Human gate table |
| `PROOF_SESSION_FORCE_LOGIN.json` | Machine-readable gates |

**Verdict: PASS (11/11)**

| Gate ID | Assertion | Result |
|---------|-----------|--------|
| `POLICY_ACTIVE_DEFINITIVE` | Active + definitive_auth → logout **true** | PASS |
| `POLICY_NETWORK_PRESERVE` | Active + network → logout **false** | PASS |
| `POLICY_PEER_SESSION_EXPIRED` | Cross-tab ignore always **false** | PASS |
| `CLASSIFY_EXPIRED_MSG` | “Refresh token expired” → definitive | PASS |
| `CLASSIFY_BARE_401` | Bare 401 → definitive | PASS |
| `FORCE_CLEAR` | forceLogoutRedirect clears tokens | PASS |
| `FORCE_REPLACE` | `location.replace` to `/login` | PASS |
| `FORCE_FLAG` | `session_expired` flag set | PASS |
| `HANDLER_CLEAR` | 401 + dead refresh clears tokens | PASS |
| `HANDLER_NAV` | 401 path triggers hard nav | PASS |
| `IDLE_INACTIVE_LOGOUT` | Idle + definitive still logout | PASS |

### 5.3 Behavioral matrix (tester sign-off)

| Scenario | Expected | Proved by |
|----------|----------|-----------|
| Active user + refresh 401 expired | Clear auth + go login | proof HANDLER_* + POLICY_ACTIVE_DEFINITIVE |
| Active user + network error | Stay signed in | POLICY_NETWORK_PRESERVE + enterprise matrix |
| Active user + refresh 500 | Stay signed in | enterprise 401/500 integration |
| Peer tab SESSION_EXPIRED | This tab also leaves | POLICY_PEER_SESSION_EXPIRED |
| Idle timeout | Logout + hard login | AuthContext + IDLE gate / reliability idle specs |

### 5.4 Manual UAT checklist (after deploy)

1. Login as any role → navigate to Sales.  
2. In another session/admin: revoke refresh tokens / force logout / wait past refresh expiry with only bad access token.  
3. Trigger any authenticated API on the first browser.  
4. **Pass criteria:** immediate navigateto **Login**; optional session-expired banner; **no** stack of permanent “token expired” toasts on a protected page.  
5. Airplane mode / kill server 5xx mid-form: must **not** dump user to login solely for connectivity.

---

## 6. Files touched (change inventory)

| Path | Change type |
|------|-------------|
| `samplepos.client/src/lib/sessionLogoutPolicy.ts` | Policy fix (cause A + peer ignore) |
| `samplepos.client/src/hooks/useTokenRefresh.ts` | `forceLogoutRedirect` + refresh-fail path |
| `samplepos.client/src/contexts/AuthContext.tsx` | Hard nav on idle / peer logout / expire |
| `samplepos.client/src/__tests__/session-force-login-redirect.proof.test.ts` | **NEW** proof producer |
| `samplepos.client/src/__tests__/session-reliability.spec.ts` | Expectations inverted for definitive auth |
| `samplepos.client/src/__tests__/session-active-enterprise.spec.ts` | Matrix + force-logout evidence |
| `PROOF_SESSION_FORCE_LOGIN.md` | Generated evidence |
| `PROOF_SESSION_FORCE_LOGIN.json` | Generated evidence |

---

## 7. Residual risk & recommendations

| Risk | Mitigation |
|------|------------|
| Brief flash of error toast if UI renders one frame before replace | Acceptable; hard replace is primary fix |
| Users mid-form lose draft on true session death | Correct: session is invalid; re-auth required |
| FOH auto-logout to **quick-login** | Unchanged path (still uses dedicated FOH redirect after its own `logout()`) |
| Dependency on `window.location.replace` in tests | Mocked; real browsers always have replace |

**Recommendation:** Keep this proof in CI:

```bash
npx vitest run src/__tests__/session-force-login-redirect.proof.test.ts
```

Do **not** reintroduce “defer definitive_auth while active” — that is what caused the second regression.

---

## 8. Sign-off

| Role | Finding |
|------|---------|
| **Developer** | Cause = client policy + same-tab redirect gap; solution = forced login on definitive auth + hard replace. |
| **Superior tester** | Suite **162/162 PASS**; dedicated proof **11/11 PASS**; cause/solution/evidence consistent. |
| **Verdict** | **APPROVED FOR RELEASE** pending manual UAT smoke on target deploy environment. |

### Re-run commands

```bash
cd samplepos.client
npx vitest run src/__tests__/session-force-login-redirect.proof.test.ts
npx vitest run src/__tests__/session-reliability.spec.ts src/__tests__/session-active-enterprise.spec.ts
```

Artifacts: `PROOF_SESSION_FORCE_LOGIN.md`, `PROOF_SESSION_FORCE_LOGIN.json`, this report.
