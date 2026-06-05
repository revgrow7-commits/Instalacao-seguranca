import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import tokenManager from '../utils/tokenManager';
import api from '../utils/api';

const AuthContext = createContext();

const API_URL = (process.env.REACT_APP_BACKEND_URL?.trim() || window.location.origin) + '/api';

const SESSION_KEY = 'auth_user_snapshot';
const SESSION_TTL = 5 * 60 * 1000; // 5 min

// Label legível do role, centralizado aqui para não espalhar switches pela UI.
// Adicionar novo role exige mudar 1 lugar só.
const ROLE_LABELS = {
  admin: 'Administrador',
  manager: 'Gerente',
  installer: 'Instalador',
};

const readSessionSnapshot = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { user, ts } = JSON.parse(raw);
    if (Date.now() - ts > SESSION_TTL) return null;
    return user;
  } catch {
    return null;
  }
};

const writeSessionSnapshot = (user) => {
  try {
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, ts: Date.now() }));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
};

export const AuthProvider = ({ children }) => {
  // Inicialização preguiçosa: roda apenas no primeiro mount, não a cada render.
  const [user, setUser] = useState(() => readSessionSnapshot());
  const [loading, setLoading] = useState(() => !readSessionSnapshot());

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
        writeSessionSnapshot(response.data);
      } catch (error) {
        // Token invalid, logout
        tokenManager.clearToken();
        setUser(null);
        writeSessionSnapshot(null);
      }
    } else {
      writeSessionSnapshot(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Escuta evento disparado pelo interceptor 401 de api.js.
  // Evita hard reload — React Router redireciona via ProtectedRoute.
  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      writeSessionSnapshot(null);
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password
      });

      const { access_token, user: userData } = response.data;
      tokenManager.setToken(access_token);
      setUser(userData);
      writeSessionSnapshot(userData);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.detail || 'Erro ao fazer login'
      };
    }
  }, []);

  const logout = useCallback(() => {
    tokenManager.clearToken();
    api.clearCache();
    setUser(null);
    writeSessionSnapshot(null);
  }, []);

  // Value memoizado: re-render dos consumidores apenas quando user ou loading mudam.
  // Sem isso, qualquer setState no Provider re-render toda a árvore consumidora.
  const value = useMemo(() => {
    const role = user?.role;
    return {
      user,
      loading,
      login,
      logout,
      isAdmin: role === 'admin',
      isManager: role === 'manager',
      isInstaller: role === 'installer',
      roleLabel: ROLE_LABELS[role] ?? 'Usuário',
    };
  }, [user, loading]);

  return (
    <AuthContext.Provider value={value}>
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
