// vite.config.ts
import { defineConfig, loadEnv } from "file:///D:/Career/resume/ai-resume-hub/extension/ui/node_modules/vite/dist/node/index.js";
import react from "file:///D:/Career/resume/ai-resume-hub/extension/ui/node_modules/@vitejs/plugin-react/dist/index.js";
import { resolve } from "path";
var __vite_injected_original_dirname = "D:\\Career\\resume\\ai-resume-hub\\extension\\ui";
var rootDir = resolve(__vite_injected_original_dirname, "../..");
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, ["REACT_APP_", "VITE_"]);
  const apiBaseUrl = env.REACT_APP_API_BASE_URL || env.VITE_API_BASE_URL || "https://ai-talent-resume-hub.vercel.app";
  const supabaseUrl = env.REACT_APP_SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = env.REACT_APP_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  return {
    plugins: [react()],
    base: "./",
    envDir: rootDir,
    envPrefix: ["VITE_", "REACT_APP_"],
    define: {
      __EXT_API_BASE_URL__: JSON.stringify(apiBaseUrl.replace(/\/$/, "")),
      __EXT_SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __EXT_SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnonKey)
    },
    build: {
      outDir: resolve(__vite_injected_original_dirname, "../dist"),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          sidepanel: resolve(__vite_injected_original_dirname, "sidepanel.html")
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]"
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxDYXJlZXJcXFxccmVzdW1lXFxcXGFpLXJlc3VtZS1odWJcXFxcZXh0ZW5zaW9uXFxcXHVpXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxDYXJlZXJcXFxccmVzdW1lXFxcXGFpLXJlc3VtZS1odWJcXFxcZXh0ZW5zaW9uXFxcXHVpXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9DYXJlZXIvcmVzdW1lL2FpLXJlc3VtZS1odWIvZXh0ZW5zaW9uL3VpL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcclxuXHJcbmNvbnN0IHJvb3REaXIgPSByZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uJyk7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiB7XHJcbiAgLy8gU2FtZSAuZW52IGFzIHRoZSBSZWFjdCB3ZWIgYXBwIChSRUFDVF9BUFBfKilcclxuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHJvb3REaXIsIFsnUkVBQ1RfQVBQXycsICdWSVRFXyddKTtcclxuXHJcbiAgY29uc3QgYXBpQmFzZVVybCA9XHJcbiAgICBlbnYuUkVBQ1RfQVBQX0FQSV9CQVNFX1VSTCB8fFxyXG4gICAgZW52LlZJVEVfQVBJX0JBU0VfVVJMIHx8XHJcbiAgICAnaHR0cHM6Ly9haS10YWxlbnQtcmVzdW1lLWh1Yi52ZXJjZWwuYXBwJztcclxuICBjb25zdCBzdXBhYmFzZVVybCA9IGVudi5SRUFDVF9BUFBfU1VQQUJBU0VfVVJMIHx8IGVudi5WSVRFX1NVUEFCQVNFX1VSTCB8fCAnJztcclxuICBjb25zdCBzdXBhYmFzZUFub25LZXkgPVxyXG4gICAgZW52LlJFQUNUX0FQUF9TVVBBQkFTRV9BTk9OX0tFWSB8fCBlbnYuVklURV9TVVBBQkFTRV9BTk9OX0tFWSB8fCAnJztcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHBsdWdpbnM6IFtyZWFjdCgpXSxcclxuICAgIGJhc2U6ICcuLycsXHJcbiAgICBlbnZEaXI6IHJvb3REaXIsXHJcbiAgICBlbnZQcmVmaXg6IFsnVklURV8nLCAnUkVBQ1RfQVBQXyddLFxyXG4gICAgZGVmaW5lOiB7XHJcbiAgICAgIF9fRVhUX0FQSV9CQVNFX1VSTF9fOiBKU09OLnN0cmluZ2lmeShhcGlCYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCAnJykpLFxyXG4gICAgICBfX0VYVF9TVVBBQkFTRV9VUkxfXzogSlNPTi5zdHJpbmdpZnkoc3VwYWJhc2VVcmwpLFxyXG4gICAgICBfX0VYVF9TVVBBQkFTRV9BTk9OX0tFWV9fOiBKU09OLnN0cmluZ2lmeShzdXBhYmFzZUFub25LZXkpLFxyXG4gICAgfSxcclxuICAgIGJ1aWxkOiB7XHJcbiAgICAgIG91dERpcjogcmVzb2x2ZShfX2Rpcm5hbWUsICcuLi9kaXN0JyksXHJcbiAgICAgIGVtcHR5T3V0RGlyOiB0cnVlLFxyXG4gICAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgICAgaW5wdXQ6IHtcclxuICAgICAgICAgIHNpZGVwYW5lbDogcmVzb2x2ZShfX2Rpcm5hbWUsICdzaWRlcGFuZWwuaHRtbCcpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgICBlbnRyeUZpbGVOYW1lczogJ2Fzc2V0cy9bbmFtZV0uanMnLFxyXG4gICAgICAgICAgY2h1bmtGaWxlTmFtZXM6ICdhc3NldHMvW25hbWVdLmpzJyxcclxuICAgICAgICAgIGFzc2V0RmlsZU5hbWVzOiAnYXNzZXRzL1tuYW1lXVtleHRuYW1lXScsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1QsU0FBUyxjQUFjLGVBQWU7QUFDclcsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUZ4QixJQUFNLG1DQUFtQztBQUl6QyxJQUFNLFVBQVUsUUFBUSxrQ0FBVyxPQUFPO0FBRTFDLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBRXhDLFFBQU0sTUFBTSxRQUFRLE1BQU0sU0FBUyxDQUFDLGNBQWMsT0FBTyxDQUFDO0FBRTFELFFBQU0sYUFDSixJQUFJLDBCQUNKLElBQUkscUJBQ0o7QUFDRixRQUFNLGNBQWMsSUFBSSwwQkFBMEIsSUFBSSxxQkFBcUI7QUFDM0UsUUFBTSxrQkFDSixJQUFJLCtCQUErQixJQUFJLDBCQUEwQjtBQUVuRSxTQUFPO0FBQUEsSUFDTCxTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsSUFDakIsTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBLElBQ1IsV0FBVyxDQUFDLFNBQVMsWUFBWTtBQUFBLElBQ2pDLFFBQVE7QUFBQSxNQUNOLHNCQUFzQixLQUFLLFVBQVUsV0FBVyxRQUFRLE9BQU8sRUFBRSxDQUFDO0FBQUEsTUFDbEUsc0JBQXNCLEtBQUssVUFBVSxXQUFXO0FBQUEsTUFDaEQsMkJBQTJCLEtBQUssVUFBVSxlQUFlO0FBQUEsSUFDM0Q7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNMLFFBQVEsUUFBUSxrQ0FBVyxTQUFTO0FBQUEsTUFDcEMsYUFBYTtBQUFBLE1BQ2IsZUFBZTtBQUFBLFFBQ2IsT0FBTztBQUFBLFVBQ0wsV0FBVyxRQUFRLGtDQUFXLGdCQUFnQjtBQUFBLFFBQ2hEO0FBQUEsUUFDQSxRQUFRO0FBQUEsVUFDTixnQkFBZ0I7QUFBQSxVQUNoQixnQkFBZ0I7QUFBQSxVQUNoQixnQkFBZ0I7QUFBQSxRQUNsQjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
