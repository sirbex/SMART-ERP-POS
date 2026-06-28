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

---

## Stabilization cycle entry — G2 (governance UI + materiality wiring)

| Field | Value |
|-------|-------|
| Collected | 2026-06-28 |
| Commits | `5ce3999` (G1), G2 pending push |
| G1 deploy | [28309356007](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/28309356007) — success |

### AR integrity investigation (read-only)

`proof-ar-drift-decompose.mjs` confirms **−52,800 UGX** integrity drift:

- GL 1200 net-active total: 20,847,314 vs open-item: 20,900,114
- Cache healthy (0 drift) — not a cache maintenance issue
- Top entity drivers: case hospital (−2.6M entity GL gap), partially offset by BOU (+137K), African Humanitarian (+166K)
- **Remediation requires authorized GL/open-item alignment — not auto-healed during F0**

Period close remains **blocked on AR** until resolved or materiality override approved via governance config.

### G2 deliverables (in progress)

- `FinancialGovernancePanel` on Reconciliation page
- Tenant materiality config wired into AP/AR/Inventory metrics
- Scheduled snapshot script: `npm run capture:governance-snapshot`
- Post-deploy smoke DB section uses `proof:framework-baseline` via tsx

Re-run after deploy completes and weekly during stabilization:

```bash
cd SamplePOS.Server
npm run proof:framework-baseline
npm run collect:stabilization-evidence   # set TEST_EMAIL / TEST_PASSWORD for API evidence
```
