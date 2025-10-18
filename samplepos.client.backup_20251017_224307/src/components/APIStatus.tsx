/**
 * API Status Component
 * 
 * Shows the connection status to the backend API
 */

import React, { useState, useEffect } from 'react';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Wifi, WifiOff } from 'lucide-react';
import api from '../config/api.config';

export const APIStatus: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checking, setChecking] = useState<boolean>(false);

  const checkApiConnection = async () => {
    if (checking) return;
    
    setChecking(true);
    try {
      // The api.config.ts baseURL is already '/api', so we use '/health' to match '/api/health'
      // This will correctly call '/api/health' which matches the backend Express route
      const response = await api.get('/health', { 
        timeout: 3000,
        // Add error handling options to get more details
        validateStatus: (_status) => true // Accept any status code to avoid throwing
      });
      console.log('API health check response:', response.status, response.data);
      setIsConnected(response.status === 200);
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