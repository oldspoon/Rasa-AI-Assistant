import { useRef, useState } from "react";
import { reply as demoReply } from "../demo/demoEngine.js";
import { getSender, newSenderId, readStoredUser, saveSender } from "../storage/session.js";
import { trackTurn } from "../storage/transcriptLog.js";
import { SessionExpired, isBackendDown, postChat as postWithToken } from "./backend.js";
import { serverErrorMessage, signedInMessage } from "./messages.js";

// POST one chat message with the stored login token.
function postChat(sender, message) {
  return postWithToken(sender, message, readStoredUser()?.token);
}

// Chat state and the send path: live backend first, in-browser demo engine as fallback.
export function useChat({ user, busy, setBusy, stopDictation, closeMenu, onSessionExpired }) {
  const [sender, setSender] = useState(() => getSender());
  const [messages, setMessages] = useState(() => {
    const saved = readStoredUser();
    return saved ? [signedInMessage(saved)] : [];
  });
  const [demoMode, setDemoMode] = useState(false);
  const demoStateRef = useRef({ student: null });
  // Sign-in introduction, resent first if the backend missed it.
  const pendingIntroRef = useRef(null);

  // One chat turn. hidden: no bubble. sender: overrides the conversation id.
  async function sendMessage(
    raw,
    { hidden = false, sender: senderOverride, intro = false, label } = {}
  ) {
    const message = raw.trim();
    if (!message || busy) return;
    const shown = label ?? message; // buttons show their title, the bot gets the payload
    stopDictation(); // sending ends dictation
    closeMenu();
    const activeSender = senderOverride ?? sender;

    if (!hidden) {
      setMessages((msgs) => [...msgs, { from: "user", text: shown, ts: Date.now() }]);
    }
    setBusy(true);
    trackTurn(activeSender, "user", shown, hidden ? { hidden: true } : undefined);
    try {
      // Deliver a sign-in introduction that never reached the backend.
      const pending = pendingIntroRef.current;
      if (!intro && pending && pending.sender === activeSender) {
        await postChat(activeSender, pending.text);
        pendingIntroRef.current = null;
        trackTurn(activeSender, "notice", "introduction re-sent to the live backend", {
          engine: "rasa",
        });
      }
      const res = await postChat(activeSender, message);
      const replies = await res.json(); // [{ recipient_id, text }, ...]
      const ts = Date.now();
      setMessages((msgs) => [
        ...msgs,
        ...replies.map((reply) => ({ from: "bot", text: reply.text, ts, buttons: reply.buttons })),
      ]);
      replies
        .filter((reply) => reply.text)
        .forEach((reply) => trackTurn(activeSender, "bot", reply.text, { engine: "rasa" }));
      setDemoMode(false);
      if (intro) pendingIntroRef.current = null;
    } catch (err) {
      if (err instanceof SessionExpired) {
        onSessionExpired?.();
        return;
      }
      if (!isBackendDown(err)) {
        // The backend answered but failed: say so instead of hiding it behind the demo engine.
        const reason = err?.message || String(err);
        trackTurn(activeSender, "notice", `backend error (${reason})`, { engine: "rasa" });
        setMessages((msgs) => [...msgs, serverErrorMessage(reason)]);
        console.error("[attendance-bot] chat request failed", err);
        return;
      }
      // Backend unreachable: answer from the in-browser demo engine.
      trackTurn(
        activeSender,
        "notice",
        `backend unreachable (${err?.message || err}) - answered by the demo engine`,
        { engine: "demo" }
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      const result = demoReply(message, demoStateRef.current.student);
      demoStateRef.current.student = result.student;
      const ts = Date.now();
      setMessages((msgs) => [
        ...msgs,
        ...result.texts.map((text, i) => ({
          from: "bot",
          text,
          ts,
          buttons: i === result.texts.length - 1 ? result.buttons : undefined,
        })),
      ]);
      result.texts.forEach((text) =>
        trackTurn(activeSender, "bot", text, { engine: "demo" })
      );
      setDemoMode(true);
      // Queue the introduction for the next live send.
      if (intro) pendingIntroRef.current = { sender: activeSender, text: message };
    } finally {
      setBusy(false);
    }
  }

  // Greet a signed-in student and introduce them to the bot silently.
  function beginSession(account, senderOverride) {
    setMessages([signedInMessage(account)]);
    sendMessage(`My name is ${account.first} ${account.last}`, {
      hidden: true,
      sender: senderOverride,
      intro: true,
    });
  }

  // Login checked against the offline demo accounts instead of the server.
  function noteOfflineLogin(reason) {
    setDemoMode(true);
    trackTurn(sender, "notice", `login checked offline (${reason})`, { engine: "demo" });
  }

  // Fresh conversation id. A signed-in student is introduced again silently.
  function startNewConversation() {
    const id = newSenderId();
    saveSender(id);
    setSender(id);
    demoStateRef.current.student = null;
    setDemoMode(false);
    if (user) {
      beginSession(user, id);
    } else {
      setMessages([]);
    }
    console.info(`[attendance-bot] new conversation ${id}`);
  }

  // Drop the dialogue state on sign-out.
  function resetConversation() {
    setDemoMode(false);
    demoStateRef.current.student = null;
    pendingIntroRef.current = null;
    // New conversation: drop the previous dialogue state.
    const id = newSenderId();
    saveSender(id);
    setSender(id);
    setMessages([]);
    console.info(`[attendance-bot] signed out; new conversation ${id}`);
  }

  return {
    sender,
    messages,
    demoMode,
    sendMessage,
    beginSession,
    noteOfflineLogin,
    startNewConversation,
    resetConversation,
  };
}
