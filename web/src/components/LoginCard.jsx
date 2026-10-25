// Student sign-in form, shown until a student is signed in.
export function LoginCard({ name, setName, password, setPassword, error, busy, onSubmit }) {
  return (
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-head">
        <span className="login-icon">
          <i className="fa-solid fa-lock" aria-hidden="true" />
        </span>
        <div>
          <h2 id="login-title">Student login</h2>
          <p>Sign in to check your lecture and practical sessions with Octopi.</p>
        </div>
      </div>

      <form className="login-form" onSubmit={onSubmit} autoComplete="off">
        <label>
          Username
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="alicejohnson"
            autoComplete="username"
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="johnsonalice"
            autoComplete="current-password"
          />
        </label>

        {error && (
          <p className="login-error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            {error}
          </p>
        )}

        <button
          type="submit"
          className="login-submit"
          disabled={busy || !name.trim() || !password.trim()}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="login-hint">
        Username: first name + last name · password: last name + first
        name, run together — e.g. <code>alicejohnson</code> /{" "}
        <code>johnsonalice</code>. Case and spaces are ignored.
      </p>
    </section>
  );
}
