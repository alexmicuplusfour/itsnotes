import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AuthPage.css';
import logo from '../assets/images/loom.png';

const AuthPage = () => {
  const { login, setup, requiresSetup, disconnectSignOut, isDemoMode } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { username, password, confirmPassword } = formData;

    // Basic validation
    if (!username.trim() || !password) {
      setError('Username and password are required');
      setIsLoading(false);
      return;
    }

    if (requiresSetup && password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (requiresSetup && password.length < 6) {
      setError('Password must be at least 6 characters long');
      setIsLoading(false);
      return;
    }

    try {
      let result;
      if (requiresSetup) {
        result = await setup(username.trim(), password);
      } else {
        result = await login(username.trim(), password);
      }

      if (!result.success) {
        setError(result.error || 'Authentication failed');
      }
      // If successful, the AuthContext will handle the state update
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <img src={logo} alt="itsnotes Logo" className="auth-logo" />          
      <div className="auth-container">
        <div className="auth-header">
          <h1>{requiresSetup ? 'Setup itsnotes' : 'Sign In'}</h1>
          <p>
            {requiresSetup 
              ? 'Create your admin account to get started'
              : ''
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {isDemoMode && (
            <div className="info-message">
              Demo credentials — username: <strong>itsnotes &nbsp;</strong>password: <strong>itspassword</strong>
            </div>
          )}

          {disconnectSignOut && (
            <div className="info-message">
              You were signed out because the connection to the server was lost.
            </div>
          )}
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="Enter your username"
              disabled={isLoading}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              disabled={isLoading}
              autoComplete={requiresSetup ? "new-password" : "current-password"}
              required
            />
          </div>

          {requiresSetup && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Confirm your password"
                disabled={isLoading}
                autoComplete="new-password"
                required
              />
            </div>
          )}

          <button 
            type="submit" 
            className="auth-button"
            disabled={isLoading}
          >
            {isLoading ? 'Please wait...' : (requiresSetup ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {requiresSetup 
              ? 'This will create the initial admin account for your Keep Clone instance.'
              : ''
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
