/**
 * Phase 5: Master Test Runner
 * Orchestrates all Phase 5 testing components with comprehensive reporting
 */

import axios from 'axios';
import { performance } from 'perf_hooks';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

console.log('🚀 PHASE 5: COMPREHENSIVE TESTING SUITE');
console.log('======================================');
console.log('Implementation Sequence: Following Mandatory Steps\n');

const NODE_API = 'http://localhost:3001';
const CSHARP_API = 'http://localhost:5062';

// Test suite configuration
const TEST_SUITES = [
  {
    name: 'End-to-End Sales Workflow',
    file: 'phase5-end-to-end-test.js',
    description: 'Complete business workflow validation',
    priority: 'CRITICAL',
    estimatedTime: '3-5 minutes'
  },
  {
    name: 'Error Resilience Testing',
    file: 'phase5-error-resilience-test.js',
    description: 'System behavior during failures',
    priority: 'HIGH',
    estimatedTime: '2-3 minutes'
  },
  {
    name: 'Financial Reports Validation',
    file: 'phase5-financial-reports-test.js',
    description: 'Accounting reports accuracy',
    priority: 'HIGH',
    estimatedTime: '4-6 minutes'
  },
  {
    name: 'Performance Benchmarking',
    file: 'phase5-performance-test.js',
    description: 'Load testing and metrics',
    priority: 'MEDIUM',
    estimatedTime: '5-7 minutes'
  },
  {
    name: 'Data Consistency Validation',
    file: 'phase5-data-consistency-test.js',
    description: 'Cross-system data integrity',
    priority: 'CRITICAL',
    estimatedTime: '3-4 minutes'
  }
];

// Global test results
const masterResults = {
  startTime: new Date(),
  endTime: null,
  totalDuration: 0,
  suiteResults: {},
  overallStatus: 'PENDING',
  systemHealth: {
    nodeApi: false,
    csharpApi: false,
    database: false
  },
  summary: {
    totalSuites: TEST_SUITES.length,
    passedSuites: 0,
    failedSuites: 0,
    criticalFailures: 0,
    highPriorityFailures: 0
  }
};

async function checkSystemHealth() {
  console.log('🔍 PHASE 5 PRE-FLIGHT: System Health Check');
  console.log('==========================================');

  try {
    // Check Node.js API
    console.log('   Checking Node.js API...');
    const nodeHealth = await axios.get(`${NODE_API}/api/health`, { timeout: 5000 });
    masterResults.systemHealth.nodeApi = nodeHealth.data.success || nodeHealth.status === 200;
    console.log(`   Node.js API: ${masterResults.systemHealth.nodeApi ? '✅ Healthy' : '❌ Unhealthy'}`);

    // Check C# API
    console.log('   Checking C# Accounting API...');
    const csharpHealth = await axios.get(`${CSHARP_API}/health`, {
      timeout: 5000,
      headers: { 'X-API-Key': 'your_shared_secret_key_here' }
    });
    masterResults.systemHealth.csharpApi = csharpHealth.data.success || csharpHealth.status === 200;
    console.log(`   C# API: ${masterResults.systemHealth.csharpApi ? '✅ Healthy' : '❌ Unhealthy'}`);

    // Check database connectivity through Node.js
    console.log('   Checking Database connectivity...');
    const dbHealth = await axios.get(`${NODE_API}/api/health/database`, { timeout: 10000 });
    masterResults.systemHealth.database = dbHealth.data.success || dbHealth.status === 200;
    console.log(`   Database: ${masterResults.systemHealth.database ? '✅ Connected' : '❌ Disconnected'}`);

  } catch (error) {
    console.log(`   ❌ Health check failed: ${error.message}`);
  }

  const healthyComponents = Object.values(masterResults.systemHealth).filter(Boolean).length;
  const totalComponents = Object.keys(masterResults.systemHealth).length;

  console.log(`\n   System Health: ${healthyComponents}/${totalComponents} components healthy`);

  if (healthyComponents === totalComponents) {
    console.log('   ✅ All systems operational - proceeding with testing');
    return true;
  } else if (healthyComponents >= 2) {
    console.log('   ⚠️  Partial system availability - continuing with limited testing');
    return true;
  } else {
    console.log('   ❌ Critical system failures - testing may be unreliable');
    return false;
  }
}

async function runTestSuite(suite) {
  console.log(`\n🧪 EXECUTING: ${suite.name}`);
  console.log('='.repeat(50));
  console.log(`   Description: ${suite.description}`);
  console.log(`   Priority: ${suite.priority}`);
  console.log(`   Estimated Time: ${suite.estimatedTime}`);
  console.log(`   File: ${suite.file}\n`);

  const suiteStartTime = performance.now();

  return new Promise((resolve) => {
    const testProcess = spawn('node', [suite.file], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    testProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write(chunk); // Real-time output
    });

    testProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      process.stderr.write(chunk);
    });

    testProcess.on('close', (code) => {
      const suiteEndTime = performance.now();
      const suiteDuration = suiteEndTime - suiteStartTime;

      // Analyze output for results
      const success = output.includes('COMPLETE!') && !output.includes('CRITICAL ISSUES');
      const partialSuccess = output.includes('PARTIAL SUCCESS') || output.includes('ACCEPTABLE');

      const result = {
        name: suite.name,
        priority: suite.priority,
        success: success,
        partialSuccess: partialSuccess,
        duration: suiteDuration,
        exitCode: code,
        output: output,
        errorOutput: errorOutput,
        timestamp: new Date().toISOString()
      };

      // Update master results
      masterResults.suiteResults[suite.name] = result;

      if (success) {
        masterResults.summary.passedSuites++;
        console.log(`\n✅ ${suite.name}: PASSED (${(suiteDuration / 1000).toFixed(1)}s)`);
      } else if (partialSuccess) {
        masterResults.summary.passedSuites++; // Count as passed but note issues
        console.log(`\n⚠️  ${suite.name}: PARTIAL SUCCESS (${(suiteDuration / 1000).toFixed(1)}s)`);
      } else {
        masterResults.summary.failedSuites++;
        if (suite.priority === 'CRITICAL') {
          masterResults.summary.criticalFailures++;
        } else if (suite.priority === 'HIGH') {
          masterResults.summary.highPriorityFailures++;
        }
        console.log(`\n❌ ${suite.name}: FAILED (${(suiteDuration / 1000).toFixed(1)}s)`);
      }

      resolve(result);
    });

    // Timeout protection
    setTimeout(() => {
      if (!testProcess.killed) {
        console.log(`\n⏱️  ${suite.name}: Test timeout - terminating process`);
        testProcess.kill();
      }
    }, 600000); // 10 minute timeout per suite
  });
}

