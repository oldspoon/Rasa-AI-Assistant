/* In-browser demo: replays the bot offline, with the Neon login for sign-in. */
"use strict";

// Shared with the web chat; copied into shared/ by sync-shared.sh and the deploy script.
import { SAY, STUDENTS, checkCredentials, reply } from "./shared/demoEngine.js";
import { isNoiseTranscript, mergeTranscript, scrubTranscript } from "./shared/transcript.js";
import { peakOf, slice16k as sliceCapture, total16k as totalCapture } from "./shared/pcm.js";
import { attachPcmTap } from "./shared/capture.js";

/* Live login: Neon Function, same contract as rasa/auth_channel.py. */

const AUTH_URL =
  "https://br-empty-violet-b70xbc42-login.compute.c-13.us-east-1.aws.neon.tech/";

async function loginRequest(username, password) {
  try {
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.status === 400 || res.status === 401) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !data.ok || !data.first_name || !data.last_name) {
      throw new Error("unexpected login response");
    }
    return (
      STUDENTS.find(
        (s) => s.first === data.first_name && s.last === data.last_name
      ) ?? checkCredentials(username, password)
    );
  } catch (err) {
    console.info(
      `[campus-demo] login endpoint unreachable (${
        err && err.message ? err.message : err
      }) — checked in the browser`
    );
    return checkCredentials(username, password);
  }
}

/* Chat UI. */

const messagesEl = document.getElementById("messages");
const quickEl = document.getElementById("quick");
const formEl = document.getElementById("chatForm");
const inputEl = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const resetBtn = document.getElementById("resetChat");
const logoutBtn = document.getElementById("logoutBtn");
const loginView = document.getElementById("loginView");
const chatView = document.getElementById("chatView");
const loginForm = document.getElementById("loginForm");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginError = document.getElementById("loginError");
const themeToggle = document.getElementById("themeToggle");
const micBtn = document.getElementById("micBtn");
const speechHint = document.getElementById("speechHint");

let student = null;
let busy = false;
let signedIn = false;

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function appendMessage(from, text) {
  const div = document.createElement("div");
  div.className = `msg msg-${from}`;

  const body = document.createElement("span");
  // Bot replies: **bold** only, the rest is plain text.
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      body.appendChild(strong);
    } else {
      body.appendChild(document.createTextNode(part));
    }
  });
  div.appendChild(body);

  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = fmtTime(Date.now());
  div.appendChild(time);

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "msg msg-bot typing";
  div.innerHTML = "<span></span><span></span><span></span>";
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function renderQuickReplies() {
  const chips = student
    ? [
        "What days do I have lectures?",
        "What days do I have practicals?",
        "Give me all my details",
        "What room am I in?",
      ]
    : [
        "My name is Alice Johnson",
        "I am Bob Smith",
        "My name is Mia Thomas",
        "I am John Doe",
      ];
  quickEl.replaceChildren(
    ...chips.map((label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quick-chip";
      b.textContent = label;
      b.addEventListener("click", () => send(label));
      return b;
    })
  );
}

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
  inputEl.disabled = value;
  micBtn.disabled = value || transcribing;
  resetBtn.disabled = value;
  logoutBtn.disabled = value;
}

function botRespond(texts) {
  const typing = showTyping();
  const baseDelay = 400 + Math.random() * 300;

  const push = (index) => {
    if (index === 0) typing.remove();
    appendMessage("bot", texts[index]);
    if (index + 1 < texts.length) {
      setTimeout(() => push(index + 1), 350);
    } else {
      setBusy(false);
      renderQuickReplies();
      inputEl.focus();
    }
  };

  setTimeout(() => push(0), baseDelay);
}

function send(text) {
  const clean = (text || "").trim();
  if (!clean || busy) return;

  stopListening(); // sending ends dictation
  appendMessage("user", clean);
  inputEl.value = "";
  setBusy(true);

  const result = reply(clean, student);
  student = result.student;
  botRespond(result.texts);
}

function appendSystem(text) {
  const div = document.createElement("div");
  div.className = "msg msg-system";
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function greetSignedIn() {
  appendSystem(`Signed in as ${student.first} ${student.last}`);
  setBusy(true);
  botRespond([SAY.found(student.first, student.last)]);
}

function resetChat() {
  if (!signedIn) return;
  stopListening();
  setBusy(false);
  messagesEl.replaceChildren();
  const hint = document.createElement("div");
  hint.className = "msg msg-system";
  hint.textContent =
    "In-browser replay of the deployed bot — the same intents, replies and 15 seeded students. Only the sign-in check talks to the live database; the chat itself stays in the browser.";
  messagesEl.appendChild(hint);
  greetSignedIn();
}

/* Wiring. */

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  send(inputEl.value);
});

