import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The page talks to the Rasa REST channel through this dev-server proxy:
//   browser -> http://localhost:5173/api/...  ->  http://localhost:5005/...
// From the browser's point of view everything is same-origin, so the Rasa
// side needs no CORS setup at all. (RASA_URL can override the target.)
const RASA_URL = process.env.RASA_URL ?? "http://localhost:5005";

// VITE_BASE is set only for the static deployment (a project site is served
// from /<repo-name>/); local development stays at the server root.
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
