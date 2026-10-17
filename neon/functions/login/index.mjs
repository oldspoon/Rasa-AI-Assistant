/* =============================================================================
   login - student login endpoint for the Campus Attendance Bot.

   A Neon Function (https://neon.com/docs/compute/functions): a small
   always-reachable HTTP handler deployed onto the project's `main` branch,
   next to the `users` table. It gets a public HTTPS URL and the runtime
   injects DATABASE_URL.

   Drop-in replacement for the Rasa custom channel endpoint
   (rasa/auth_channel.py) - same request/response contract:

       POST  {"username": "alicejohnson", "password": "johnsonalice"}
       200   {"ok": true,  "first_name": "Alice", "last_name": "Johnson"}
       400   {"ok": false, "error": "username and password are required"}
       401   {"ok": false, "error": "invalid credentials"}
       503   {"ok": false, "error": "login service unavailable"}

   Matching is case-insensitive and ignores whitespace ("Alice Johnson" /
   "Johnson Alice" work too), mirroring the channel's _clean() rule.

   Deploy:  neon functions deploy login --src neon/functions/login --wait
   (or ./deploy/deploy-neon-login.sh). The React web chat and the static
   demo Space call this endpoint so sign-in works even when the Rasa
   backend is asleep; Rasa's /auth/login stays as a fallback.
   ============================================================================= */

import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";

// One pool per isolate, reused across requests (see the Neon Functions
// docs): created at module scope, kept small - each isolate has its own.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
attachDatabasePool(pool);

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

// Mirrors _clean() in rasa/auth_channel.py: drop all whitespace, lowercase
// ("Alice Johnson" -> "alicejohnson").
function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export default {
  async fetch(request) {
    // CORS preflight (the web chat is hosted on a different origin).
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "method not allowed" }, 405);
    }

    let payload = {};
    try {
      payload = await request.json();
    } catch {
      // Same as the channel: an unreadable body is treated as an empty one.
    }

    const username = clean(payload?.username);
    const password = clean(payload?.password);
    if (!username || !password) {
      return json(
        { ok: false, error: "username and password are required" },
        400
      );
    }

    let result;
    try {
      result = await pool.query(
        `SELECT first_name, last_name
         FROM   users
         WHERE  LOWER(username) = LOWER($1)
           AND  LOWER(password) = LOWER($2)
         LIMIT  1`,
        [username, password]
      );
    } catch (err) {
      console.error(`login lookup failed (user=${JSON.stringify(username)})`, err);
      return json({ ok: false, error: "login service unavailable" }, 503);
    }

    if (result.rows.length === 0) {
      console.info(`login user=${JSON.stringify(username)} result=invalid`);
      return json({ ok: false, error: "invalid credentials" }, 401);
    }

    const { first_name, last_name } = result.rows[0];
    console.info(`login user=${JSON.stringify(username)} result=ok`);
    return json({ ok: true, first_name, last_name });
  },
};
