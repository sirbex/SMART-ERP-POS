# SMART ERP-POS — Microsoft Entra ID (Azure AD) SSO Readiness

**Status:** Design readiness assessment only — **no SSO implementation**.  
**Depends on:** [`SECURITY_BASELINE_INVESTIGATION.md`](./SECURITY_BASELINE_INVESTIGATION.md)  
**Date:** 2026-08-09  

---

## 1. Customer question (mapped)

**Prospect asks:** Does SMART ERP Point of Sale support Single Sign-On with Microsoft Entra ID? If not, what authentication methods exist?

### Honest answers (current product)

| Question | Current answer |
|----------|----------------|
| Entra ID SSO supported? | **No** — no OIDC/SAML/Entra integration in the codebase (investigation found no OAuth/OIDC client libraries or routes for corporate SSO). |
| Preferred corporate IdP + MFA? | **Not available** via Entra Conditional Access today. SMART offers **optional TOTP** for ADMIN/MANAGER. |
| Available authentication methods today | See baseline §2: email/password (tenant DB); TOTP MFA (admin/manager); trusted-device PIN/WebAuthn quick login (online); offline password verifier cache (PWA); platform super-admin password (master DB). |

Evidence: auth stack under `SamplePOS.Server/src/modules/auth/*`, platform under `modules/platform/*`, offline under `samplepos.client/src/lib/offlineLoginCredentials.ts`, JWT issuance in `refreshTokenService.ts`.

---

## 2. Answers to readiness questions (A–M)

### A. Can Entra ID be added without replacing existing authorization?

**Yes.** Authorization is already a first-class **permission-key RBAC** system in each tenant database (`rbac_roles`, `rbac_role_permissions`, `rbac_user_roles`, `requirePermission` middleware). Entra should serve **identity and primary authentication**, not replace SMART permission evaluation.

### B. Can Entra be the identity provider while SMART remains authorization authority?

**Yes — recommended pattern.**

```
Entra proves "who" (and corporate MFA / Conditional Access)
SMART proves "what they may do" (tenant, roles, permissions, policies)
```

Compatible with current `authenticate` → `loadAuthorizationContext` → `requirePermission` pipeline.

### C. Can the system support Entra → OIDC → SMART identity mapping → tenant → branch → role → permissions?

| Layer | Feasibility today |
|-------|-------------------|
| Entra → OIDC | Requires **new** broker/routes/libraries |
| Identity mapping | Needs new durable mapping (e.g. Entra `oid` + `tid` → `users.id`) |
| SMART tenant | Already **host/subdomain + DB-per-tenant** — map Entra org ↔ SMART tenant carefully |
| Branch | **Schema exists** (`scope_type`/`scope_id`) but **APIs do not enforce** — enterprise multi-store Entra group → branch needs product work |
| Role → permissions | Existing RBAC seed/assignment |

### D. Is the current JWT/session architecture compatible?

**Yes, with federation-at-login.**

Preferred design: Entra completes OIDC; SMART issues **existing** HS256 access JWT + opaque refresh pair via `refreshTokenService.generateTokenPair`, still binding `tenantId`/`tenantSlug`, still stored per tenant `refresh_tokens`.

Avoid accepting raw Entra access tokens on every ERP API without SMART-side user context/RBAC, unless building a parallel token introspection path (higher cost, weaker fit with offline POS).

### E. What changes would be required? (scope only)

Non-exhaustive design checklist:

1. App registration(s) in Entra; redirect URIs for SPA and/or BFF.  
2. OIDC authorization-code (+ PKCE) flow; secrets handling if confidential client.  
3. SMART user provisioning/linking rules (`email`/`oid`/`tid`).  
4. Login UX: “Sign in with Microsoft” + optional hybrid local.  
5. Logout: SMART RT revoke + optional Entra logout / SLO policy.  
6. Admin: IdP settings per SMART tenant (issuer, client id, allowed Entra tid).  
7. Token storage strategy decision (current localStorage XSS risk).  
8. Offline POS residual auth strategy (see §H and migration phases).  
9. Platform super-admin remains **non-Entra** or separately federated (break-glass).  
10. Audit events for federated login / link / unlink.

### F. What existing security controls could be accidentally weakened?

