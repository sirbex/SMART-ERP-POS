/**
 * API Status Component
 * 
 * Shows the connection status to the backend API
 */

import React, { useState, useEffect } from 'react';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Wifi, WifiOff } from 'lucide-react';

export const APIStatus: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checking, setChecking] = useState<boolean>(false);

  const checkApiConnection = async () => {
    if (checking) return;
    
    setChecking(true);
    try {
      // Health endpoint is at root level (/health), not under /api
      // Use fetch directly instead of api config
      const response = await fetch('http://localhost:3001/health', { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      console.log('API health check response:', response.status, data);
      setIsConnected(response.ok && data.status === 'OK');
    } catch (error) {
      console.error('API connection check failed:', error);
      setIsConnected(false);
    } finally {
      setLastChecked(new Date());
      setChecking(false);
    }
  };

  // Check connection when component mounts and every 30 seconds
  useEffect(() => {
    checkApiConnection();
    
    const interval = setInterval(() => {
      checkApiConnection();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className="cursor-pointer flex items-center" 
            onClick={checkApiConnection}
          >
            <Badge 
              variant={isConnected ? "default" : "destructive"} 
              className="flex gap-1 items-center"
            >
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" /> 
                  <span>API Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" /> 
                  <span>API Disconnected</span>
                </>
              )}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p>Backend API is {isConnected ? 'connected' : 'disconnected'}</p>
            {lastChecked && (
              <p>Last checked: {lastChecked.toLocaleTimeString()}</p>
            )}
            <p className="text-muted-foreground">Click to check again</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default APIStatus;