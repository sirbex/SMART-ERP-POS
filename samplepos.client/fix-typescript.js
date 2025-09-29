// This is a simple utility script to fix TypeScript errors in POSScreen.tsx
// by changing the payment button code to use paidAsNumber and isValidPaid

import fs from 'fs';

const filePath = 'c:/Users/Chase/source/repos/SamplePOS/samplepos.client/src/components/POSScreen.tsx';

// Read the file
const content = fs.readFileSync(filePath, 'utf8');

// Find the specific lines to replace using a unique pattern
const oldPattern = `                <button 
                  onClick={handleCompleteSaleWithCheck} 
                  disabled={typeof paid !== 'number' || paid < 0}
                  className="pos-payment-complete-btn btn btn-success btn-lg"
                >
                  {typeof paid === 'number' && paid >= 0 ? (
                    paid === total ? 'Complete Sale (Exact)' :
                    paid > total ? 'Complete Sale (Change Due)' :
                    'Complete Sale (Partial)'
                  ) : 'Complete Sale'}`;

const newContent = `                <button 
                  onClick={handleCompleteSaleWithCheck} 
                  disabled={!isValidPaid(paid)}
                  className="pos-payment-complete-btn btn btn-success btn-lg"
                >
                  {isValidPaid(paid) ? (
                    paidAsNumber(paid) === total ? 'Complete Sale (Exact)' :
                    paidAsNumber(paid) > total ? 'Complete Sale (Change Due)' :
                    'Complete Sale (Partial)'
                  ) : 'Complete Sale'}`;

// Replace the content
const updatedContent = content.replace(oldPattern, newContent);

// Write back to file
fs.writeFileSync(filePath, updatedContent, 'utf8');

console.log('File updated successfully!');