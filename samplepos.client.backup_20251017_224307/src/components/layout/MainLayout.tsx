/**
 * QuickBooks-inspired Main Layout Component
 * Fully responsive layout with collapsible sidebar and mobile support
 */

import React, { useState, useEffect } from 'react';
import HeaderBar from './HeaderBar';
import SidebarNav from './SidebarNav';
import { Menu, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';

interface MainLayoutProps {
  children: React.ReactNode;
  selected: string;
  onNavigate: (screen: string) => void;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  maxWidth?: 'full' | '7xl' | '6xl' | '5xl' | '4xl';
  noPadding?: boolean;
}

const MainLayout: React.FC<MainLayoutProps> = ({ 
  children, 
  selected, 
  onNavigate,
  title,
  subtitle,
  actions,
  maxWidth = '7xl',
  noPadding = false
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Detect mobile screen size and auto-collapse sidebar
  useEffect(() => {
    const checkMobile = () => {
      const isMobileScreen = window.innerWidth < 1024;
      if (isMobileScreen) {
        setIsSidebarCollapsed(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const mainPadding = isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64';

  return (
    <div className="min-h-screen bg-qb-gray-50">
      {/* Header */}
      <HeaderBar onNavigate={onNavigate} />
      
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed bottom-4 right-4 z-40">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button 
              size="icon" 
              className="h-14 w-14 rounded-full shadow-lg bg-qb-blue-600 hover:bg-qb-blue-700"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="pt-4">
              <SidebarNav 
                selected={selected} 
                onSelect={(screen) => {
                  onNavigate(screen);
                  setIsMobileMenuOpen(false);
                }} 
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <SidebarNav 
          selected={selected} 
          onSelect={onNavigate}
          isCollapsed={isSidebarCollapsed}
        />
      </div>
      
      {/* Main Content Area */}
      <main className={`pt-16 ${mainPadding} transition-all duration-300 ease-in-out`}>
        <div className={`${noPadding ? '' : 'p-4 sm:p-6 lg:p-8'}`}>
          {/* Page Header */}
          {(title || actions) && (
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  {title && (
                    <h1 className="text-2xl sm:text-3xl font-bold text-qb-gray-900 tracking-tight">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="mt-1 text-sm text-qb-gray-500">{subtitle}</p>
                  )}
                </div>
                {actions && (
                  <div className="flex items-center gap-2">
                    {actions}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Page Content with responsive max-width */}
          <div className={`mx-auto ${maxWidth === 'full' ? 'w-full' : `max-w-${maxWidth}`}`}>
            {children}
          </div>
        </div>

        {/* Optional Footer */}
        <footer className="mt-auto py-6 px-4 sm:px-6 lg:px-8 border-t border-qb-gray-200 bg-white">
          <div className={`mx-auto ${maxWidth === 'full' ? 'w-full' : `max-w-${maxWidth}`}`}>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-qb-gray-500">
              <p>© 2025 Sample POS. All rights reserved.</p>
              <div className="flex gap-4">
                <button className="hover:text-qb-blue-600 transition-colors">Help</button>
                <button className="hover:text-qb-blue-600 transition-colors">Privacy</button>
                <button className="hover:text-qb-blue-600 transition-colors">Terms</button>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default MainLayout;
