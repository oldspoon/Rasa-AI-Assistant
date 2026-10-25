/* Offline replay of the bot's dialogue, used when the hosted backend is unreachable.
   Mirrors deploy/static-space/app.js. */
/* Students, each with a weekly lecture and practical (matches the database). */

export const STUDENTS = [
  { first: "Alice", middle: "Marie", last: "Johnson", campus: "Craiglockhart", subject: "Fine Arts",
    lecture: { day: "Monday", time: "10:00-12:00", room: "F14" },
    practical: { day: "Wednesday", time: "13:00-15:00", room: "D28" } },
  { first: "Bob", middle: "James", last: "Smith", campus: "Sighthill", subject: "Computing",
    lecture: { day: "Thursday", time: "14:00-16:00", room: "D75" },
    practical: { day: "Tuesday", time: "11:00-13:00", room: "A94" } },
  { first: "Carol", middle: "Anne", last: "Williams", campus: "Merchiston", subject: "Biology",
    lecture: { day: "Wednesday", time: "12:00-14:00", room: "C31" },
    practical: { day: "Friday", time: "15:00-17:00", room: "C00" } },
  { first: "David", middle: "Lee", last: "Brown", campus: "Craiglockhart", subject: "Fine Arts",
    lecture: { day: "Monday", time: "10:00-12:00", room: "B89" },
    practical: { day: "Thursday", time: "13:00-15:00", room: "B17" } },
  { first: "Emma", middle: "Grace", last: "Jones", campus: "Sighthill", subject: "Computing",
    lecture: { day: "Friday", time: "14:00-16:00", room: "F13" },
    practical: { day: "Tuesday", time: "11:00-13:00", room: "D43" } },
  { first: "Frank", middle: "Thomas", last: "Garcia", campus: "Merchiston", subject: "Biology",
    lecture: { day: "Wednesday", time: "12:00-14:00", room: "C19" },
    practical: { day: "Monday", time: "15:00-17:00", room: "F94" } },
  { first: "Grace", middle: "Louise", last: "Miller", campus: "Craiglockhart", subject: "Fine Arts",
    lecture: { day: "Tuesday", time: "10:00-12:00", room: "E11" },
    practical: { day: "Thursday", time: "13:00-15:00", room: "B97" } },
  { first: "Henry", middle: "Charles", last: "Davis", campus: "Sighthill", subject: "Computing",
    lecture: { day: "Friday", time: "14:00-16:00", room: "C13" },
    practical: { day: "Wednesday", time: "11:00-13:00", room: "E54" } },
  { first: "Isabella", middle: "Rose", last: "Wilson", campus: "Merchiston", subject: "Biology",
    lecture: { day: "Thursday", time: "12:00-14:00", room: "A03" },
    practical: { day: "Monday", time: "15:00-17:00", room: "A48" } },
  { first: "Jack", middle: "Edward", last: "Moore", campus: "Craiglockhart", subject: "Fine Arts",
    lecture: { day: "Tuesday", time: "10:00-12:00", room: "A45" },
    practical: { day: "Friday", time: "13:00-15:00", room: "A27" } },
  { first: "Katie", middle: "Lynn", last: "Taylor", campus: "Sighthill", subject: "Computing",
    lecture: { day: "Monday", time: "14:00-16:00", room: "B64" },
    practical: { day: "Wednesday", time: "11:00-13:00", room: "C77" } },
  { first: "Liam", middle: "Patrick", last: "Anderson", campus: "Merchiston", subject: "Biology",
    lecture: { day: "Thursday", time: "12:00-14:00", room: "C05" },
    practical: { day: "Tuesday", time: "15:00-17:00", room: "E03" } },
  { first: "Mia", middle: "Claire", last: "Thomas", campus: "Craiglockhart", subject: "Fine Arts",
    lecture: { day: "Wednesday", time: "10:00-12:00", room: "E25" },
    practical: { day: "Friday", time: "13:00-15:00", room: "F58" } },
  { first: "Noah", middle: "William", last: "Jackson", campus: "Sighthill", subject: "Computing",
    lecture: { day: "Monday", time: "14:00-16:00", room: "E15" },
    practical: { day: "Thursday", time: "11:00-13:00", room: "F83" } },
  { first: "Olivia", middle: "Faith", last: "White", campus: "Merchiston", subject: "Biology",
    lecture: { day: "Friday", time: "12:00-14:00", room: "F69" },
    practical: { day: "Tuesday", time: "15:00-17:00", room: "D10" } },
];

/* Unpaid parking charges: [first, last, licence plate, issued, fine in pence].
   Same data as PARKING_ARREARS in action_server/database/populate_db.py.
   The campus is always the student's own. */
