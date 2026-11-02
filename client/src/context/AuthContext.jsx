import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('stockwise_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('stockwise_token'));
  const [loading, setLoading] = useState(() => {
    // Optimistic hydration: if both token and user are cached, don't block render
    const hasToken = Boolean(localStorage.getItem('stockwise_token'));
    const hasUser = Boolean(localStorage.getItem('stockwise_user'));
    return hasToken && !hasUser;
  });

  // Validate session in background
  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('stockwise_token');
      if (storedToken) {
        try {
          const res = await api.get('/auth/me', { timeout: 15000 });
          if (res.data.success && isMounted) {
            setUser(res.data.user);
            localStorage.setItem('stockwise_user', JSON.stringify(res.data.user));
          }
        } catch (err) {
          // ONLY clear tokens if the backend explicitly rejected the token with 401
          // Do NOT clear tokens on network timeout, 502, 504, or cold boot delay!
          if (err.response && err.response.status === 401) {
            console.warn('Session expired or invalid (401). Clearing credentials.');
            localStorage.removeItem('stockwise_token');
            localStorage.removeItem('stockwise_user');
            if (isMounted) {
              setUser(null);
              setToken(null);
            }
          } else {
            console.warn('Backend reachability check delayed, retaining cached session:', err.message);
          }
        }
      }
      if (isMounted) {
        setLoading(false);
      }
    };

    checkAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data.success) {
      const { token: receivedToken, user: receivedUser } = res.data;
      localStorage.setItem('stockwise_token', receivedToken);
      localStorage.setItem('stockwise_user', JSON.stringify(receivedUser));
      setToken(receivedToken);
      setUser(receivedUser);
      return receivedUser;
    }
    throw new Error(res.data.message || 'Login failed');
  };

  const logout = () => {
    localStorage.removeItem('stockwise_token');
    localStorage.removeItem('stockwise_user');
    setUser(null);
    setToken(null);
    window.location.href = '/login';
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin
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
