'use client';

import { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { supabase, UserRole } from '../lib/supabase';
import IUser from '../types/user';
import { useAuth } from './AuthContext';


interface UserContextType {
  user: IUser | null;
  role: UserRole;
}

const UserContext = createContext<UserContextType | undefined>({
  role: 'bidder',
  user: null
});

interface UserContextProps {
  children: React.ReactNode
}

const UserProvider: React.FC<UserContextProps> = ({ children }) => {
  const [user, setUser] = useState<IUser | null>(null);
  const { session } = useAuth();

  const getUser = useCallback(async (userID: string) => {
    if (!userID) return
    const { data, error } = await supabase.rpc('get_user_by_id', { p_user_id: userID })
    setUser(data?.[0])

    if (error) {
      console.error('Error fetching user:', error)
    }
  }, [])

  useEffect(() => {
    if (session?.user.id) {
      getUser(session.user.id)
    }
  }, [getUser, session?.user.id])

  return (
    <UserContext.Provider value={{ user, role: user?.role || 'bidder' }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);

  if (context === undefined) {
    throw new Error('useUser must be used inside UserProvider');
  }

  return context;
};

export default UserProvider;
