// Check all ledger entries
const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

(async () => {
    console.log('=== LEDGER TRANSACTIONS ===');
    const lt = await p.query(`
        SELECT "TransactionNumber", "ReferenceType", "ReferenceNumber", "TotalDebitAmount", "TotalCreditAmount"
        FROM ledger_transactions 
        ORDER BY "CreatedAt"
    `);
    console.table(lt.rows);

    console.log('\n=== ALL LEDGER ENTRIES ===');
    const le = await p.query(`
        SELECT 
            lt."ReferenceType",
            lt."ReferenceNumber",
            a."AccountCode",
            a."AccountName",
            le."DebitAmount",
            le."CreditAmount"
        FROM ledger_entries le
        JOIN accounts a ON a."Id" = le."AccountId"
        JOIN ledger_transactions lt ON lt."Id" = le."LedgerTransactionId"
        ORDER BY lt."CreatedAt", le."LineNumber"
    `);
    console.table(le.rows);

    console.log('\n=== ACCOUNT BALANCE SUMMARY FROM LEDGER ===');
    const summary = await p.query(`
        SELECT 
            a."AccountCode",
            a."AccountName",
            SUM(le."DebitAmount") as total_debit,
            SUM(le."CreditAmount") as total_credit,
            SUM(le."DebitAmount") - SUM(le."CreditAmount") as net_balance
        FROM ledger_entries le
        JOIN accounts a ON a."Id" = le."AccountId"
        GROUP BY a."AccountCode", a."AccountName"
        ORDER BY a."AccountCode"
    `);
    console.table(summary.rows);

    await p.end();
})();
