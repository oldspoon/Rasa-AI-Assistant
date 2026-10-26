// Relative /api (Vite proxy). Production sets VITE_RASA_URL.
export const WEBHOOK = import.meta.env.VITE_RASA_URL ?? "/api/webhooks/rest/webhook";

// VITE_AUTH_URL, else Rasa's /auth/login next to the webhook. It must be a Rasa /auth/login:
// the webhook only accepts the token it issues (the Neon login, for the static demo, issues none).
export const AUTH_URL =
  import.meta.env.VITE_AUTH_URL ??
  ((import.meta.env.VITE_RASA_URL
    ? import.meta.env.VITE_RASA_URL.replace(/\/webhooks\/rest\/webhook\/?$/, "")
    : "/api") + "/auth/login");

// Sign-off revokes the login token. Derived from AUTH_URL, so it only works with the Rasa login.
export const LOGOUT_URL = AUTH_URL.replace(/\/login\/?$/, "/logout");
