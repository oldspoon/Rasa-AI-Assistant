/* login: student sign-in for the static demo Space (deploy/static-space), deployed as a
   Neon Function. Same request, credential rule and status codes as rasa/auth_channel.py,
   but it issues no chat token and has no /logout. The live web chat must sign in through
   Rasa's /auth/login instead, because its webhook only accepts that token.

   POST {"username": "alicejohnson", "password": "johnsonalice"}
   200 ok | 400 missing fields | 401 bad credentials | 503 database down

   Deploy: ./deploy/deploy-neon-login.sh
*/

import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";

// One pool per isolate, reused across requests.
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

// Same rule as rasa/auth_channel.py: drop spaces, lowercase.
function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export default {
  async fetch(request) {
    // CORS preflight.
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
      // Bad JSON counts as an empty body.
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
