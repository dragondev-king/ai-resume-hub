import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ExtensionSettings } from './settings';

const chromeStorageAdapter = {
  getItem: async (key: string) => {
    const result = await chrome.storage.local.get(key);
    const value = result[key];
    return typeof value === 'string' ? value : null;
  },
  setItem: async (key: string, value: string) => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string) => {
    await chrome.storage.local.remove(key);
  },
};

let client: SupabaseClient | null = null;
let clientKey = '';

export function getSupabase(settings: ExtensionSettings): SupabaseClient {
  const key = `${settings.supabaseUrl}::${settings.supabaseAnonKey}`;
  if (client && clientKey === key) return client;

  client = createClient(settings.supabaseUrl, settings.supabaseAnonKey, {
    auth: {
      storage: chromeStorageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  clientKey = key;
  return client;
}

export type UserRole = 'bidder' | 'manager' | 'admin';

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  title?: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  portfolio?: string;
  summary?: string;
  experience: any[];
  education: Array<{
    school?: string;
    degree?: string;
    field?: string;
    start_date?: string;
    end_date?: string;
  }>;
  skills: string[];
  resume_filename_format?: string;
  check_duplicate_applications?: boolean;
  metadata?: Record<string, unknown>;
};

export type AppUser = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
};
