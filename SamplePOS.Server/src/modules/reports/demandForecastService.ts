// Demand Forecast Service — Self-Learning Reorder Engine
// Orchestrates daily + monthly learning jobs and provides
// forecast-enhanced data to the reorder recommendation engine.

import type { Pool } from 'pg';
import { demandForecastRepository, type ProductDemandStats } from './demandForecastRepository.js';
import logger from '../../utils/logger.js';

export const demandForecastService = {

    // ────────────────────────────────────────────────────────
    // DAILY JOB: Refresh rolling demand statistics
    // Runs: every night (via Bull cron)
    // Updates: product_demand_stats for all active products
    // ────────────────────────────────────────────────────────
    async runDailyUpdate(pool: Pool): Promise<{ productsUpdated: number; executionTimeMs: number }> {
        const start = Date.now();
        logger.info('[DemandForecast] Starting daily demand stats refresh');

        const productsUpdated = await demandForecastRepository.refreshDemandStats(pool);
        const executionTimeMs = Date.now() - start;

        await demandForecastRepository.logRun(pool, 'DAILY', productsUpdated, executionTimeMs, {
            trigger: 'scheduled',
        });

        logger.info('[DemandForecast] Daily refresh complete', { productsUpdated, executionTimeMs });
        return { productsUpdated, executionTimeMs };
    },

    // ────────────────────────────────────────────────────────
    // MONTHLY JOB: Refresh seasonality indexes
    // Runs: first day of each month (via Bull cron)
    // Updates: product_seasonality for all 12 months × all products
    // ────────────────────────────────────────────────────────
    async runMonthlyUpdate(pool: Pool): Promise<{ productsUpdated: number; executionTimeMs: number }> {
        const start = Date.now();
        logger.info('[DemandForecast] Starting monthly seasonality refresh');

        const rowsUpdated = await demandForecastRepository.refreshSeasonality(pool);
        const executionTimeMs = Date.now() - start;

        await demandForecastRepository.logRun(pool, 'MONTHLY', rowsUpdated, executionTimeMs, {
            trigger: 'scheduled',
        });

        logger.info('[DemandForecast] Monthly seasonality refresh complete', { rowsUpdated, executionTimeMs });
        return { productsUpdated: rowsUpdated, executionTimeMs };
    },

    // ────────────────────────────────────────────────────────
    // QUERY: Get learned stats map (consumed by reorder engine)
    // Returns a Map<productId, stats> for quick lookup
    // ────────────────────────────────────────────────────────
    async getLearnedStats(pool: Pool): Promise<Map<string, ProductDemandStats>> {
        return demandForecastRepository.getAllStats(pool);
    },

    // ────────────────────────────────────────────────────────
    // QUERY: Get seasonal index for current month
    // Returns Map<productId, seasonalIndex>
    // A seasonalIndex > 1 means demand is typically higher this month
    // ────────────────────────────────────────────────────────
    async getCurrentSeasonalIndexes(pool: Pool): Promise<Map<string, number>> {
        const currentMonth = new Date().getMonth() + 1; // 1-12
        return demandForecastRepository.getSeasonalityForMonth(pool, currentMonth);
    },

    // ────────────────────────────────────────────────────────
    // ADMIN: Get recent learning run history
    // ────────────────────────────────────────────────────────
    async getRunHistory(pool: Pool, limit?: number) {
        return demandForecastRepository.getRecentRuns(pool, limit);
    },
};
