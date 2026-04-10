/**
 * Secure Token Manager
 * Uses sessionStorage instead of localStorage for better security against XSS
 * Tokens are cleared when the browser session ends
 */

const TOKEN_KEY = 'auth_token';
const TOKEN_EXPIRY_KEY = 'auth_token_expiry';

// Sanitize token to prevent injection attacks
const sanitizeToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  // Remove any potentially dangerous characters
  return token.replace(/[<>'"&]/g, '');
};

// Check if token is expired
const isTokenExpired = () => {
  const expiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!expiry) return true;
  return Date.now() > parseInt(expiry, 10);
};

export const tokenManager = {
  /**
   * Store token securely in sessionStorage
   * @param {string} token - JWT token
   * @param {number} expiresInDays - Token expiry in days (default 7)
   */
  setToken: (token, expiresInDays = 7) => {
    const sanitized = sanitizeToken(token);
    if (!sanitized) return false;
    
    try {
      sessionStorage.setItem(TOKEN_KEY, sanitized);
      // Store expiry time
      const expiryTime = Date.now() + (expiresInDays * 24 * 60 * 60 * 1000);
      sessionStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      return true;
    } catch (e) {
      console.error('Failed to store token:', e);
      return false;
    }
  },

  /**
   * Get token from storage
   * Returns null if token is expired or doesn't exist
   */
  getToken: () => {
    try {
      if (isTokenExpired()) {
        tokenManager.clearToken();
        return null;
      }
      return sessionStorage.getItem(TOKEN_KEY);
    } catch (e) {
      console.error('Failed to get token:', e);
      return null;
    }
  },

  /**
   * Clear token from storage
   */
  clearToken: () => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    } catch (e) {
      console.error('Failed to clear token:', e);
    }
  },

  /**
   * Check if user has a valid token
   */
  hasValidToken: () => {
    return !!tokenManager.getToken();
  },

  /**
   * Get authorization header
   */
  getAuthHeader: () => {
    const token = tokenManager.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },

  /**
   * Migrate from localStorage to sessionStorage (one-time migration)
   */
  migrateFromLocalStorage: () => {
    const oldToken = localStorage.getItem('token');
    if (oldToken && !sessionStorage.getItem(TOKEN_KEY)) {
      tokenManager.setToken(oldToken);
      localStorage.removeItem('token');
    }
  }
};

export default tokenManager;
