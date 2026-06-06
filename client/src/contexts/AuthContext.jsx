import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import env from '../../env.js';
import socketService from '../services/socket.js';

const AuthContext = createContext();

// Default grace period: 30 seconds
const DISCONNECT_GRACE_PERIOD_MS = 30 * 1000;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [nextResetAt, setNextResetAt] = useState(null);  const [token, setToken] = useState(() => {
    const storedToken = localStorage.getItem('authToken');
    console.log('AuthContext: Initial token from localStorage:', !!storedToken);
    return storedToken;
  });
  const [authChecked, setAuthChecked] = useState(false);
  
  // Track if we're being signed out due to disconnect
  const [disconnectSignOut, setDisconnectSignOut] = useState(false);

  // Handle disconnect timeout - auto logout
  const handleDisconnectTimeout = useCallback(() => {
    console.log('AuthContext: Disconnect timeout reached - signing out');
    setDisconnectSignOut(true);
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(false);
  }, []);

  // Register disconnect timeout callback when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      socketService.registerDisconnectTimeoutCallback(
        handleDisconnectTimeout,
        DISCONNECT_GRACE_PERIOD_MS
      );
    } else {
      socketService.clearDisconnectTimeoutCallback();
    }
    
    return () => {
      socketService.clearDisconnectTimeoutCallback();
    };
  }, [isAuthenticated, handleDisconnectTimeout]);

  // Clear disconnect sign out flag after a brief moment (for UI to show message if needed)
  useEffect(() => {
    if (disconnectSignOut) {
      const timer = setTimeout(() => setDisconnectSignOut(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [disconnectSignOut]);

  // Update API headers when token changes
  useEffect(() => {
    console.log('AuthContext: Token changed to:', token ? 'TOKEN_SET' : 'NULL');
    if (token) {
      localStorage.setItem('authToken', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      console.log('AuthContext: Token saved to localStorage and axios defaults set');
    } else {
      localStorage.removeItem('authToken');
      delete axios.defaults.headers.common['Authorization'];
      console.log('AuthContext: Token removed from localStorage and axios defaults');
    }
  }, [token]);

  // Simple auth check function
  const checkAuthStatus = async (retryCount = 0, maxRetries = 10) => {
    if (authChecked) return; // Prevent multiple calls

    console.log('AuthContext: Checking auth status...');
    setIsLoading(true);

    let shouldFinalize = true; // Track if we should exit loading state

    try {
      const currentToken = localStorage.getItem('authToken');
      const response = await fetch(`${env.API_BASE_URL}/auth/status`, {
        headers: {
          'Authorization': currentToken ? `Bearer ${currentToken}` : '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('AuthContext: Auth status response:', data);

      if (data.isDemoMode) {
        setIsDemoMode(true);
        setNextResetAt(data.nextResetAt);
      }

      if (data.requiresSetup) {
        setRequiresSetup(true);
        setIsAuthenticated(false);
        setUser(null);
      } else if (data.authenticated) {
        setIsAuthenticated(true);
        setUser(data.user);
        setRequiresSetup(false);
      } else {
        setIsAuthenticated(false);
        setUser(null);
        setRequiresSetup(false);
        if (currentToken) {
          setToken(null);
        }
      }
    } catch (error) {
      console.error('AuthContext: Auth check failed:', error);

      // If server is not reachable and we have retries left, retry with exponential backoff
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Max 5 seconds
        console.log(`AuthContext: Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
        shouldFinalize = false; // Don't exit loading state, we're retrying
        setTimeout(() => {
          checkAuthStatus(retryCount + 1, maxRetries);
        }, delay);
        return;
      }

      // After max retries, assume not authenticated
      console.error('AuthContext: Max retries reached, showing login page');
      setIsAuthenticated(false);
      setUser(null);
      // Do not clear token on error, it might be a temporary server issue
      // if (token) {
      //   setToken(null);
      // }
    } finally {
      // Only set loading to false and authChecked to true if we're not retrying
      if (shouldFinalize) {
        setIsLoading(false);
        setAuthChecked(true);
      }
    }
  };

  // Check auth status once on mount
  useEffect(() => {
    checkAuthStatus();
  }, []); // Empty dependency array - only run once

  const login = async (username, password) => {
    try {
      const response = await fetch(`${env.API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });      const data = await response.json();
      console.log('AuthContext: Login response data:', data);

      if (response.ok) {
        console.log('AuthContext: Login successful, setting token:', !!data.token);
        setToken(data.token);
        setUser(data.user);
        setIsAuthenticated(true);
        setRequiresSetup(false);
        setAuthChecked(true); // Mark as checked after successful login
        return { success: true };
      } else {
        console.log('AuthContext: Login failed:', data.message);
        return { success: false, error: data.message };
      }
    } catch (error) {
      console.error('Login error:', error);
      // Check if it's a network error (server unreachable)
      if (error.name === 'TypeError' || error.message === 'Failed to fetch') {
        return { success: false, error: 'Unable to connect to server. Please check your connection and try again.' };
      }
      return { success: false, error: 'Login failed. Please try again.' };
    }
  };

  const setup = async (username, password) => {
    try {
      const response = await fetch(`${env.API_BASE_URL}/auth/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        setIsAuthenticated(true);
        setRequiresSetup(false);
        setAuthChecked(true); // Mark as checked after successful setup
        return { success: true };
      } else {
        return { success: false, error: data.message };
      }
    } catch (error) {
      console.error('Setup error:', error);
      // Check if it's a network error (server unreachable)
      if (error.name === 'TypeError' || error.message === 'Failed to fetch') {
        return { success: false, error: 'Unable to connect to server. Please check your connection and try again.' };
      }
      return { success: false, error: 'Setup failed. Please try again.' };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch(`${env.API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      setAuthChecked(false); // Allow re-checking auth after logout
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const response = await fetch(`${env.API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, error: data.message };
      }
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: 'Failed to change password. Please try again.' };
    }
  };

  const value = {
    user,
    isAuthenticated,
    requiresSetup,
    isLoading,
    login,
    setup,
    logout,
    changePassword,
    checkAuthStatus,
    token,
    disconnectSignOut,
    isDemoMode,
    nextResetAt
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
