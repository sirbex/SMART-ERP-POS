/**
 * QuickBooks-inspired Header Bar Component
 * Professional navigation bar with company branding, search, and user actions
 */

import React, { useState, useEffect } from 'react';
import { Bell, ChevronDown, Search, User, Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
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
    <header className="qb-header sticky top-0 z-50">
      <div className="flex items-center justify-between h-16 px-4 md:px-6">
        {/* Left Section: Logo & Company Name */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-qb-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
              {businessInfo.businessName?.charAt(0) || 'S'}
            </div>
            <div className="hidden md:block">
              <h1 className="text-lg font-semibold text-qb-gray-900">
                {businessInfo.businessName || 'Sample POS'}
              </h1>
              <p className="text-xs text-qb-gray-500">Point of Sale System</p>
            </div>
          </div>
        </div>

        {/* Center Section: Search */}
        <div className="hidden lg:flex flex-1 max-w-md mx-6">
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
        <div className="flex items-center gap-3">
          {/* Date & Time Display */}
          <div className="hidden xl:flex flex-col items-end mr-2">
            <p className="text-sm font-medium text-qb-gray-900">{formatTime(currentTime)}</p>
            <p className="text-xs text-qb-gray-500">{formatDate(currentTime)}</p>
          </div>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative hover:bg-qb-gray-100">
            <Bell className="h-5 w-5 text-qb-gray-600" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-qb-red-500 rounded-full"></span>
          </Button>

          {/* Settings Quick Access */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="hover:bg-qb-gray-100"
            onClick={() => onNavigate?.('settings')}
          >
            <Settings className="h-5 w-5 text-qb-gray-600" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 hover:bg-qb-gray-100">
                <div className="w-8 h-8 bg-qb-blue-100 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-qb-blue-600" />
                </div>
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-medium text-qb-gray-900">Admin User</span>
                  <span className="text-xs text-qb-gray-500">Administrator</span>
                </div>
                <ChevronDown className="h-4 w-4 text-qb-gray-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onNavigate?.('settings')}>
                <User className="mr-2 h-4 w-4" />
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNavigate?.('settings')}>
                <Settings className="mr-2 h-4 w-4" />
                System Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-qb-red-600">
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default HeaderBar;
