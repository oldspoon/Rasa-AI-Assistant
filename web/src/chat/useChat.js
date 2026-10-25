import { useRef, useState } from "react";
import { reply as demoReply } from "../demo/demoEngine.js";
import { WEBHOOK } from "../endpoints.js";
import { getSender, newSenderId, readStoredUser, saveSender } from "../storage/session.js";
import { trackTurn } from "../storage/transcriptLog.js";
import { signedInMessage } from "./messages.js";

// Chat state and the send path: live backend first, in-browser demo engine as fallback.
export function useChat({ user, busy, setBusy, stopDictation, closeMenu }) {
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
    { hidden = false, sender: senderOverride, intro = false } = {}
  ) {
    const message = raw.trim();
    if (!message || busy) return;
    stopDictation(); // sending ends dictation
    closeMenu();
    const activeSender = senderOverride ?? sender;

    if (!hidden) {
      setMessages((msgs) => [...msgs, { from: "user", text: message, ts: Date.now() }]);
    }
    setBusy(true);
    trackTurn(activeSender, "user", message, hidden ? { hidden: true } : undefined);
    try {
      // Deliver a sign-in introduction that never reached the backend.
      const pending = pendingIntroRef.current;
      if (!intro && pending && pending.sender === activeSender) {
        const catchUp = await fetch(WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sender: activeSender, message: pending.text }),
        });
        if (!catchUp.ok) throw new Error(`HTTP ${catchUp.status}`);
        pendingIntroRef.current = null;
        trackTurn(activeSender, "notice", "introduction re-sent to the live backend", {
          engine: "rasa",
        });
      }
      const res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: activeSender, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const replies = await res.json(); // [{ recipient_id, text }, ...]
      const ts = Date.now();
      setMessages((msgs) => [
        ...msgs,
        ...replies.map((reply) => ({ from: "bot", text: reply.text, ts })),
      ]);
      replies
        .filter((reply) => reply.text)
        .forEach((reply) => trackTurn(activeSender, "bot", reply.text, { engine: "rasa" }));
      setDemoMode(false);
      if (intro) pendingIntroRef.current = null;
    } catch (err) {
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
        ...result.texts.map((text) => ({ from: "bot", text, ts })),
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
