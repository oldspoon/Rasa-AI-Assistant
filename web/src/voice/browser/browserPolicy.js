// Rules for the built-in speech recogniser. Pure, so each rule is testable without a browser.
//
// Event names and error codes follow the MDN SpeechRecognition reference:
// https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
// (see "Event handlers" and the error code list on that page).

export const MAX_SILENT_RESTARTS = 20;

const HINTS = {
  "not-allowed":
    "Microphone access is blocked - allow it for this site in your browser and try again.",
  "audio-capture": "No microphone was found on this device.",
};

export const FALLBACK_HINT =
  "This browser's speech service isn't available - switched to on-device voice. Tap the mic and speak.";

// What to do when the recogniser reports an error.
//   ignore:   we stopped it ourselves
//   restart:  silence, the end event restarts it
//   fallback: service unreachable, switch to the on-device model
//   fatal:    stop listening and show a hint
export function speechErrorAction(error) {
  if (error === "aborted") return { action: "ignore" };
  if (error === "network" || error === "service-not-allowed") {
    return { action: "fallback", hint: FALLBACK_HINT };
  }
  if (error === "no-speech") return { action: "restart" };
  return {
    action: "fatal",
    hint: HINTS[error] || "Voice input didn't work - please try again.",
  };
}

// What to do when the recogniser ends. The service ends sessions on its own after a pause,
// so while the user still wants dictation we start a new session, up to a limit of silent restarts.
export function onEndAction({ wantListen, speechActive, restarts }) {
  if (!(wantListen && speechActive)) return { action: "stop", restarts };
  const next = restarts + 1;
  if (next > MAX_SILENT_RESTARTS) {
    return { action: "giveUp", restarts: next, hint: "I didn't hear anything - tap the mic and try again." };
  }
  return { action: "restart", restarts: next };
}

// Join non-empty parts with single spaces.
export function joinText(parts) {
  return parts
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(" ");
}

// Text that has been finalised by sessions the service already ended.
export function commitSession(committed, sessionFinal) {
  return joinText([committed, sessionFinal]);
}