| Control | How Entra work could weaken it |
|---------|--------------------------------|
| DB-per-tenant isolation | Wrong multi-tenant app registration; accepting unvalidated `tid`; trusting headers |
| Least privilege | Auto-provisioning with default ADMIN role |
| Offline isolation | Reusing Entra refresh tokens offline or writing Entra tokens into LS without analysis |
| Active-user check | Skipping SMART `is_active` after IdP success |
| MFA | Disabling SMART TOTP before Entra Conditional Access is mandatory |
| Super-admin separation | Allowing platform JWT issuance from tenant Entra apps |

### G. Offline POS if Entra is introduced?

**Current offline** depends on **locally cached password verifiers** after online SMART login — not Entra.

Options once Entra ships (design choices; not implemented):

1. **Hybrid:** Entra only online; continue local offline password cache (must communicate risk).  
2. **Cached SMART session only** offline (no re-auth offline) — time/idle limited.  
3. **Device bound offline vouchers** issued by SMART after Entra login (new).  
4. **No offline interactive login** for strict enterprises (business impact).

### H. What happens when an Entra user is disabled?

**Without redesign:**

- **Online:** next SMART refresh or force re-login should fail if SMART syncs disable or OIDC login fails **and** existing RTs are revoked. Today password-change/disable lifecycle does **not always revoke RTs / offline caches** (baseline weakness) — must fix alongside Entra.  
- **Offline:** local offline password path (if hybrid kept) or residual cached session can still open the SPA until purged.

### I. How would account linking work?

Recommended pattern:

1. Enterprise admin creates SMART user in tenant **or** first-login JIT provision with strict defaults.  
2. Store `external_identity` rows: `{ provider: 'entra', issuer, subject(oid), email, tenant_id(smart), user_id }`.  
3. Require email domain / group claim gates before link.  
4. Unlink requires permission + audit; revoke sessions.

Do **not** rely only on mutable email without `oid`.

### J. How to prevent user from one Microsoft tenant accessing another SMART tenant?

1. SMART pool still selected by **host/subdomain**, not client headers.  
2. Persist allowed `entra_tenant_id` (Azure `tid`) **per SMART tenant config**; reject tokens with wrong `tid`.  
3. Never map solely on email across SMART tenants.  
4. Optionally require `verifyTenantAccess` after federated login.  
5. Multitenant Entra apps need **explicit allowlist**; single-tenant apps reduce blast radius.

### K. Entra groups → SMART roles?

Possible mapping table: Entra group object id → `rbac_roles.id` **within one SMART tenant**.

Rules:

- SMART remains final permission expansion (roles → keys).  
- Group claim overload: prefer app roles or filtered group claims.  
- Do not grant ADMIN via wildcards.  
- Divergent group membership while offline → stale RBAC problem already present offline.

### L. How does MFA remain authoritative under Conditional Access?

- Online interactive login must require Entra session that already satisfied CA (MFA).  
- SMART should treat Entra authentication method as authoritative for that online session rather than re-prompt TOTP **unless** customer requires dual-control.  
- Offline path **cannot** honor Conditional Access — document residual risk.  
- Local TOTP can remain for local-only accounts / break-glass.

### M. What should remain under SMART ERP control?

- Tenant database isolation and connection routing  
- User enable/disable (local gate even if IdP down)  
- RBAC roles, permissions, document policies, plan features  
- Branch/store policies (once enforced)  
- Refresh token issuance/revocation and session inventory  
- Offline credential policy for POS  
- Platform super-admin / tenant lifecycle  
- Accounting integrity and audit of business events  

---

## 3. Entra deployment models (do not assume multi-tenant Entra)

| Model | Description | Fit for SMART business | Risks |
|-------|-------------|------------------------|-------|
| **1. Single Entra tenant / single customer** | One customer’s corporate Entra + one SMART tenant subdomain | **Best for first enterprise pilot** | One customer only |
| **2. Multitenant Entra application** | One SMART app registration accepts many Entra tenants | Fits SaaS scale | Wrong-`tid` bugs; harder compliance; customer may forbid multitenant apps |
| **3. Customer-specific Entra configuration** | Each SMART tenant stores its own client id / issuer / tid | **Best multi-customer SaaS posture** | More ops configuration |
| **4. Hybrid Local + Entra** | OIDC for corporate users; password/PIN/offline for POS floor | **Required by current POS offline architecture** | Dual auth surfaces |

