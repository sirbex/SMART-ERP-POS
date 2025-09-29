import React from 'react';
import type { Customer } from '../context/CustomerLedgerContext';
import { formatCurrency } from '../utils/currency';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

interface CustomerBalanceDisplayProps {
  customer: Customer;
  className?: string;
}

const CustomerBalanceDisplay: React.FC<CustomerBalanceDisplayProps> = ({ customer, className = '' }) => {
  // Calculate if this is a high balance (over 80% of credit limit)
  const creditLimit = customer.creditLimit || 0;
  const isHighBalance = creditLimit > 0 && customer.balance > creditLimit * 0.8;
  const isOverLimit = creditLimit > 0 && customer.balance > creditLimit;
  const usagePercentage = creditLimit > 0 ? Math.min(100, (customer.balance / creditLimit) * 100) : 0;
  
  // Determine color based on balance status
  const getBarColor = () => {
    if (isOverLimit) return 'bg-red-600';
    if (isHighBalance) return 'bg-amber-500';
    if (usagePercentage > 50) return 'bg-yellow-400';
    return 'bg-green-500';
  };
  
  return (
    <div className={cn(
      "p-4 rounded-lg border",
      isHighBalance ? "bg-amber-50 border-amber-200" : "bg-card border-input",
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-lg text-foreground">{customer.name}</div>
        {customer.type && (
          <Badge variant="secondary" className="font-medium">
            {customer.type}
          </Badge>
        )}
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Current Balance:</span>
          <span className={cn(
            "font-semibold",
            isHighBalance ? "text-amber-600" : isOverLimit ? "text-destructive" : "text-foreground"
          )}>
            {formatCurrency(customer.balance)}
          </span>
        </div>
        
        {creditLimit > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Credit Limit:</span>
              <span className="font-medium text-foreground">{formatCurrency(creditLimit)}</span>
            </div>
            
            <div className="w-full bg-secondary rounded-full h-2.5">
              <div 
                className={cn(
                  "h-2.5 rounded-full transition-all duration-300",
                  getBarColor()
                )}
                style={{ width: `${usagePercentage}%` }}
              ></div>
            </div>
            
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">
                {usagePercentage.toFixed(0)}% used
              </span>
            </div>
          </div>
        )}
        
        {isHighBalance && (
          <div className="flex items-center gap-1.5 mt-2 text-sm font-medium text-amber-600">
            <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            High account balance
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerBalanceDisplay;