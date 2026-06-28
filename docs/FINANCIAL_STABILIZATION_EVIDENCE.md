# Financial Stabilization Evidence (Phase F0)

Operational evidence log for the Financial Integrity Framework stabilization period.
**Legacy reconciliation is NOT retired until all Phase F exit criteria are met.**

See [LEGACY_RECONCILIATION_CONSUMER_AUDIT.md](./LEGACY_RECONCILIATION_CONSUMER_AUDIT.md) for governance gates.

---

## Stabilization cycle entry — deploy 6322fad + 7a606f1

| Field | Value |
|-------|-------|
| Collected | 2026-06-28T02:43Z (initial); deploy workflow in progress |
| Commits pushed | `6322fad` (framework + F0), `7a606f1` (import fix) |
| origin/main | `7a606f1` |
| Target tenant | https://henber.wizarddigital-inv.com |
| Framework phase | F0 (legacy deprecated, not retired) |
| Deploy workflow | [28309030406](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/28309030406) — **success** (~14m47s) |

### Pre/post deploy checks

- Health: OK (HTTP 200)
- Route registration: all framework lanes + `/financial-health` + F0 stabilization routes return 401 (registered, auth required) — not 404
- Frontend: `ReconciliationPage` bundle contains AP lane routes

### Framework baseline proof (`npm run proof:framework-baseline`)

**RESULT: BASELINE OK** (non-blocking SQL parity warnings as expected)

| Domain | Integrity | Period close |
|--------|-----------|--------------|
| AP | RECONCILED (0) | Clear |
| AR | DISCREPANCY (−52,800) | **Blocked** |
| Inventory | RECONCILED (3,410 within materiality) | Clear |

Known legacy SQL parity (documented, non-blocking):

| Field | Framework | Legacy SQL |
|-------|-----------|------------|
| AP integrity | 0 | −913,785 |
| AP status | MATCHED | DISCREPANCY |

### Phase F exit criteria status (cycle 1 — in progress)

| Criterion | This cycle |
|-----------|------------|
| Legacy endpoint usage | Monitor `[LEGACY RECON]` production logs for one release cycle |
| Framework parity | AP SQL mismatch documented; `PARITY_STRICT=1` for CI only |
| Dashboard adoption | Pending finance sign-off |
| Regression suite | Baseline proof PASS; route smoke PASS; tenant API login requires Henber credentials |
| Documentation | FINANCIAL_RECONCILIATION_FRAMEWORK.md + LEGACY audit |
| Rollback | Legacy code paths remain in repo through F0 |

### Next collection

Re-run after deploy completes and weekly during stabilization:

```bash
cd SamplePOS.Server
npm run proof:framework-baseline
npm run collect:stabilization-evidence   # set TEST_EMAIL / TEST_PASSWORD for API evidence
```
