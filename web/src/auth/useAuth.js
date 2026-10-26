import { useState } from "react";
import { AUTH_URL, LOGOUT_URL } from "../endpoints.js";
import { HttpError, accountFromLogin, isBackendDown } from "../chat/backend.js";
import { checkCredentials } from "../demo/demoEngine.js";
import { clearStoredUser, readStoredUser, storeUser } from "../storage/session.js";
import { clearTranscripts } from "../storage/transcriptLog.js";

// Student sign-in form and sign-out.
// Sign-in checks the server first, then the offline demo accounts.
export function useAuth({ setUser, setInput, chat, voice, closeMenu }) {
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  async function checkWithServer(username, password) {
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.status === 400 || res.status === 401) return "rejected";
    if (!res.ok) throw new HttpError(res.status);
    return accountFromLogin(await res.json());
  }

  async function onLogin(e) {
    e.preventDefault();
    const username = loginName.trim();
    const password = loginPassword.trim();
    if (!username || !password || loginBusy) return;

    setLoginBusy(true);
    setLoginError("");

    let account;
    try {
      account = await checkWithServer(username, password);
      if (account === "rejected") {
        setLoginError("Wrong username or password.");
        return;
      }
    } catch (err) {
      if (!isBackendDown(err)) {
        // The server answered but failed: say so instead of signing in offline.
        console.error("[attendance-bot] sign-in failed", err);
        setLoginError(`Sign-in failed on the server (${err?.message || err}). Please try again.`);
        return;
      }
      // Backend unreachable: check the credentials in the browser.
      const offline = checkCredentials(username, password);
      if (!offline) {
        setLoginError(
          "Wrong username or password. (The live server is unreachable, so this was checked against the offline demo accounts.)"
        );
        return;
      }
      account = { first: offline.first, last: offline.last, via: "offline" };
      chat.noteOfflineLogin(err?.message || err);
    } finally {
      setLoginBusy(false);
    }

    storeUser(account);
    setUser(account);
    setLoginName("");
    setLoginPassword("");
    chat.beginSession(account);
  }

  // The server no longer accepts the login token: back to the sign-in form.
  function expireSession() {
    logout();
    setLoginError("Your session has expired. Please sign in again.");
  }

  // Tell the server to drop the token. Best effort: signing off never waits on it.
  function revokeOnServer() {
    const token = readStoredUser()?.token;
    if (!token) return;
    fetch(LOGOUT_URL, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(
      () => {}
    );
  }

  function logout() {
    revokeOnServer();
    clearTranscripts();
    closeMenu();
    voice.stopListening();
    voice.clearSpeechHint();
    clearStoredUser();
    setUser(null);
    setLoginError("");
    setLoginName("");
    setLoginPassword("");
    setInput("");
    chat.resetConversation();
  }

  return {
    loginName,
    setLoginName,
    loginPassword,
    setLoginPassword,
    loginError,
    loginBusy,
    onLogin,
    logout,
    expireSession,
  };
}
