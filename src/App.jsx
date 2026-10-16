import { useEffect, useRef, useState } from "react";

const K_SENDER = "attendance-bot-sender";
const K_THEME = "attendance-bot-theme";
const K_CVD = "attendance-bot-cvd";

const THEMES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

// Colour-vision modes - each switches the UI to a palette tuned for that
// condition (see the matching [data-cb="..."] blocks in index.css).
const CVD_MODES = [
  { id: "off", label: "Off", hint: "default colours" },
  { id: "protanopia", label: "Protanopia", hint: "red-blind · blue palette" },
  { id: "deuteranopia", label: "Deuteranopia", hint: "green-blind · purple palette" },
  { id: "tritanopia", label: "Tritanopia", hint: "blue-blind · red palette" },
  { id: "achromatopsia", label: "Achromatopsia", hint: "no colour · greyscale" },
];

const BASE_REPLIES = [
  "What days do I have lectures?",
  "What days do I have practicals?",
  "Give me all my schedule details.",
];

const WELCOME_TEXT =
  "Hi! I'm the campus attendance bot.\n" +
  'Tell me your first and last name (e.g. "My name is Alice Johnson").';

const welcomeMessage = () => ({ from: "bot", text: WELCOME_TEXT, ts: Date.now() });

function newSenderId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// One stable conversation id per browser, kept across page reloads.
// Rasa uses it to keep the dialogue state ("tracker").
function getSender() {
  let id = localStorage.getItem(K_SENDER);
  if (!id) {
    id = newSenderId();
    localStorage.setItem(K_SENDER, id);
  }
  return id;
}

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

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  // --- appearance / accessibility preferences (persisted in localStorage) ---
  const [themePref, setThemePref] = useState(
    () => localStorage.getItem(K_THEME) ?? "system"
  );
  const [cvd, setCvd] = useState(() => localStorage.getItem(K_CVD) ?? "off");
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme = themePref === "system" ? (systemDark ? "dark" : "light") : themePref;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(K_THEME, themePref);
  }, [theme, themePref]);

  useEffect(() => {
    document.documentElement.dataset.cb = cvd;
    localStorage.setItem(K_CVD, cvd);
  }, [cvd]);

  // --- chat state ---
  const [sender, setSender] = useState(() => getSender());
  const [messages, setMessages] = useState(() => [welcomeMessage()]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bottomRef = useRef(null);
  const menuRef = useRef(null);

  const userHasSpoken = messages.some((m) => m.from === "user");
  const quickReplies = [
    ...(userHasSpoken ? [] : ["My name is Alice Johnson"]),
    ...BASE_REPLIES,
  ];
  const showQuickReplies = !busy && messages[messages.length - 1]?.from === "bot";

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, busy]);

  // Close the menu on click outside / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function sendMessage(raw) {
    const message = raw.trim();
    if (!message || busy) return;
    setMenuOpen(false);

    setMessages((msgs) => [...msgs, { from: "user", text: message, ts: Date.now() }]);
    setBusy(true);
    try {
      const res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const replies = await res.json(); // [{ recipient_id, text }, ...]
      const ts = Date.now();
      setMessages((msgs) => [
        ...msgs,
        ...replies.map((reply) => ({ from: "bot", text: reply.text, ts })),
      ]);
    } catch (err) {
      setMessages((msgs) => [
        ...msgs,
        {
          from: "bot",
          text:
            `⚠️ Could not reach the bot (${err.message}).\n` +
            "Is the Rasa server running?  cd ../rasa && ./dev-run.sh -r",
          ts: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    sendMessage(input);
    setInput("");
  }

  function newConversation() {
    setMenuOpen(false);
    const id = newSenderId();
    localStorage.setItem(K_SENDER, id);
    setSender(id);
    setMessages([welcomeMessage()]);
    setInput("");
  }

  return (
    <div className="chat">
      <header>
        <div className="title">
          <h1>🎓 Attendance Bot</h1>
          <p>React + Vite — talks to Rasa over the REST channel</p>
        </div>

        <div className="menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 6h18M3 12h18M3 18h18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {menuOpen && (
            <div className="menu" role="menu" aria-label="Options">
              <p className="menu-label">Appearance</p>
              <div className="segmented" role="group" aria-label="Theme">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={themePref === t.id}
                    onClick={() => setThemePref(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <p className="menu-label">Colour vision</p>
              <div className="cvd" role="group" aria-label="Colour-vision mode">
                {CVD_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="cvd-option"
                    aria-pressed={cvd === m.id}
                    onClick={() => setCvd(m.id)}
                  >
                    <span className="cvd-label">{m.label}</span>
                    <span className="cvd-hint">{m.hint}</span>
                  </button>
                ))}
              </div>

              <hr />

              <button type="button" className="menu-action" onClick={newConversation}>
                🔄 Start a new conversation
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="messages" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.from}`}>
            <RichText text={m.text} />
            <span className="time">{fmtTime(m.ts)}</span>
          </div>
        ))}

        {busy && (
          <div className="bubble bot typing" aria-label="The bot is typing">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}

        {showQuickReplies && (
          <div className="chips" role="group" aria-label="Suggested questions">
            {quickReplies.map((q) => (
              <button
                key={q}
                type="button"
                className="chip"
                onClick={() => sendMessage(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message"
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
