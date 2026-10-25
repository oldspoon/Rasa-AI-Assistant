import { K_LOG_PREFIX } from "./keys.js";

const LOG_MAX_ENTRIES = 300; // per conversation
const LOG_MAX_CONVERSATIONS = 20; // transcripts kept in localStorage

function lastTs(key) {
  try {
    const log = JSON.parse(localStorage.getItem(key) ?? "[]");
    return log.length ? log[log.length - 1].ts : 0;
  } catch {
    return 0;
  }
}

// Remove every saved transcript, so the next person on this browser sees none.
export function clearTranscripts() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(K_LOG_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* Storage can be unavailable. */
  }
}

// Log each turn under the conversation id (console and localStorage).
export function trackTurn(sender, from, text, extra) {
  (from === "notice" ? console.warn : console.info)(
    `[attendance-bot ${sender}] ${from}: ${text}`
  );
  try {
    const key = K_LOG_PREFIX + sender;
    const log = JSON.parse(localStorage.getItem(key) ?? "[]");
    log.push({ ts: Date.now(), from, text, ...extra });
    localStorage.setItem(key, JSON.stringify(log.slice(-LOG_MAX_ENTRIES)));
    // Keep the newest transcripts only.
    Object.keys(localStorage)
      .filter((k) => k.startsWith(K_LOG_PREFIX) && k !== key)
      .sort((a, b) => lastTs(b) - lastTs(a))
      .slice(LOG_MAX_CONVERSATIONS - 1)
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* Tracking must never break the chat. */
  }
}
