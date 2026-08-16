# Blis PC logout vs phone — root cause

**Symptom:** Blis (and similar) restaurant tenants: login works on **phones**, immediate logout on **PCs**.

**Deploy status:** `6ff6993e` was on the server; that release fixed *same-tab* bounce only.

## Why phone OK / PC broken

| | Phone | PC |
|--|-------|-----|
| Tabs | Usually **1** | Often **2+** (floor + back-office, or leftover login tab) |
| Shared | — | `localStorage` + `storage` events across tabs |
| Login grace (old) | `sessionStorage` only | Peer tab **cannot** see grace |

### Sequence on a PC with a second tab open

1. User logs in → tab A writes `auth_token` / `user` to `localStorage`.
2. Tab B receives `storage` → runs `initAuth()`.
3. Tab B: SHARED cold-start + actor lock; **no grace** (grace was session-only on tab A).
4. Tab B **wipes tokens** (and may revoke refresh) → tab A looks logged out instantly.

Phones never hit step 2–4.

## Fix (this change)

1. `markLoginGrace()` writes **`localStorage` + `sessionStorage`** so peer tabs honor the 30s window.
2. `login()` calls **grace + `clearActorLock()` before** writing tokens (before any `await`).
3. `clearTokens()` clears the grace key so logout does not leave a false grace.

Proofs: login-no-false-logout **25/25**, session cold-start + shared-terminal vitests green.
