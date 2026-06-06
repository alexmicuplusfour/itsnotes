import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import AuthPage from './AuthPage';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, requiresSetup, isLoading } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  // Show auth page if not authenticated or setup is required
  if (!isAuthenticated || requiresSetup) {
    return <AuthPage />;
  }

  // User is authenticated, show the protected content
  return children;
};

export default ProtectedRoute;
