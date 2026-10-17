/* =============================================================================
   Campus Attendance Bot — in-browser demo.

   A client-side replay of the deployed bot's dialogue: the same intents, the
   same response templates, the same 15 seeded students and the same student
   login rule (username = first+last, password = last+first), so the chat
   works with no server. The sign-in is checked against the live database
   when reachable — a Neon Function endpoint (neon/functions/login/) running
   the same rule as the bot's /auth/login channel (rasa/auth_channel.py); if
   it cannot be reached, the rule is applied in the browser instead. The
   real stack (Rasa 3.6 + rasa-sdk action server + SQLite / Neon Postgres)
   produces identical answers — the transcripts on the main README were
   recorded from it.
   ============================================================================= */
"use strict";

/* --- the seeded cohort (mirrors the attendance database) ------------------- */

const STUDENTS = [
  { first: "Alice", middle: "Marie", last: "Johnson", campus: "Craiglockhart", type: "Lecture", day: "Monday", time: "10:00-12:00", subject: "Fine Arts", room: "F14" },
  { first: "Bob", middle: "James", last: "Smith", campus: "Sighthill", type: "Practical", day: "Tuesday", time: "11:00-13:00", subject: "Computing", room: "A94" },
  { first: "Carol", middle: "Anne", last: "Williams", campus: "Merchiston", type: "Lecture", day: "Wednesday", time: "12:00-14:00", subject: "Biology", room: "C31" },
  { first: "David", middle: "Lee", last: "Brown", campus: "Craiglockhart", type: "Practical", day: "Thursday", time: "13:00-15:00", subject: "Fine Arts", room: "B17" },
  { first: "Emma", middle: "Grace", last: "Jones", campus: "Sighthill", type: "Lecture", day: "Friday", time: "14:00-16:00", subject: "Computing", room: "F13" },
  { first: "Frank", middle: "Thomas", last: "Garcia", campus: "Merchiston", type: "Practical", day: "Monday", time: "15:00-17:00", subject: "Biology", room: "F94" },
  { first: "Grace", middle: "Louise", last: "Miller", campus: "Craiglockhart", type: "Lecture", day: "Tuesday", time: "10:00-12:00", subject: "Fine Arts", room: "E11" },
  { first: "Henry", middle: "Charles", last: "Davis", campus: "Sighthill", type: "Practical", day: "Wednesday", time: "11:00-13:00", subject: "Computing", room: "E54" },
  { first: "Isabella", middle: "Rose", last: "Wilson", campus: "Merchiston", type: "Lecture", day: "Thursday", time: "12:00-14:00", subject: "Biology", room: "A03" },
  { first: "Jack", middle: "Edward", last: "Moore", campus: "Craiglockhart", type: "Practical", day: "Friday", time: "13:00-15:00", subject: "Fine Arts", room: "A27" },
  { first: "Katie", middle: "Lynn", last: "Taylor", campus: "Sighthill", type: "Lecture", day: "Monday", time: "14:00-16:00", subject: "Computing", room: "B64" },
  { first: "Liam", middle: "Patrick", last: "Anderson", campus: "Merchiston", type: "Practical", day: "Tuesday", time: "15:00-17:00", subject: "Biology", room: "E03" },
  { first: "Mia", middle: "Claire", last: "Thomas", campus: "Craiglockhart", type: "Lecture", day: "Wednesday", time: "10:00-12:00", subject: "Fine Arts", room: "E25" },
  { first: "Noah", middle: "William", last: "Jackson", campus: "Sighthill", type: "Practical", day: "Thursday", time: "11:00-13:00", subject: "Computing", room: "F83" },
  { first: "Olivia", middle: "Faith", last: "White", campus: "Merchiston", type: "Lecture", day: "Friday", time: "12:00-14:00", subject: "Biology", room: "F69" },
];

/* --- response templates (verbatim from the live bot) ----------------------- */

