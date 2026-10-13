import { useEffect, useRef, useState } from "react";

// Short status line under the chat. Clears itself after six seconds.
export function useSpeechHint() {
  const [speechHint, setSpeechHint] = useState("");
  const timerRef = useRef(null);

  function showSpeechHint(message) {
    setSpeechHint(message);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSpeechHint(""), 6000);
  }

  function clearSpeechHint() {
    clearTimeout(timerRef.current);
    setSpeechHint("");
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { speechHint, showSpeechHint, clearSpeechHint };
}
