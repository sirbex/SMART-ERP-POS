/**
 * One-off remediation: reverse the duplicate adjustment TXN-000131.
 *
 * Root cause: The VOID of SALE-2026-0045 (TXN-000125) already re-debited
 * GL 1300 by 195.8M. TXN-000131 was posted as a "corrective adjustment"
 * claiming the original receipt was missing, adding another 195.8M.
 * Net effect: GL 1300 over-stated by exactly 195.8M.
 *
 * This reverses TXN-000131 via the standard immutability-preserving
 * AccountingCore.reverseTransaction path (no DELETE, full audit trail).
 */
import { reverseTransaction } from '../services/accountingCore.js';

const ORIGINAL_TXN_ID = '47408e5d-b869-401a-b4e3-5f4e9232b45f'; // TXN-000131
const ADMIN_USER_ID = '7aa55a55-db98-4a9d-a743-d877c7d8dd21';

async function main() {
    const today = new Date().toISOString().slice(0, 10);
    const result = await reverseTransaction({
        originalTransactionId: ORIGINAL_TXN_ID,
        reversalDate: today,
        reason:
            'DUPLICATE: The VOID of SALE-2026-0045 (TXN-000125) already re-added 195.8M to inventory GL 1300. TXN-000131 posted the same amount again under the mistaken belief the original receipt was never GL-posted. Reversing to remove the duplicate and restore GL 1300 <-> cost_layers reconciliation.',
        userId: ADMIN_USER_ID,
        idempotencyKey: `reverse-duplicate-txn131-${today}`,
    });

    console.log('✅ Reversal posted');
    console.log('   transactionNumber:', result.transactionNumber);
    console.log('   transactionId    :', result.transactionId);
    console.log('   totalDebits      :', result.totalDebits);
    console.log('   totalCredits     :', result.totalCredits);
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Reversal failed:', err);
    process.exit(1);
});