const SAY = {
  welcome:
    "Hello! Welcome to the Campus Attendance System. Ask me about your schedule - lecture or practical days, campus, time, subject or room. If I don't know you yet, tell me your first and last name (e.g. 'My name is Alice Johnson').",
  found: (f, l) =>
    `Great! I found your record, ${f} ${l}. You can now ask me about your schedule. For example: 'What days do I have lectures?', 'What days do I have practicals?', or 'Give me all my schedule details.'`,
  notFound: (f, l) =>
    `I'm sorry, I couldn't find a student with the name ${f} ${l} in our attendance records. Please check your name and try again.`,
  lectureDays: (s) =>
    `Hi ${s.first}! You have a **Lecture** session on **${s.day}**. Would you like to know more details such as your campus, time, subject, or room?`,
  lectureDaysButPractical: (s) =>
    `Hi ${s.first}! You do not have any lecture sessions registered - your session on **${s.day}** is a **Practical** session. Ask me about your practical days if you'd like.`,
  practicalDays: (s) =>
    `Hi ${s.first}! You have a **Practical** session on **${s.day}**. Would you like to know more details such as your campus, time, subject, or room?`,
  practicalDaysButLecture: (s) =>
    `Hi ${s.first}! You do not have any practical sessions registered - your session on **${s.day}** is a **Lecture** session. Ask me about your lecture days if you'd like.`,
  campus: (s) =>
    `${s.first}, your session on **${s.day}** takes place at the **${s.campus}** campus.`,
  time: (s) =>
    `${s.first}, your **${s.type}** session on **${s.day}** runs from **${s.time}**.`,
  subject: (s) =>
    `${s.first}, your subject on **${s.day}** is **${s.subject}**.`,
  room: (s) =>
    `${s.first}, your session is in room **${s.room}** at the **${s.campus}** campus.`,
  fullSchedule: (s) => [
    `Here is the full schedule for **${s.first} ${s.last}**:`,
    `**Day:**           ${s.day}\n**Campus:**        ${s.campus}\n**Session type:**  ${s.type}\n**Time:**          ${s.time}\n**Subject:**       ${s.subject}\n**Room:**          ${s.room}`,
    "Is there anything else you'd like to know?",
  ],
  guard:
    "It seems I don't have your information yet. Please introduce yourself first by telling me your first name and last name.",
  thanks:
    "You're welcome! Let me know if you need anything else about your schedule.",
  goodbye: "Goodbye! Have a great session on campus!",
  outOfScope:
    "I'm sorry, I can only help with campus attendance and schedule information. Please ask me something related to your timetable.",
  fallback:
    "I didn't quite understand that. You can ask me about your lecture or practical days, campus location, time, subject, or room number.",
};

