#!/usr/bin/env node

/**
 * Test Enhanced Reports System
 * Tests both Enhanced Daily Cash Flow and Business Position Reports
 */

const API_BASE = 'http://localhost:3001/api';

// Test credentials
const loginCredentials = {
    email: 'admin@samplepos.com',
    password: 'admin123'
};

let authToken = '';

// Utility functions
function log(message, data = null) {
    console.log(`[${new Date().toISOString()}] ${message}`);
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
}

async function makeRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return response.json();
}

// Authentication
async function authenticate() {
    try {
        log('🔐 Authenticating...');
        const response = await makeRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(loginCredentials)
        });

        if (response.success && response.data.token) {
            authToken = response.data.token;
            log('✅ Authentication successful');
            return true;
        }

        log('❌ Authentication failed', response);
        return false;
    } catch (error) {
        log('❌ Authentication error', error.message);
        return false;
    }
}

// Test Enhanced Daily Cash Flow Report
async function testEnhancedDailyCashFlow() {
    try {
        log('📊 Testing Enhanced Daily Cash Flow Report...');

        const today = new Date().toISOString().split('T')[0];
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const params = new URLSearchParams({
            start_date: sevenDaysAgo,
            end_date: today,
            format: 'json'
        });

        const response = await makeRequest(`/reports/daily-cash-flow?${params}`);

        if (response.success) {
            log('✅ Enhanced Daily Cash Flow Report generated successfully');
            log('📈 Report Summary:', {
                reportType: response.data.reportType,
                recordCount: response.data.recordCount,
                executionTime: `${response.data.executionTimeMs}ms`,
                totalDays: response.data.summary.totalDays,
                salesRevenue: response.data.summary.salesRevenue,
                debtCollections: response.data.summary.debtCollections,
                totalCashIn: response.data.summary.totalCashIn,
                revenueComposition: response.data.summary.revenueComposition
            });

            // Show sample data points
            if (response.data.data.length > 0) {
                log('📊 Sample Data Points:');
                response.data.data.slice(0, 3).forEach((item, index) => {
                    log(`  ${index + 1}. ${item.transactionDate} - ${item.revenueType}: ${item.cashAmount} (${item.transactionCount} transactions)`);
                });
            }

            return true;
        } else {
            log('❌ Enhanced Daily Cash Flow Report failed', response);
            return false;
        }
    } catch (error) {
        log('❌ Enhanced Daily Cash Flow Report error', error.message);
        return false;
    }
}

// Test Business Position Report
async function testBusinessPositionReport() {
    try {
        log('🏢 Testing Business Position Report...');

        const today = new Date().toISOString().split('T')[0];

        const params = new URLSearchParams({
            report_date: today,
            include_comparisons: 'true',
            include_forecasts: 'true',
            format: 'json'
        });

        const response = await makeRequest(`/reports/business-position?${params}`);

        if (response.success) {
            log('✅ Business Position Report generated successfully');
            log('🎯 Business Health Score:', `${response.data.data.businessHealthScore}/100`);

            log('📊 Key Performance Metrics:', {
                totalRevenue: response.data.data.salesPerformance.totalRevenue,
                grossProfit: response.data.data.salesPerformance.grossProfit,
                totalCashIn: response.data.data.cashPosition.totalCashIn,
                profitMargin: `${response.data.data.cashPosition.profitMarginPercent}%`,
                businessHealthScore: response.data.data.businessHealthScore
            });

            log('⚠️ Risk Assessment:', response.data.data.riskAssessment);

            // Show recommendations
            if (response.data.data.enhancedAnalysis.recommendations.length > 0) {
                log('💡 Business Recommendations:');
                response.data.data.enhancedAnalysis.recommendations.forEach((rec, index) => {
                    log(`  ${index + 1}. [${rec.priority}] ${rec.category}: ${rec.message}`);
                });
            }

            // Show advanced metrics
            log('🔍 Advanced Metrics:', {
                liquidityMetrics: response.data.data.enhancedAnalysis.liquidityMetrics,
                efficiencyMetrics: response.data.data.enhancedAnalysis.efficiencyMetrics,
                customerInsights: response.data.data.enhancedAnalysis.customerInsights
            });

            log('⏱️ Performance:', {
                executionTime: `${response.data.executionTimeMs}ms`,
                generatedAt: response.data.generatedAt
            });

            return true;
        } else {
            log('❌ Business Position Report failed', response);
            return false;
        }
    } catch (error) {
        log('❌ Business Position Report error', error.message);
        return false;
    }
}

// Test PDF export for Business Position Report
async function testBusinessPositionPDF() {
    try {
        log('📄 Testing Business Position PDF Export...');

        const today = new Date().toISOString().split('T')[0];

        const params = new URLSearchParams({
            report_date: today,
            format: 'pdf'
        });

        const url = `${API_BASE}/reports/business-position?${params}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok && response.headers.get('content-type')?.includes('application/pdf')) {
            const buffer = await response.arrayBuffer();
            log(`✅ Business Position PDF generated successfully (${buffer.byteLength} bytes)`);
            return true;
        } else {
            log('❌ Business Position PDF generation failed');
            return false;
        }
    } catch (error) {
        log('❌ Business Position PDF error', error.message);
        return false;
    }
}

// Main test execution
async function runTests() {
    console.log('🚀 Enhanced Reports System Test Suite');
    console.log('=====================================\n');

    const results = {
        authentication: false,
        enhancedCashFlow: false,
        businessPosition: false,
        businessPositionPDF: false
    };

    // Authenticate
    results.authentication = await authenticate();
    if (!results.authentication) {
        log('❌ Cannot proceed without authentication');
        process.exit(1);
    }

    console.log('\n');

    // Test Enhanced Daily Cash Flow
    results.enhancedCashFlow = await testEnhancedDailyCashFlow();
    console.log('\n');

    // Test Business Position Report
    results.businessPosition = await testBusinessPositionReport();
    console.log('\n');

    // Test Business Position PDF
    results.businessPositionPDF = await testBusinessPositionPDF();
    console.log('\n');

    // Summary
    console.log('📋 Test Results Summary:');
    console.log('========================');
    Object.entries(results).forEach(([test, passed]) => {
        console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
    });

    const passedCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;

    console.log(`\n🎯 Overall: ${passedCount}/${totalCount} tests passed`);

    if (passedCount === totalCount) {
        console.log('🎉 All enhanced reports are working correctly with bank-grade precision!');
        process.exit(0);
    } else {
        console.log('⚠️ Some tests failed. Please check the implementation.');
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
    log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the tests
runTests().catch(error => {
    log('❌ Test suite failed', error.message);
    process.exit(1);
});