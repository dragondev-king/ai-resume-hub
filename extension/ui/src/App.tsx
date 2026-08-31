import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadSettings,
  missingConfigMessage,
  settingsAreReady,
  type ExtensionSettings,
} from './lib/settings';
import { getSupabase, type AppUser, type Profile } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import GeneratorPage from './pages/GeneratorPage';

type View = 'loading' | 'login' | 'generator' | 'config-error';

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [view, setView] = useState<View>('loading');
  const [user, setUser] = useState<AppUser | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesError, setProfilesError] = useState('');
  const [bootError, setBootError] = useState('');

  const supabase = useMemo(() => {
    if (!settings || !settingsAreReady(settings)) return null;
    return getSupabase(settings);
  }, [settings]);

  const refreshProfiles = useCallback(
    async (appUser: AppUser) => {
      if (!supabase) return;
      setProfilesError('');
      const { data, error } = await supabase.rpc('get_profiles_with_details', {
        p_user_id: appUser.id,
        p_user_role: appUser.role,
      });
      if (error) {
        setProfiles([]);
        setProfilesError(error.message);
        return;
      }
      setProfiles((data as Profile[]) || []);
    },
    [supabase]
  );

  const loadSessionUser = useCallback(async () => {
    if (!supabase) return;
    setBootError('');
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setUser(null);
      setView('login');
      return;
    }

    const { data, error } = await supabase.rpc('get_user_by_id', {
      p_user_id: session.user.id,
    });
    if (error || !data?.[0]) {
      setBootError(error?.message || 'Could not load user profile.');
      setUser(null);
      setView('login');
      return;
    }

    const appUser = data[0] as AppUser;
    setUser(appUser);
    await refreshProfiles(appUser);
    setView('generator');
  }, [refreshProfiles, supabase]);

  useEffect(() => {
    (async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
      if (!settingsAreReady(loaded)) {
        setView('config-error');
        return;
      }
      setView('loading');
    })();
  }, []);

  useEffect(() => {
    if (!settings || !settingsAreReady(settings)) return;
    loadSessionUser();
  }, [settings, loadSessionUser]);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      loadSessionUser();
    });
    return () => data.subscription.unsubscribe();
  }, [supabase, loadSessionUser]);

  if (view === 'config-error') {
    return (
      <div className="shell">
        <header className="header">
          <h1>Build config missing</h1>
        </header>
        <p className="error">{missingConfigMessage()}</p>
      </div>
    );
  }

  if (view === 'loading' || !settings) {
    return (
      <div className="shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (view === 'login' || !user || !supabase) {
    return (
      <LoginPage
        settings={settings}
        bootError={bootError}
        onLoggedIn={() => loadSessionUser()}
      />
    );
  }

  return (
    <GeneratorPage
      settings={settings}
      supabase={supabase}
      user={user}
      profiles={profiles}
      profilesError={profilesError}
      onRefreshProfiles={() => refreshProfiles(user)}
      onSignOut={async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfiles([]);
        setView('login');
      }}
    />
  );
}
