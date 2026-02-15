import { Pool } from 'pg';
import * as reportsRepository from '../modules/reports/reportsRepository.js';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Simple test endpoint without authentication for debugging
export default function testRoutes(app) {
    app.get('/test/cash-flow', async (req, res) => {
        try {
            console.log('Testing cash flow repository method...');

            const result = await reportsRepository.getDailyCashFlow(pool, {
                startDate: '2025-11-27',
                endDate: '2025-11-30',
                includeDebCollections: true
            });

            console.log('Repository result:', result);

            res.json({
                success: true,
                data: result,
                message: `Retrieved ${result.length} records`
            });

        } catch (error) {
            console.error('Test endpoint error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });
}