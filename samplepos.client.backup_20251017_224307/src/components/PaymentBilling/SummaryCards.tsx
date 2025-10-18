/**
 * Summary Cards Component
 * Displays key billing metrics and statistics
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { DollarSign, TrendingUp, AlertCircle, Receipt } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';

interface SummaryCardsProps {
  totalRevenue: number;
  totalPaid: number;
  totalOutstanding: number;
  transactionCount: number;
  isLoading?: boolean;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  totalRevenue,
  totalPaid,
  totalOutstanding,
  transactionCount,
  isLoading = false,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const cards = [
    {
      title: 'Total Revenue',
      value: totalRevenue,
      icon: DollarSign,
      className: 'text-blue-600',
      bgClassName: 'bg-blue-50',
    },
    {
      title: 'Total Paid',
      value: totalPaid,
      icon: TrendingUp,
      className: 'text-green-600',
      bgClassName: 'bg-green-50',
    },
    {
      title: 'Outstanding',
      value: totalOutstanding,
      icon: AlertCircle,
      className: 'text-orange-600',
      bgClassName: 'bg-orange-50',
    },
    {
      title: 'Transactions',
      value: transactionCount,
      icon: Receipt,
      className: 'text-purple-600',
      bgClassName: 'bg-purple-50',
      isCount: true,
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-full ${card.bgClassName}`}>
                <Icon className={`h-4 w-4 ${card.className}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {card.isCount ? card.value : formatCurrency(card.value)}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