/* --- dialogue engine ------------------------------------------------------- */

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findStudentIn(text) {
  for (const s of STUDENTS) {
    const flat = `${s.first} ${s.last}`.toLowerCase();
    const full = `${s.first} ${s.middle} ${s.last}`.toLowerCase();
    if (text.includes(flat) || text.includes(full)) return s;
  }
  return null;
}

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function parseIntroducedName(text) {
  // "my name is john doe", "i am john doe", "this is jane roe here" ...
  const m = text.match(
    /(?:my name is|my name's|name is|name's|\bi am\b|\bi'm\b|\bim\b|\bthis is\b|\bhere\b)\s+([a-z]+(?: [a-z]+){1,2})/
  );
  if (!m) return null;
  const words = m[1].split(" ").slice(0, 3);
  const STOP = ["here", "unknown", "please", "thanks"];
  while (words.length > 2 && STOP.includes(words[words.length - 1])) {
    words.pop();
  }
  return words.map(titleCase).join(" ");
}

const RE = {
  greeting: /\b(hi|hello|hey|yo|howdy|good (morning|afternoon|evening))\b/,
  thanks: /\b(thanks|thank you|thankyou|thx|cheers|much appreciated|appreciated)\b/,
  goodbye: /\b(bye|goodbye|farewell|see you)\b/,
  details:
    /(all (my )?(details|schedule)|full (schedule|details|timetable|info)|everything|complete (schedule|information|details|info)|my full schedule|full information)/,
  lecture: /\blectures?\b/,
  practical: /\bpracticals?\b/,
  lectureDayish: /\b(day|days|when|what)\b/,
  campus:
    /(campus|building|where do i need to go|where is (my|the) (session|class|lecture|practical)|location)/,
  time: /(what time|time is my|when is my|when does|runs from|start time|start and end|what time)/,
  subject: /(subject|studying|module|course|activity)/,
  room: /\b(room|where am i|which room)\b/,
  filler: /^(ok|okay|cool|nice|hmm+|hm|yeah|sure|right|oh|ah|meh|k|np|got it)\.?$/,
};

/**
 * Produce the bot's reply (or replies) for a user message.
 * Returns { texts: string[], student: object|null }.
 */
function reply(text, student) {
  const t = normalize(text);
  if (!t) return { texts: [SAY.fallback], student };

  // 1. A known student's name anywhere in the sentence = an introduction.
  const found = findStudentIn(t);
  if (found) {
    return { texts: [SAY.found(found.first, found.last)], student: found };
  }

  // 2. An introduction phrasing with an unknown name.
  const candidate = parseIntroducedName(t);
  if (candidate) {
    const [f, ...rest] = candidate.split(" ");
    return { texts: [SAY.notFound(f, rest.join(" ") || "")], student: student };
  }

  // 3. Social intents.
  if (RE.goodbye.test(t)) return { texts: [SAY.goodbye], student };
  if (RE.thanks.test(t)) return { texts: [SAY.thanks], student };
  if (RE.greeting.test(t)) return { texts: [SAY.welcome], student };

  // 4. Schedule questions (each needs a student on record first).
  const scheduleQuestion =
    RE.details.test(t) ||
    RE.lecture.test(t) ||
    RE.practical.test(t) ||
    RE.campus.test(t) ||
    RE.time.test(t) ||
    RE.subject.test(t) ||
    RE.room.test(t);

  if (scheduleQuestion && !student) {
    return { texts: [SAY.guard], student };
  }

  if (student) {
    if (RE.details.test(t)) {
      return { texts: SAY.fullSchedule(student), student };
    }
    if (RE.lecture.test(t) && (RE.lectureDayish.test(t) || !RE.practical.test(t))) {
      const text2 =
        student.type === "Lecture"
          ? SAY.lectureDays(student)
          : SAY.lectureDaysButPractical(student);
      return { texts: [text2], student };
    }
    if (RE.practical.test(t) && (RE.lectureDayish.test(t) || !RE.lecture.test(t))) {
      const text2 =
        student.type === "Practical"
          ? SAY.practicalDays(student)
          : SAY.practicalDaysButLecture(student);
      return { texts: [text2], student };
    }
    if (RE.campus.test(t)) return { texts: [SAY.campus(student)], student };
    if (RE.time.test(t)) return { texts: [SAY.time(student)], student };
    if (RE.subject.test(t)) return { texts: [SAY.subject(student)], student };
    if (RE.room.test(t)) return { texts: [SAY.room(student)], student };
  }

  // 5. Neither a question nor an introduction.
  if (RE.filler.test(t)) return { texts: [SAY.fallback], student };
  return { texts: [SAY.outOfScope], student };
}

/**
 * Offline check of the login form's credentials - the same rule the live
 * backend applies (rasa/auth_channel.py): username = first+last name,
 * password = last+first name, lowercase, whitespace ignored.
 * Returns the student object on success, otherwise null.
 */
function checkCredentials(username, password) {
  const u = String(username || "").toLowerCase().replace(/\s+/g, "");
  const p = String(password || "").toLowerCase().replace(/\s+/g, "");
  if (!u || !p) return null;
  for (const s of STUDENTS) {
    if (
      `${s.first}${s.last}`.toLowerCase() === u &&
      `${s.last}${s.first}`.toLowerCase() === p
    ) {
      return s;
    }
  }
  return null;
}

/* --- the live login endpoint -------------------------------------------------
   A Neon Function deployed next to the bot's database (the `users` table),
   with the same request/response contract as the Rasa channel
   (rasa/auth_channel.py). When it is unreachable, the in-browser rule above
   answers instead, so the demo always works. */

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

/* --- chat UI --------------------------------------------------------------- */

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
  // Render the bot's tiny **bold** markdown; everything else is plain text.
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

/* --- wiring ---------------------------------------------------------------- */

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  send(inputEl.value);
});

