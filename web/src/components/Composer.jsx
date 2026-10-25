// Message box with the microphone and send buttons.
export function Composer({
  input,
  setInput,
  onSubmit,
  busy,
  transcribing,
  listening,
  voiceMode,
  onToggleMic,
}) {
  return (
    <form className="composer" onSubmit={onSubmit}>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={
          transcribing
            ? "Transcribing…"
            : listening
              ? "Listening…"
              : "Message"
        }
        aria-label="Message"
        autoFocus
      />
      {voiceMode !== "none" && (
        <button
          type="button"
          className={`mic-btn${listening ? " listening" : ""}`}
          aria-label={
            transcribing
              ? "Transcribing your speech"
              : listening
                ? "Stop voice input"
                : "Speak your question (English)"
          }
          aria-pressed={listening}
          title={
            transcribing
              ? "Transcribing…"
              : listening
                ? "Stop listening"
                : "Speak your question (English)"
          }
          onClick={onToggleMic}
          disabled={busy || transcribing}
        >
          <i
            className={`fa-solid ${
              transcribing
                ? "fa-spinner fa-spin"
                : listening
                  ? "fa-microphone-lines"
                  : "fa-microphone"
            }`}
            aria-hidden="true"
          />
        </button>
      )}
      <button
        type="submit"
        className="send-btn"
        aria-label="Send"
        disabled={busy || !input.trim()}
      >
        <i className="fa-solid fa-paper-plane" aria-hidden="true" />
      </button>
    </form>
  );
}
