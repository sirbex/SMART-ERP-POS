/**
 * QuickBooks-inspired Main Layout Component
 * Unified layout combining HeaderBar and SidebarNav
 */

import React from 'react';
import HeaderBar from './HeaderBar';
import SidebarNav from './SidebarNav';

interface MainLayoutProps {
  children: React.ReactNode;
  selected: string;
  onNavigate: (screen: string) => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, selected, onNavigate }) => {
  return (
    <div className="min-h-screen bg-qb-gray-50">
      {/* Header */}
      <HeaderBar onNavigate={onNavigate} />
      
      {/* Sidebar */}
      <SidebarNav selected={selected} onSelect={onNavigate} />
      
      {/* Main Content Area */}
      <main className="pl-64 pt-16">
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
