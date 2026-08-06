import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      // Menyasar WebView/browser lawas (mis. Android 9 & di bawahnya)
      // yang belum support ES Modules native.
      targets: ["defaults", "Android >= 4.4", "not IE 11"],
    }),
  ],
  server: {
    host: true,
    watch: {
      usePolling: true,
    },
  },
});