export const PARKING = [
  ["Alice", "Johnson", "LB21 XQT", "2026-10-14 09:32", 6000],
  ["Carol", "Williams", "SK19 DPN", "2026-10-09 13:05", 5000],
  ["Emma", "Jones", "YH70 RMV", "2026-10-20 16:40", 7000],
  ["Grace", "Miller", "EX68 HLC", "2026-10-02 08:15", 10000],
  ["Isabella", "Wilson", "NU22 KBA", "2026-10-17 11:48", 6000],
  ["Katie", "Taylor", "MA18 TZW", "2026-10-06 14:22", 5000],
  ["Mia", "Thomas", "PO71 GFD", "2026-10-22 10:10", 6000],
  ["Olivia", "White", "RV20 JSE", "2026-10-12 17:03", 7000],
];

// Buttons under the arrears message (the web chat adds a phone icon to the first).
export const PARKING_BUTTONS = [
  { title: "Pay by phone", payload: "/pay_by_phone" },
  { title: "Visit the InfoDesk", payload: "/pay_at_infodesk" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2026-10-14 09:32" -> { year, month, day, time }
function parseIssued(issued) {
  const [date, time] = issued.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day, time };
}

function dateText(year, month, day) {
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

// One month after the charge was issued, clamped to the end of a short month.
function payByDate(year, month, day) {
  const nextMonth = (month % 12) + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return dateText(nextYear, nextMonth, Math.min(day, lastDay));
}

function pounds(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

// Charges for one student, on the campus they attend.
export function parkingFor(student) {
  return PARKING.filter(([first, last]) => first === student.first && last === student.last).map(
    ([, , plate, issued, pence]) => ({
      plate,
      issued,
      pence,
      location: `${student.campus} campus grounds`,
    })
  );
}

function describeArrear(arrear) {
  const { year, month, day, time } = parseIssued(arrear.issued);
  return [
    `**Date:** ${dateText(year, month, day)}`,
    `**Time:** ${time}`,
    `**Vehicle:** ${arrear.plate}`,
    `**Location:** ${arrear.location}`,
    `**Fine owed:** ${pounds(arrear.pence)}`,
    `**Pay by:** ${payByDate(year, month, day)}`,
  ].join("\n");
}

export function arrearsMessage(student) {
  const arrears = parkingFor(student);
  if (!arrears.length) {
    return `Hi ${student.first}! You have no parking arrears. You're all clear.`;
  }
  const noun = arrears.length === 1 ? "a parking charge" : `${arrears.length} parking charges`;
  const blocks = arrears.map(describeArrear).join("\n\n");
  return (
    `Hi ${student.first}! You have ${noun} to pay:\n\n${blocks}\n\n` +
    "You can pay up to a month after a charge was issued. " +
    "After that, charges start to accrue. How would you like to pay?"
  );
}

/* Reply templates (same wording as the live bot). */

export const SAY = {
  welcome:
    "Hello! I'm Octopi, your Campus Attendance Assistant. Welcome to the Campus Attendance System. Ask me about your schedule - lecture or practical days, campus, time, subject or room. If I don't know you yet, tell me your first and last name (e.g. 'My name is Alice Johnson').",
  found: (f, l) =>
    `Great! I found your record, ${f} ${l}. You can now ask me about your schedule. For example: 'What days do I have lectures?', 'What days do I have practicals?', or 'Give me all my schedule details.'`,
  notFound: (f, l) =>
    `I'm sorry, I couldn't find a student with the name ${f} ${l} in our attendance records. Please check your name and try again.`,
  lectureDays: (s) =>
    `Hi ${s.first}! You have a **Lecture** session on **${s.lecture.day}**. Would you like to know more details such as your campus, time, subject, or room?`,
  practicalDays: (s) =>
    `Hi ${s.first}! You have a **Practical** session on **${s.practical.day}**. Would you like to know more details such as your campus, time, subject, or room?`,
  campus: (s) =>
    `${s.first}, your lecture and practical both take place at the **${s.campus}** campus.`,
  time: (s) =>
    `${s.first}, your **Lecture** on **${s.lecture.day}** runs from **${s.lecture.time}** and your **Practical** on **${s.practical.day}** runs from **${s.practical.time}**.`,
  subject: (s) => `${s.first}, your subject is **${s.subject}**.`,
  room: (s) =>
    `${s.first}, your **Lecture** is in room **${s.lecture.room}** and your **Practical** is in room **${s.practical.room}**, both at the **${s.campus}** campus.`,
  fullSchedule: (s) => [
    `Here is the weekly schedule for **${s.first} ${s.last}**:`,
    `**Campus:** ${s.campus}\n**Subject:** ${s.subject}\n\n` +
      ["lecture", "practical"]
        .map(
          (k) =>
            `**${titleCase(k)}**\n**Day:** ${s[k].day}\n**Time:** ${s[k].time}\n**Room:** ${s[k].room}`
        )
        .join("\n\n"),
    "Is there anything else you'd like to know?",
  ],
  guard:
    "It seems I don't have your information yet. Please introduce yourself first by telling me your first name and last name.",
  thanks:
    "You're welcome! Let me know if you need anything else about your schedule.",
  goodbye: "Goodbye! Have a great session on campus!",
  payByPhone:
    "To pay by phone, call the parking payment line on **020 7946 0321**. Have your vehicle's licence plate and the date of the charge ready.",
  visitInfoDesk:
    "To pay in person, visit the **InfoDesk** on your campus. Bring your vehicle's licence plate and the date of the charge.",
  outOfScope:
    "I'm sorry, I can only help with campus attendance and schedule information. Please ask me something related to your timetable.",
  explain:
    "I'm Octopi, the Campus Attendance Assistant - a chatbot that looks up your attendance records. You can ask me about your lecture or practical days, campus, time, subject and room. To get started, tell me your first and last name (e.g. 'My name is Alice Johnson'), then just type or dictate a question like 'What days do I have lectures?', 'What time is my practical?', or 'Give me all my schedule details'.",
  fallback:
    "I didn't quite understand that. You can ask me about your lecture or practical days, campus location, time, subject, or room number.",
};

/* Dialogue engine. */

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
  // e.g. 'my name is john doe', 'this is jane roe here'.
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
  explain:
    /(what can you do|what are you|who are you|what (is|does) this (bot|chatbot|system|app)|how can you help me|how (can|do) i (use|interact with|talk to)|what (kind of )?questions can i ask|what can i ask|explain what you do|tell me about yourself|how does this work|^(help|help me)$)/,
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
  parking: /\b(parking|arrears?)\b/,
  payPhone: /(pay|payment|call).*\bphone\b|\bphone\b.*(pay|payment)/,
  infoDesk: /info ?desk|pay in person|pay at the desk/,
  filler: /^(ok|okay|cool|nice|hmm+|hm|yeah|sure|right|oh|ah|meh|k|np|got it)\.?$/,
};

/** Reply to a user message: { texts, student }. */
export function reply(text, student) {
  const t = normalize(text);
  if (!t) return { texts: [SAY.fallback], student };

  // 1. Known student name: introduction.
  const found = findStudentIn(t);
  if (found) {
    return { texts: [SAY.found(found.first, found.last)], student: found };
  }

  // 2. Unknown name: retry.
  const candidate = parseIntroducedName(t);
  if (candidate) {
    const [f, ...rest] = candidate.split(" ");
    return { texts: [SAY.notFound(f, rest.join(" ") || "")], student: student };
  }

  // 3. Social intents.
  if (RE.explain.test(t)) return { texts: [SAY.explain], student };
  if (RE.goodbye.test(t)) return { texts: [SAY.goodbye], student };
  if (RE.thanks.test(t)) return { texts: [SAY.thanks], student };
  if (RE.greeting.test(t)) return { texts: [SAY.welcome], student };

  // Payment choices after the arrears message (the buttons send /pay_by_phone and /pay_at_infodesk).
  if (RE.payPhone.test(t)) return { texts: [SAY.payByPhone], student };
  if (RE.infoDesk.test(t)) return { texts: [SAY.visitInfoDesk], student };

  // 4. Schedule questions: need a known student.
  const scheduleQuestion =
    RE.parking.test(t) ||
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
    if (RE.parking.test(t)) {
      const owes = parkingFor(student).length > 0;
      return {
        texts: [arrearsMessage(student)],
        student,
        buttons: owes ? PARKING_BUTTONS : undefined,
      };
    }
    if (RE.details.test(t)) {
      return { texts: SAY.fullSchedule(student), student };
    }
    if (RE.lecture.test(t) && (RE.lectureDayish.test(t) || !RE.practical.test(t))) {
      return { texts: [SAY.lectureDays(student)], student };
    }
    if (RE.practical.test(t) && (RE.lectureDayish.test(t) || !RE.lecture.test(t))) {
      return { texts: [SAY.practicalDays(student)], student };
    }
    if (RE.campus.test(t)) return { texts: [SAY.campus(student)], student };
    if (RE.time.test(t)) return { texts: [SAY.time(student)], student };
    if (RE.subject.test(t)) return { texts: [SAY.subject(student)], student };
    if (RE.room.test(t)) return { texts: [SAY.room(student)], student };
  }

  // 5. Fallback.
  if (RE.filler.test(t)) return { texts: [SAY.fallback], student };
  return { texts: [SAY.outOfScope], student };
}

/** Login check, same rule as rasa/auth_channel.py. Returns the student or null. */
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
