import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import tokenManager from '../utils/tokenManager';
import { api } from '../utils/api';

const AuthContext = createContext();

const API_URL = (process.env.REACT_APP_BACKEND_URL || window.location.origin) + '/api';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tokenVersion, setTokenVersion] = useState(0); // Force re-render when token changes

  // Migrate from localStorage on first load (one-time)
  useEffect(() => {
    tokenManager.migrateFromLocalStorage();
  }, []);

  // Verify token and load user
  const loadUser = useCallback(async () => {
    const token = tokenManager.getToken();
    if (token) {
      try {
        const response = await axios.get(`${API_URL}/auth/me`, {
          headers: tokenManager.getAuthHeader()
        });
        setUser(response.data);
      } catch (error) {
        // Token invalid, logout
        tokenManager.clearToken();
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password
      });

      const { access_token, user: userData } = response.data;
      tokenManager.setToken(access_token);
      setUser(userData);
      setTokenVersion(v => v + 1); // Trigger re-render
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.detail || 'Erro ao fazer login'
      };
    }
  };

  const logout = () => {
    tokenManager.clearToken();
    api.clearCache();
    setUser(null);
    setTokenVersion(v => v + 1); // Trigger re-render
  };

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isInstaller = user?.role === 'installer';
  
  // Get token for consumers who need it
  const getToken = useCallback(() => tokenManager.getToken(), [tokenVersion]);
  
  // Memoize the current token value
  const token = useMemo(() => tokenManager.getToken(), [tokenVersion]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAdmin,
        isManager,
        isInstaller,
        token,
        getToken
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};