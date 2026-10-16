import { useEffect, useRef, useState } from "react";

// One stable conversation id per browser, kept across page reloads.
// Rasa uses it to keep the dialogue state ("tracker").
function getSender() {
  let id = localStorage.getItem("attendance-bot-sender");
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    localStorage.setItem("attendance-bot-sender", id);
  }
  return id;
}

const SENDER = getSender();

// Relative URL - the Vite dev server proxies /api/* to Rasa on :5005.
const WEBHOOK = "/api/webhooks/rest/webhook";

// The bot's replies use **bold** - render just that bit of markdown.
function RichText({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

export default function App() {
  const [messages, setMessages] = useState([
    {
      from: "bot",
      text:
        "Hi! I'm the campus attendance bot.\n" +
        'Tell me your first and last name (e.g. "My name is Alice Johnson").',
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(event) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    setMessages((msgs) => [...msgs, { from: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: SENDER, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const replies = await res.json(); // [{ recipient_id, text }, ...]
      setMessages((msgs) => [
        ...msgs,
        ...replies.map((reply) => ({ from: "bot", text: reply.text })),
      ]);
    } catch (err) {
      setMessages((msgs) => [
        ...msgs,
        {
          from: "bot",
          text:
            `⚠️ Could not reach the bot (${err.message}).\n` +
            "Is the Rasa server running?  cd ../rasa && ./dev-run.sh -r",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      <header>
        <h1>🎓 Attendance Bot</h1>
        <p>React + Vite - talks to Rasa over the REST channel</p>
      </header>

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.from}`}>
            <RichText text={m.text} />
          </div>
        ))}
        {busy && <div className="bubble bot typing">…</div>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
