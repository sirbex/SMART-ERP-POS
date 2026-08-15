# PROOF: Shared terminal session lock

- Date: 2026-08-15T22:44:21.763Z
- Runner: `npx vitest run src/__tests__/shared-terminal-session-lock.evidence.test.ts src/lib/deviceSessionPolicy.integrity.test.ts`
- Gates: 31/31 pass (0 fail)
- Verdict: **PASS**

## Problem

User logs in, closes the browser without logout. Next person opens the same browser and is silently restored as the previous actor.

## Controls (SHARED default) — fail closed

1. **Actor lock** (`smarterp_actor_lock_v1`) on `pagehide`/`beforeunload` — survives Chrome session restore.
2. **Boot gate** clears JWT, **asserts wipe**, redirects to `/quick-login`.
3. **Storage errors ⇒ locked** (never fail-open into prior actor).
4. **Lock write failure ⇒ immediate token wipe** on unload.
5. **Short idle** (3 min) on SHARED.
6. **PERSONAL** opt-in only via verified mode write / env.
7. Unload RT revoke is best-effort (browser constraint); boot wipe is mandatory.

## Gates

- [x] `DEFAULT_SHARED` — unset storage/env → SHARED
- [x] `GARBAGE_NOT_PERSONAL` — invalid stored mode never becomes PERSONAL
- [x] `IDLE_SHARED_3M` — 180000ms
- [x] `IDLE_PERSONAL_60M` — 3600000ms
- [x] `SAME_SESSION_OK` — alive browser session may continue
- [x] `ACTOR_LOCK_SET_OK` — durable lock
- [x] `ACTOR_LOCK_SET` — smarterp_actor_lock_v1
- [x] `NEXT_OPENER_BLOCKED` — actor lock beats restored sessionStorage
- [x] `NEXT_OPENER_ADMIN_BLOCKED` — SHARED never silent-restores admin either
- [x] `AFTER_RELOGIN` — fresh login clears lock and may operate
- [x] `FAIL_CLOSED_LOCK_READ` — unreadable storage ⇒ locked
- [x] `WIPE_ASSERT_FAILS_LOUD` — leftover JWT throws DeviceSessionIntegrityError
- [x] `WIPE_ASSERT_PASS` — clearTokens + assertSessionWiped
- [x] `UNLOAD_LOCK_FAIL_WIPES` — lock not durable
- [x] `UNLOAD_TOKENS_GONE` — fail-closed wipe on unload
- [x] `SHARED_ALL` — admin
- [x] `MODE_PERSONAL` — smarterp_device_session_mode
- [x] `PERSONAL_ADMIN_OK` — office admin restore
- [x] `PERSONAL_FLOOR_GATE` — floor still gated
- [x] `AUTH_WIPE_ASSERT` — boot gate verifies wipe
- [x] `AUTH_UNLOAD_SSOT` — unload uses SSOT helper
- [x] `AUTH_IDLE_MODE` — idle follows device mode
- [x] `AUTH_CLEAR_LOCK_BEFORE_AUTH` — grace + lock cleared before authenticated paint
- [x] `AUTH_NO_SAME_TAB_INIT_ON_AUTH_CHANGED` — same-tab auth-changed must not re-initAuth (login bounce)
- [x] `POLICY_FAIL_CLOSED` — lock read errors ⇒ locked
- [x] `SSOT_INTEGRITY_ERROR` — integrity error type
- [x] `BOOT_KEY_SSOT` — boot key owned by SSOT (no client fork)
- [x] `WIPE_KEY_CATALOG` — wipe key catalog
- [x] `NO_EMPTY_CATCH_LOCK_OPEN` — isActorLockSet must not fail-open
- [x] `BEACON_SAFE` — unload-safe
- [x] `ASSERT_CLEARED_HELPER` — empty session passes assert
