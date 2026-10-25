import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: /api goes to Rasa on port 5005 (RASA_URL overrides). No CORS needed.
const RASA_URL = process.env.RASA_URL ?? "http://localhost:5005";

// VITE_BASE is set only for the static deployment; dev stays at /.
const BASE_URL = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base: BASE_URL,
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: RASA_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
