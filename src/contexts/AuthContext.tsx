import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  isAuthenticated: boolean;
  setIsAuthenticated: (isAuthenticated: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const getSession = useCallback( async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
      setIsAuthenticated(true)
    } else {
      setIsAuthenticated(false)
    }
  }, [])

  useEffect(() => {
    getSession()
  }, [getSession])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = {
    isAuthenticated,
    setIsAuthenticated,
    signIn,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
