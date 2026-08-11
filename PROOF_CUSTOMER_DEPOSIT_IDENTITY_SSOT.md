# PROOF — Customer deposit identity SSOT

**Generated:** 2026-08-11T04:07:01.144Z  
**Verdict:** **PASS** (30/30 gates)

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
| `FORBIDDEN_DEP_customers\.find\s*\(` | PASS | customers\.find\s*\([^)]*\)[\s\S]{0,80}Please select a customer |
| `FORBIDDEN_DEP_customers\.find\s*\(` | PASS | customers\.find\s*\([^)]*\)\s*\?\.name\s*\\\|\\\|\s*['"]Unknown['"] |
| `FORBIDDEN_DEP_useCustomers\s*\(\s*` | PASS | useCustomers\s*\(\s*1\s*,\s*100\s*\)[\s\S]{0,400}customers\.find |
| `USES_CAN_POST` | PASS | save uses canAct/canPost SSOT |
| `USES_RESOLVE_NAME` | PASS | name SSOT helper |
| `NO_FIND_FOR_SAVE` | PASS | no find-for-save |
| `IMPORT_SSOT` | PASS | imports domain SSOT |
| `USE_CUSTOMER` | PASS | master GET by id |
| `PICKER_NOT_BOUND` | PASS | list scoped to browse mode |
| `DETAIL_PASSES_NAME` | PASS | detail passes customerName |
| `MODAL_PASSES_NAME` | PASS | modal passes customerName |
| `FORBIDDEN_CR_customers\.find\s*\(` | PASS | customers\.find\s*\([^)]*\)[\s\S]{0,80}Please select a customer |
| `FORBIDDEN_CR_customers\.find\s*\(` | PASS | customers\.find\s*\([^)]*\)\s*\?\.name\s*\\\|\\\|\s*['"]Unknown['"] |
| `FORBIDDEN_CR_useCustomers\s*\(\s*` | PASS | useCustomers\s*\(\s*1\s*,\s*100\s*\)[\s\S]{0,400}customers\.find |
| `CREDITS_USES_CAN_ACT` | PASS | save uses identity SSOT |
| `CREDITS_NO_FIND_SAVE` | PASS | no customers.find for save |
| `CREDITS_USE_CUSTOMER` | PASS | master GET by id |
| `CREDITS_IMPORT_SSOT` | PASS | imports domain SSOT |
| `CREDITS_PICKER_BROWSE` | PASS | list scoped to browse mode |
| `CREDITS_DETAIL_NAME` | PASS | detail passes customerName to StoreCredits |
| `SSOT_APPLIES_TO_CREDITS` | PASS | domain SSOT appliesTo includes StoreCredits |
| `FIND_BY_ID` | PASS | findCustomerById |
| `CREATE_HAS_IDENTITY_SSOT_DOC` | PASS | SSOT documented on create |
| `GL_USES_MASTER_NAME` | PASS | GL name from master, not Unknown fallback |