/* Voice input: browser speech, or on-device Whisper where that fails. */

const DEFAULT_PLACEHOLDER = inputEl.placeholder;
const SpeechRecognitionClass =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

// Opera and Firefox lack a usable speech service: use the on-device model.
const IS_OPERA = /OPR\//.test(navigator.userAgent);
const CAN_WHISPER =
  !!(window.AudioContext || window.webkitAudioContext) &&
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
const BROWSER_SPEECH_OK = !!SpeechRecognitionClass && !IS_OPERA;
let voiceMode = BROWSER_SPEECH_OK ? "browser" : CAN_WHISPER ? "whisper" : "none";

const SPEECH_HINT_MS = 6000;
const WHISPER_MODEL = "onnx-community/whisper-base.en";
// Exact commit (see web/src/App.jsx), never 'main'.
const WHISPER_REVISION = "51eefc0af78b103839eda9e7e4f4186acc6517fe";
const WHISPER_CDN =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
const WHISPER_RATE = 16000; // the sample rate the model wants
const LIVE_FIRST_S = 2.2; // first live pass, in seconds of audio
const LIVE_CHUNK_S = 3.5; // audio per later live pass
const LIVE_OVERLAP_S = 0.8; // overlap with the previous pass
const MAX_RECORD_S = 60; // auto-stop limit
const SILENT_PEAK = 0.006; // below this peak: silence

let recognizer = null;
let speechActive = false; // recognizer is running
let wantListen = false; // user wants dictation on
let speechBase = ""; // text before the mic started
let speechHintTimer = 0;
let speechWatchdog = 0;
let committedSpeech = ""; // final text of ended sessions
let sessionFinal = ""; // final words of this session
let sessionInterim = ""; // interim words of this session
let sawSpeechEvent = false; // has the recognizer reacted?
let noSignalRestarts = 0; // restarts without any transcript
let permPoll = 0; // polls for a dead speech service
let transcribing = false;
let recording = false; // on-device capture running?
let capDetach = null; // unhooks the PCM tap
let capBlocks = []; // audio blocks at the context rate
let capRate = WHISPER_RATE;
let capStream = null; // microphone stream
let liveText = ""; // live transcript so far
let liveCovered = 0; // 16 kHz samples already transcribed
let liveBusy = false; // one live pass at a time
let liveStale = false; // final pass owns the box
let recordTimer = 0;
let levelTimer = 0; // mic level watcher
let levelCtx = null; // mic AudioContext
let heardSpeech = false; // any audible sound yet?
let micWarned = false; // silent-mic hint shown?

function showSpeechHint(message) {
  speechHint.textContent = message;
  speechHint.hidden = false;
  clearTimeout(speechHintTimer);
  speechHintTimer = setTimeout(() => {
    speechHint.hidden = true;
  }, SPEECH_HINT_MS);
}

// Stop dictation: the built-in recognizer and the on-device capture.
function stopListening() {
  speechActive = false; // ignore late results
  wantListen = false;
  clearTimeout(speechWatchdog);
  clearInterval(permPoll);
  if (recognizer) {
    try {
      recognizer.stop();
    } catch {
      /* not running */
    }
  }
  if (recording) stopWhisperRecording();
}

