# PROOF — Soft quarantine program (P0–P4 master)

**Verdict:** PASS
**Proven at:** 2026-08-26T17:54:02.368Z
**Strict:** false

**Contract:** P0–P4 soft quarantine program: mode adapter, expiry automation, Expiring Items bridge, auto-dispose; unified job dispatch; LQ fitness + architecture proof

- PASS `P0_DOC`: P0 policy + mode adapter documented
- PASS `P1_SOFT`: P1 soft quarantine + aging + dispose parity
- PASS `DAMAGE_FLOW`: single-store DAMAGE → soft quarantine; aging maps QUARANTINED → DAMAGE band
- PASS `P2_AUTO`: P2 unified expiry automation (flag default off)
- PASS `P3_BRIDGE`: P3 Expiring Items → quarantine bridge
- PASS `P4_DISPOSE`: P4 auto-dispose separate flag, EXPIRED only, dispose gateway
- PASS `JOBS_DISPATCH`: Unified calculations dispatcher (no competing Bull processors)
- PASS `LQ13`: LQ13 touchpoint covers P1–P4
- PASS `FITNESS`: ci:loss-quarantine-fitness PASS
- PASS `VITEST_EVIDENCE`: P1–P4 + lifecycle E2E vitest PASS
- PASS `TSC_SERVER`: Server TypeScript compile PASS
- PASS `LQ_ARCH`: lossQuarantineArchitectureProof (Gate A) PASS
- PASS `ARTIFACT_P1`: PROOF_SOFT_QUARANTINE_P1 = PASS
- PASS `ARTIFACT_P2`: PROOF_SOFT_QUARANTINE_P2 = PASS
- PASS `ARTIFACT_P3`: PROOF_SOFT_QUARANTINE_P3 = PASS
- PASS `ARTIFACT_P4`: PROOF_SOFT_QUARANTINE_P4 = PASS
- PASS `ARTIFACT_DAMAGE`: PROOF_QUARANTINE_DAMAGE_VISIBILITY = PASS
- PASS `ARTIFACT_LIFECYCLE`: PROOF_QUARANTINE_LIFECYCLE_E2E = PASS

```bash
npm run proof:soft-quarantine-program
npm run proof:soft-quarantine-program -- --strict
```
