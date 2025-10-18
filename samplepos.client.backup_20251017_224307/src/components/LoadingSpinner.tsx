import React from 'react';
import { Card, CardContent } from "./ui/card";

interface LoadingSpinnerProps {
  message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = "Loading..." }) => {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
          {/* Spinner */}
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-muted"></div>
            <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin absolute top-0 left-0"></div>
          </div>
          
          {/* Loading text */}
          <div className="text-center space-y-1">
            <p className="text-lg font-medium text-foreground">{message}</p>
            <p className="text-sm text-muted-foreground">Please wait while we load the component</p>
          </div>
          
          {/* Progress dots */}
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-primary/70 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-primary/40 rounded-full animate-pulse"></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Specific loading components for different screens
export const DashboardLoading = () => <LoadingSpinner message="Loading Dashboard..." />;
export const InventoryLoading = () => <LoadingSpinner message="Loading Inventory..." />;
export const CustomerLedgerLoading = () => <LoadingSpinner message="Loading Customer Ledger..." />;
export const POSLoading = () => <LoadingSpinner message="Loading Point of Sale..." />;
export const PaymentLoading = () => <LoadingSpinner message="Loading Payment System..." />;
export const ReportsLoading = () => <LoadingSpinner message="Loading Reports..." />;
export const SettingsLoading = () => <LoadingSpinner message="Loading Settings..." />;

export default LoadingSpinner;