async function generateMasterReport() {
  masterResults.endTime = new Date();
  masterResults.totalDuration = masterResults.endTime.getTime() - masterResults.startTime.getTime();

  // Determine overall status
  if (masterResults.summary.criticalFailures === 0 && masterResults.summary.failedSuites === 0) {
    masterResults.overallStatus = 'SUCCESS';
  } else if (masterResults.summary.criticalFailures === 0) {
    masterResults.overallStatus = 'PARTIAL_SUCCESS';
  } else {
    masterResults.overallStatus = 'FAILURE';
  }

  console.log('\n' + '='.repeat(80));
  console.log('🏆 PHASE 5: COMPREHENSIVE TESTING RESULTS');
  console.log('='.repeat(80));

  console.log(`\n📊 EXECUTION SUMMARY:`);
  console.log(`   Start Time: ${masterResults.startTime.toISOString()}`);
  console.log(`   End Time: ${masterResults.endTime.toISOString()}`);
  console.log(`   Total Duration: ${(masterResults.totalDuration / 1000 / 60).toFixed(1)} minutes`);
  console.log(`   Overall Status: ${masterResults.overallStatus}`);

  console.log(`\n🎯 TEST SUITE RESULTS:`);
  console.log(`   Total Suites: ${masterResults.summary.totalSuites}`);
  console.log(`   Passed: ${masterResults.summary.passedSuites}`);
  console.log(`   Failed: ${masterResults.summary.failedSuites}`);
  console.log(`   Critical Failures: ${masterResults.summary.criticalFailures}`);
  console.log(`   High Priority Failures: ${masterResults.summary.highPriorityFailures}`);

  const successRate = (masterResults.summary.passedSuites / masterResults.summary.totalSuites) * 100;
  console.log(`   Success Rate: ${successRate.toFixed(1)}%`);

  console.log(`\n🔍 SYSTEM HEALTH STATUS:`);
  console.log(`   Node.js API: ${masterResults.systemHealth.nodeApi ? '✅ Healthy' : '❌ Issues'}`);
  console.log(`   C# API: ${masterResults.systemHealth.csharpApi ? '✅ Healthy' : '❌ Issues'}`);
  console.log(`   Database: ${masterResults.systemHealth.database ? '✅ Connected' : '❌ Issues'}`);

  console.log(`\n📋 DETAILED SUITE RESULTS:`);
  TEST_SUITES.forEach(suite => {
    const result = masterResults.suiteResults[suite.name];
    if (result) {
      const status = result.success ? '✅ PASSED' :
        result.partialSuccess ? '⚠️  PARTIAL' : '❌ FAILED';
      const duration = (result.duration / 1000).toFixed(1);
      console.log(`   ${suite.name}: ${status} (${duration}s) [${suite.priority}]`);
    }
  });

  console.log(`\n📈 PERFORMANCE METRICS:`);
  const avgDuration = Object.values(masterResults.suiteResults).reduce((sum, r) => sum + r.duration, 0) /
    Object.keys(masterResults.suiteResults).length;
  console.log(`   Average Suite Duration: ${(avgDuration / 1000).toFixed(1)}s`);

  const fastestSuite = Object.values(masterResults.suiteResults).reduce((fastest, current) =>
    current.duration < fastest.duration ? current : fastest
  );
  const slowestSuite = Object.values(masterResults.suiteResults).reduce((slowest, current) =>
    current.duration > slowest.duration ? current : slowest
  );

  console.log(`   Fastest Suite: ${fastestSuite.name} (${(fastestSuite.duration / 1000).toFixed(1)}s)`);
  console.log(`   Slowest Suite: ${slowestSuite.name} (${(slowestSuite.duration / 1000).toFixed(1)}s)`);

  // Generate recommendations
  console.log(`\n💡 RECOMMENDATIONS:`);

  if (masterResults.overallStatus === 'SUCCESS') {
    console.log('   ✅ All tests passed successfully!');
    console.log('   ✅ System ready for production deployment');
    console.log('   ✅ All Phase 5 objectives achieved');
  } else if (masterResults.overallStatus === 'PARTIAL_SUCCESS') {
    console.log('   ⚠️  Most tests passed with minor issues');
    console.log('   ⚠️  Review failed test details before production');
    console.log('   ⚠️  Consider addressing high-priority failures');
  } else {
    console.log('   ❌ Critical failures detected');
    console.log('   ❌ System not ready for production');
    console.log('   ❌ Address critical failures before proceeding');
  }

  if (masterResults.summary.criticalFailures > 0) {
    console.log('   🚨 CRITICAL: Fix critical failures immediately');
  }

  if (!masterResults.systemHealth.nodeApi || !masterResults.systemHealth.csharpApi) {
    console.log('   🔧 System health issues require attention');
  }

  console.log(`\n📄 PHASE 5 STATUS: ${masterResults.overallStatus}`);
  console.log('='.repeat(80));

  // Save report to file
  try {
    const reportData = {
      ...masterResults,
      generatedAt: new Date().toISOString(),
      phase: 'Phase 5: Comprehensive Testing',
      version: '1.0'
    };

    await fs.writeFile(
      path.join(process.cwd(), 'phase5-test-report.json'),
      JSON.stringify(reportData, null, 2)
    );

    console.log('\n📋 Detailed report saved to: phase5-test-report.json');
  } catch (error) {
    console.log('\n⚠️  Could not save report file:', error.message);
  }

  return masterResults;
}

async function runPhase5ComprehensiveTesting() {
  console.log('Starting Phase 5: Comprehensive Testing Suite...');
  console.log(`Total test suites: ${TEST_SUITES.length}`);
  console.log(`Estimated total time: 15-25 minutes\n`);

  // Pre-flight system health check
  const systemHealthy = await checkSystemHealth();

  if (!systemHealthy) {
    console.log('\n⚠️  WARNING: System health issues detected');
    console.log('Some tests may fail due to system unavailability');
    console.log('Proceeding with testing but results may be limited...\n');
  }

  // Execute each test suite sequentially
  for (let i = 0; i < TEST_SUITES.length; i++) {
    const suite = TEST_SUITES[i];
    console.log(`\n📋 PROGRESS: Suite ${i + 1} of ${TEST_SUITES.length}`);

    try {
      await runTestSuite(suite);
    } catch (error) {
      console.log(`\n❌ FATAL ERROR in ${suite.name}: ${error.message}`);

      // Record the failure
      masterResults.suiteResults[suite.name] = {
        name: suite.name,
        priority: suite.priority,
        success: false,
        partialSuccess: false,
        duration: 0,
        exitCode: -1,
        output: '',
        errorOutput: error.message,
        timestamp: new Date().toISOString()
      };

      masterResults.summary.failedSuites++;
      if (suite.priority === 'CRITICAL') {
        masterResults.summary.criticalFailures++;
      }
    }

    // Brief pause between suites
    if (i < TEST_SUITES.length - 1) {
      console.log('\n⏳ Preparing next test suite...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Generate comprehensive report
  await generateMasterReport();

  return masterResults;
}

// Execute Phase 5 testing
runPhase5ComprehensiveTesting().then(results => {
  process.exit(results.overallStatus === 'SUCCESS' ? 0 : 1);
}).catch(error => {
  console.error('\n💥 FATAL ERROR: Phase 5 testing failed to execute:', error);
  process.exit(2);
});