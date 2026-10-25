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

// Colour-vision palettes (see index.css).
const CVD_MODES = [
  { id: "off", label: "Off", hint: "default colours" },
  { id: "protanopia", label: "Protanopia", hint: "red-blind · blue palette" },
  { id: "deuteranopia", label: "Deuteranopia", hint: "green-blind · purple palette" },
  { id: "tritanopia", label: "Tritanopia", hint: "blue-blind · red palette" },
  { id: "achromatopsia", label: "Achromatopsia", hint: "no colour · greyscale" },
];

// Sidebar shortcuts: common questions, one click each.
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

// Per-browser conversation id (Rasa's tracker key).
function getSender() {
  let id = localStorage.getItem(K_SENDER);
  if (!id) {
    id = newSenderId();
    localStorage.setItem(K_SENDER, id);
  }
  return id;
}

// Signed-in student, kept for the tab so a reload skips the login.
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

// Log each turn under the conversation id (console and localStorage).
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
    // Keep the newest transcripts only.
    Object.keys(localStorage)
      .filter((k) => k.startsWith(K_LOG_PREFIX) && k !== key)
      .sort((a, b) => lastTs(b) - lastTs(a))
      .slice(LOG_MAX_CONVERSATIONS - 1)
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* Tracking must never break the chat. */
  }
}

// Relative /api (Vite proxy). Production sets VITE_RASA_URL.
const WEBHOOK = import.meta.env.VITE_RASA_URL ?? "/api/webhooks/rest/webhook";

// Production: VITE_AUTH_URL (Neon login). Local: Rasa /auth/login.
const AUTH_URL =
  import.meta.env.VITE_AUTH_URL ??
  ((import.meta.env.VITE_RASA_URL
    ? import.meta.env.VITE_RASA_URL.replace(/\/webhooks\/rest\/webhook\/?$/, "")
    : "/api") + "/auth/login");

// Voice input: browser speech, or on-device Whisper where that fails.
// Dictation fills the box; Send is manual. VITE_SPEECH_LANG sets the language.
const SpeechRecognitionClass =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;
const SPEECH_LANG = import.meta.env.VITE_SPEECH_LANG ?? "en-US";

// Opera's Chromium has no speech service: go straight to the on-device model.
const IS_OPERA = /OPR\//.test(navigator.userAgent);
const CAN_WHISPER =
  !!(window.AudioContext || window.webkitAudioContext) &&
  !!navigator.mediaDevices?.getUserMedia;
const BROWSER_SPEECH_OK = !!SpeechRecognitionClass && !IS_OPERA;

// English-only, quantized (~50 MB, cached after first use).
const WHISPER_MODEL = "onnx-community/whisper-base.en";

const WHISPER_RATE = 16000; // the sample rate the model wants
const LIVE_FIRST_S = 2.2; // audio before the first live transcription pass
const LIVE_CHUNK_S = 3.5; // audio per later live pass
const LIVE_OVERLAP_S = 0.8; // re-listen to a little already-covered audio
const MAX_RECORD_S = 60; // dictation stops by itself after this long
const SILENT_PEAK = 0.006; // below this peak the recording counts as silence

// Loaded on first use (lazy chunk), then kept in memory.
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

