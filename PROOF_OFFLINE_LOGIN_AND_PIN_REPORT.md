# Report: Offline login + PIN — bug-free hardening

**Verdict: PASS**  
**Gates:** see auto matrix in `PROOF_OFFLINE_LOGIN_AND_PIN.md` (includes identity-isolation gates)  
**Regression pack:** **126/126** — offline/PIN proof + session-death lock + force-login + reliability + cold-start  

---

## Bugs found and fixed

### 1. Critical — offline login could bind the wrong server identity

**Before:** offline success did  
`localStorage.getItem('auth_token') || generateOfflineToken()`  
and AuthContext `login()` only set `auth_token` when no RT was passed — **leaving the previous user’s `refresh_token` in place**.

**Impact:**
- User B offline-login could keep **User A’s JWT** as the access token.  
- Keepalive / axios pre-refresh could **revive User A’s session** while the UI showed User B.  
- **Foreign `rbac_permissions`** could route B with A’s rights until refresh.

**Fix:**
- `beginOfflineLoginSession(user)` always strips `auth_token`, `refresh_token`, `token_expiry`, `refresh_lock`.  
- Strips `rbac_permissions` unless **same `user.id`**.  
- Mints a fresh `offline-session-*` token only.  
- LoginPage uses that helper on both offline and “server unreachable” paths.  
- Access-only `login()` always removes residual RT/expiry.

### 2. Robustness — corrupt cache / salt

- Invalid salt no longer throws (null-safe parse).  
- Malformed credentials JSON coerced to `[]`.  
- Empty email/password rejected.  
- Validate is try/catch around derive (no uncaught crypto throw)

### 3. Consistency — recovery path SSOT

- `isAuthRecoveryPath` is the single helper for forceLogout, peer LOGOUT/SESSION_EXPIRED, idle logout, cold-start gate.  
- Prevents drift where one path bounced off `/quick-login` while another did not.

---

## Product truth (post-fix)

| Path | Online | Offline | Session death |
|---|---|---|---|
| Password `/login` | Cache on success | PBKDF2 multi-user cache | Force login; **offline cache kept**; isolated offline session |
| PIN `/quick-login` | Public pin-only API | Not supported (server) | Stay on screen; no replace loop |
| Cold start | — | — | Cashier → PIN; Admin/Manager restore |

---

## Re-run automation

```bash
cd samplepos.client
npm run proof:offline-login-pin
# Full session + offline pack used for sign-off:
npx vitest run \
  src/__tests__/offline-login-and-pin.proof.test.ts \
  src/__tests__/session-death-login.invariant.lock.test.ts \
  src/__tests__/session-force-login-redirect.proof.test.ts \
  src/__tests__/session-reliability.spec.ts \
  src/__tests__/session-cold-start-lock.evidence.test.ts
```

---

## Residual (by design, not bugs)

| Item | Note |
|---|---|
| PIN offline | Impossible without server bcrypt — password offline only |
| Offline-session API | Has no valid JWT; online APIs correctly reject/force re-login when network returns |
| Live production pin-only E2E | Covered by separate server pin-only evidence suites |

---

## Bottom line

Identity isolation on offline login is now sealed; leftover RT/JWT/RBAC bleed is closed; PIN recovery surfaces stay usable after session death. **126 related automated tests pass.**
