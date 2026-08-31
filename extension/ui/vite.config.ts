import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const rootDir = resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, ['REACT_APP_', 'VITE_']);

  const apiBaseUrl =
    env.REACT_APP_API_BASE_URL ||
    env.VITE_API_BASE_URL ||
    'https://ai-talent-resume-hub.vercel.app';
  const supabaseUrl = env.REACT_APP_SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey =
    env.REACT_APP_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  return {
    plugins: [react()],
    base: './',
    envDir: rootDir,
    envPrefix: ['VITE_', 'REACT_APP_'],
    define: {
      __EXT_API_BASE_URL__: JSON.stringify(apiBaseUrl.replace(/\/$/, '')),
      __EXT_SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __EXT_SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnonKey),
    },
    build: {
      outDir: resolve(__dirname, '../dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          sidepanel: resolve(__dirname, 'sidepanel.html'),
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  };
});
