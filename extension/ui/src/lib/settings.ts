export type ExtensionSettings = {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

/** Baked in at `npm run build:extension` from the web app `.env`. */
const BUILTIN: ExtensionSettings = {
  apiBaseUrl: String(__EXT_API_BASE_URL__ || 'https://ai-talent-resume-hub.vercel.app').replace(
    /\/$/,
    ''
  ),
  supabaseUrl: String(__EXT_SUPABASE_URL__ || '').trim(),
  supabaseAnonKey: String(__EXT_SUPABASE_ANON_KEY__ || '').trim(),
};

export function getBuiltinSettings(): ExtensionSettings {
  return { ...BUILTIN };
}

/** Always use frontend build config — no manual setup. */
export async function loadSettings(): Promise<ExtensionSettings> {
  return getBuiltinSettings();
}

export function settingsAreReady(settings: ExtensionSettings): boolean {
  return Boolean(settings.apiBaseUrl && settings.supabaseUrl && settings.supabaseAnonKey);
}

export function missingConfigMessage(): string {
  return 'Extension was built without Supabase keys. Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to the project .env, then run npm run build:extension again.';
}
