import { useEffect, useRef } from "react";
import { BROWSER_SPEECH_OK, SpeechRecognitionClass, SPEECH_LANG } from "../shared/config.js";
import { commitSession, joinText, onEndAction, speechErrorAction } from "./browserPolicy.js";

// Built-in browser speech recognition, as documented on MDN:
// https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
// The rules (which error means what, when to restart) live in browserPolicy.js.
export function useBrowserDictation({
  input,
  setInput,
  busy,
  setListening,
  showSpeechHint,
  switchToWhisper,
}) {
  const recognitionRef = useRef(null);
  const speechActiveRef = useRef(false); // recognizer is running
  const wantListenRef = useRef(false); // user wants dictation on
  const speechBaseRef = useRef(""); // text before the mic started
  const watchdogRef = useRef(null);
  const committedRef = useRef(""); // final text of ended sessions
  const sessionFinalRef = useRef(""); // final words of this session
  const sessionInterimRef = useRef(""); // interim words of this session
  const sawSpeechEventRef = useRef(false); // has the recognizer reacted?
  const noSignalRestartsRef = useRef(0); // restarts without any transcript
  const permPollRef = useRef(null); // polls for a dead speech service

  // All dictated text so far.
  function composeSpeechText() {
    return joinText([
      speechBaseRef.current,
      committedRef.current,
      sessionFinalRef.current,
      sessionInterimRef.current,
    ]);
  }

  // If the service never fires an event, switch to the on-device model.
  // Permissions API: https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API
  function pollForDeadSpeechService() {
    clearInterval(permPollRef.current);
    const startedAt = Date.now();
    permPollRef.current = setInterval(() => {
      if (
        !speechActiveRef.current ||
        sawSpeechEventRef.current ||
        Date.now() - startedAt > 25000
      ) {
        clearInterval(permPollRef.current);
        return;
      }
      let query;
      try {
        query = navigator.permissions?.query({ name: "microphone" });
      } catch {
        return; // this browser does not expose the permission name
      }
      Promise.resolve(query).then((p) => {
        if (
          p?.state !== "granted" ||
          sawSpeechEventRef.current ||
          !speechActiveRef.current
        ) {
          return;
        }
        clearInterval(permPollRef.current);
        clearTimeout(watchdogRef.current);
        watchdogRef.current = setTimeout(() => {
          if (!speechActiveRef.current || sawSpeechEventRef.current) return;
          speechActiveRef.current = false;
          wantListenRef.current = false;
          try {
            recognitionRef.current?.abort();
          } catch {
            /* not running */
          }
          setListening(false);
          switchToWhisper(
            "This browser's speech service isn't available - switched to on-device voice. Tap the mic and speak."
          );
        }, 2500);
      }, () => {});
    }, 800);
  }

  // Stop the built-in recognizer.
  function stop() {
    speechActiveRef.current = false; // ignore late results
    wantListenRef.current = false;
    clearTimeout(watchdogRef.current);
    clearInterval(permPollRef.current);
    try {
      recognitionRef.current?.stop();
    } catch {
      /* not running */
    }
  }

  // Start a new dictation, keeping whatever is already typed.
  function begin() {
    if (!recognitionRef.current || busy) return;
    speechBaseRef.current = input.trim();
    committedRef.current = "";
    sessionFinalRef.current = "";
    sessionInterimRef.current = "";
    noSignalRestartsRef.current = 0;
    sawSpeechEventRef.current = false;
    speechActiveRef.current = true;
    wantListenRef.current = true;
    try {
      recognitionRef.current.start();
    } catch {
      speechActiveRef.current = false;
      wantListenRef.current = false;
      return;
    }
    pollForDeadSpeechService();
  }

  useEffect(() => {
    if (!BROWSER_SPEECH_OK) return;
    const rec = new SpeechRecognitionClass();
    rec.lang = SPEECH_LANG;
    rec.interimResults = true; // stream words while speaking
    rec.continuous = true; // dictate until tapped again
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      sawSpeechEventRef.current = true;
      clearTimeout(watchdogRef.current);
      setListening(true);
    };

    // Results: the final part of each result is stored, the interim part is shown until it is final.
    rec.onresult = (event) => {
      if (!speechActiveRef.current) return;
      sawSpeechEventRef.current = true;
      noSignalRestartsRef.current = 0;
      let finalText = "";
      let interimText = "";
      for (const result of event.results) {
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      sessionFinalRef.current = finalText;
      sessionInterimRef.current = interimText;
      setInput(composeSpeechText());
    };

    rec.onerror = (event) => {
      sawSpeechEventRef.current = true;
      clearTimeout(watchdogRef.current);
      const rule = speechErrorAction(event.error);
      if (rule.action === "ignore" || rule.action === "restart") return;
      wantListenRef.current = false;
      if (rule.action === "fallback") {
        switchToWhisper(rule.hint);
        return;
      }
      showSpeechHint(rule.hint);
    };

    rec.onend = () => {
      clearTimeout(watchdogRef.current);
      const rule = onEndAction({
        wantListen: wantListenRef.current,
        speechActive: speechActiveRef.current,
        restarts: noSignalRestartsRef.current,
      });
      noSignalRestartsRef.current = rule.restarts;
      if (rule.action === "stop") {
        speechActiveRef.current = false;
        setListening(false);
        return;
      }
      if (rule.action === "giveUp") {
        speechActiveRef.current = false;
        wantListenRef.current = false;
        setListening(false);
        showSpeechHint(rule.hint);
        return;
      }
      // Session ended on its own: keep the text, start a new one.
      committedRef.current = commitSession(committedRef.current, sessionFinalRef.current);
      sessionFinalRef.current = "";
      sessionInterimRef.current = "";
      setInput(composeSpeechText());
      try {
        rec.start();
      } catch {
        speechActiveRef.current = false;
        wantListenRef.current = false;
        setListening(false);
      }
    };

    recognitionRef.current = rec;
    return () => {
      rec.onend = null; // no state updates after unmount
      try {
        rec.abort();
      } catch {
        /* not running */
      }
      recognitionRef.current = null;
      clearTimeout(watchdogRef.current);
      clearInterval(permPollRef.current);
    };
  }, []);

  return { begin, stop, supported: BROWSER_SPEECH_OK };
}
