import { Bell, User, ChevronDown, Calendar, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface HeaderBarProps {
  companyName?: string;
  userName?: string;
}

export const HeaderBar = ({ 
  companyName = "Sample POS", 
  userName = "Admin User" 
}: HeaderBarProps) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-gradient-to-r from-slate-800 to-slate-700 text-white shadow-lg border-b border-slate-600">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left: Company Logo/Name */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center font-bold text-xl shadow-md">
              SP
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{companyName}</h1>
              <p className="text-xs text-slate-300">Point of Sale System</p>
            </div>
          </div>
        </div>

        {/* Center: Date & Time */}
        <div className="hidden md:flex items-center space-x-6 text-sm">
          <div className="flex items-center space-x-2 bg-slate-700/50 px-4 py-2 rounded-lg">
            <Calendar className="w-4 h-4 text-teal-400" />
            <span className="font-medium">{format(currentTime, 'MMM dd, yyyy')}</span>
          </div>
          <div className="flex items-center space-x-2 bg-slate-700/50 px-4 py-2 rounded-lg">
            <Clock className="w-4 h-4 text-teal-400" />
            <span className="font-mono font-medium">{format(currentTime, 'hh:mm:ss a')}</span>
          </div>
        </div>

        {/* Right: User & Notifications */}
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <button className="relative p-2 hover:bg-slate-700 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          {/* User Menu */}
          <div className="flex items-center space-x-3 bg-slate-700/50 px-4 py-2 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors group">
            <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs text-slate-300">Administrator</p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
          </div>
        </div>
      </div>
    </header>
  );
};
