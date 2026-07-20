# Quotation "duplicate" false positive (Henber)

## User complaint
Creating a quotation fails with *Duplicate quotation detected…* even though
the user sees no open duplicate on Henber.

## Root cause
BR-QUOTE-012 content-hash guard treated **EXPIRED** and **REJECTED** quotes
as blockers (unique index + service check only excluded `CONVERTED` /
`CANCELLED`).

Users only browse open quotes → they correctly say “there is no duplicate.”
An expired/rejected quote with the same customer + product/qty/price still
held the hash.

Secondary false positives:
- Hash ignored UOM, discount, tax → Box vs Each looked identical
- Walk-in / same display name without phone collapsed to one key

## Fix (schema 555)
1. Unique index + service check exclude `EXPIRED` and `REJECTED`
2. Hash includes discount, tax rate, UOM, and phone when no customerId
3. Error message names the blocking quote number, status, customer, date

## Files
- `shared/sql/555_quotation_content_hash_terminal_statuses.sql`
- `SamplePOS.Server/src/modules/quotations/quotationContentHash.ts`
- `SamplePOS.Server/src/modules/quotations/quotationService.ts`
