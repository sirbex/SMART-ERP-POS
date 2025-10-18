#!/usr/bin/env node

/**
 * Migration Helper Script
 * Helps identify files that can benefit from refactoring
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Analyzing codebase for refactoring opportunities...\n');

// Backend analysis
console.log('📊 BACKEND ANALYSIS\n');

const controllersPath = path.join(__dirname, 'server', 'src', 'controllers');
const controllers = fs.readdirSync(controllersPath).filter(f => f.endsWith('.js'));

console.log(`Found ${controllers.length} controllers:\n`);

controllers.forEach(controller => {
  const filePath = path.join(controllersPath, controller);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Count patterns that could be refactored
  const tryBlocks = (content.match(/try {/g) || []).length;
  const resJson = (content.match(/res\.(json|status)/g) || []).length;
  const consoleError = (content.match(/console\.error/g) || []).length;
  
  const refactoringScore = tryBlocks + resJson + consoleError;
  
  if (refactoringScore > 10) {
    console.log(`  ⚠️  ${controller} - HIGH priority (score: ${refactoringScore})`);
    console.log(`      - ${tryBlocks} try-catch blocks (use asyncHandler)`);
    console.log(`      - ${resJson} manual responses (use responseFormatter)`);
    console.log(`      - ${consoleError} console.error calls`);
  } else if (refactoringScore > 5) {
    console.log(`  ⚡ ${controller} - Medium priority (score: ${refactoringScore})`);
  } else {
    console.log(`  ✅ ${controller} - Low priority (score: ${refactoringScore})`);
  }
});

console.log('\n📊 FRONTEND ANALYSIS\n');

const componentsPath = path.join(__dirname, 'src', 'components');
let components = [];

function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFiles(filePath, fileList);
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

components = getFiles(componentsPath);

console.log(`Found ${components.length} components. Analyzing large files...\n`);

const largeComponents = components
  .map(comp => {
    const content = fs.readFileSync(comp, 'utf8');
    const lines = content.split('\n').length;
    const apiCalls = (content.match(/api\.(get|post|put|delete)/g) || []).length;
    const useState = (content.match(/useState</g) || []).length;
    const tableMarkup = (content.match(/<(table|Table)/gi) || []).length;
    const modalMarkup = (content.match(/<(Dialog|Modal)/gi) || []).length;
    
    return {
      name: path.basename(comp),
      path: comp.replace(__dirname, '.'),
      lines,
      apiCalls,
      useState,
      tableMarkup,
      modalMarkup,
      score: lines + (apiCalls * 10) + (tableMarkup * 50) + (modalMarkup * 50)
    };
  })
  .filter(c => c.lines > 200)
  .sort((a, b) => b.score - a.score);

largeComponents.slice(0, 10).forEach((comp, index) => {
  console.log(`${index + 1}. ${comp.name} (${comp.lines} lines)`);
  console.log(`   Path: ${comp.path}`);
  
  const suggestions = [];
  if (comp.apiCalls > 5) suggestions.push(`Use apiClient wrapper (${comp.apiCalls} API calls)`);
  if (comp.tableMarkup > 0) suggestions.push(`Use DataTable component (${comp.tableMarkup} tables)`);
  if (comp.modalMarkup > 0) suggestions.push(`Use FormModal component (${comp.modalMarkup} modals)`);
  if (comp.useState > 10) suggestions.push(`Consider state management (${comp.useState} useState calls)`);
  
  if (suggestions.length > 0) {
    console.log(`   Suggestions:`);
    suggestions.forEach(s => console.log(`   - ${s}`));
  }
  console.log('');
});

console.log('\n📋 MIGRATION RECOMMENDATIONS\n');

console.log('Backend (High Priority):');
console.log('  1. Replace try-catch with asyncHandler in all controllers');
console.log('  2. Replace manual res.json() with response formatters');
console.log('  3. Add validation using validation utilities\n');

console.log('Frontend (High Priority):');
console.log('  1. Replace axios calls with API client wrapper');
console.log('  2. Implement form validation hook in forms');
console.log('  3. Replace custom tables with DataTable component');
console.log('  4. Replace custom modals with FormModal component\n');

console.log('📖 See REFACTORING_REPORT.md and USAGE_GUIDE.md for details\n');
console.log('✅ Analysis complete!');
