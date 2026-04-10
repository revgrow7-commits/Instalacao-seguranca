import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import tokenManager from '../utils/tokenManager';

const AuthContext = createContext();

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isInstaller = user?.role === 'installer';
  
  // Get token for consumers who need it
  const getToken = () => tokenManager.getToken();

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
        token: tokenManager.getToken(),
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