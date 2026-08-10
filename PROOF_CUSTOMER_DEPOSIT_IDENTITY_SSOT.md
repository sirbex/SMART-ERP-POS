# PROOF — Customer deposit identity SSOT

**Generated:** 2026-08-10T21:22:05.489Z  
**Verdict:** **PASS** (20/20 gates)

## Mandatory rules

1. Write identity = `customers.id` via `findCustomerById` (server).  
2. UI name = bound prop → `GET /customers/:id` → balance join — **never** list page slice.  
3. Paginated customer list is **browse/picker only** — never save gate.  

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `CAN_POST_ID` | PASS | uuid posts |
| `CAN_POST_EMPTY` | PASS | empty blocked |
| `NAME_ORDER` | PASS | bound wins |
| `NAME_NO_LIST` | PASS | master next |
| `NAME_SKIP_UNKNOWN` | PASS | drops Unknown literal |
| `SSOT_LIST_ROLE` | PASS | list is browse only |
| `FORBIDDEN_customers\.find\s*\([^)]` | PASS | customers\.find\s*\([^)]*\)[\s\S]{0,80}Please select a customer |
| `FORBIDDEN_customers\.find\s*\([^)]` | PASS | customers\.find\s*\([^)]*\)\s*\?\.name\s*\\\|\\\|\s*['"]Unknown['"] |
| `FORBIDDEN_useCustomers\s*\(\s*1\s*` | PASS | useCustomers\s*\(\s*1\s*,\s*100\s*\)[\s\S]{0,400}customers\.find |
| `USES_CAN_POST` | PASS | save uses canPost SSOT |
| `USES_RESOLVE_NAME` | PASS | name SSOT helper |
| `NO_FIND_FOR_SAVE` | PASS | no find-for-save |
| `IMPORT_SSOT` | PASS | imports domain SSOT |
| `USE_CUSTOMER` | PASS | master GET by id |
| `PICKER_NOT_BOUND` | PASS | list scoped to browse mode |
| `DETAIL_PASSES_NAME` | PASS | detail passes customerName |
| `MODAL_PASSES_NAME` | PASS | modal passes customerName |
| `FIND_BY_ID` | PASS | findCustomerById |
| `CREATE_HAS_IDENTITY_SSOT_DOC` | PASS | SSOT documented on create |
| `GL_USES_MASTER_NAME` | PASS | GL name from master, not Unknown fallback |
