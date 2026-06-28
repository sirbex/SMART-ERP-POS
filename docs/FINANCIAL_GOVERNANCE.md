# Financial Governance (Phase G1)

Builds on the **Financial Integrity Framework** (Phases A–E, F0). Governance adds operational controls accountants need for period close — without introducing a second reconciliation model.

## Scope (G1 — initial release)

| Capability | Status | API |
|------------|--------|-----|
| Configurable materiality thresholds | G1 | `GET/PUT /reconciliation/governance/materiality` |
| Reconciliation history & trends | G1 | `POST/GET /reconciliation/governance/snapshots`, `GET .../trends/:domain` |
| Integrity drift alerts | G1 | `GET /reconciliation/governance/alerts`, `POST .../alerts/:id/acknowledge` |
| Period-close sign-off | G1 | `POST /reconciliation/governance/signoffs`, `POST .../review` |
| Tenant financial health monitoring | G1 | `GET /reconciliation/governance/dashboard` |
| Audit evidence packs | G1 | `GET /reconciliation/governance/evidence/:snapshotId` |

## Relationship to reconciliation framework

```
Financial Integrity Framework (F0)
  ├── Lane 1 integrity  → period-close gate (authoritative)
  ├── Lane 2 cache      → maintenance
  └── Lane 3 audit      → informational

Financial Governance (G1)
  ├── Materiality config → overrides framework defaults per domain
  ├── Snapshots          → point-in-time lane summaries + parity
  ├── Alerts             → drift vs previous snapshot
  ├── Sign-offs          → finance attestation linked to snapshot
  └── Evidence packs     → export for auditors
```

Lane calculations remain in domain providers. Governance **records, configures, and attests** — it does not replace lane SSOT.

## Materiality modes

| Mode | Behavior |
|------|----------|
| `default` | Framework hard-coded rules (AP exact 0.01; AR percent floor cap; Inventory percent floor) |
| `exact` | Fixed tolerance (e.g. 0.01 UGX) |
| `percent_floor` | `max(floor, \|GL\| × rate)` |
| `percent_floor_cap` | Same as above, capped at `cap_amount` |

Migration `020_financial_governance.sql` seeds `default` rows for AP, AR, Inventory.

## Sign-off workflow

1. Capture snapshot (`POST /governance/snapshots`) — blocked if integrity lanes fail.
2. Request sign-off (`POST /governance/signoffs`) — requires `accounting.period_manage`.
3. Approve/reject (`POST /governance/signoffs/:id/review`) — requires `accounting.approve`.
4. Only one **APPROVED** sign-off per period (partial unique index).

Sign-off approval is rejected if the linked snapshot has `periodCloseBlocked = true`.

## Stabilization coexistence

During **Phase F0**, legacy endpoints remain available. Governance snapshots capture framework lane state only. Phase F retirement criteria in [LEGACY_RECONCILIATION_CONSUMER_AUDIT.md](./LEGACY_RECONCILIATION_CONSUMER_AUDIT.md) must be satisfied before removing legacy code.

## Roadmap (G2+)

- Scheduled snapshot jobs (daily post-close)
- Email/webhook alerts for new drift
- UI: Governance tab on Reconciliation page
- Wire `resolveMaterialityThreshold` into lane engines (optional tenant override)
- Cash domain governance when cash lane provider lands

## Related docs

- [FINANCIAL_RECONCILIATION_FRAMEWORK.md](./FINANCIAL_RECONCILIATION_FRAMEWORK.md)
- [FINANCIAL_STABILIZATION_EVIDENCE.md](./FINANCIAL_STABILIZATION_EVIDENCE.md)
- [LEGACY_RECONCILIATION_CONSUMER_AUDIT.md](./LEGACY_RECONCILIATION_CONSUMER_AUDIT.md)