/* --- voice input (English) --------------------------------------------------
   The browser's built-in speech recognition (Chrome, Edge and Safari ship it;
   Firefox does not, so the mic button stays hidden there). Interim results
   stream into the message box; the final transcript stays for review. */

const DEFAULT_PLACEHOLDER = inputEl.placeholder;
const SpeechRecognitionClass =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

// Opera's Chromium builds ship no speech service (the API exists but no event
// ever fires) and Firefox has no API at all - both use the on-device model.
const IS_OPERA = /OPR\//.test(navigator.userAgent);
const CAN_WHISPER =
  typeof MediaRecorder !== "undefined" &&
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
const BROWSER_SPEECH_OK = !!SpeechRecognitionClass && !IS_OPERA;
let voiceMode = BROWSER_SPEECH_OK ? "browser" : CAN_WHISPER ? "whisper" : "none";

const SPEECH_HINT_MS = 6000;
const WHISPER_MODEL = "onnx-community/whisper-base.en";
const WHISPER_CDN =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

let recognizer = null;
let speechActive = false; // recognition is running / may write to the box
let speechBase = ""; // text already typed when the mic starts
let speechHintTimer = 0;
let speechWatchdog = 0;
let recorder = null;
let recordChunks = [];
let recordStream = null;
let recordTimer = 0;
let transcribing = false;
let levelTimer = 0; // watches the mic level while recording
let levelCtx = null; // analyser context for that watchdog
let heardSpeech = false; // did any audible sound arrive?
let micWarned = false; // "not hearing anything" hint shown?

function showSpeechHint(message) {
  speechHint.textContent = message;
  speechHint.hidden = false;
  clearTimeout(speechHintTimer);
  speechHintTimer = setTimeout(() => {
    speechHint.hidden = true;
  }, SPEECH_HINT_MS);
}

// stop() throws when the recognizer is not running - a no-op for us.
function stopListening() {
  speechActive = false; // late results must not rewrite the box
  clearTimeout(speechWatchdog);
  if (!recognizer) return;
  try {
    recognizer.stop();
  } catch {
    /* not running */
  }
}

/* --- on-device fallback: MediaRecorder + Whisper (transformers.js) -------- */

