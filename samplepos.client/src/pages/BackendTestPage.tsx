import { useState, useEffect } from 'react';
import api from '@/config/api.config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Database, Users, Package, ShoppingCart } from 'lucide-react';

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
}

export default function BackendTestPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, ApiResponse>>({});

  // Test endpoints
  const testEndpoints = [
    { name: 'Health Check', endpoint: 'http://localhost:3001/health', icon: CheckCircle, description: 'GET /health', direct: true },
    { name: 'Users List', endpoint: '/users', icon: Users, description: 'GET /api/users' },
    { name: 'Products List', endpoint: '/products', icon: Package, description: 'GET /api/products' },
    { name: 'Customers List', endpoint: '/customers', icon: Database, description: 'GET /api/customers' },
    { name: 'Sales List', endpoint: '/sales', icon: ShoppingCart, description: 'GET /api/sales' },
  ];

  const testEndpoint = async (endpoint: string, isDirect = false) => {
    try {
      setLoading(true);
      if (isDirect) {
        // Direct call without api config (for health check)
        const response = await fetch(endpoint);
        const data = await response.json();
        setResults(prev => ({
          ...prev,
          [endpoint]: {
            success: response.ok,
            data: data,
            status: response.status
          }
        }));
      } else {
        // Use api config (includes auth token)
        const token = localStorage.getItem('token');
        console.log('Testing endpoint:', endpoint);
        console.log('Token exists:', !!token);
        console.log('Token preview:', token ? token.substring(0, 20) + '...' : 'No token');
        
        const response = await api.get(endpoint);
        console.log('Response received:', response.status, response.data);
        setResults(prev => ({
          ...prev,
          [endpoint]: {
            success: true,
            data: response.data,
            status: response.status
          }
        }));
      }
    } catch (error: any) {
      console.error(`Error testing ${endpoint}:`, error);
      setResults(prev => ({
        ...prev,
        [endpoint]: {
          success: false,
          error: error.response?.data?.message || error.message || 'Unknown error',
          status: error.response?.status
        }
      }));
    } finally {
      setLoading(false);
    }
  };

  const testAllEndpoints = async () => {
    setLoading(true);
    setResults({});
    
    for (const test of testEndpoints) {
      await testEndpoint(test.endpoint, (test as any).direct);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    setLoading(false);
  };

  // Auto-test on mount
  useEffect(() => {
    testAllEndpoints();
  }, []);

  const getResultIcon = (endpoint: string) => {
    const result = results[endpoint];
    if (!result) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
    if (result.success) return <CheckCircle className="w-5 h-5 text-green-500" />;
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  const getResultColor = (endpoint: string) => {
    const result = results[endpoint];
    if (!result) return 'border-gray-200';
    if (result.success) return 'border-green-200 bg-green-50';
    return 'border-red-200 bg-red-50';
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Backend API Integration Test</h1>
        <p className="text-muted-foreground">
          Testing authenticated API calls to the new Node.js backend (localhost:3001)
        </p>
      </div>

      <Alert className="mb-6">
        <AlertDescription>
          <div className="space-y-2">
            <p className="font-medium">Testing the following:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>JWT token is being sent in Authorization header</li>
              <li>Backend API endpoints are accessible</li>
              <li>Data is being returned successfully</li>
              <li>CORS is configured correctly</li>
            </ul>
          </div>
        </AlertDescription>
      </Alert>

      <div className="mb-6 flex gap-3">
        <Button 
          onClick={testAllEndpoints} 
          disabled={loading}
          className="flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Test All Endpoints
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {testEndpoints.map((test) => {
          const Icon = test.icon;
          const result = results[test.endpoint];

          return (
            <Card key={test.endpoint} className={`${getResultColor(test.endpoint)} transition-colors`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="w-6 h-6 text-primary" />
                    <div>
                      <CardTitle className="text-lg">{test.name}</CardTitle>
                      <CardDescription className="text-xs font-mono">
                        {test.description}
                      </CardDescription>
                    </div>
                  </div>
                  {getResultIcon(test.endpoint)}
                </div>
              </CardHeader>
              <CardContent>
                {!result ? (
                  <p className="text-sm text-muted-foreground">Testing...</p>
                ) : result.success ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-green-700">Success</span>
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                        {result.status}
                      </span>
                    </div>
                    <div className="text-sm">
                      <p className="text-muted-foreground mb-1">Response:</p>
                      <div className="bg-white rounded p-3 border max-h-40 overflow-auto">
                        <pre className="text-xs">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-red-700">Failed</span>
                      {result.status && (
                        <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                          {result.status}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-red-600">{result.error}</p>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testEndpoint(test.endpoint, (test as any).direct)}
                  disabled={loading}
                  className="mt-3 w-full"
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary */}
      {Object.keys(results).length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Test Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {Object.values(results).filter(r => r.success).length}
                </p>
                <p className="text-sm text-green-600">Successful</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {Object.values(results).filter(r => !r.success).length}
                </p>
                <p className="text-sm text-red-600">Failed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{testEndpoints.length}</p>
                <p className="text-sm text-muted-foreground">Total Tests</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {Math.round((Object.values(results).filter(r => r.success).length / testEndpoints.length) * 100)}%
                </p>
                <p className="text-sm text-muted-foreground">Success Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
