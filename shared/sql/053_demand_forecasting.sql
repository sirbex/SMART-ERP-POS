-- ============================================================
-- DEMAND FORECASTING - Self-Learning Reorder Engine
-- Migration: 053_demand_forecasting.sql
-- Created: March 2026
-- Purpose: Rolling demand statistics + monthly seasonality
-- ============================================================

-- Product Demand Stats: rolling averages updated daily by scheduled job
CREATE TABLE IF NOT EXISTS product_demand_stats (
    product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    
    -- Rolling averages (units/day)
    avg_daily_7d   NUMERIC(12,4) NOT NULL DEFAULT 0,
    avg_daily_30d  NUMERIC(12,4) NOT NULL DEFAULT 0,
    avg_daily_90d  NUMERIC(12,4) NOT NULL DEFAULT 0,
    
    -- Demand variability
    std_dev_daily  NUMERIC(12,4) NOT NULL DEFAULT 0,
    
    -- Trend indicator derived from rolling averages
    demand_trend   VARCHAR(12) NOT NULL DEFAULT 'STABLE'
        CHECK (demand_trend IN ('INCREASING', 'DECREASING', 'STABLE')),
    trend_strength NUMERIC(6,2) NOT NULL DEFAULT 0,  -- ratio of 7d/30d
    
    -- Adaptive safety stock & reorder point (auto-calculated)
    computed_safety_stock  INTEGER NOT NULL DEFAULT 0,
    computed_reorder_point INTEGER NOT NULL DEFAULT 0,
    
    -- Forecast (next 30 days estimated demand)
    forecast_30d   NUMERIC(12,2) NOT NULL DEFAULT 0,
    
    -- Bookkeeping
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    learning_cycles INTEGER NOT NULL DEFAULT 0  -- how many times stats have been refreshed
);

CREATE INDEX IF NOT EXISTS idx_demand_stats_trend ON product_demand_stats(demand_trend);

-- Product Seasonality: monthly demand patterns learned over time
CREATE TABLE IF NOT EXISTS product_seasonality (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    avg_daily_sales NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_units     NUMERIC(14,2) NOT NULL DEFAULT 0,
    sample_years    INTEGER NOT NULL DEFAULT 0,  -- how many years of data contributed
    seasonal_index  NUMERIC(6,4) NOT NULL DEFAULT 1.0000, -- ratio vs annual average
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (product_id, month)
);

-- Demand forecast log: tracks each learning run
CREATE TABLE IF NOT EXISTS demand_forecast_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type     VARCHAR(20) NOT NULL CHECK (run_type IN ('DAILY', 'MONTHLY')),
    products_updated INTEGER NOT NULL DEFAULT 0,
    execution_time_ms INTEGER NOT NULL DEFAULT 0,
    details      JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_runs_type ON demand_forecast_runs(run_type, created_at DESC);