// Drop Whisper's silence hallucinations ('[BLANK_AUDIO]', 'thank you').
function scrubTranscript(raw) {
  return String(raw ?? "")
    .replace(/\[[^\]]{0,40}\]/g, " ")
    .replace(/\((?:silence|blank audio|inaudible|no speech)\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoiseTranscript(text) {
  return (
    !text ||
    /^(you|thank you\.?|thanks for watching\.?|please subscribe\.?)$/i.test(text)
  );
}

function peakOf(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

// Join a pass onto the committed text, skipping overlapped words.
function mergeTranscript(committed, addition) {
  const a = committed.trim() ? committed.trim().split(/\s+/) : [];
  const b = addition.trim() ? addition.trim().split(/\s+/) : [];
  if (!a.length) return b.join(" ");
  if (!b.length) return a.join(" ");
  const max = Math.min(a.length, b.length, 12);
  for (let k = max; k > 0; k -= 1) {
    if (
      a.slice(a.length - k).join(" ").toLowerCase() ===
      b.slice(0, k).join(" ").toLowerCase()
    ) {
      return [...a, ...b.slice(k)].join(" ");
    }
  }
  return [...a, ...b].join(" ");
}

// AudioWorklet keeps capture off the main thread. ScriptProcessor is the fallback.
const CAPTURE_WORKLET_SOURCE = `
class DictationCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(2048);
    this._n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i += 1) {
        this._buf[this._n++] = ch[i];
        if (this._n === this._buf.length) {
          this.port.postMessage(this._buf.slice(0));
          this._n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("dictation-capture", DictationCapture);
`;

let captureWorkletUrl = null;
function getCaptureWorkletUrl() {
  if (!captureWorkletUrl) {
    captureWorkletUrl = URL.createObjectURL(
      new Blob([CAPTURE_WORKLET_SOURCE], { type: "application/javascript" })
    );
  }
  return captureWorkletUrl;
}

// Returns a function that detaches the tap.
async function attachPcmTap(ctx, sourceNode, onBlock) {
  // Muted gain: pulls audio through, never played.
  const silent = ctx.createGain();
  silent.gain.value = 0;
  if (ctx.audioWorklet) {
    try {
      await ctx.audioWorklet.addModule(getCaptureWorkletUrl());
      const node = new AudioWorkletNode(ctx, "dictation-capture");
      node.port.onmessage = (e) => onBlock(e.data);
      sourceNode.connect(node);
      node.connect(silent);
      silent.connect(ctx.destination);
      return () => {
        node.port.onmessage = null;
        try {
          sourceNode.disconnect(node);
          node.disconnect(silent);
          silent.disconnect();
        } catch {
          /* already detached */
        }
      };
    } catch (err) {
      console.info(
        "[attendance-bot] AudioWorklet capture unavailable, using ScriptProcessor:",
        err
      );
    }
  }
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) =>
    onBlock(new Float32Array(e.inputBuffer.getChannelData(0)));
  sourceNode.connect(node);
  node.connect(silent);
  silent.connect(ctx.destination);
  return () => {
    node.onaudioprocess = null;
    try {
      sourceNode.disconnect(node);
      node.disconnect(silent);
      silent.disconnect();
    } catch {
      /* already detached */
    }
  };
}

// Box-average downsampling, only when the context refuses 16 kHz.
function downsample16k(raw, ratio) {
  const outLen = Math.max(1, Math.floor(raw.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const start = i * ratio;
    const end = Math.min(raw.length, start + ratio);
    let sum = 0;
    let n = 0;
    for (let j = Math.floor(start); j < end; j += 1) {
      sum += raw[j];
      n += 1;
    }
    out[i] = n ? sum / n : 0;
  }
  return out;
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
  // Appearance and accessibility (saved).
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

  // Login.
  const [user, setUser] = useState(readStoredUser);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  // Chat.
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
  // Sign-in introduction, resent first if the backend missed it.
  const pendingIntroRef = useRef(null);

  // Voice input state.
  const [listening, setListening] = useState(false);
  const [speechHint, setSpeechHint] = useState("");
  const recognitionRef = useRef(null);
  const speechActiveRef = useRef(false); // recognition is running / may write
  const wantListenRef = useRef(false); // the user wants dictation to continue
  const speechBaseRef = useRef(""); // text already typed when the mic starts
  const speechHintTimerRef = useRef(null);
  // "browser" = built-in speech, "whisper" = on-device, "none" = unsupported.
  const [voiceMode, setVoiceMode] = useState(
    BROWSER_SPEECH_OK ? "browser" : CAN_WHISPER ? "whisper" : "none"
  );
  const [transcribing, setTranscribing] = useState(false);
  const watchdogRef = useRef(null);
  // Built-in recognition: text committed across the sessions the service
  // ends on its own (dictation restarts to keep listening until stopped).
  const committedRef = useRef(""); // final text of sessions that already ended
  const sessionFinalRef = useRef(""); // final results of the running session
  const sessionInterimRef = useRef(""); // interim words of the running session
  const sawSpeechEventRef = useRef(false); // did the recognizer ever react?
  const noSignalRestartsRef = useRef(0); // restarts with no transcript yet
  const permPollRef = useRef(null); // watches for a dead speech service
  // On-device model: raw PCM capture + live transcription passes.
  const capDetachRef = useRef(null); // unhooks the PCM tap
  const capBlocksRef = useRef([]); // Float32Array blocks at the context rate
  const capRateRef = useRef(WHISPER_RATE);
  const capStreamRef = useRef(null); // the microphone stream being captured
  const recordingRef = useRef(false); // on-device capture running?
  const liveTextRef = useRef(""); // transcript of the live passes so far
  const liveCoveredRef = useRef(0); // 16 kHz samples already live-transcribed
  const liveBusyRef = useRef(false); // one live pass at a time
  const liveStaleRef = useRef(false); // stop/final pass owns the box now
  const recordTimerRef = useRef(null);
  const levelTimerRef = useRef(null); // watches the mic level while recording
  const audioCtxRef = useRef(null); // the mic AudioContext (analyser + capture)
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

  // Voice input.
  function showSpeechHint(message) {
    setSpeechHint(message);
    clearTimeout(speechHintTimerRef.current);
    speechHintTimerRef.current = setTimeout(() => setSpeechHint(""), 6000);
  }

  function basePlus(text) {
    const base = speechBaseRef.current;
    return base ? `${base} ${text}` : text;
  }

  // All dictated text so far.
  function composeSpeechText() {
    return [
      speechBaseRef.current,
      committedRef.current,
      sessionFinalRef.current,
      sessionInterimRef.current,
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  }

  // Stop dictation: the built-in recognizer and the on-device capture.
  function stopListening() {
    speechActiveRef.current = false; // late results must not rewrite the box
    wantListenRef.current = false;
    clearTimeout(watchdogRef.current);
    clearInterval(permPollRef.current);
    try {
      recognitionRef.current?.stop();
    } catch {
      /* not running */
    }
    if (recordingRef.current) stopWhisperRecording();
  }

  // Switch to the on-device model when built-in voice is unusable.
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

  // Fall back to the on-device model if the speech service never fires an event.
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
      navigator.permissions
        ?.query?.({ name: "microphone" })
        .then((p) => {
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
            useWhisper(
              "This browser's speech service isn't available - switched to on-device voice. Tap the mic and speak."
            );
          }, 2500);
        }, () => {});
    }, 800);
  }

  // On-device capture and live transcript.

  function rawLength() {
    let n = 0;
    for (const block of capBlocksRef.current) n += block.length;
    return n;
  }

  function total16k() {
    return Math.floor(rawLength() / (capRateRef.current / WHISPER_RATE));
  }

  // Copy [startRaw, endRaw) out of the captured blocks.
  function gatherRaw(startRaw, endRaw) {
    const out = new Float32Array(Math.max(0, endRaw - startRaw));
    let blockStart = 0;
    let offset = 0;
    for (const block of capBlocksRef.current) {
      const blockEnd = blockStart + block.length;
      if (blockEnd > startRaw && blockStart < endRaw) {
        const from = Math.max(0, startRaw - blockStart);
        const to = Math.min(block.length, endRaw - blockStart);
        out.set(block.subarray(from, to), offset);
        offset += to - from;
      }
      blockStart = blockEnd;
      if (blockStart >= endRaw) break;
    }
    return out.subarray(0, offset);
  }

  // Slice of the recording at 16 kHz.
  function slice16k(start16, end16) {
    const rate = capRateRef.current;
    if (rate === WHISPER_RATE) return gatherRaw(start16, end16);
    const ratio = rate / WHISPER_RATE;
    return downsample16k(
      gatherRaw(Math.floor(start16 * ratio), Math.ceil(end16 * ratio)),
      ratio
    );
  }

  function releaseCapture() {
    recordingRef.current = false;
    liveStaleRef.current = true;
    if (capDetachRef.current) {
      try {
        capDetachRef.current();
      } catch {
        /* already detached */
      }
      capDetachRef.current = null;
    }
    if (capStreamRef.current) {
      capStreamRef.current.getTracks().forEach((t) => t.stop());
      capStreamRef.current = null;
    }
    closeLevelCtx(); // closes the shared microphone AudioContext
  }

  // Transcribe ~3 s slices while speaking, one pass at a time.
  async function pumpLiveTranscription() {
    if (liveBusyRef.current) return;
    liveBusyRef.current = true;
    try {
      while (recordingRef.current && !liveStaleRef.current) {
        const asr = await loadWhisperModel().catch(() => null);
        if (!asr) {
          showSpeechHint(
            "Voice transcription didn't work - check your connection and try again."
          );
          return;
        }
        if (!recordingRef.current || liveStaleRef.current) return;
        const end = total16k();
        const covered = liveCoveredRef.current;
        const need =
          (covered === 0 ? LIVE_FIRST_S : LIVE_CHUNK_S) * WHISPER_RATE;
        if (end - covered < need) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        const from = Math.max(0, covered - LIVE_OVERLAP_S * WHISPER_RATE);
        const samples = slice16k(from, end);
        liveCoveredRef.current = end;
        // Silent slice: skip it, since Whisper hallucinates on silence.
        if (peakOf(samples) < SILENT_PEAK) continue;
        let text = "";
        try {
          const result = await asr(samples);
          text = scrubTranscript(result?.text);
        } catch (err) {
          console.info("[attendance-bot] live transcription pass failed:", err);
        }
        if (!recordingRef.current || liveStaleRef.current) return;
        if (text && !isNoiseTranscript(text)) {
          liveTextRef.current = mergeTranscript(liveTextRef.current, text);
          setInput(basePlus(liveTextRef.current));
        }
      }
    } finally {
      liveBusyRef.current = false;
    }
  }

  async function startWhisperRecording() {
    if (transcribing || recordingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      // Ask for 16 kHz; the context resamples the mic for us.
      const ctx = new AudioCtx({ sampleRate: WHISPER_RATE });
      if (ctx.state === "suspended" && ctx.resume) ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      audioCtxRef.current = ctx;
      capRateRef.current = ctx.sampleRate || WHISPER_RATE;
      capBlocksRef.current = [];
      capStreamRef.current = stream;
      liveTextRef.current = "";
      liveCoveredRef.current = 0;
      liveStaleRef.current = false;
      recordingRef.current = true;
      speechBaseRef.current = input.trim();

      // Capture off the audio thread, so Whisper cannot drop words.
      capDetachRef.current = await attachPcmTap(ctx, source, (block) => {
        if (recordingRef.current) capBlocksRef.current.push(block);
      });

      // Warn while recording if the mic delivers no sound.
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
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
            // Sound arrived: clear the warning.
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

      // Warm up the speech model while the user speaks.
      loadWhisperModel((pct) =>
        showSpeechHint(
          pct >= 100
            ? "Preparing the on-device speech model…"
            : `Downloading the on-device speech model… ${pct}%`
        )
      ).catch(() => {});
      pumpLiveTranscription();

      setListening(true);
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = setTimeout(stopWhisperRecording, MAX_RECORD_S * 1000);
    } catch (err) {
      releaseCapture();
      showSpeechHint(
        err?.name === "NotAllowedError"
          ? "Microphone access is blocked - allow it for this site in your browser and try again."
          : "No microphone was found on this device."
      );
    }
  }

  function stopWhisperRecording() {
    if (!recordingRef.current) return;
    clearTimeout(recordTimerRef.current);
    clearInterval(levelTimerRef.current);
    releaseCapture();
    setListening(false);
    finalizeRecording();
  }

  // Final pass: one clean transcript replaces the live text.
  async function finalizeRecording() {
    const samples = slice16k(0, total16k());
    if (!samples.length) {
      showSpeechHint("I didn't hear anything - tap the mic and try again.");
      return;
    }
    const peak = peakOf(samples);
    console.info("[attendance-bot] voice recording level (peak):", peak.toFixed(4));
    if (peak < SILENT_PEAK) {
      showSpeechHint(
        "I didn't hear anything - check your microphone is on and unmuted."
      );
      return;
    }
    setTranscribing(true);
    showSpeechHint("Transcribing…");
    try {
      // Lift quiet recordings (low-gain mics) before transcription.
      if (peak < 0.5) {
        const gain = Math.min(0.9 / peak, 20);
        for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
      }
      const asr = await loadWhisperModel((pct) =>
        showSpeechHint(`Downloading the on-device speech model… ${pct}%`)
      );
      const options =
        samples.length > 25 * WHISPER_RATE
          ? { chunk_length_s: 30, stride_length_s: 5 }
          : undefined;
      const result = await asr(samples, options);
      const text = scrubTranscript(result?.text);
      if (isNoiseTranscript(text)) {
        showSpeechHint("I didn't hear anything - tap the mic and try again.");
        return;
      }
      setInput(basePlus(text));
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

  function beginBrowserDictation() {
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
    beginBrowserDictation();
  }

  useEffect(() => {
    if (!BROWSER_SPEECH_OK) return;
    const rec = new SpeechRecognitionClass();
    rec.lang = SPEECH_LANG;
    rec.interimResults = true; // stream words into the box while speaking
    rec.continuous = true; // keep dictating until the mic is tapped again
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      sawSpeechEventRef.current = true;
      clearTimeout(watchdogRef.current);
      setListening(true);
    };
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
      if (event.error === "aborted") return; // we stopped it on purpose
      clearTimeout(watchdogRef.current);
      if (event.error === "network" || event.error === "service-not-allowed") {
        wantListenRef.current = false;
        // Service unreachable: use the on-device model.
        useWhisper(
          "This browser's speech service isn't available - switched to on-device voice. Tap the mic and speak."
        );
        return;
      }
      if (event.error === "no-speech") return; // silence; onend restarts it
      wantListenRef.current = false; // fatal: mic blocked or no device
      const hints = {
        "not-allowed":
          "Microphone access is blocked - allow it for this site in your browser and try again.",
        "audio-capture": "No microphone was found on this device.",
      };
      showSpeechHint(
        hints[event.error] || "Voice input didn't work - please try again."
      );
    };
    rec.onend = () => {
      clearTimeout(watchdogRef.current);
      if (wantListenRef.current && speechActiveRef.current) {
        // Session ended on its own: keep the text, start a new one.
        noSignalRestartsRef.current += 1;
        if (noSignalRestartsRef.current > 20) {
          speechActiveRef.current = false;
          wantListenRef.current = false;
          setListening(false);
          showSpeechHint("I didn't hear anything - tap the mic and try again.");
          return;
        }
        committedRef.current = [committedRef.current, sessionFinalRef.current]
          .filter(Boolean)
          .join(" ")
          .trim();
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
        return;
      }
      speechActiveRef.current = false;
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
      clearInterval(permPollRef.current);
      clearTimeout(speechHintTimerRef.current);
      clearInterval(levelTimerRef.current);
      liveStaleRef.current = true;
      recordingRef.current = false;
      if (capDetachRef.current) {
        try {
          capDetachRef.current();
        } catch {
          /* already detached */
        }
        capDetachRef.current = null;
      }
      if (capStreamRef.current) {
        capStreamRef.current.getTracks().forEach((t) => t.stop());
        capStreamRef.current = null;
      }
      closeLevelCtx();
    };
  }, []);

  // One chat turn. hidden: no bubble. sender: overrides the conversation id.
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
      // Deliver a sign-in introduction that never reached the backend.
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
      // Backend unreachable: answer from the in-browser demo engine.
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
      // Queue the introduction for the next live send.
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
      // Backend unreachable: check the credentials in the browser.
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

    // Signed in: greet, then introduce the student to the bot silently.
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
    // New conversation: drop the previous dialogue state.
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
      /* No clipboard here (non-secure context). */
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
