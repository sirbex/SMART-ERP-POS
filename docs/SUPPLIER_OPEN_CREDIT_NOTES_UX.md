# Supplier open credit notes — industry pattern + SALUD proof

## How SAP / Odoo / Tally show this

| System | Pattern |
|--------|---------|
| **SAP** (FBL1N open items) | Bills and credit memos are **separate open line items**. Net AP = sum of open items (credits reduce liability). Document type is visible on each row. |
| **Odoo** | Bills vs Refunds are distinct. Outstanding credits surface as **open credit** and can be **applied** to bills. Net payable shrinks only after apply/reconcile. Banner: outstanding credits available. |
| **Tally** | Bill-wise outstandings; credit notes appear as pending with opposite nature. Optional **nett balance**; settlement applies CN against bills. |

**Shared rule:** never hide credits inside a single “outstanding” that looks like bill total. Show:
1. Bills due  
2. Open credit notes (available to apply)  
3. **Net payable** = bills − credits  

## Production evidence — SALUD PHARMACY LIMITED (Henber)

Workflows (2026-07-21):

- Investigate: https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/29841149487  
- Proof: https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/29841154568  

| Metric | Amount (UGX) |
|--------|--------------|
| Wrong raw SUM(OutstandingBalance) | 18,708,689 |
| Open credit notes | 556,215 |
| Correct open-item / cache / GL 2100 | **17,596,259** |
| Gap (wrong − correct) | 1,112,430 = **2 × 556,215** |

## Automated proof (client)

```bash
cd samplepos.client && npx vitest run src/utils/supplierOpenItemSummary.test.ts
```

Encodes SALUD numbers: `billsDue − openCredits = 17,596,259` and `2 × CN = gap`.

## Product UX implemented

Supplier → Invoices tab:

- **Bills due** / **Open credit notes** / **Net payable** cards  
- Filter: Bills + credit notes | Bills only | Credit notes only  
- Teal **Credit note** badge on CN rows  
- Link to Credit/Debit Notes when credits are open  
