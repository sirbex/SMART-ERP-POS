// Test endpoint to bypass authentication for debugging
import { Pool } from 'pg';
import * as reportsService from './src/modules/reports/reportsService.js';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

export async function testCashFlow(req, res) {
    try {
        console.log('Testing cash flow report...');

        const report = await reportsService.generateDailyCashFlow(pool, {
            startDate: new Date('2025-11-27'),
            endDate: new Date('2025-11-30'),
            format: 'json',
            userId: '1cb55ec4-7188-45bb-a8fc-75369181cb21'
        });

        console.log('Report generated successfully');
        res.json({ success: true, data: report });

    } catch (error) {
        console.error('Test cash flow error:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}