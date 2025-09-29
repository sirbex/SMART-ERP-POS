import React, { useState, useEffect } from 'react';
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { Toggle } from "./ui/toggle";
import { cn } from "@/lib/utils";

interface SidebarProps {
  onSelect: (screen: string) => void;
  selected: string;
}

const menuItems = [
  { key: 'dashboard', label: 'Dashboard', icon: '📈' },
  { key: 'pos', label: 'Point of Sale', icon: '🛒' },
  { key: 'payment', label: 'Payment & Billing', icon: '💲' },
  { key: 'inventory', label: 'Inventory', icon: '📦' },
  { key: 'customers', label: 'Customers & Ledger', icon: '👥' },
  { key: 'reports', label: 'Reports', icon: '📊' },
];

const Sidebar: React.FC<SidebarProps> = ({ onSelect, selected }) => {
  const [expanded, setExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024); // Changed from 768 to 1024 for better tablet support
  const [mobileOpen, setMobileOpen] = useState(false);
  
  const toggleSidebar = () => {
    setExpanded(!expanded);
  };
  
  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 1024; // Updated breakpoint
      setIsMobile(mobile);
      if (!mobile) {
        setMobileOpen(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleItemClick = (itemKey: string) => {
    onSelect(itemKey);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  // Navigation Menu Component
  const NavigationMenu = ({ className = "" }: { className?: string }) => (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h2 className="text-xl font-bold text-white">
          Sample POS
        </h2>
        {!isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="text-white hover:bg-white/10 p-1"
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {expanded ? '◀' : '▶'}
          </Button>
        )}
      </div>

      {/* Menu Items */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {menuItems.map(item => (
            <li key={item.key}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 h-12 px-4 text-gray-200 hover:bg-white/10 hover:text-white transition-colors min-h-[48px] touch-manipulation", // Added better touch targets
                  selected === item.key && "bg-blue-600 text-white hover:bg-blue-700",
                  !expanded && !isMobile && "px-3 justify-center"
                )}
                onClick={() => handleItemClick(item.key)}
              >
                <span className="text-xl sm:text-base flex-shrink-0">{item.icon}</span>
                {(expanded || isMobile) && (
                  <span className="font-medium text-sm sm:text-base">{item.label}</span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center justify-between">
          <Toggle
            aria-label="Switch theme"
            className="bg-white/10 text-white hover:bg-white/20 data-[state=on]:bg-white/20"
          >
            🌓
          </Toggle>
          {(expanded || isMobile) && (
            <span className="text-xs text-gray-400">v2.0.1</span>
          )}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="default"
              size="sm"
              className="fixed top-4 left-4 z-50 bg-slate-800 hover:bg-slate-700 text-white shadow-lg min-h-[44px] min-w-[44px] touch-manipulation"
            >
              <span className="text-lg">☰</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-80 max-w-[85vw] p-0 bg-slate-800 border-slate-700"
          >
            <NavigationMenu />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-slate-800 border-r border-slate-700 shadow-xl transition-all duration-300 hidden lg:flex",
        expanded ? "w-56" : "w-16"
      )}
    >
      <NavigationMenu />
    </div>
  );
};

export default Sidebar;