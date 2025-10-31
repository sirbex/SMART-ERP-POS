/**
 * QuickBooks-inspired Header Bar Component
 * Professional navigation bar with company branding, search, and user actions
 */

import React, { useState, useEffect } from 'react';
import { Bell, ChevronDown, Search, User, Settings, LogOut } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Separator } from '../ui/separator';
import SettingsService from '../../services/SettingsService';

interface HeaderBarProps {
  onNavigate?: (screen: string) => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({ onNavigate }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const businessInfo = SettingsService.getInstance().getBusinessInfo();

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <header className="qb-header sticky top-0 z-50 w-full">
      <div className="flex items-center justify-between h-16 px-3 sm:px-4 md:px-6 w-full">
        {/* Left Section: Logo & Company Name */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-qb-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-sm flex-shrink-0">
              {businessInfo.businessName?.charAt(0) || 'S'}
            </div>
            <div className="hidden sm:block min-w-0">
              <h1 className="text-base md:text-lg font-semibold text-qb-gray-900 truncate">
                {businessInfo.businessName || 'Sample POS'}
              </h1>
              <p className="text-xs text-qb-gray-500 truncate">Point of Sale System</p>
            </div>
          </div>
        </div>

        {/* Center Section: Search - Hidden on small screens */}
        <div className="hidden xl:flex flex-1 max-w-2xl mx-6">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-qb-gray-400" />
            <Input
              type="text"
              placeholder="Search products, customers, transactions..."
              className="w-full pl-10 bg-qb-gray-50 border-qb-gray-200 focus:bg-white qb-input"
            />
          </div>
        </div>

        {/* Right Section: Time, Notifications & User Menu */}
        <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
          {/* Date & Time Display - Progressive disclosure */}
          <div className="hidden 2xl:flex flex-col items-end mr-2">
            <p className="text-sm font-medium text-qb-gray-900">{formatTime(currentTime)}</p>
            <p className="text-xs text-qb-gray-500">{formatDate(currentTime)}</p>
          </div>
          
          {/* Compact time for smaller screens */}
          <div className="hidden md:flex 2xl:hidden items-center mr-2">
            <p className="text-xs font-medium text-qb-gray-900">{formatTime(currentTime)}</p>
          </div>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative hover:bg-qb-gray-100 h-9 w-9 sm:h-10 sm:w-10">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-qb-gray-600" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-qb-red-500 rounded-full"></span>
          </Button>

          {/* Settings Quick Access - Hidden on mobile */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="hidden sm:flex hover:bg-qb-gray-100 h-9 w-9 sm:h-10 sm:w-10"
            onClick={() => onNavigate?.('settings')}
          >
            <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-qb-gray-600" />
          </Button>

          {/* User Menu */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-1 sm:gap-2 hover:bg-qb-gray-100 px-2 sm:px-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-qb-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="h-3 w-3 sm:h-4 sm:w-4 text-qb-blue-600" />
                </div>
                <div className="hidden lg:flex flex-col items-start min-w-0">
                  <span className="text-sm font-medium text-qb-gray-900 truncate">Admin User</span>
                  <span className="text-xs text-qb-gray-500 truncate">Administrator</span>
                </div>
                <ChevronDown className="hidden sm:block h-4 w-4 text-qb-gray-500 flex-shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">My Account</p>
              </div>
              <Separator className="my-1" />
              <button
                onClick={() => onNavigate?.('settings')}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-qb-gray-100 rounded-md transition-colors"
              >
                <User className="h-4 w-4" />
                Profile Settings
              </button>
              <button
                onClick={() => onNavigate?.('settings')}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-qb-gray-100 rounded-md transition-colors"
              >
                <Settings className="h-4 w-4" />
                System Settings
              </button>
              <Separator className="my-1" />
              <button className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-qb-red-600 hover:bg-qb-red-50 rounded-md transition-colors">
                <LogOut className="h-4 w-4" />
                Log Out
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
};

export default HeaderBar;
