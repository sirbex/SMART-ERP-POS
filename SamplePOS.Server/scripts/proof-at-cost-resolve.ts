/**
 * CLI helper for proof-at-cost-issue-price.mjs — prints JSON from resolveAtCostPerBaseUnit.
 */
import { pool } from '../src/db/pool.js';
import {
    resolveAtCostPerBaseUnit,
    type ProductValuationForAtCost,
} from '../src/modules/pricing/atCostIssuePrice.js';

try {
    const productId = process.argv[2];
    const baseQty = Number(process.argv[3]);
    const valuation = JSON.parse(
        process.env.VALUATION_JSON || process.argv[4] || '{}',
    ) as ProductValuationForAtCost;

    if (!productId || !Number.isFinite(baseQty)) {
        console.error('Usage: tsx scripts/proof-at-cost-resolve.ts <productId> <baseQty> <valuationJson>');
        process.exit(1);
    }

    const result = await resolveAtCostPerBaseUnit(pool, productId, baseQty, valuation);
    console.log(JSON.stringify(result));
    await pool.end();
} catch (err) {
    console.error('ERROR:', err instanceof Error ? err.stack ?? err.message : err);
    try {
        await pool.end();
    } catch {
        /* ignore */
    }
    process.exit(1);
}
