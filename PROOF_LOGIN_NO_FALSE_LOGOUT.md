# PROOF — Login must not false-logout

**Generated:** 2026-08-16T05:27:01.512Z  
**Verdict:** **PASS** (25/25 tests)

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

 ✓ src/__tests__/login-no-false-logout.proof.test.ts (5 tests) 17ms
 ✓ src/lib/sessionColdStartLock.test.ts (8 tests) 18ms
 ✓ src/lib/deviceSessionPolicy.integrity.test.ts (12 tests) 29ms

 Test Files  3 passed (3)
      Tests  25 passed (25)
   Start at  08:27:03
   Duration  2.84s (transform 459ms, setup 0ms, collect 1.82s, tests 64ms, environment 1ms, prepare 2.45s)



```
