// Quick test for Daily Cash Flow Report
const fetch = require('node-fetch');

const testDailyCashFlow = async () => {
    try {
        const response = await fetch('http://localhost:3001/api/reports/daily-cash-flow?start_date=2025-11-27&end_date=2025-11-30&format=json', {
            headers: {
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluLWlkLTEyMzQiLCJlbWFpbCI6ImFkbWluQHNhbXBsZXBvcy5jb20iLCJuYW1lIjoiQWRtaW4gVXNlciIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTczMzAwOTU1NywiZXhwIjoxNzMzMDk1OTU3fQ.xLOVPnzYOCNiL36SvOpCPHPcmKBkwPO8XAOJPKLb9co'
            }
        });

        console.log('Status:', response.status);
        const result = await response.text();
        console.log('Response:', result);
    } catch (error) {
        console.error('Error:', error.message);
    }
};

testDailyCashFlow();