let whisperLibPromise = null;
function loadWhisperLib() {
  // The published dist file is an ES module - import it dynamically
  // (dynamic import is allowed in a classic script; a <script> tag is not).
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

async function blobToWhisperAudio(blob) {
  const bytes = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } finally {
    if (ctx.close) ctx.close();
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

// The built-in service is dead in some Chromium builds (Opera GX): start()
// returns but no event ever fires. When the microphone is already allowed,
// give it a moment, then fall back to the on-device model.
function armSpeechWatchdog() {
  const arm = (state) => {
    if (state !== "granted") return; // a permission prompt is its own UI
    clearTimeout(speechWatchdog);
    speechWatchdog = setTimeout(() => {
      if (!speechActive) return;
      speechActive = false;
      if (recognizer) {
        try {
          recognizer.abort();
        } catch {
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
  };
  try {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "microphone" }).then(
        (p) => arm(p && p.state),
        () => {}
      );
    }
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
    recorder = rec;
    recordChunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) recordChunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recordStream = null;
      transcribeRecording(
        new Blob(recordChunks, { type: rec.mimeType || "audio/webm" })
      );
    };
    recordStream = stream;
    speechBase = inputEl.value.trim();
    // Watch the input level: tell the user while recording when the
    // microphone delivers nothing (muted, off or the wrong device).
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const actx = new AudioCtx();
    const analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    actx.createMediaStreamSource(stream).connect(analyser);
    levelCtx = actx;
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
          // Sound arrived after all - take the warning back down.
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
    // Fetch and warm up the small speech model while the user speaks.
    loadWhisperModel((pct) =>
      showSpeechHint(
        pct >= 100
          ? "Preparing the on-device speech model…"
          : "Downloading the on-device speech model… " + pct + "%"
      )
    ).catch(() => {});
    rec.start();
    micBtn.classList.add("listening");
    micBtn.setAttribute("aria-pressed", "true");
    updateMicPlaceholder();
    clearTimeout(recordTimer);
    recordTimer = setTimeout(stopWhisperRecording, 30000);
  } catch (err) {
    showSpeechHint(
      err && err.name === "NotAllowedError"
        ? "Microphone access is blocked - allow it for this site in your browser and try again."
        : "No microphone was found on this device."
    );
  }
}

function stopWhisperRecording() {
  clearTimeout(recordTimer);
  clearInterval(levelTimer);
  closeLevelCtx();
  const rec = recorder;
  recorder = null;
  if (rec && rec.state !== "inactive") rec.stop(); // -> transcribeRecording
  micBtn.classList.remove("listening");
  micBtn.setAttribute("aria-pressed", "false");
  updateMicPlaceholder();
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

async function transcribeRecording(blob) {
  if (!blob.size) {
    showSpeechHint("I didn't hear anything - tap the mic and try again.");
    return;
  }
  transcribing = true;
  micBtn.disabled = true;
  updateMicPlaceholder();
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
    const text = String((result && result.text) || "")
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
    inputEl.value = speechBase ? speechBase + " " + text : text;
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

/* --- wiring --------------------------------------------------------------- */

if (BROWSER_SPEECH_OK) {
  recognizer = new SpeechRecognitionClass();
  recognizer.lang = "en-US"; // English
  recognizer.interimResults = true;
  recognizer.continuous = false; // one utterance per tap
  recognizer.maxAlternatives = 1;

  recognizer.onstart = () => {
    clearTimeout(speechWatchdog);
    micBtn.classList.add("listening");
    micBtn.setAttribute("aria-pressed", "true");
    updateMicPlaceholder();
  };
  recognizer.onresult = (event) => {
    if (!speechActive) return;
    let finalText = "";
    let interimText = "";
    for (const result of event.results) {
      if (result.isFinal) finalText += result[0].transcript;
      else interimText += result[0].transcript;
    }
    const spoken = `${finalText} ${interimText}`.replace(/\s+/g, " ").trim();
    inputEl.value = spoken
      ? speechBase
        ? `${speechBase} ${spoken}`
        : spoken
      : speechBase;
  };
  recognizer.onerror = (event) => {
    if (event.error === "aborted") return; // stopped on purpose
    clearTimeout(speechWatchdog);
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
  recognizer.onend = () => {
    speechActive = false;
    clearTimeout(speechWatchdog);
    micBtn.classList.remove("listening");
    micBtn.setAttribute("aria-pressed", "false");
    updateMicPlaceholder();
  };
}

// Show the mic whenever there is any usable voice path.
if (voiceMode !== "none") {
  micBtn.hidden = false;
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
  speechBase = inputEl.value.trim();
  speechActive = true;
  try {
    recognizer.start();
    armSpeechWatchdog();
  } catch {
    speechActive = false;
    /* already running */
  }
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

themeToggle.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("campus-demo-theme", next);
  themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
});

themeToggle.textContent =
  document.documentElement.dataset.theme === "dark" ? "☀️" : "🌙";

/* --- initial state: the login gate (chat opens after sign-in) -------------- */

loginUser.focus();
