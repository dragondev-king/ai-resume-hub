import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, UserRole } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: UserRole | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isBidder: boolean;
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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  useEffect(() => {
    console.log('AuthContext: Initializing...');
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('AuthContext: Initial session loaded:', session ? 'exists' : 'null');
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('AuthContext: Loading user role for:', session.user.email);
        loadUserRole(session.user.id).catch((error) => {
          console.error('AuthContext: Failed to load user role on initial load, using fallback:', error);
          setUserRole('bidder');
        });
      }
      setLoading(false);
      console.log('AuthContext: Initial loading complete');
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('AuthContext: Auth state changed:', _event, session ? 'session exists' : 'no session');
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('AuthContext: Loading user role for auth change:', session.user.email);
        try {
          await loadUserRole(session.user.id);
        } catch (error) {
          console.error('AuthContext: Failed to load user role, using fallback:', error);
          setUserRole('bidder');
        }
      } else {
        console.log('AuthContext: No session, clearing user role');
        setUserRole(null);
      }
      setLoading(false);
      console.log('AuthContext: Auth state change loading complete');
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserRole = async (userId: string) => {
    try {
      console.log('AuthContext: Loading user role for userId:', userId);
      
      // Query the users table directly for role
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      console.log('AuthContext: Query completed. Data:', data, 'Error:', error);

      if (error) {
        console.log('AuthContext: Error loading user role:', error);
        if (error.code === 'PGRST116') {
          // No user found in public.users, create one with default role
          console.log('AuthContext: No user found in public.users, creating with default role');
          
          const { error: insertError } = await supabase
            .from('users')
            .insert([{
              id: userId,
              email: 'user@example.com', // This will be updated by the trigger
              role: 'bidder',
              is_active: true,
            }]);

          console.log('AuthContext: Insert completed. Error:', insertError);

          if (insertError) {
            console.error('AuthContext: Error creating user record:', insertError);
            setUserRole('bidder');
          } else {
            setUserRole('bidder');
          }
          console.log('AuthContext: Set default role to bidder');
        } else {
          console.error('AuthContext: Error loading user role:', error);
          setUserRole('bidder');
          console.log('AuthContext: Set fallback role to bidder');
        }
      } else {
        console.log('AuthContext: User role loaded successfully:', data?.role);
        setUserRole(data?.role || 'bidder');
      }
      
      console.log('AuthContext: loadUserRole function completed successfully');
    } catch (error) {
      console.error('AuthContext: Error in loadUserRole:', error);
      setUserRole('bidder');
      console.log('AuthContext: Set error fallback role to bidder');
    }
  };

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

  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';
  const isBidder = userRole === 'bidder';

  const value = {
    user,
    session,
    loading,
    userRole,
    signIn,
    signOut,
    isAdmin,
    isManager,
    isBidder,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