### Recommended model (based on actual SMART architecture & commercial model)

**Primary recommendation: Model 3 (per-SMART-tenant Entra configuration) + Model 4 (hybrid), pilot with Model 1.**

Reasons:

1. SMART already **database-isolates** customers and resolves them by **subdomain** — mapping **one corporate Entra directory ↔ one SMART tenant** is the natural security unit.  
2. Multi-tenant Entra (Model 2) is optional later, only with strict `tid` allowlists and SOC evidence.  
3. Pure Entra-only with no local secrets **breaks** current offline PIN/password design unless product intentionally abandons offline interactive auth.  
4. Platform super-admin should stay **outside** customer Entra (Model independent break-glass).

---

## 4. Compatibility of identity models with offline POS

```
                    ONLINE                         OFFLINE
Corporate user ──► Entra OIDC ──► SMART JWT ──► (session)
Cashier floor  ──► SMART password / PIN ──► JWT ──► offline PBKDF2 cache
Stolen device  ──► RT in LS / offline cache remain until controls
Entra disable  ──► enforced only when online validation runs
```

Enterprise acceptance criteria should state whether offline residual access is **accepted for N hours** or **forbidden** (which requires POS always-online or stronger device control / encryption / MDM).

---

## 5. Threats introduced by naive Entra integration

1. **Account conflation** across SMART tenants by email.  
2. **Over-privileged JIT provisioning**.  
3. **Accepting Entra tokens without SMART user active check**.  
4. **Disabling local TOTP** without enforcing CA on all admin paths (including platform).  
5. **Storing Entra refresh tokens** in localStorage alongside existing XSS exposure.  
6. Assuming disable in Entra instantly stops offline POS.

---

## 6. Minimal technical surface area (future implementation sketch)

| Component | Responsibility |
|-----------|----------------|
| `GET /api/auth/oidc/:tenant/start` | Begin OIDC (PKCE) against configured Entra |
| `GET /api/auth/oidc/:tenant/callback` | Code exchange; map identity; `generateTokenPair` |
| Tenant IdP config table | issuer, client_id, allowed_tid, claim maps |
| Identity link service | oid/tid → user_id |
| Client LoginPage | “Sign in with Microsoft” button |
| Unchanged | `tenantMiddleware`, `requirePermission`, offline journal semantics |

*Sketch only — not implemented.*

---

## 7. Customer-facing interim response (draft)

> SMART ERP-POS does **not currently support** Microsoft Entra ID (Azure AD) Single Sign-On.  
>
> Users authenticate with **SMART ERP local accounts** (email and password) hosted per customer tenant. Administrative and managerial accounts can use **authenticator-app MFA (TOTP)**. POS floors may use **PIN quick-login on registered trusted devices** when online, and the PWA can perform **limited offline re-authentication using previously cached credentials** after a successful online login.  
>
> Authorization is enforced with a **role-and-permission system inside SMART ERP**, not Microsoft groups, today. Multi-tenant customers are isolated using **separate databases per tenant**.  
>
> Entra ID SSO is under architectural readiness review for a future phase where Microsoft remains the identity provider and SMART ERP remains the authorization authority, with hybrid offline POS considerations.

---

## 8. Proof gates before claiming “Entra supported”

1. Lab Entra single-tenant → pilot SMART tenant login end-to-end.  
2. Wrong Entra `tid` rejected.  
3. Disabled Entra user cannot obtain new SMART tokens online.  
4. Existing refresh families revoked on unlink/disable within agreed SLA.  
5. Federated user RBAC unchanged vs local user of same role.  
6. Hybrid offline policy signed; residual risks listed.  
7. No regression of tenant DB isolation suite.  
8. Security baseline high-risk XSS/session items triaged.

---

## 9. SSO readiness verdict

| Dimension | Score | Comment |
|-----------|-------|---------|
| AuthZ compatibility | **High** | RBAC already exists server-side |
| AuthN surface readiness | **Low** | No OIDC today |
| Multi-tenant safety design | **Medium–High** if Model 3 + tid gates | Need config + tests |
| Offline enterprise readiness | **Low–Medium** | Must negotiate residual risk |
| Effort class | **Medium–Large** product initiative | Not a config flag |

**SSO READINESS: Not ready for production enterprise SSO claims; ready for design and phased delivery.**

---

*End of Entra readiness assessment. No implementation performed.*
