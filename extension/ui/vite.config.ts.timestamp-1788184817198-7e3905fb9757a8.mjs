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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxDYXJlZXJcXFxccmVzdW1lXFxcXGFpLXJlc3VtZS1odWJcXFxcZXh0ZW5zaW9uXFxcXHVpXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxDYXJlZXJcXFxccmVzdW1lXFxcXGFpLXJlc3VtZS1odWJcXFxcZXh0ZW5zaW9uXFxcXHVpXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9DYXJlZXIvcmVzdW1lL2FpLXJlc3VtZS1odWIvZXh0ZW5zaW9uL3VpL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcclxuXHJcbmNvbnN0IHJvb3REaXIgPSByZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uJyk7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiB7XHJcbiAgY29uc3QgZW52ID0gbG9hZEVudihtb2RlLCByb290RGlyLCBbJ1JFQUNUX0FQUF8nLCAnVklURV8nXSk7XHJcblxyXG4gIGNvbnN0IGFwaUJhc2VVcmwgPVxyXG4gICAgZW52LlJFQUNUX0FQUF9BUElfQkFTRV9VUkwgfHxcclxuICAgIGVudi5WSVRFX0FQSV9CQVNFX1VSTCB8fFxyXG4gICAgJ2h0dHBzOi8vYWktdGFsZW50LXJlc3VtZS1odWIudmVyY2VsLmFwcCc7XHJcbiAgY29uc3Qgc3VwYWJhc2VVcmwgPSBlbnYuUkVBQ1RfQVBQX1NVUEFCQVNFX1VSTCB8fCBlbnYuVklURV9TVVBBQkFTRV9VUkwgfHwgJyc7XHJcbiAgY29uc3Qgc3VwYWJhc2VBbm9uS2V5ID1cclxuICAgIGVudi5SRUFDVF9BUFBfU1VQQUJBU0VfQU5PTl9LRVkgfHwgZW52LlZJVEVfU1VQQUJBU0VfQU5PTl9LRVkgfHwgJyc7XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBwbHVnaW5zOiBbcmVhY3QoKV0sXHJcbiAgICBiYXNlOiAnLi8nLFxyXG4gICAgZW52RGlyOiByb290RGlyLFxyXG4gICAgZW52UHJlZml4OiBbJ1ZJVEVfJywgJ1JFQUNUX0FQUF8nXSxcclxuICAgIGRlZmluZToge1xyXG4gICAgICBfX0VYVF9BUElfQkFTRV9VUkxfXzogSlNPTi5zdHJpbmdpZnkoYXBpQmFzZVVybC5yZXBsYWNlKC9cXC8kLywgJycpKSxcclxuICAgICAgX19FWFRfU1VQQUJBU0VfVVJMX186IEpTT04uc3RyaW5naWZ5KHN1cGFiYXNlVXJsKSxcclxuICAgICAgX19FWFRfU1VQQUJBU0VfQU5PTl9LRVlfXzogSlNPTi5zdHJpbmdpZnkoc3VwYWJhc2VBbm9uS2V5KSxcclxuICAgIH0sXHJcbiAgICBidWlsZDoge1xyXG4gICAgICBvdXREaXI6IHJlc29sdmUoX19kaXJuYW1lLCAnLi4vZGlzdCcpLFxyXG4gICAgICBlbXB0eU91dERpcjogdHJ1ZSxcclxuICAgICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICAgIGlucHV0OiB7XHJcbiAgICAgICAgICBzaWRlcGFuZWw6IHJlc29sdmUoX19kaXJuYW1lLCAnc2lkZXBhbmVsLmh0bWwnKSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIG91dHB1dDoge1xyXG4gICAgICAgICAgZW50cnlGaWxlTmFtZXM6ICdhc3NldHMvW25hbWVdLmpzJyxcclxuICAgICAgICAgIGNodW5rRmlsZU5hbWVzOiAnYXNzZXRzL1tuYW1lXS5qcycsXHJcbiAgICAgICAgICBhc3NldEZpbGVOYW1lczogJ2Fzc2V0cy9bbmFtZV1bZXh0bmFtZV0nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH07XHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQStULFNBQVMsY0FBYyxlQUFlO0FBQ3JXLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFGeEIsSUFBTSxtQ0FBbUM7QUFJekMsSUFBTSxVQUFVLFFBQVEsa0NBQVcsT0FBTztBQUUxQyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUN4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFNBQVMsQ0FBQyxjQUFjLE9BQU8sQ0FBQztBQUUxRCxRQUFNLGFBQ0osSUFBSSwwQkFDSixJQUFJLHFCQUNKO0FBQ0YsUUFBTSxjQUFjLElBQUksMEJBQTBCLElBQUkscUJBQXFCO0FBQzNFLFFBQU0sa0JBQ0osSUFBSSwrQkFBK0IsSUFBSSwwQkFBMEI7QUFFbkUsU0FBTztBQUFBLElBQ0wsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLElBQ2pCLE1BQU07QUFBQSxJQUNOLFFBQVE7QUFBQSxJQUNSLFdBQVcsQ0FBQyxTQUFTLFlBQVk7QUFBQSxJQUNqQyxRQUFRO0FBQUEsTUFDTixzQkFBc0IsS0FBSyxVQUFVLFdBQVcsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUFBLE1BQ2xFLHNCQUFzQixLQUFLLFVBQVUsV0FBVztBQUFBLE1BQ2hELDJCQUEyQixLQUFLLFVBQVUsZUFBZTtBQUFBLElBQzNEO0FBQUEsSUFDQSxPQUFPO0FBQUEsTUFDTCxRQUFRLFFBQVEsa0NBQVcsU0FBUztBQUFBLE1BQ3BDLGFBQWE7QUFBQSxNQUNiLGVBQWU7QUFBQSxRQUNiLE9BQU87QUFBQSxVQUNMLFdBQVcsUUFBUSxrQ0FBVyxnQkFBZ0I7QUFBQSxRQUNoRDtBQUFBLFFBQ0EsUUFBUTtBQUFBLFVBQ04sZ0JBQWdCO0FBQUEsVUFDaEIsZ0JBQWdCO0FBQUEsVUFDaEIsZ0JBQWdCO0FBQUEsUUFDbEI7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
