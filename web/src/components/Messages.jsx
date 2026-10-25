import { Fragment } from "react";
import { BASE_REPLIES } from "../chat/quickQuestions.js";
import { iconFor } from "../chat/replyButtons.js";
import { fmtTime } from "../chat/format.js";
import { RichText } from "./RichText.jsx";

// Conversation transcript, typing indicator and suggested questions.
export function Messages({ messages, busy, showQuickReplies, onQuickReply, onChoose, bottomRef }) {
  return (
    <div className="messages" aria-live="polite">
      {messages.map((m, i) => (
        <Fragment key={i}>
          <div className={`bubble ${m.from}`}>
            <RichText text={m.text} />
            {m.from !== "system" && (
              <span className="time">{fmtTime(m.ts)}</span>
            )}
          </div>
          {m.buttons?.length > 0 && i === messages.length - 1 && !busy && (
            <div className="reply-buttons" role="group" aria-label="Choose an option">
              {m.buttons.map((b) => (
                <button
                  key={b.payload}
                  type="button"
                  className="reply-btn"
                  onClick={() => onChoose(b)}
                >
                  {iconFor(b.payload) && (
                    <i className={`fa-solid ${iconFor(b.payload)}`} aria-hidden="true" />
                  )}
                  {b.title}
                </button>
              ))}
            </div>
          )}
        </Fragment>
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
