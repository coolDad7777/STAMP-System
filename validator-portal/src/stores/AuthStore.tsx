import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  lastLogin: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

// Mock users for demo
const mockUsers: Record<string, { password: string; user: User }> = {
  'officer@demo.gov': {
    password: 'demo123',
    user: {
      id: '1',
      email: 'officer@demo.gov',
      name: 'Sarah Johnson',
      role: 'Probation Officer',
      permissions: ['verify_attendance', 'view_compliance', 'generate_reports'],
      lastLogin: new Date().toISOString(),
    },
  },
  'admin@demo.gov': {
    password: 'demo123',
    user: {
      id: '2',
      email: 'admin@demo.gov',
      name: 'Michael Chen',
      role: 'Court Administrator',
      permissions: ['verify_attendance', 'view_compliance', 'generate_reports', 'manage_users', 'view_audit'],
      lastLogin: new Date().toISOString(),
    },
  },
  'auditor@demo.gov': {
    password: 'demo123',
    user: {
      id: '3',
      email: 'auditor@demo.gov',
      name: 'Dr. Emily Rodriguez',
      role: 'System Auditor',
      permissions: ['view_audit', 'generate_reports', 'verify_integrity'],
      lastLogin: new Date().toISOString(),
    },
  },
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing session on app start
  useEffect(() => {
    const checkExistingSession = () => {
      try {
        const savedUser = localStorage.getItem('stamp_user');
        const savedToken = localStorage.getItem('stamp_token');
        
        if (savedUser && savedToken) {
          // In real app, validate token with server
          setUser(JSON.parse(savedUser));
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
        // Clear invalid session data
        localStorage.removeItem('stamp_user');
        localStorage.removeItem('stamp_token');
      } finally {
        setIsLoading(false);
      }
    };

    checkExistingSession();
  }, []);

  const login = async (email: string, password: string, rememberMe = false) => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check mock credentials
      const mockUser = mockUsers[email.toLowerCase()];
      
      if (!mockUser || mockUser.password !== password) {
        throw new Error('Invalid email or password');
      }

      // Update last login time
      const user = {
        ...mockUser.user,
        lastLogin: new Date().toISOString(),
      };

      // Generate mock JWT token
      const token = btoa(JSON.stringify({
        userId: user.id,
        email: user.email,
        role: user.role,
        exp: Date.now() + (rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000), // 7 days or 1 day
      }));

      // Save to localStorage
      localStorage.setItem('stamp_user', JSON.stringify(user));
      localStorage.setItem('stamp_token', token);

      setUser(user);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setError(null);
    localStorage.removeItem('stamp_user');
    localStorage.removeItem('stamp_token');
  };

  const clearError = () => {
    setError(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    logout,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}