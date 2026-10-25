import { useEffect, useRef, useState } from "react";
import { reply as demoReply, checkCredentials } from "./demoEngine.js";

const K_SENDER = "attendance-bot-sender";
const K_USER = "attendance-bot-user";
const K_THEME = "attendance-bot-theme";
const K_CVD = "attendance-bot-cvd";
const K_LOG_PREFIX = "attendance-bot-log-";
const LOG_MAX_ENTRIES = 300; // per conversation
const LOG_MAX_CONVERSATIONS = 20; // transcripts kept in localStorage

const THEMES = [
  { id: "system", label: "System", icon: "fa-desktop" },
  { id: "light", label: "Light", icon: "fa-sun" },
  { id: "dark", label: "Dark", icon: "fa-moon" },
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

// Sidebar ("local navigation") quick questions - the docs-page way to run
// the bot's most common asks with one click.
const SIDEBAR_QUESTIONS = [
  { icon: "fa-calendar-days", label: "Lecture days", message: "What days do I have lectures?" },
  { icon: "fa-flask", label: "Practical days", message: "What days do I have practicals?" },
  { icon: "fa-list-check", label: "Full schedule", message: "Give me all my schedule details." },
];

const BASE_REPLIES = [
  "What days do I have lectures?",
  "What days do I have practicals?",
  "Give me all my schedule details.",
];

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

// The signed-in student, kept for the tab (sessionStorage) so a reload does
// not force a second login.
function readStoredUser() {
  try {
    const user = JSON.parse(sessionStorage.getItem(K_USER) ?? "null");
    return user && user.first && user.last ? user : null;
  } catch {
    return null;
  }
}

function signedInMessage(user) {
  return {
    from: "system",
    text:
      `Signed in as ${user.first} ${user.last}` +
      (user.via === "offline" ? " (checked against the offline demo accounts)" : ""),
    ts: Date.now(),
  };
}

// Every turn is tracked under the conversation's UUID: one console line for
// live debugging, plus a capped transcript in localStorage
// ("attendance-bot-log-<uuid>") so the conversation can still be inspected
// after a reload - including when it was answered by the in-browser demo
// engine and never reached the backend.
function lastTs(key) {
  try {
    const log = JSON.parse(localStorage.getItem(key) ?? "[]");
    return log.length ? log[log.length - 1].ts : 0;
  } catch {
    return 0;
  }
}

function trackTurn(sender, from, text, extra) {
  (from === "notice" ? console.warn : console.info)(
    `[attendance-bot ${sender}] ${from}: ${text}`
  );
  try {
    const key = K_LOG_PREFIX + sender;
    const log = JSON.parse(localStorage.getItem(key) ?? "[]");
    log.push({ ts: Date.now(), from, text, ...extra });
    localStorage.setItem(key, JSON.stringify(log.slice(-LOG_MAX_ENTRIES)));
    // Keep only the newest transcripts so localStorage cannot grow forever.
    Object.keys(localStorage)
      .filter((k) => k.startsWith(K_LOG_PREFIX) && k !== key)
      .sort((a, b) => lastTs(b) - lastTs(a))
      .slice(LOG_MAX_CONVERSATIONS - 1)
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* tracking must never break the chat (storage full / blocked) */
  }
}

// Relative URL by default - the Vite dev server proxies /api/* to Rasa on
// :5005. A production build (e.g. on GitHub Pages) sets VITE_RASA_URL to the
// public Rasa endpoint instead, since the dev proxy doesn't exist there.
const WEBHOOK = import.meta.env.VITE_RASA_URL ?? "/api/webhooks/rest/webhook";

// Production builds point VITE_AUTH_URL at the Neon login function
// (neon/functions/login/) - it sits next to the database and stays reachable
// even when the Rasa backend is asleep. Locally (and as a fallback) the
// login endpoint is derived from the Rasa URL: a custom channel on the same
// server (rasa/auth_channel.py), i.e. /api/auth/login through the dev proxy
// and <rasa-url>/auth/login hosted.
const AUTH_URL =
  import.meta.env.VITE_AUTH_URL ??
  ((import.meta.env.VITE_RASA_URL
    ? import.meta.env.VITE_RASA_URL.replace(/\/webhooks\/rest\/webhook\/?$/, "")
    : "/api") + "/auth/login");

// Voice input. Preferred: the browser's built-in speech recognition (Chrome,
// Edge, Safari). Where that service is missing or dead (Opera GX exposes the
// API but never fires an event; Firefox has no API), the mic records with
// MediaRecorder and transcribes on-device with a small Whisper model
// (transformers.js) - no account, no server. The transcript lands in the
// message box for review; VITE_SPEECH_LANG tunes the built-in recognizer.
const SpeechRecognitionClass =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;
const SPEECH_LANG = import.meta.env.VITE_SPEECH_LANG ?? "en-US";

// Opera's Chromium builds ship no speech service, so go straight to the
// on-device model there instead of showing a dead button.
const IS_OPERA = /OPR\//.test(navigator.userAgent);
const CAN_WHISPER =
  typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const BROWSER_SPEECH_OK = !!SpeechRecognitionClass && !IS_OPERA;

// English-only, quantized (~50 MB; the browser caches it after first use).
const WHISPER_MODEL = "onnx-community/whisper-base.en";

// The model is only needed for the fallback, so it is loaded on first use
// (a separate bundle chunk, fetched lazily) and then kept in memory.
let whisperAsrPromise = null;

function loadWhisperModel(onProgress) {
  if (!whisperAsrPromise) {
    whisperAsrPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false; // fetch the model from the Hub
      return pipeline("automatic-speech-recognition", WHISPER_MODEL, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (p) => {
          if (onProgress && p?.status === "progress" && typeof p.progress === "number") {
            onProgress(Math.round(p.progress));
          }
        },
      });
    })().catch((err) => {
      whisperAsrPromise = null; // allow a retry on the next tap
      throw err;
    });
  }
  return whisperAsrPromise;
}

