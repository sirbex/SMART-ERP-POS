# Phase 2.5 — Deploy Step 1 Complete

**Date:** 2026-07-05  
**Commit:** `c6c1d74` — AR posting integrity Phase 2 + warn-mode rollout  
**Follow-up:** `pending` — docker-compose `AR_GOVERNANCE_MODE` passthrough  

---

## CI (push c6c1d74)

| Workflow | Run | Result |
|----------|-----|--------|
| Accounting Integrity Tests | [28746245998](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/28746245998) | ✅ success |
| CI/CD Pipeline | [28746245945](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/28746245945) | ✅ success |
| Deploy to Production | [28746245959](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/28746245959) | ✅ success (~14m) |

---

## Production state after deploy

- Phase 2 code live on Henber (`c6c1d74`)
- **Warn mode:** requires second deploy with `docker-compose.deploy.yml` env passthrough OR manual `AR_GOVERNANCE_MODE=warn` on backend container
- Default after follow-up commit: `AR_GOVERNANCE_MODE=warn` (compose default)

---

## Observation window

| Milestone | Target | Status |
|-----------|--------|--------|
| Code deployed | 2026-07-05 | ✅ |
| Warn mode active | After follow-up deploy | ⏳ |
| Day 7 review | 2026-07-12 | |
| Day 14 complete | 2026-07-19 | |
| Report filed | | |

---

## Ops commands

```bash
# After warn mode active — weekly
npm run summarize:ar-governance-warns -- /path/to/combined.log

# Verify startup log on server
docker logs smarterp-backend 2>&1 | rg "AR governance mode"
```

---

## Next

1. Push follow-up deploy commit (docker-compose env)
2. Confirm log: `AR governance mode active { arGovernanceMode: 'warn' }`
3. Begin 14-day observation — fill [WARN_OBSERVATION_REPORT.md](./WARN_OBSERVATION_REPORT.md)
