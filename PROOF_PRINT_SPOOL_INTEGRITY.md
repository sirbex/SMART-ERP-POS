# Print spool integrity — runtime + evidence

## Verdict
**PASS** (executed steps, not source-guessing alone)

## What was executed

### Client (`samplepos.client`)
```
npx vitest run src/__tests__/print-spool-integrity.runtime.test.ts \
  src/__tests__/print-jobs-ssot.evidence.test.ts \
  src/__tests__/printJobDispatcher.evidence.test.ts \
  src/__tests__/receipt-print-integrity.evidence.test.ts
```
**37/37 passed**

Runtime steps covered:
1. Version gate ≥1.4 for spool wait
2. Unnamed printer rejected
3. HTTP classify: 200+spooled / waited reject / 202 legacy / 4xx / 5xx
4. Poll outcome ok|fail|unsupported
5. Flush max age 20m (fresh vs stale)
6. Dispatcher: PRINTED only after `printKitchenTicket` resolves
7. Dispatcher: throw → failure, not PRINTED
8. Flush skips stale offline jobs
9. Delivered-id cache blocks re-paper
10. Bill path `allowUnnamedAgentDefault: false`

### Agent (`smart-print-agent` v1.4.0)
```
npx vitest run
```
**6/6 passed** (real Express listen + fetch)

Runtime steps covered:
1. POST /print without name → **400** Named printer required
2. X-Print-Wait spool → **200** `{ spooled: true, status: SPOOL_OK }`
3. Spool throw → **502** not success
4. Legacy 202 + GET `/print/jobs/:id` → SPOOL_OK after drain
5. `/health` version **1.4.0**
6. RAW source asserts full WritePrinter byte count

## Inconsistency fixed during this pass
- `smart-print-agent/package.json` was still **1.3.1** while `config.ts` said **1.4.0** → aligned to **1.4.0**
