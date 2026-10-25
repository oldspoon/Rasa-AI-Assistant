// Relative /api (Vite proxy). Production sets VITE_RASA_URL.
export const WEBHOOK = import.meta.env.VITE_RASA_URL ?? "/api/webhooks/rest/webhook";

// Production: VITE_AUTH_URL (Neon login). Local: Rasa /auth/login.
export const AUTH_URL =
  import.meta.env.VITE_AUTH_URL ??
  ((import.meta.env.VITE_RASA_URL
    ? import.meta.env.VITE_RASA_URL.replace(/\/webhooks\/rest\/webhook\/?$/, "")
    : "/api") + "/auth/login");
