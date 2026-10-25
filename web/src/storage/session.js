import { K_SENDER, K_USER } from "./keys.js";

export function newSenderId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// Per-browser conversation id (Rasa's tracker key).
export function getSender() {
  let id = localStorage.getItem(K_SENDER);
  if (!id) {
    id = newSenderId();
    localStorage.setItem(K_SENDER, id);
  }
  return id;
}

export function saveSender(id) {
  localStorage.setItem(K_SENDER, id);
}

// Signed-in student, kept for the tab so a reload skips the login.
export function readStoredUser() {
  try {
    const user = JSON.parse(sessionStorage.getItem(K_USER) ?? "null");
    return user && user.first && user.last ? user : null;
  } catch {
    return null;
  }
}

export function storeUser(user) {
  sessionStorage.setItem(K_USER, JSON.stringify(user));
}

export function clearStoredUser() {
  sessionStorage.removeItem(K_USER);
}
