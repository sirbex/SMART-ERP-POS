# Investigation: “deploy did not reach the server”

**Claim:** Production deploy for `6ff6993e` did not update the server.  
**Finding:** **False.** Server disk, Docker images, and public SPA all match `6ff6993e`.

**Checked:** 2026-08-16 (SSH `root@209.38.203.138` + public HTTPS)

## 1) GitHub Actions deploy log

Run: https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/31913308377  
Conclusion: **success**

On the server during that run:

| Step | Evidence |
|------|----------|
| Stash local WIP | `WIP on main: b7901aea` |
| `git pull` | `b7901aea..6ff6993e` **Fast-forward** from `https://github.com/sirbex/SMART-ERP-POS` |
| Auth files pulled | `AuthContext.tsx`, `sessionColdStartLock.ts`, etc. listed in FF |
| Post-pull HEAD | `Git: 6ff6993e` |
| Build | `smarterp-backend` + `smarterp-frontend` **Built** |
| Restart | containers recreated; nginx reloaded |
| Health | internal + `https://wizarddigital-inv.com/api/health` **OK** |
| Finish | `Deploy finished … app containers rebuilt` |

## 2) Live SSH proof (after the fact)

```
/opt/smarterp HEAD = 6ff6993e438e56da07d042292ee0f1eab9e80ab9
log = fix(foh): stop login false-logout and harden adaptive multi-ticket UX
```

Containers (created at deploy time `2026-08-15T23:07:24Z`):

- `smarterp-frontend` → `/usr/share/nginx/html/assets/index-244GZ-qL.js` **contains** `auth_login_grace_v1`
- `smarterp-nginx` → `upstream frontend { server frontend:3000; }` for `*.wizarddigital-inv.com`

## 3) Public edge matches container

Henber serves the same hashed index as inside `smarterp-frontend`:
`/assets/index-244GZ-qL.js` with login-grace fingerprints.

## What did *not* get replaced (by design)

| Component | Status | Notes |
|-----------|--------|-------|
| `smarterp-nginx` image | Up ~2 months | Config-only; proxies to frontend — **reload only** |
| Postgres / Redis | Up ~2 months | Intentional (`--no-deps`) |
| Server `git stash` pile | Still present | Pre-deploy WIP stashes; **not** applied onto running images |

Stashes do **not** change what Docker is serving until someone rebuilds from a dirty tree. Current running frontend was built from clean `6ff6993e` after the FF pull.

## Conclusion

Deployment **did** reach `/opt/smarterp`, rebuilt app images, and is what public tenants hit via nginx → `smarterp-frontend`.  
Restaurant login bounce is **not** explained by a missed server update; see `PROOF_LOGIN_DEPLOY_INVESTIGATION.md` for remaining client-side races / stale tabs.
