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
  micBtn.disabled = value;
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

const SPEECH_HINT_MS = 6000;
let recognizer = null;
let speechActive = false; // recognition is running / may write to the box
let speechBase = ""; // text already typed when the mic starts
let speechHintTimer = 0;

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
  if (!recognizer) return;
  try {
    recognizer.stop();
  } catch {
    /* not running */
  }
}

if (SpeechRecognitionClass) {
  recognizer = new SpeechRecognitionClass();
  recognizer.lang = "en-US"; // English
  recognizer.interimResults = true;
  recognizer.continuous = false; // one utterance per tap
  recognizer.maxAlternatives = 1;

  recognizer.onstart = () => {
    micBtn.classList.add("listening");
    micBtn.setAttribute("aria-pressed", "true");
    inputEl.placeholder = "Listening…";
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
    const hints = {
      "not-allowed":
        "Microphone access is blocked - allow it for this site in your browser and try again.",
      "service-not-allowed": "Speech recognition is blocked in this browser.",
      "no-speech": "I didn't hear anything - tap the mic and try again.",
      "audio-capture": "No microphone was found on this device.",
      network:
        "Speech recognition needs a network connection - check it and try again.",
    };
    showSpeechHint(
      hints[event.error] || "Voice input didn't work - please try again."
    );
  };
  recognizer.onend = () => {
    speechActive = false;
    micBtn.classList.remove("listening");
    micBtn.setAttribute("aria-pressed", "false");
    inputEl.placeholder = DEFAULT_PLACEHOLDER;
  };

  micBtn.hidden = false;
  micBtn.addEventListener("click", () => {
    if (micBtn.classList.contains("listening")) {
      stopListening();
      return;
    }
    if (busy) return;
    speechBase = inputEl.value.trim();
    speechActive = true;
    try {
      recognizer.start();
    } catch {
      speechActive = false;
      /* already running */
    }
  });
}

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
