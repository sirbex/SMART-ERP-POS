/**
 * QuickBooks-inspired Main Layout Component
 * Unified layout combining HeaderBar and SidebarNav
 * Fully responsive with mobile-first approach
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
    <div className="w-full min-h-screen flex flex-col bg-qb-gray-50">
      {/* Header - Fixed at top, full width */}
      <HeaderBar onNavigate={onNavigate} />
      
      {/* Main Layout with Sidebar and Content */}
      <div className="flex flex-1 w-full pt-16">
        {/* Sidebar - Collapsible on mobile, fixed on desktop */}
        <SidebarNav selected={selected} onSelect={onNavigate} />
        
        {/* Main Content Area - Responsive padding to account for sidebar */}
        <main className="flex-1 w-full lg:pl-64 overflow-x-hidden">
          <div className="w-full h-full p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
