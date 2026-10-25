import { useState } from "react";
import { BROWSER_SPEECH_OK, CAN_WHISPER } from "./shared/config.js";
import { useBrowserDictation } from "./browser/useBrowserDictation.js";
import { useSpeechHint } from "./shared/useSpeechHint.js";
import { useWhisperDictation } from "./whisper/useWhisperDictation.js";

// Voice input for the chat box. Uses browser speech when it works, the on-device model otherwise.
// Dictation fills the box; Send is manual.
export function useVoiceInput({ input, setInput, busy }) {
  const [listening, setListening] = useState(false);
  // "browser" = built-in speech, "whisper" = on-device, "none" = unsupported.
  const [voiceMode, setVoiceMode] = useState(
    BROWSER_SPEECH_OK ? "browser" : CAN_WHISPER ? "whisper" : "none"
  );
  const hint = useSpeechHint();

  // Switch to the on-device model when built-in voice is unusable.
  function switchToWhisper(message) {
    if (!CAN_WHISPER) {
      hint.showSpeechHint(
        "Voice input doesn't work in this browser - please try Chrome, Edge or Safari, or type your question."
      );
      return;
    }
    setVoiceMode("whisper");
    if (message) hint.showSpeechHint(message);
  }

  const browser = useBrowserDictation({
    input,
    setInput,
    busy,
    setListening,
    showSpeechHint: hint.showSpeechHint,
    switchToWhisper,
  });

  const whisper = useWhisperDictation({
    input,
    setInput,
    setListening,
    showSpeechHint: hint.showSpeechHint,
    clearSpeechHint: hint.clearSpeechHint,
  });

  // Stop whichever recogniser is running.
  function stopListening() {
    browser.stop();
    whisper.stopIfRecording();
  }

  function toggleListening() {
    if (voiceMode === "whisper") {
      whisper.toggle(listening, busy);
      return;
    }
    if (voiceMode !== "browser") return;
    if (listening) {
      stopListening();
      return;
    }
    browser.begin();
  }

  return {
    listening,
    transcribing: whisper.transcribing,
    speechHint: hint.speechHint,
    voiceMode,
    toggleListening,
    stopListening,
    clearSpeechHint: hint.clearSpeechHint,
  };
}
