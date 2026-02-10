import { WEBHOOK } from "../endpoints.js";

// The server answered with an error status.
export class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

// The server no longer accepts the login token.
export class SessionExpired extends Error {}

// Statuses a gateway sends while the hosted backend is asleep or restarting.
const GATEWAY_STATUSES = new Set([502, 503, 504]);

// True when the backend could not be reached at all, which is the only case the demo
// engine stands in for. fetch rejects with a TypeError when the network or CORS fails.
// Any other error is a real failure and must be shown, not hidden behind demo mode.
export function isBackendDown(err) {
  return err instanceof TypeError || (err instanceof HttpError && GATEWAY_STATUSES.has(err.status));
}

// POST one chat message with the login token.
export async function postChat(sender, message, token) {
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ sender, message }),
  });
  if (res.status === 401 && token) throw new SessionExpired();
  if (!res.ok) throw new HttpError(res.status);
  return res;
}

// The signed-in account from a successful /auth/login response. The chat webhook only
// accepts a login token, so a response without one comes from the wrong login service.
export function accountFromLogin(data) {
  if (!data?.ok || !data.first_name || !data.last_name) {
    throw new Error("unexpected login response");
  }
  if (!data.token) {
    throw new Error("the login service sent no chat token (AUTH_URL must be Rasa's /auth/login)");
  }
  return { first: data.first_name, last: data.last_name, token: data.token, via: "server" };
}