// Decode a MediaRecorder blob (webm/opus, ogg or mp4) and resample it to the
// 16 kHz mono samples the Whisper pipeline expects.
async function blobToWhisperAudio(blob) {
  const bytes = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } finally {
    ctx.close?.();
  }
  const rate = 16000;
  const length = Math.max(1, Math.ceil(decoded.duration * rate));
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new OfflineCtx(1, length, rate);
  const source = off.createBufferSource();
  source.buffer = decoded;
  source.connect(off.destination);
  source.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

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

  // --- login state ---
  const [user, setUser] = useState(readStoredUser);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  // --- chat state ---
  const [sender, setSender] = useState(() => getSender());
  const [messages, setMessages] = useState(() => {
    const saved = readStoredUser();
    return saved ? [signedInMessage(saved)] : [];
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef(null);
  const menuRef = useRef(null);
  const demoStateRef = useRef({ student: null });
  // The sign-in introduction ("My name is ...") is sent silently; if the
  // backend was unreachable when it went out, it is delivered again before
  // the next message reaches the live backend, so the dialogue still has the
  // student on record. `null` means nothing is pending.
  const pendingIntroRef = useRef(null);

  // --- voice input state ---
  const [listening, setListening] = useState(false);
  const [speechHint, setSpeechHint] = useState("");
  const recognitionRef = useRef(null);
  const speechActiveRef = useRef(false); // recognition is running / may write
  const speechBaseRef = useRef(""); // text already typed when the mic starts
  const speechHintTimerRef = useRef(null);
  // "browser" = built-in speech service, "whisper" = on-device model,
  // "none" = this browser has no usable voice input at all.
  const [voiceMode, setVoiceMode] = useState(
    BROWSER_SPEECH_OK ? "browser" : CAN_WHISPER ? "whisper" : "none"
  );
  const [transcribing, setTranscribing] = useState(false);
  const watchdogRef = useRef(null);
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordStreamRef = useRef(null);
  const recordTimerRef = useRef(null);
  const levelTimerRef = useRef(null); // watches the mic level while recording
  const audioCtxRef = useRef(null); // analyser context for that watchdog
  const heardRef = useRef(false); // did any audible sound arrive?
  const micWarnedRef = useRef(false); // "not hearing anything" hint shown?

  const quickReplies = BASE_REPLIES;
  const showQuickReplies =
    user && !busy && messages[messages.length - 1]?.from === "bot";

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

  // --- voice input (built-in speech, with an on-device model fallback) ---
  function showSpeechHint(message) {
    setSpeechHint(message);
    clearTimeout(speechHintTimerRef.current);
    speechHintTimerRef.current = setTimeout(() => setSpeechHint(""), 6000);
  }

  // stop() throws when the recognizer is not running - a no-op for us.
  function stopListening() {
    speechActiveRef.current = false; // late results must not rewrite the box
    clearTimeout(watchdogRef.current);
    try {
      recognitionRef.current?.stop();
    } catch {
      /* not running */
    }
  }

  // Switch to the on-device model (Opera GX ships a speech API that never
  // fires an event; some networks cannot reach the service either).
  function useWhisper(message) {
    if (!CAN_WHISPER) {
      showSpeechHint(
        "Voice input doesn't work in this browser - please try Chrome, Edge or Safari, or type your question."
      );
      return;
    }
    setVoiceMode("whisper");
    if (message) showSpeechHint(message);
  }

  // Some Chromium builds expose the speech API but a start() never produces a
  // single event: give the service a moment once the microphone is already
  // allowed (a permission prompt is its own UI and takes its time).
  function armSpeechWatchdog() {
    const arm = (state) => {
      if (state !== "granted") return;
      clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        if (!speechActiveRef.current) return;
        speechActiveRef.current = false;
        try {
          recognitionRef.current?.abort();
        } catch {
          /* not running */
        }
        setListening(false);
        useWhisper(
          "This browser's speech service isn't available - switched to on-device voice. Tap the mic and speak."
        );
      }, 2500);
    };
    try {
      navigator.permissions?.query?.({ name: "microphone" }).then(
        (p) => arm(p?.state),
        () => {}
      );
    } catch {
      /* Permissions API unsupported - the error handler covers it */
    }
  }

  async function startWhisperRecording() {
    if (transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const mimeType =
        typeof MediaRecorder.isTypeSupported === "function"
          ? types.find((t) => MediaRecorder.isTypeSupported(t))
          : undefined;
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) recordChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        transcribeRecording(
          new Blob(recordChunksRef.current, { type: rec.mimeType || "audio/webm" })
        );
      };
      recordStreamRef.current = stream;
      speechBaseRef.current = input.trim();
      // Watch the input level: tell the user while recording when the
      // microphone delivers nothing (muted, off or the wrong device).
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const actx = new AudioCtx();
      const analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      actx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = actx;
      heardRef.current = false;
      micWarnedRef.current = false;
      const levelBuf = new Float32Array(analyser.fftSize);
      const levelStartedAt = Date.now();
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(levelBuf);
        let peak = 0;
        for (let i = 0; i < levelBuf.length; i += 1) {
          peak = Math.max(peak, Math.abs(levelBuf[i]));
        }
        if (peak > 0.01) {
          if (micWarnedRef.current) {
            // Sound arrived after all - take the warning back down.
            micWarnedRef.current = false;
            clearTimeout(speechHintTimerRef.current);
            setSpeechHint("");
          }
          heardRef.current = true;
        } else if (
          !heardRef.current &&
          Date.now() - levelStartedAt > 1500 &&
          !micWarnedRef.current
        ) {
          micWarnedRef.current = true;
          showSpeechHint(
            "I'm not hearing anything - check your microphone is on and unmuted."
          );
        }
      }, 300);
      // Fetch and warm up the small speech model while the user speaks.
      loadWhisperModel((pct) =>
        showSpeechHint(
          pct >= 100
            ? "Preparing the on-device speech model…"
            : `Downloading the on-device speech model… ${pct}%`
        )
      ).catch(() => {});
      rec.start();
      setListening(true);
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = setTimeout(stopWhisperRecording, 30000);
    } catch (err) {
      showSpeechHint(
        err?.name === "NotAllowedError"
          ? "Microphone access is blocked - allow it for this site in your browser and try again."
          : "No microphone was found on this device."
      );
    }
  }

  function stopWhisperRecording() {
    clearTimeout(recordTimerRef.current);
    clearInterval(levelTimerRef.current);
    closeLevelCtx();
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") rec.stop(); // -> transcribeRecording
    setListening(false);
  }

  function closeLevelCtx() {
    if (!audioCtxRef.current) return;
    try {
      const p = audioCtxRef.current.close();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* already closed */
    }
    audioCtxRef.current = null;
  }

  async function transcribeRecording(blob) {
    if (!blob.size) {
      showSpeechHint("I didn't hear anything - tap the mic and try again.");
      return;
    }
    setTranscribing(true);
    showSpeechHint("Transcribing…");
    try {
      const samples = await blobToWhisperAudio(blob);
      // Recordings with no audible signal at all (muted or disconnected
      // microphone) only make Whisper hallucinate - never guess on those.
      let peak = 0;
      for (let i = 0; i < samples.length; i += 1) {
        peak = Math.max(peak, Math.abs(samples[i]));
      }
      console.info("[attendance-bot] voice recording level (peak):", peak.toFixed(4));
      if (peak < 0.006) {
        showSpeechHint(
          "I didn't hear anything - check your microphone is on and unmuted."
        );
        return;
      }
      // Lift quiet recordings (low-gain microphones) before transcription.
      if (peak < 0.5) {
        const gain = Math.min(0.9 / peak, 20);
        for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
      }
      const asr = await loadWhisperModel();
      const result = await asr(samples);
      const text = String(result?.text ?? "")
        // Drop bracketed annotations ("[BLANK_AUDIO]", "[ Silence ]", ...):
        // those are hallucinations produced for silent input.
        .replace(/\[[^\]]{0,40}\]/g, " ")
        .replace(/\((?:silence|blank audio|inaudible|no speech)\)/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (
        !text ||
        /^(you|thank you\.?|thanks for watching\.?|please subscribe\.?)$/i.test(text)
      ) {
        showSpeechHint("I didn't hear anything - tap the mic and try again.");
        return;
      }
      const base = speechBaseRef.current;
      setInput(base ? `${base} ${text}` : text);
      clearTimeout(speechHintTimerRef.current);
      setSpeechHint("");
    } catch (err) {
      console.warn("[attendance-bot] on-device transcription failed:", err);
      showSpeechHint(
        "Voice transcription didn't work - check your connection and try again."
      );
    } finally {
      setTranscribing(false);
    }
  }

  function toggleListening() {
    if (voiceMode === "whisper") {
      if (transcribing) return;
      if (listening) stopWhisperRecording();
      else if (!busy) startWhisperRecording();
      return;
    }
    if (voiceMode !== "browser") return;
    if (listening) {
      stopListening();
      return;
    }
    if (!recognitionRef.current || busy) return;
    speechBaseRef.current = input.trim();
    speechActiveRef.current = true;
    try {
      recognitionRef.current.start();
      armSpeechWatchdog();
    } catch {
      speechActiveRef.current = false;
      /* already running */
    }
  }

  useEffect(() => {
    if (!BROWSER_SPEECH_OK) return;
    const rec = new SpeechRecognitionClass();
    rec.lang = SPEECH_LANG;
    rec.interimResults = true; // stream words into the box while speaking
    rec.continuous = false; // one utterance per tap
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      clearTimeout(watchdogRef.current);
      setListening(true);
    };
    rec.onresult = (event) => {
      if (!speechActiveRef.current) return;
      let finalText = "";
      let interimText = "";
      for (const result of event.results) {
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      const spoken = `${finalText} ${interimText}`.replace(/\s+/g, " ").trim();
      const base = speechBaseRef.current;
      setInput(spoken ? (base ? `${base} ${spoken}` : spoken) : base);
    };
    rec.onerror = (event) => {
      if (event.error === "aborted") return; // we stopped it on purpose
      clearTimeout(watchdogRef.current);
      if (event.error === "network" || event.error === "service-not-allowed") {
        // The built-in service is unreachable here - use the on-device model.
        useWhisper(
          "This browser's speech service isn't available - switched to on-device voice. Tap the mic and speak."
        );
        return;
      }
      const hints = {
        "not-allowed":
          "Microphone access is blocked - allow it for this site in your browser and try again.",
        "no-speech": "I didn't hear anything - tap the mic and try again.",
        "audio-capture": "No microphone was found on this device.",
      };
      showSpeechHint(
        hints[event.error] || "Voice input didn't work - please try again."
      );
    };
    rec.onend = () => {
      speechActiveRef.current = false;
      clearTimeout(watchdogRef.current);
      setListening(false);
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
      clearTimeout(speechHintTimerRef.current);
      clearInterval(levelTimerRef.current);
      closeLevelCtx();
    };
  }, []);

  // One chat turn. `hidden` skips the user bubble (the login screen sends
  // the introduction silently); `sender` overrides the conversation id (a
  // brand-new conversation still belongs to the signed-in student).
  async function sendMessage(
    raw,
    { hidden = false, sender: senderOverride, intro = false } = {}
  ) {
    const message = raw.trim();
    if (!message || busy) return;
    stopListening(); // sending ends dictation
    setMenuOpen(false);
    const activeSender = senderOverride ?? sender;

    if (!hidden) {
      setMessages((msgs) => [...msgs, { from: "user", text: message, ts: Date.now() }]);
    }
    setBusy(true);
    trackTurn(activeSender, "user", message, hidden ? { hidden: true } : undefined);
    try {
      // An introduction that never reached the backend (it was asleep at
      // sign-in): deliver it now, before this message is interpreted.
      const pending = pendingIntroRef.current;
      if (!intro && pending && pending.sender === activeSender) {
        const catchUp = await fetch(WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sender: activeSender, message: pending.text }),
        });
        if (!catchUp.ok) throw new Error(`HTTP ${catchUp.status}`);
        pendingIntroRef.current = null;
        trackTurn(activeSender, "notice", "introduction re-sent to the live backend", {
          engine: "rasa",
        });
      }
      const res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: activeSender, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const replies = await res.json(); // [{ recipient_id, text }, ...]
      const ts = Date.now();
      setMessages((msgs) => [
        ...msgs,
        ...replies.map((reply) => ({ from: "bot", text: reply.text, ts })),
      ]);
      replies
        .filter((reply) => reply.text)
        .forEach((reply) => trackTurn(activeSender, "bot", reply.text, { engine: "rasa" }));
      setDemoMode(false);
      if (intro) pendingIntroRef.current = null;
    } catch (err) {
      // Backend unreachable (e.g. the hosted Space is parked). Answer from
      // the in-browser demo engine so the page always works: same intents,
      // same response wording, same seeded students.
      trackTurn(
        activeSender,
        "notice",
        `backend unreachable (${err?.message || err}) - answered by the demo engine`,
        { engine: "demo" }
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      const result = demoReply(message, demoStateRef.current.student);
      demoStateRef.current.student = result.student;
      const ts = Date.now();
      setMessages((msgs) => [
        ...msgs,
        ...result.texts.map((text) => ({ from: "bot", text, ts })),
      ]);
      result.texts.forEach((text) =>
        trackTurn(activeSender, "bot", text, { engine: "demo" })
      );
      setDemoMode(true);
      // Remember the introduction so the next live send delivers it first.
      if (intro) pendingIntroRef.current = { sender: activeSender, text: message };
    } finally {
      setBusy(false);
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    const username = loginName.trim();
    const password = loginPassword.trim();
    if (!username || !password || loginBusy) return;

    setLoginBusy(true);
    setLoginError("");

    let account = null;
    try {
      const res = await fetch(AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 400 || res.status === 401) {
        setLoginError("Wrong username or password.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok || !data.first_name || !data.last_name) {
        throw new Error("unexpected login response");
      }
      account = { first: data.first_name, last: data.last_name, via: "server" };
    } catch (err) {
      // Loyal to the chat's fallback: when the backend cannot be reached the
      // same credential rule is checked in the browser (15 demo accounts),
      // so the page still works while the Space is parked.
      const offline = checkCredentials(username, password);
      if (!offline) {
        setLoginError(
          "Wrong username or password. (The live server is unreachable, so this was checked against the offline demo accounts.)"
        );
        return;
      }
      account = { first: offline.first, last: offline.last, via: "offline" };
      setDemoMode(true);
      trackTurn(sender, "notice", `login checked offline (${err?.message || err})`, {
        engine: "demo",
      });
    } finally {
      setLoginBusy(false);
    }

    // Signed in: greet with a system line and introduce the student to the
    // bot silently - from here on the dialogue is exactly the old flow, so
    // the bot already knows who is asking.
    sessionStorage.setItem(K_USER, JSON.stringify(account));
    setUser(account);
    setLoginName("");
    setLoginPassword("");
    setMessages([signedInMessage(account)]);
    sendMessage(`My name is ${account.first} ${account.last}`, {
      hidden: true,
      intro: true,
    });
  }

  function logout() {
    setMenuOpen(false);
    stopListening();
    setSpeechHint("");
    sessionStorage.removeItem(K_USER);
    setUser(null);
    setLoginError("");
    setLoginName("");
    setLoginPassword("");
    setInput("");
    setDemoMode(false);
    demoStateRef.current.student = null;
    pendingIntroRef.current = null;
    // A fresh conversation: the next student must not inherit this one's
    // dialogue state (Rasa keeps the student in the tracker's slots).
    const id = newSenderId();
    localStorage.setItem(K_SENDER, id);
    setSender(id);
    setMessages([]);
    console.info(`[attendance-bot] signed out; new conversation ${id}`);
  }

  function onSubmit(e) {
    e.preventDefault();
    sendMessage(input);
    setInput("");
  }

  function newConversation() {
    setMenuOpen(false);
    stopListening();
    setSpeechHint("");
    const id = newSenderId();
    localStorage.setItem(K_SENDER, id);
    setSender(id);
    setInput("");
    demoStateRef.current.student = null;
    setDemoMode(false);
    if (user) {
      setMessages([signedInMessage(user)]);
      sendMessage(`My name is ${user.first} ${user.last}`, {
        hidden: true,
        sender: id,
        intro: true,
      });
    } else {
      setMessages([]);
    }
    console.info(`[attendance-bot] new conversation ${id}`);
  }

  async function copySender() {
    try {
      await navigator.clipboard.writeText(sender);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable (non-secure context) - the id stays visible */
    }
  }

  return (
    <div className="page">
      <nav className="topbar">
        <div className="brand">
          <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
          <span>Campus Attendance Bot</span>
          <span className="brand-chip">Web Chat</span>
        </div>

        <div className="menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="top-icon-btn"
            aria-label="Options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i className="fa-solid fa-bars" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div className="menu" role="menu" aria-label="Options">
              <p className="menu-label">
                <i className="fa-solid fa-palette" aria-hidden="true" />
                Appearance
              </p>
              <div className="segmented" role="group" aria-label="Theme">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={themePref === t.id}
                    onClick={() => setThemePref(t.id)}
                  >
                    <i className={`fa-solid ${t.icon}`} aria-hidden="true" />
                    {t.label}
                  </button>
                ))}
              </div>

              <p className="menu-label">
                <i className="fa-solid fa-eye" aria-hidden="true" />
                Colour vision
              </p>
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

              {user && (
                <>
                  <hr />

                  <button
                    type="button"
                    className="menu-action"
                    onClick={newConversation}
                    disabled={busy}
                  >
                    <i className="fa-solid fa-rotate-right" aria-hidden="true" />
                    Start a new conversation
                  </button>

                  <hr />

                  <p className="menu-label">
                    <i className="fa-solid fa-user" aria-hidden="true" />
                    Signed in as {user.first} {user.last}
                  </p>
                  <button
                    type="button"
                    className="menu-action"
                    onClick={logout}
                    disabled={busy}
                  >
                    <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
                    Log out
                  </button>
                </>
              )}

              <hr />

              <p className="menu-label">
                <i className="fa-solid fa-fingerprint" aria-hidden="true" />
                Conversation ID
              </p>
              <div className="conv-id">
                <code title={sender}>{sender}</code>
                <button
                  type="button"
                  className={`conv-copy${copied ? " copied" : ""}`}
                  aria-label="Copy conversation ID"
                  onClick={copySender}
                >
                  <i
                    className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`}
                    aria-hidden="true"
                  />
                </button>
              </div>
              <p className="conv-hint">
                Identifies this conversation in the logs — quote it when
                debugging.
              </p>
            </div>
          )}
        </div>
      </nav>

      <div className="layout">
        <aside className="sidebar">
          <p className="group-label">Ask about</p>
          {SIDEBAR_QUESTIONS.map((q) => (
            <button
              key={q.label}
              type="button"
              className="nav-item"
              disabled={busy || !user}
              onClick={() => sendMessage(q.message)}
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
            onClick={newConversation}
          >
            <i className="fa-solid fa-rotate-right" aria-hidden="true" />
            <span>New conversation</span>
          </button>
        </aside>

        <main className="content">
          <div className="content-inner">
            <p className="crumbs">
              <span>React Web Chat</span>
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              <span>Attendance Bot</span>
            </p>

            <h1 className="page-title">Ask the Attendance Bot</h1>

            <p className="lede">
              Log in with your student username and password, then ask about
              your lecture and practical sessions — campus, day, time, subject
              and room.
            </p>

            <div className="badges">
              <span className="badge">
                <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
                Student records
              </span>
              <span className="badge">
                <i className="fa-solid fa-gears" aria-hidden="true" />
                Rasa 3.6
              </span>
              <span className="badge">
                <i className="fa-solid fa-plug" aria-hidden="true" />
                REST channel
              </span>
              <span className="badge">
                <i className="fa-solid fa-database" aria-hidden="true" />
                SQLite / Neon
              </span>
            </div>

            {demoMode && (
              <div className="demo-banner" role="status">
                <i className="fa-solid fa-circle-info" aria-hidden="true" />
                <span>
                  The live Rasa backend isn't reachable right now, so replies
                  come from the <strong>in-browser demo engine</strong> — same
                  intents and replies, with the same student data. It
                  reconnects automatically when the backend is up.
                </span>
              </div>
            )}

            {!user ? (
              <section className="login-card" aria-labelledby="login-title">
                <div className="login-head">
                  <span className="login-icon">
                    <i className="fa-solid fa-lock" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id="login-title">Student login</h2>
                    <p>Sign in to check your lecture and practical sessions.</p>
                  </div>
                </div>

                <form className="login-form" onSubmit={onLogin} autoComplete="off">
                  <label>
                    Username
                    <input
                      value={loginName}
                      onChange={(e) => setLoginName(e.target.value)}
                      placeholder="alicejohnson"
                      autoComplete="username"
                      autoFocus
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="johnsonalice"
                      autoComplete="current-password"
                    />
                  </label>

                  {loginError && (
                    <p className="login-error" role="alert">
                      <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                      {loginError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="login-submit"
                    disabled={loginBusy || !loginName.trim() || !loginPassword.trim()}
                  >
                    {loginBusy ? "Signing in…" : "Sign in"}
                  </button>
                </form>

                <p className="login-hint">
                  Username: first name + last name · password: last name + first
                  name, run together — e.g. <code>alicejohnson</code> /{" "}
                  <code>johnsonalice</code>. Case and spaces are ignored.
                </p>
              </section>
            ) : (
              <>
                <h2 className="section-title">Conversation</h2>

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

                {speechHint && (
                  <p className="speech-hint" role="status">
                    <i className="fa-solid fa-circle-info" aria-hidden="true" />
                    {speechHint}
                  </p>
                )}

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
                      onClick={toggleListening}
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
              </>
            )}

            <footer className="footer">
              Built with Rasa Open Source · React 19 + Vite · SQLite / Neon Postgres
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
