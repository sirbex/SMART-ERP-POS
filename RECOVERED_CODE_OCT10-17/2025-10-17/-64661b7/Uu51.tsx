/**
 * QuickBooks-Style UI Demo Router
 * 
 * This file demonstrates the new QuickBooks 2019-inspired UI components.
 * To use this demo:
 * 1. Temporarily rename your current App.tsx to App.backup.tsx
 * 2. Rename this file to App.tsx
 * 3. Restart the dev server
 * 4. Navigate to https://localhost:5173/
 * 
 * To revert: Rename App.backup.tsx back to App.tsx
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { SalesRegisterPage } from './pages/SalesRegisterPage';
import { MainLayout } from './components/layout/MainLayout';
import './App.css';

// Placeholder component for unfinished pages
const ComingSoonPage = ({ title }: { title: string }) => (
  <MainLayout>
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-800 mb-4">{title}</h1>
        <p className="text-slate-600 text-lg">This page is coming soon!</p>
        <p className="text-slate-500 text-sm mt-2">Check back later for updates.</p>
      </div>
    </div>
  </MainLayout>
);

function QuickBooksDemoApp() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* Completed Pages */}
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/pos" element={<SalesRegisterPage />} />
        
        {/* Placeholder Routes - To Be Implemented */}
        <Route path="/customers" element={<ComingSoonPage title="Customers" />} />
        <Route path="/inventory" element={<ComingSoonPage title="Inventory" />} />
        <Route path="/receipts" element={<ComingSoonPage title="Receipts" />} />
        <Route path="/reports" element={<ComingSoonPage title="Reports" />} />
        <Route path="/settings" element={<ComingSoonPage title="Settings" />} />
        
        {/* 404 - Catch all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default QuickBooksDemoApp;
