/**
 * API Status Tester Component
 * 
 * This component tests API connectivity and displays status information
 */

import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import api from '../config/api.config';

interface ApiStatus {
  health: {
    status: 'unknown' | 'connected' | 'error';
    message: string;
    timestamp?: string;
  };
  inventory: {
    status: 'unknown' | 'connected' | 'error';
    count: number;
  };
  customers: {
    status: 'unknown' | 'connected' | 'error';
    count: number;
  };
  transactions: {
    status: 'unknown' | 'connected' | 'error';
    count: number;
  };
}

export const ApiTester: React.FC = () => {
  const [status, setStatus] = useState<ApiStatus>({
    health: { status: 'unknown', message: 'Not checked yet' },
    inventory: { status: 'unknown', count: 0 },
    customers: { status: 'unknown', count: 0 },
    transactions: { status: 'unknown', count: 0 }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get('/health');
      setStatus(prev => ({
        ...prev,
        health: {
          status: 'connected',
          message: response.data.message || 'API is healthy',
          timestamp: response.data.timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        health: {
          status: 'error',
          message: error.message || 'Failed to connect to API'
        }
      }));
      setError('Could not connect to API health endpoint. Is the server running?');
    }
    
    setLoading(false);
  };

  const checkInventory = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get('/inventory');
      setStatus(prev => ({
        ...prev,
        inventory: {
          status: 'connected',
          count: response.data.length || 0
        }
      }));
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        inventory: {
          status: 'error',
          count: 0
        }
      }));
      setError('Could not fetch inventory data');
    }
    
    setLoading(false);
  };

  const checkCustomers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get('/customers');
      setStatus(prev => ({
        ...prev,
        customers: {
          status: 'connected',
          count: response.data.length || 0
        }
      }));
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        customers: {
          status: 'error',
          count: 0
        }
      }));
      setError('Could not fetch customer data');
    }
    
    setLoading(false);
  };

  const checkTransactions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get('/transactions/recent');
      setStatus(prev => ({
        ...prev,
        transactions: {
          status: 'connected',
          count: response.data.length || 0
        }
      }));
    } catch (error: any) {
      console.error('Transaction fetch error:', error);
      const errorMessage = error.response?.data?.message 
        || error.message 
        || 'Could not fetch transaction data';
      
      setStatus(prev => ({
        ...prev,
        transactions: {
          status: 'error',
          count: 0
        }
      }));
      setError(`Transaction API Error: ${errorMessage}`);
    }
    
    setLoading(false);
  };

  const checkAll = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Check health first
      const healthResponse = await api.get('/health');
      const isHealthy = healthResponse.status === 200;
      
      setStatus(prev => ({
        ...prev,
        health: {
          status: 'connected',
          message: healthResponse.data.message || 'API is healthy',
          timestamp: healthResponse.data.timestamp
        }
      }));
      
      // If health check passed, check other endpoints
      if (isHealthy) {
        await Promise.all([
          checkInventory(),
          checkCustomers(),
          checkTransactions()
        ]);
      }
    } catch (error: any) {
      console.error('Health check failed:', error);
      setStatus(prev => ({
        ...prev,
        health: {
          status: 'error',
          message: error.message || 'Failed to connect to API'
        }
      }));
      setError('API health check failed. Cannot proceed with other checks.');
    }
    
    setLoading(false);
  };

  useEffect(() => {
    // Check health when component mounts
    checkHealth();
  }, []);

  const getStatusColor = (status: 'unknown' | 'connected' | 'error') => {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <Card className="w-full max-w-xl mx-auto">
      <CardHeader>
        <CardTitle>API Connectivity Tester</CardTitle>
        <CardDescription>
          Tests the connection to the backend API endpoints
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <p>{error}</p>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-md p-3">
            <h3 className="font-medium text-lg">Health Check</h3>
            <p className={`${getStatusColor(status.health.status)}`}>
              Status: {status.health.status}
            </p>
            <p className="text-sm">{status.health.message}</p>
            {status.health.timestamp && (
              <p className="text-xs text-gray-500">
                Last updated: {new Date(status.health.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
          
          <div className="border rounded-md p-3">
            <h3 className="font-medium text-lg">Inventory</h3>
            <p className={`${getStatusColor(status.inventory.status)}`}>
              Status: {status.inventory.status}
            </p>
            <p className="text-sm">Item count: {status.inventory.count}</p>
          </div>
          
          <div className="border rounded-md p-3">
            <h3 className="font-medium text-lg">Customers</h3>
            <p className={`${getStatusColor(status.customers.status)}`}>
              Status: {status.customers.status}
            </p>
            <p className="text-sm">Customer count: {status.customers.count}</p>
          </div>
          
          <div className="border rounded-md p-3">
            <h3 className="font-medium text-lg">Transactions</h3>
            <p className={`${getStatusColor(status.transactions.status)}`}>
              Status: {status.transactions.status}
            </p>
            <p className="text-sm">Transaction count: {status.transactions.count}</p>
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-col gap-3">
        <div className="flex justify-between w-full gap-2">
          <Button 
            variant="outline" 
            onClick={checkHealth}
            disabled={loading}
            size="sm"
          >
            Check Health
          </Button>
          <Button 
            variant="outline" 
            onClick={checkInventory}
            disabled={loading}
            size="sm"
          >
            Check Inventory
          </Button>
          <Button 
            variant="outline" 
            onClick={checkCustomers}
            disabled={loading}
            size="sm"
          >
            Check Customers
          </Button>
          <Button 
            variant="outline" 
            onClick={checkTransactions}
            disabled={loading}
            size="sm"
          >
            Check Transactions
          </Button>
        </div>
        <Button 
          onClick={checkAll}
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Testing...' : 'Test All Endpoints'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ApiTester;