// All dictated text so far.
function composeSpeechText() {
  return [speechBase, committedSpeech, sessionFinal, sessionInterim]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

function basePlus(text) {
  return speechBase ? speechBase + " " + text : text;
}

// On-device capture and live transcript.

function total16k() {
  return totalCapture(capBlocks, capRate);
}

// Slice of the recording at 16 kHz.
function slice16k(start16, end16) {
  return sliceCapture(capBlocks, capRate, start16, end16);
}

function releaseCapture() {
  recording = false;
  liveStale = true;
  if (capDetach) {
    try {
      capDetach();
    } catch (e) {
      /* already detached */
    }
    capDetach = null;
  }
  if (capStream) {
    capStream.getTracks().forEach((t) => t.stop());
    capStream = null;
  }
  closeLevelCtx(); // close the mic AudioContext
}

// Transcribe ~3 s slices while speaking, one pass at a time.
async function pumpLiveTranscription() {
  if (liveBusy) return;
  liveBusy = true;
  try {
    while (recording && !liveStale) {
      const asr = await loadWhisperModel().catch(() => null);
      if (!asr) {
        showSpeechHint(
          "Voice transcription didn't work - check your connection and try again."
        );
        return;
      }
      if (!recording || liveStale) return;
      const end = total16k();
      const covered = liveCovered;
      const need = (covered === 0 ? LIVE_FIRST_S : LIVE_CHUNK_S) * WHISPER_RATE;
      if (end - covered < need) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      const from = Math.max(0, covered - LIVE_OVERLAP_S * WHISPER_RATE);
      const samples = slice16k(from, end);
      liveCovered = end;
      // Silent slice: skip it, since Whisper hallucinates on silence.
      if (peakOf(samples) < SILENT_PEAK) continue;
      let text = "";
      try {
        const result = await asr(samples);
        text = scrubTranscript(result && result.text);
      } catch (err) {
        console.info("[campus-demo] live transcription pass failed:", err);
      }
      if (!recording || liveStale) return;
      if (text && !isNoiseTranscript(text)) {
        liveText = mergeTranscript(liveText, text);
        inputEl.value = basePlus(liveText);
      }
    }
  } finally {
    liveBusy = false;
  }
}

/* On-device fallback: Whisper via transformers.js. */

let whisperLibPromise = null;
function loadWhisperLib() {
  // Dynamic import: the dist file is an ES module.
  if (!whisperLibPromise) {
    whisperLibPromise = import(WHISPER_CDN).catch((err) => {
      whisperLibPromise = null; // allow a retry on the next tap
      throw err;
    });
  }
  return whisperLibPromise;
}

let whisperAsrPromise = null;
function loadWhisperModel(onProgress) {
  if (!whisperAsrPromise) {
    whisperAsrPromise = loadWhisperLib()
      .then(({ pipeline, env }) => {
        env.allowLocalModels = false; // fetch the model from the Hub
        return pipeline("automatic-speech-recognition", WHISPER_MODEL, {
          revision: WHISPER_REVISION,
          dtype: "q8",
          device: "wasm",
          progress_callback: (p) => {
            if (onProgress && p && p.status === "progress" && typeof p.progress === "number") {
              onProgress(Math.round(p.progress));
            }
          },
        });
      })
      .catch((err) => {
        whisperAsrPromise = null; // allow a retry on the next tap
        throw err;
      });
  }
  return whisperAsrPromise;
}

function updateMicPlaceholder() {
  inputEl.placeholder = transcribing
    ? "Transcribing…"
    : micBtn.classList.contains("listening")
      ? "Listening…"
      : DEFAULT_PLACEHOLDER;
}

function useWhisper(message) {
  if (!CAN_WHISPER) {
    showSpeechHint(
      "Voice input doesn't work in this browser - please try Chrome, Edge or Safari, or type your question."
    );
    return;
  }
  voiceMode = "whisper";
  if (message) showSpeechHint(message);
}

// Fall back to the on-device model if the speech service never fires an event.
function pollForDeadSpeechService() {
  clearInterval(permPoll);
  const startedAt = Date.now();
  permPoll = setInterval(() => {
    if (!speechActive || sawSpeechEvent || Date.now() - startedAt > 25000) {
      clearInterval(permPoll);
      return;
    }
    if (!(navigator.permissions && navigator.permissions.query)) return;
    navigator.permissions.query({ name: "microphone" }).then(
      (p) => {
        if (!p || p.state !== "granted" || sawSpeechEvent || !speechActive) {
          return;
        }
        clearInterval(permPoll);
        clearTimeout(speechWatchdog);
        speechWatchdog = setTimeout(() => {
          if (!speechActive || sawSpeechEvent) return;
          speechActive = false;
          wantListen = false;
          if (recognizer) {
            try {
              recognizer.abort();
            } catch (e) {
              /* not running */
            }
          }
          micBtn.classList.remove("listening");
          micBtn.setAttribute("aria-pressed", "false");
          updateMicPlaceholder();
          useWhisper(
            "This browser's speech service isn't available - switched to on-device voice. Tap the mic and speak."
          );
        }, 2500);
      },
      () => {}
    );
  }, 800);
}

async function startWhisperRecording() {
  if (transcribing || recording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    // Ask for 16 kHz; the context resamples the mic for us.
    const ctx = new AudioCtx({ sampleRate: WHISPER_RATE });
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    levelCtx = ctx;
    capRate = ctx.sampleRate || WHISPER_RATE;
    capBlocks = [];
    capStream = stream;
    liveText = "";
    liveCovered = 0;
    liveStale = false;
    recording = true;
    speechBase = inputEl.value.trim();

    // Capture off the audio thread, so Whisper cannot drop words.
    capDetach = await attachPcmTap(ctx, source, (block) => {
      if (recording) capBlocks.push(block);
    });

    // Warn while recording if the mic delivers no sound.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    heardSpeech = false;
    micWarned = false;
    const levelBuf = new Float32Array(analyser.fftSize);
    const levelStartedAt = Date.now();
    clearInterval(levelTimer);
    levelTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(levelBuf);
      let peak = 0;
      for (let i = 0; i < levelBuf.length; i += 1) {
        peak = Math.max(peak, Math.abs(levelBuf[i]));
      }
      if (peak > 0.01) {
        if (micWarned) {
          // Sound arrived: clear the warning.
          micWarned = false;
          clearTimeout(speechHintTimer);
          speechHint.hidden = true;
        }
        heardSpeech = true;
      } else if (
        !heardSpeech &&
        Date.now() - levelStartedAt > 1500 &&
        !micWarned
      ) {
        micWarned = true;
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
          : "Downloading the on-device speech model… " + pct + "%"
      )
    ).catch(() => {});
    pumpLiveTranscription();

    micBtn.classList.add("listening");
    micBtn.setAttribute("aria-pressed", "true");
    updateMicPlaceholder();
    clearTimeout(recordTimer);
    recordTimer = setTimeout(stopWhisperRecording, MAX_RECORD_S * 1000);
  } catch (err) {
    releaseCapture();
    showSpeechHint(
      err && err.name === "NotAllowedError"
        ? "Microphone access is blocked - allow it for this site in your browser and try again."
        : "No microphone was found on this device."
    );
  }
}

