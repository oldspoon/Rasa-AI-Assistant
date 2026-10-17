/* =============================================================================
   In-browser replay of the attendance bot's dialogue.

   Used as a fallback by the web chat when the hosted Rasa backend is not
   reachable (e.g. the Hugging Face Space is parked), so the page always
   answers: the same intents, the same response wording and the same 15
   seeded students as the real stack.

   Kept in sync with deploy/static-space/app.js, which carries the same
   engine for the static demo Space.
   ============================================================================= */

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
  time: /(what time|time is my|when is my|when does|runs from|start time|start and end)/,
  subject: /(subject|studying|module|course|activity)/,
  room: /\b(room|where am i|which room)\b/,
  filler: /^(ok|okay|cool|nice|hmm+|hm|yeah|sure|right|oh|ah|meh|k|np|got it)\.?$/,
};

/**
 * Produce the bot's reply (or replies) for a user message.
 * Returns { texts: string[], student: object|null }.
 */
export function reply(text, student) {
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
 * Offline check of the login screen's credentials - the same rule the live
 * backend applies (rasa/auth_channel.py): username = first+last name,
 * password = last+first name, lowercase, whitespace ignored.
 * Returns the student object on success, otherwise null.
 */
export function checkCredentials(username, password) {
  const u = String(username ?? "").toLowerCase().replace(/\s+/g, "");
  const p = String(password ?? "").toLowerCase().replace(/\s+/g, "");
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
