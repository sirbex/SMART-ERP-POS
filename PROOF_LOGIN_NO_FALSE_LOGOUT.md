# PROOF — Login must not false-logout

**Generated:** 2026-08-15T22:44:06.056Z  
**Verdict:** **PASS** (23/23 tests)

## Guarantee

A successful login must **stay authenticated**. Same-tab `auth-changed` must not re-run cold-start wipe; login grace blocks cross-tab storage races for 30s.

## Suites

```
src/__tests__/login-no-false-logout.proof.test.ts
src/lib/sessionColdStartLock.test.ts
src/lib/deviceSessionPolicy.integrity.test.ts
```

## Output tail

```

 RUN  v3.2.4 C:/Users/Chase/source/repos/SamplePOS/samplepos.client

 ✓ src/__tests__/login-no-false-logout.proof.test.ts (4 tests) 19ms
 ✓ src/lib/sessionColdStartLock.test.ts (7 tests) 18ms
 ✓ src/lib/deviceSessionPolicy.integrity.test.ts (12 tests) 22ms

 Test Files  3 passed (3)
      Tests  23 passed (23)
   Start at  01:44:07
   Duration  3.21s (transform 538ms, setup 0ms, collect 1.95s, tests 59ms, environment 2ms, prepare 2.91s)



```
