import type { ReactNode } from 'react';
import { HeaderBar } from './HeaderBar';
import { SidebarNav } from './SidebarNav';

interface MainLayoutProps {
  children: ReactNode;
  companyName?: string;
  userName?: string;
}

export const MainLayout = ({ 
  children, 
  companyName, 
  userName 
}: MainLayoutProps) => {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <HeaderBar companyName={companyName} userName={userName} />
      
      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <SidebarNav />
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
