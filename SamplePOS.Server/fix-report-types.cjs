// Script to safely replace return types in reportsRepository.ts
// Only modifies the ): Promise<...> lines, preserving function signatures
const fs = require('fs');
const file = 'src/modules/reports/reportsRepository.ts';
const lines = fs.readFileSync(file, 'utf8').split('\n');

// Map function names to their new return types
const map = {
    getInventoryValuation: 'InventoryValuationRow[]',
    getSalesReport: 'SalesReportRow[]',
    getExpiringItems: 'ExpiringItemRow[]',
    getLowStockItems: 'LowStockItemRow[]',
    getBestSellingProducts: 'BestSellingProductRow[]',
    getSupplierCostAnalysis: 'SupplierCostAnalysisRow[]',
    getGoodsReceivedReport: 'GoodsReceivedRow[]',
    getPaymentReport: 'PaymentReportRow[]',
    getCustomerPaymentsReport: 'CustomerPaymentsRow[]',
    getProfitLossReport: 'ProfitLossRow[]',
    getDeletedItemsReport: 'DeletedItemRow[]',
    getInventoryAdjustmentsReport: 'InventoryAdjustmentRow[]',
    getPurchaseOrderSummary: 'PurchaseOrderSummaryRow[]',
    getStockMovementAnalysis: 'StockMovementAnalysisRow[]',
    getProfitMarginByProduct: 'ProfitMarginByProductRow[]',
    getDailyCashFlow: 'DailyCashFlowRow[]',
    getSupplierPaymentStatus: 'SupplierPaymentStatusRow[]',
    getTopCustomers: 'TopCustomerRow[]',
    getCustomerAging: 'CustomerAgingRow[]',
    getStockAging: 'StockAgingRow[]',
    getWasteDamageReport: 'WasteDamageRow[]',
    getReorderRecommendations: 'ReorderRecommendationRow[]',
    getSalesByCategory: 'SalesByCategoryRow[]',
    getSalesByPaymentMethod: 'SalesByPaymentMethodRow[]',
    getHourlySalesAnalysis: 'HourlySalesAnalysisRow[]',
    getSalesComparison: 'SalesComparisonRow[]',
    getCustomerPurchaseHistory: 'CustomerPurchaseHistoryRow[]',
    getCustomerAccountStatement: 'CustomerAccountStatementData',
    getBusinessPositionReport: 'BusinessPositionData',
    getCashRegisterSessionSummary: 'CashRegisterSessionSummaryData | null',
    getCashRegisterMovementBreakdown: 'CashRegisterMovementBreakdownData',
    getCashRegisterSessionHistory: 'CashRegisterSessionHistoryData',
};

// Find each function by scanning for `async funcName(` then finding the next ): Promise<Record<string, unknown>...> line
let currentFunc = null;
let count = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line starts a function we care about
    for (const fn of Object.keys(map)) {
        if (line.includes(`async ${fn}(`)) {
            currentFunc = fn;
            break;
        }
    }

    // If we're tracking a function, look for its return type line
    if (currentFunc && (line.includes('): Promise<any') || line.includes('): Promise<Record<string, unknown>'))) {
        const newType = map[currentFunc];
        lines[i] = line
            .replace(/Promise<any\[\]>/, `Promise<${newType}>`)
            .replace(/Promise<any>/, `Promise<${newType}>`)
            .replace(/Promise<any \| null>/, `Promise<${newType}>`)
            .replace(/Promise<Record<string, unknown>(\[\])?>/, `Promise<${newType}>`);
        console.log(`OK line ${i + 1}: ${currentFunc} -> ${newType}`);
        count++;
        delete map[currentFunc]; // Remove so we don't double-match
        currentFunc = null;
    }
}

fs.writeFileSync(file, lines.join('\n'));
console.log(`\nReplaced ${count} return types`);

// Report any missed functions
const missed = Object.keys(map);
if (missed.length > 0) {
    console.log('MISSED:', missed.join(', '));
}
