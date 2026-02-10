import { useState } from "react";
import { SIDEBAR_QUESTIONS } from "../chat/quickQuestions.js";

function when(ts) {
  return new Date(ts).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryList({ history, currentId, busy, onOpen }) {
  return (
    <ul id="chat-history" className="history-list">
      {history.length === 0 && <li className="history-empty">Nothing asked yet</li>}
      {history.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={`history-item${item.id === currentId ? " current" : ""}`}
            aria-current={item.id === currentId ? "true" : undefined}
            disabled={busy}
            title={item.title}
            onClick={() => onOpen?.(item.id)}
          >
            <span className="history-title">{item.title}</span>
            <span className="history-time">{when(item.ts)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Sidebar({
  busy,
  user,
  onAsk,
  onNewConversation,
  history = [],
  currentId,
  onOpenHistory,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <aside className="sidebar">
      <p className="group-label">Ask about</p>
      <a
        className="nav-item guide-link"
        href={`${import.meta.env.BASE_URL}guide.html`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <i className="fa-solid fa-circle-question" aria-hidden="true" />
        <span>Quick start guide</span>
        <i className="fa-solid fa-arrow-up-right-from-square guide-external" aria-hidden="true" />
      </a>
      {SIDEBAR_QUESTIONS.map((q) => (
        <button
          key={q.label}
          type="button"
          className="nav-item"
          disabled={busy || !user}
          onClick={() => onAsk(q.message)}
        >
          <i className={`fa-solid ${q.icon}`} aria-hidden="true" />
          <span>{q.label}</span>
        </button>
      ))}

      <p className="group-label">Conversation</p>
      <button
        type="button"
        className="nav-item"
        disabled={busy || !user}
        onClick={onNewConversation}
      >
        <i className="fa-solid fa-rotate-right" aria-hidden="true" />
        <span>New conversation</span>
      </button>
      <button
        type="button"
        className="nav-item"
        disabled={!user}
        aria-expanded={historyOpen}
        aria-controls="chat-history"
        onClick={() => setHistoryOpen((open) => !open)}
      >
        <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
        <span>Chat History</span>
        <i
          className={`fa-solid ${historyOpen ? "fa-chevron-up" : "fa-chevron-down"} history-chevron`}
          aria-hidden="true"
        />
      </button>
      {user && historyOpen && (
        <HistoryList history={history} currentId={currentId} busy={busy} onOpen={onOpenHistory} />
      )}
    </aside>
  );
}
