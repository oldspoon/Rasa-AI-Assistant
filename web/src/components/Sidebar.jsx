import { SIDEBAR_QUESTIONS } from "../chat/quickQuestions.js";

export function Sidebar({ busy, user, onAsk, onNewConversation }) {
  return (
    <aside className="sidebar">
      <p className="group-label">Ask about</p>
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
    </aside>
  );
}
