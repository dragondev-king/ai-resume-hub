import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ProfileWithDetailsRPC } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useUser } from './UserContext';

interface ProfilesContextType {
  profiles: ProfileWithDetailsRPC[];
  loading: boolean;
  error: string | null;
  refreshProfiles: () => Promise<void>;
}

const ProfilesContext = createContext<ProfilesContextType | undefined>(undefined);

interface ProfilesProviderProps {
  children: ReactNode;
}

export const ProfilesProvider: React.FC<ProfilesProviderProps> = ({ children }) => {
  const { user, role } = useUser();
  const [profiles, setProfiles] = useState<ProfileWithDetailsRPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Don't load profiles if user is not authenticated
      if (!user?.id || !role) {
        console.log('User or role not loaded yet, skipping profile load');
        setProfiles([]);
        return;
      }

      console.log('Loading profiles via context for user:', user.id, 'Role:', role);
      
      const { data, error: rpcError } = await supabase.rpc('get_profiles_with_details', {
        p_user_id: user.id,
        p_user_role: role
      });

      if (rpcError) {
        console.error('Error loading profiles via context:', rpcError);
        setError(rpcError.message);
        setProfiles([]);
        return;
      }

      console.log('Loaded profiles via context:', data?.length || 0);
      setProfiles(data || []);
    } catch (err) {
      console.error('Error loading profiles via context:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  const refreshProfiles = useCallback(async () => {
    await loadProfiles();
  }, [loadProfiles]);

  // Load profiles when user or role changes
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const value: ProfilesContextType = {
    profiles,
    loading,
    error,
    refreshProfiles
  };

  return (
    <ProfilesContext.Provider value={value}>
      {children}
    </ProfilesContext.Provider>
  );
};

export const useProfiles = (): ProfilesContextType => {
  const context = useContext(ProfilesContext);
  if (context === undefined) {
    throw new Error('useProfiles must be used within a ProfilesProvider');
  }
  return context;
};
