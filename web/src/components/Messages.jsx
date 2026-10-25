import { BASE_REPLIES } from "../chat/quickQuestions.js";
import { fmtTime } from "../chat/format.js";
import { RichText } from "./RichText.jsx";

// Conversation transcript, typing indicator and suggested questions.
export function Messages({ messages, busy, showQuickReplies, onQuickReply, bottomRef }) {
  return (
    <div className="messages" aria-live="polite">
      {messages.map((m, i) => (
        <div key={i} className={`bubble ${m.from}`}>
          <RichText text={m.text} />
          {m.from !== "system" && (
            <span className="time">{fmtTime(m.ts)}</span>
          )}
        </div>
      ))}

      {busy && (
        <div className="bubble bot typing" aria-label="Octopi is typing">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}

      {showQuickReplies && (
        <div className="chips" role="group" aria-label="Suggested questions">
          {BASE_REPLIES.map((q) => (
            <button
              key={q}
              type="button"
              className="chip"
              onClick={() => onQuickReply(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
