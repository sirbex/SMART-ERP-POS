import { Pool } from 'pg';
import * as reportsRepository from './SamplePOS.Server/src/modules/reports/reportsRepository.js';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const testCashFlow = async () => {
    try {
        console.log('Testing enhanced daily cash flow report...');

        const result = await reportsRepository.getDailyCashFlow(pool, {
            startDate: '2025-11-27',
            endDate: '2025-11-30',
            includeDebCollections: true
        });

        console.log('Cash flow report result:');
        console.log(JSON.stringify(result, null, 2));

        if (result.length === 0) {
            console.log('No data returned - this might be the issue');
        } else {
            console.log(`Retrieved ${result.length} records successfully`);
        }

    } catch (error) {
        console.error('Error testing cash flow:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        await pool.end();
    }
};

testCashFlow();