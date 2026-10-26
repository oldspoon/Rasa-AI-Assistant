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