function stopWhisperRecording() {
  if (!recording) return;
  clearTimeout(recordTimer);
  clearInterval(levelTimer);
  releaseCapture();
  micBtn.classList.remove("listening");
  micBtn.setAttribute("aria-pressed", "false");
  updateMicPlaceholder();
  finalizeRecording();
}

function closeLevelCtx() {
  if (!levelCtx) return;
  try {
    const p = levelCtx.close();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {
    /* already closed */
  }
  levelCtx = null;
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
  transcribing = true;
  micBtn.disabled = true;
  updateMicPlaceholder();
  showSpeechHint("Transcribing…");
  try {
    // Lift quiet recordings (low-gain mics) before transcription.
    if (peak < 0.5) {
      const gain = Math.min(0.9 / peak, 20);
      for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
    }
    const asr = await loadWhisperModel((pct) =>
      showSpeechHint("Downloading the on-device speech model… " + pct + "%")
    );
    const options =
      samples.length > 25 * WHISPER_RATE
        ? { chunk_length_s: 30, stride_length_s: 5 }
        : undefined;
    const result = await asr(samples, options);
    const text = scrubTranscript(result && result.text);
    if (isNoiseTranscript(text)) {
      showSpeechHint("I didn't hear anything - tap the mic and try again.");
      return;
    }
    inputEl.value = basePlus(text);
    clearTimeout(speechHintTimer);
    speechHint.hidden = true;
  } catch (err) {
    console.warn("[attendance-bot] on-device transcription failed:", err);
    showSpeechHint(
      "Voice transcription didn't work - check your connection and try again."
    );
  } finally {
    transcribing = false;
    micBtn.disabled = busy;
    updateMicPlaceholder();
  }
}

/* Wiring. */

if (BROWSER_SPEECH_OK) {
  recognizer = new SpeechRecognitionClass();
  recognizer.lang = "en-US"; // English
  recognizer.interimResults = true; // stream words while speaking
  recognizer.continuous = true; // dictate until tapped again
  recognizer.maxAlternatives = 1;

  recognizer.onstart = () => {
    sawSpeechEvent = true;
    clearTimeout(speechWatchdog);
    micBtn.classList.add("listening");
    micBtn.setAttribute("aria-pressed", "true");
    updateMicPlaceholder();
  };
  recognizer.onresult = (event) => {
    if (!speechActive) return;
    sawSpeechEvent = true;
    noSignalRestarts = 0;
    let finalText = "";
    let interimText = "";
    for (const result of event.results) {
      if (result.isFinal) finalText += result[0].transcript;
      else interimText += result[0].transcript;
    }
    sessionFinal = finalText;
    sessionInterim = interimText;
    inputEl.value = composeSpeechText();
  };
  recognizer.onerror = (event) => {
    sawSpeechEvent = true;
    if (event.error === "aborted") return; // we stopped it
    clearTimeout(speechWatchdog);
    if (event.error === "network" || event.error === "service-not-allowed") {
      wantListen = false;
      // Service unreachable: use the on-device model.
      useWhisper(
        "This browser's speech service isn't available - switched to on-device voice. Tap the mic and speak."
      );
      return;
    }
    if (event.error === "no-speech") return; // onend restarts it
    wantListen = false; // fatal: blocked or no mic
    const hints = {
      "not-allowed":
        "Microphone access is blocked - allow it for this site in your browser and try again.",
      "audio-capture": "No microphone was found on this device.",
    };
    showSpeechHint(
      hints[event.error] || "Voice input didn't work - please try again."
    );
  };
  recognizer.onend = () => {
    clearTimeout(speechWatchdog);
    if (wantListen && speechActive) {
      // Session ended on its own: keep the text, start a new one.
      noSignalRestarts += 1;
      if (noSignalRestarts > 20) {
        speechActive = false;
        wantListen = false;
        micBtn.classList.remove("listening");
        micBtn.setAttribute("aria-pressed", "false");
        updateMicPlaceholder();
        showSpeechHint("I didn't hear anything - tap the mic and try again.");
        return;
      }
      committedSpeech = [committedSpeech, sessionFinal]
        .filter(Boolean)
        .join(" ")
        .trim();
      sessionFinal = "";
      sessionInterim = "";
      inputEl.value = composeSpeechText();
      try {
        recognizer.start();
      } catch (e) {
        speechActive = false;
        wantListen = false;
        micBtn.classList.remove("listening");
        micBtn.setAttribute("aria-pressed", "false");
        updateMicPlaceholder();
      }
      return;
    }
    speechActive = false;
    micBtn.classList.remove("listening");
    micBtn.setAttribute("aria-pressed", "false");
    updateMicPlaceholder();
  };
}

// Show the mic whenever there is any usable voice path.
if (voiceMode !== "none") {
  micBtn.hidden = false;
}

function beginBrowserDictation() {
  speechBase = inputEl.value.trim();
  committedSpeech = "";
  sessionFinal = "";
  sessionInterim = "";
  noSignalRestarts = 0;
  sawSpeechEvent = false;
  speechActive = true;
  wantListen = true;
  try {
    recognizer.start();
  } catch (e) {
    speechActive = false;
    wantListen = false;
    return;
  }
  pollForDeadSpeechService();
}

micBtn.addEventListener("click", () => {
  if (voiceMode === "whisper") {
    if (transcribing) return;
    if (micBtn.classList.contains("listening")) stopWhisperRecording();
    else if (!busy) startWhisperRecording();
    return;
  }
  if (voiceMode !== "browser") return;
  if (micBtn.classList.contains("listening")) {
    stopListening();
    return;
  }
  if (busy) return;
  beginBrowserDictation();
});

const loginSubmit = loginForm.querySelector('button[type="submit"]');

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (loginSubmit.disabled) return;
  loginSubmit.disabled = true;
  loginSubmit.textContent = "Signing in…";
  try {
    const found = await loginRequest(loginUser.value, loginPass.value);
    if (!found) {
      loginError.textContent =
        "Wrong username or password. Username: first name + last name · password: last name + first name — e.g. alicejohnson / johnsonalice.";
      loginError.hidden = false;
      return;
    }
    loginError.hidden = true;
    student = found;
    signedIn = true;
    loginView.hidden = true;
    chatView.hidden = false;
    resetBtn.hidden = false;
    logoutBtn.hidden = false;
    resetChat();
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Sign in";
  }
});

logoutBtn.addEventListener("click", () => {
  stopListening();
  speechHint.hidden = true;
  signedIn = false;
  student = null;
  setBusy(false);
  chatView.hidden = true;
  loginView.hidden = false;
  resetBtn.hidden = true;
  logoutBtn.hidden = true;
  loginUser.value = "";
  loginPass.value = "";
  loginError.hidden = true;
  loginUser.focus();
});

resetBtn.addEventListener("click", resetChat);

function syncThemeToggle() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeToggle.setAttribute(
    "aria-label",
    dark ? "Switch to light mode" : "Switch to dark mode"
  );
}

themeToggle.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("campus-demo-theme", next);
  syncThemeToggle();
});

syncThemeToggle();

/* Initial state: login gate. */

loginUser.focus();
