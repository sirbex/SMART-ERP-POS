import React from 'react';
import ApiTester from '../components/ApiTester';

const ApiTestPage: React.FC = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">API Connection Test</h1>
      <div className="mb-4">
        <p className="text-gray-700">
          This page tests the connection to the backend API endpoints. Use the buttons below to test various endpoints.
        </p>
      </div>
      
      <ApiTester />
      
      <div className="mt-8 p-4 border rounded">
        <h2 className="text-xl font-semibold mb-2">Troubleshooting</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Make sure the backend server is running at <code className="bg-gray-100 px-1">http://localhost:3001</code></li>
          <li>Check that the Vite proxy is configured correctly in <code className="bg-gray-100 px-1">vite.config.ts</code></li>
          <li>Verify API endpoints match the routes defined on the server</li>
          <li>Check browser console for CORS or network errors</li>
        </ul>
      </div>
    </div>
  );
};

export default ApiTestPage;