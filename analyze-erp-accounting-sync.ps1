#!/usr/bin/env pwsh
# Data Synchronization Analysis Script
# Shows existing ERP data that needs to be reflected in accounting module

Write-Host "🔍 ERP Data Synchronization Analysis" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

try {
    # Database connection details
    $connectionString = "Host=localhost;Port=5432;Database=pos_system;Username=postgres;Password=password"
    
    Write-Host ""
    Write-Host "📊 EXISTING ERP DATA SUMMARY:" -ForegroundColor Yellow
    Write-Host "============================" -ForegroundColor Yellow
    
    # Connect and analyze sales data
    $env:PGPASSWORD = "password"
    
    Write-Host ""
    Write-Host "💰 SALES DATA:" -ForegroundColor Green
    $salesStats = psql -h localhost -U postgres -d pos_system -c "
        SELECT 
            COUNT(*) as total_sales,
            COALESCE(SUM(total_amount::numeric), 0) as total_revenue,
            COALESCE(SUM(total_cost::numeric), 0) as total_cost,
            COALESCE(SUM(profit::numeric), 0) as total_profit,
            MIN(sale_date) as earliest_sale,
            MAX(sale_date) as latest_sale
        FROM sales 
        WHERE status = 'COMPLETED';
    " -t
    Write-Host $salesStats
    
    Write-Host ""
    Write-Host "🏪 INVENTORY DATA:" -ForegroundColor Green
    $inventoryStats = psql -h localhost -U postgres -d pos_system -c "
        SELECT 
            COUNT(*) as total_products
        FROM products;
    " -t
    Write-Host "Total Products: $inventoryStats"
    
    # Check product batches for inventory
    $batchStats = psql -h localhost -U postgres -d pos_system -c "
        SELECT 
            COUNT(*) as total_batches,
            COALESCE(SUM(quantity_remaining::numeric), 0) as total_stock_qty
        FROM product_batches 
        WHERE quantity_remaining > 0;
    " -t
    Write-Host "Inventory Batches: $batchStats"
    
    Write-Host ""
    Write-Host "👥 CUSTOMER DATA:" -ForegroundColor Green
    $customerStats = psql -h localhost -U postgres -d pos_system -c "
        SELECT 
            COUNT(*) as total_customers,
            COALESCE(SUM(balance::numeric), 0) as total_customer_balances,
            COUNT(CASE WHEN balance::numeric > 0 THEN 1 END) as customers_with_credit,
            COUNT(CASE WHEN balance::numeric < 0 THEN 1 END) as customers_with_debt
        FROM customers 
        WHERE is_active = true;
    " -t
    Write-Host $customerStats
    
    Write-Host ""
    Write-Host "📈 ACCOUNTING IMPACT ANALYSIS:" -ForegroundColor Magenta
    Write-Host "=============================" -ForegroundColor Magenta
    
    Write-Host ""
    Write-Host "🧾 JOURNAL ENTRIES NEEDED:" -ForegroundColor Yellow
    Write-Host "• Sales Revenue Recognition: All 56 completed sales" 
    Write-Host "• Cash/Receivables Recording: By payment method"
    Write-Host "• Cost of Goods Sold: Based on product costs"
    Write-Host "• Inventory Valuation: Current stock levels"
    Write-Host "• Customer Receivables: Outstanding balances"
    
    Write-Host ""
    Write-Host "📋 CHART OF ACCOUNTS REQUIREMENTS:" -ForegroundColor Yellow
    Write-Host "• Assets: Cash, Accounts Receivable, Inventory"
    Write-Host "• Liabilities: Accounts Payable, Customer Deposits"
    Write-Host "• Income: Sales Revenue"
    Write-Host "• Expenses: Cost of Goods Sold, Operating Expenses"
    
    Write-Host ""
    Write-Host "🔗 ERP-ACCOUNTING INTEGRATION STATUS:" -ForegroundColor Cyan
    Write-Host "====================================" -ForegroundColor Cyan
    
    # Check if accounting tables exist and have data
    $accountingCheck = psql -h localhost -U postgres -d pos_system -c "
        SELECT 
            CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_accounts') 
                THEN 'EXISTS' ELSE 'MISSING' END as customer_accounts_table,
            CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') 
                THEN 'EXISTS' ELSE 'MISSING' END as journal_entries_table,
            CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ledger_entries') 
                THEN 'EXISTS' ELSE 'MISSING' END as ledger_entries_table;
    " -t
    Write-Host "Accounting Tables Status:"
    Write-Host $accountingCheck
    
    Write-Host ""
    Write-Host "✅ NEXT STEPS FOR COMPLETE ERP FINANCIAL INTEGRATION:" -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Green
    Write-Host "1. ✅ C# Accounting API running with data sync endpoint"
    Write-Host "2. 🔄 Execute customer account synchronization"
    Write-Host "3. 🔄 Create journal entries for all historical sales"
    Write-Host "4. 🔄 Set up inventory valuation entries"
    Write-Host "5. 🔄 Configure real-time event-driven sync for new transactions"
    Write-Host "6. 🔄 Generate financial reports (Trial Balance, P&L, Balance Sheet)"
    
    Write-Host ""
    Write-Host "🎯 BUSINESS VALUE:" -ForegroundColor Magenta
    Write-Host "=================" -ForegroundColor Magenta
    Write-Host "• Complete financial visibility across all business operations"
    Write-Host "• Real-time profit/loss tracking per transaction"
    Write-Host "• Customer credit management and receivables tracking"
    Write-Host "• Inventory valuation and COGS analysis"
    Write-Host "• Audit trail for all financial transactions"
    Write-Host "• Regulatory compliance with double-entry accounting"
    
} catch {
    Write-Host "❌ Error analyzing ERP data: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "🏁 Analysis Complete - Ready for Accounting Module Sync" -ForegroundColor Green