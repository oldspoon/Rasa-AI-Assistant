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

export const TEACHERS = {
  "Fine Arts": {
    first: "Margaret", last: "Ellison", room: "C214", campus: "Craiglockhart",
    email: "margaret.ellison@napier.ac.uk", phone: "0131 496 0142",
    hours: {
      Monday: "10:00-12:00", Tuesday: "14:00-16:00", Wednesday: "10:00-12:00",
      Thursday: "14:00-16:00", Friday: "10:00-12:00",
    },
  },
  Computing: {
    first: "Daniel", last: "Fraser", room: "D108", campus: "Sighthill",
    email: "daniel.fraser@napier.ac.uk", phone: "0131 496 0187",
    hours: {
      Monday: "13:00-15:00", Tuesday: "10:00-12:00", Wednesday: "13:00-15:00",
      Thursday: "10:00-12:00", Friday: "13:00-15:00",
    },
  },
  Biology: {
    first: "Priya", last: "Raman", room: "B117", campus: "Merchiston",
    email: "priya.raman@napier.ac.uk", phone: "0131 496 0163",
    hours: {
      Monday: "11:00-13:00", Tuesday: "15:00-17:00", Wednesday: "11:00-13:00",
      Thursday: "15:00-17:00", Friday: "11:00-13:00",
    },
  },
};

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const BOOKINGS = new Map();

export function resetBookings() {
  BOOKINGS.clear();
  resetLoans();
  resetSupport();
}

export function teacherFor(student) {
  return TEACHERS[student.subject];
}

export const LIBRARIES = [
  { campus: "Merchiston", name: "Merchiston Library", location: "East Wing, first floor", room: "E105", hours: "Mon-Fri 08:30-20:00" },
  { campus: "Sighthill", name: "Sighthill Library", location: "Learning Centre, ground floor", room: "L012", hours: "Mon-Fri 08:30-19:00" },
  { campus: "Craiglockhart", name: "Craiglockhart Library", location: "Main Building, second floor", room: "M221", hours: "Mon-Fri 09:00-18:30" },
];

export const BOOKS = {
  "Fine Arts": [
    ["The Story of Art", "E. H. Gombrich"],
    ["Lives of the Artists", "Giorgio Vasari"],
    ["Ways of Seeing", "John Berger"],
    ["Interaction of Color", "Josef Albers"],
    ["The Art of Color", "Johannes Itten"],
  ],
  Computing: [
    ["The C Programming Language", "Brian W. Kernighan and Dennis M. Ritchie"],
    ["Structure and Interpretation of Computer Programs", "Harold Abelson and Gerald Jay Sussman"],
    ["The Art of Computer Programming", "Donald E. Knuth"],
    ["Introduction to Algorithms", "Thomas H. Cormen et al."],
    ["The Mythical Man-Month", "Frederick P. Brooks Jr."],
  ],
  Biology: [
    ["On the Origin of Species", "Charles Darwin"],
    ["The Double Helix", "James D. Watson"],
    ["The Selfish Gene", "Richard Dawkins"],
    ["Silent Spring", "Rachel Carson"],
    ["What Is Life?", "Erwin Schrodinger"],
  ],
};

export const LOANS = [
  [0, 1, "In person", "2026-09-01", "2026-09-29", null, "CRA-1042"],
  [2, 2, "In person", "2026-10-05", "2026-11-02", null, "MER-2210"],
  [4, 3, "In person", "2026-08-25", "2026-09-22", null, "SIG-3377"],
  [1, 1, "In person", "2026-11-03", "2026-12-01", null, "SIG-4086"],
  [3, 2, "Digital", "2026-11-02", "2026-11-30", null, null],
  [6, 4, "In person", "2026-07-14", "2026-08-11", "2026-08-10", "CRA-5120"],
];

const LOAN_DAYS = 28;
const HOLD_DAYS = 3;
const FINE_PENCE_PER_MONTH = 500;
const MONTH_DAYS = 30;
const DAY_MS = 86400000;

const NEW_LOANS = [];

export function resetLoans() {
  NEW_LOANS.length = 0;
}

function dayNumber(value) {
  if (value instanceof Date) {
    return Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS);
  }
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function isoOf(days) {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

function longDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return dateText(year, month, day);
}

function libraryFor(campus) {
  return LIBRARIES.find((lib) => lib.campus === campus);
}

function loansFor(student) {
  const index = STUDENTS.indexOf(student);
  const seeded = LOANS.filter(([who]) => who === index).map(
    ([, number, format, borrowed, due, returned, code]) => ({
      number, format, borrowed, due, returned, code,
    })
  );
  const added = NEW_LOANS.filter((loan) => loan.student === student);
  return [...seeded, ...added].filter((loan) => !loan.returned);
}

function currentLoans(loans, today) {
  return loans.filter(
    (loan) => !(loan.format === "Digital" && dayNumber(loan.due) < dayNumber(today))
  );
}

export function overdueDays(due, today) {
  return Math.max(0, dayNumber(today) - dayNumber(due));
}

export function fineFor(loan, today) {
  if (loan.format !== "In person" || loan.returned) return 0;
  return Math.ceil(overdueDays(loan.due, today) / MONTH_DAYS) * FINE_PENCE_PER_MONTH;
}

function borrowPayload(number, format) {
  const entities = { book: String(number) };
  if (format) entities.format = format === "Digital" ? "digital" : "in person";
  return `/borrow_book${JSON.stringify(entities)}`;
}

function bookOf(student, number) {
  const entry = BOOKS[student.subject][number - 1];
  return entry ? { title: entry[0], author: entry[1], number } : null;
}

function booksButtons() {
  return [1, 2, 3, 4, 5].map((n) => ({ title: `Borrow book ${n}`, payload: borrowPayload(n) }));
}

function formatButtons(number) {
  return [
    { title: "Borrow digitally", payload: borrowPayload(number, "Digital") },
    { title: "Collect in person", payload: borrowPayload(number, "In person") },
  ];
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };

function parseBook(t) {
  const named = t.match(/\b(?:book|number|no)\s*(\d{1,2})\b/);
  if (named) return Number(named[1]);
  const bare = t.match(/\b(\d{1,2})\b/);
  if (bare) return Number(bare[1]);
  for (const [word, number] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) return number;
  }
  return null;
}

function parseFormat(t) {
  if (/(digital|online|e-?book|electronic)/.test(t)) return "Digital";
  if (/(person|collect|physical|pick|paper|print|hard)/.test(t)) return "In person";
  return null;
}

function newPickupCode(campus) {
  const used = new Set([
    ...LOANS.map((row) => row[6]),
    ...NEW_LOANS.map((loan) => loan.code),
  ]);
  for (;;) {
    const code = `${campus.slice(0, 3).toUpperCase()}-${1000 + Math.floor(Math.random() * 9000)}`;
    if (!used.has(code)) return code;
  }
}

function describeLoan(student, loan, today) {
  const book = bookOf(student, loan.number);
  const library = libraryFor(student.campus);
  const lines = [
    `**Book:** ${book.title} by ${book.author}`,
    `**Format:** ${loan.format}`,
    `**Borrowed:** ${longDate(loan.borrowed)}`,
    `**Return by:** ${longDate(loan.due)}`,
  ];
  if (loan.format === "In person") {
    lines.push(`**Return to:** ${library.name}, room ${library.room}`);
    if (loan.code) lines.push(`**Collection code:** ${loan.code}`);
  }
  const late = overdueDays(loan.due, today);
  const left = dayNumber(loan.due) - dayNumber(today);
  if (loan.format === "Digital") {
    lines.push(`**Status:** Returns by itself in ${left} days`);
  } else if (late) {
    lines.push(`**Status:** Overdue by ${late} days`);
    lines.push(`**Fine owed:** ${pounds(fineFor(loan, today))}`);
  } else {
    lines.push(`**Status:** ${left} days left`);
  }
  return lines.join("\n");
}

function loansReply(student, today) {
  const loans = currentLoans(loansFor(student), today);
  if (!loans.length) {
    return {
      texts: [`Hi ${student.first}! You have no borrowed books and no library fines. You're all clear.`],
      student,
    };
  }
  const noun = loans.length === 1 ? "a borrowed book" : `${loans.length} borrowed books`;
  const blocks = loans.map((loan) => describeLoan(student, loan, today)).join("\n\n");
  const total = loans.reduce((sum, loan) => sum + fineFor(loan, today), 0);
  const ending = total
    ? `**Total fines:** ${pounds(total)}\n\nLate books are fined ${pounds(FINE_PENCE_PER_MONTH)} for each month (or part of a month) overdue. Return the book to its library desk and pay the fine there.`
    : "You have no library fines. Return in-person books on time to keep it that way.";
  return {
    texts: [`Hi ${student.first}! You have ${noun}:\n\n${blocks}\n\n${ending}`],
    student,
    buttons: total ? [{ title: "Where is the library?", payload: "/ask_library_location" }] : undefined,
  };
}

function librariesReply(student) {
  const blocks = LIBRARIES.map(
    (lib) =>
      `**${lib.name}** (${lib.campus} campus)\n**Where:** ${lib.location}\n**Room:** ${lib.room}\n**Open:** ${lib.hours}`
  ).join("\n\n");
  return {
    texts: [`Here is where to find the library on each campus:\n\n${blocks}\n\nSay 'recommend books' to see five books for your subject.`],
    student,
    buttons: [{ title: "Recommend books", payload: "/ask_books" }],
  };
}

function booksReply(student) {
  const lines = BOOKS[student.subject]
    .map(([title, author], i) => `**${i + 1}.** ${title} by ${author}`)
    .join("\n");
  return {
    texts: [
      `Hi ${student.first}! Here are 5 books for **${student.subject}**:\n\n${lines}\n\nChoose a number to borrow a book. You can borrow it digitally here in the chat, or collect it in person from your campus library.`,
    ],
    student,
    buttons: booksButtons(),
  };
}

function borrowReply(t, student, today) {
  const number = parseBook(t);
  if (number === null) return booksReply(student);
  const book = bookOf(student, number);
  if (!book) {
    return { texts: [`${student.first}, I couldn't find that book. Choose a number from 1 to 5.`], student };
  }
  const format = parseFormat(t);
  if (!format) {
    return {
      texts: [
        `${student.first}, you picked **${book.title}** by ${book.author}. How would you like to borrow it? A digital copy is ready straight away. An in-person copy gets you a collection code and a receipt.`,
      ],
      student,
      buttons: formatButtons(number),
    };
  }
  if (currentLoans(loansFor(student), today).some((loan) => loan.number === number)) {
    return {
      texts: [`${student.first}, you already have **${book.title}** on loan. Say 'my borrowed books' to see it, or choose another book.`],
      student,
    };
  }
  const borrowed = isoOf(dayNumber(today));
  const due = isoOf(dayNumber(today) + LOAN_DAYS);
  const code = format === "In person" ? newPickupCode(student.campus) : null;
  NEW_LOANS.push({ student, number, format, borrowed, due, returned: null, code });
  if (format === "Digital") {
    return {
      texts: [
        `Done, ${student.first}! **${book.title}** is now in your digital library. It stays with you until **${longDate(due)}** and then returns by itself, so there is nothing to bring back and no fine. Say 'my borrowed books' to see everything you have on loan.`,
      ],
      student,
    };
  }
  const library = libraryFor(student.campus);
  return {
    texts: [
      `Booked, ${student.first}! Here is your receipt:\n\n` +
        `**Book:** ${book.title} by ${book.author}\n` +
        `**Collection code:** ${code}\n` +
        `**Collect from:** ${library.name}, ${library.location}, room ${library.room}\n` +
        `**Collect by:** ${longDate(isoOf(dayNumber(today) + HOLD_DAYS))}\n` +
        `**Return by:** ${longDate(due)}\n` +
        `**Return to:** ${library.name}, room ${library.room}\n` +
        `**Late fine:** ${pounds(FINE_PENCE_PER_MONTH)} for each month (or part of a month) overdue\n\n` +
        "Show the code at the library desk to pick up your book.",
    ],
    student,
  };
}

export const SUPPORT_CAPACITY = 8;

export const SUPPORT_LECTURES = {
  "Fine Arts": [
    { topic: "Colour theory workshop", day: "Monday", start: "16:00", end: "17:00", room: "C130", assistant: ["Hannah", "Brooks"], email: "hannah.brooks@napier.ac.uk" },
    { topic: "Drawing techniques lab", day: "Wednesday", start: "15:00", end: "16:00", room: "C131", assistant: ["Callum", "Reid"], email: "callum.reid@napier.ac.uk" },
    { topic: "Art history revision", day: "Friday", start: "14:00", end: "15:00", room: "C130", assistant: ["Hannah", "Brooks"], email: "hannah.brooks@napier.ac.uk" },
  ],
  Computing: [
    { topic: "C programming lab", day: "Tuesday", start: "13:00", end: "14:00", room: "D210", assistant: ["Omar", "Haddad"], email: "omar.haddad@napier.ac.uk" },
    { topic: "Algorithms practice", day: "Thursday", start: "15:00", end: "16:00", room: "D211", assistant: ["Chloe", "Bennett"], email: "chloe.bennett@napier.ac.uk" },
    { topic: "Debugging clinic", day: "Friday", start: "11:00", end: "12:00", room: "D210", assistant: ["Omar", "Haddad"], email: "omar.haddad@napier.ac.uk" },
  ],
  Biology: [
    { topic: "Cell biology lab", day: "Monday", start: "14:00", end: "15:00", room: "B220", assistant: ["Isla", "Murray"], email: "isla.murray@napier.ac.uk" },
    { topic: "Genetics problem class", day: "Wednesday", start: "16:00", end: "17:00", room: "B221", assistant: ["Tom", "Nguyen"], email: "tom.nguyen@napier.ac.uk" },
    { topic: "Exam revision", day: "Thursday", start: "11:00", end: "12:00", room: "B220", assistant: ["Isla", "Murray"], email: "isla.murray@napier.ac.uk" },
  ],
};

const SUPPORT_BOOKINGS = [];

export function resetSupport() {
  SUPPORT_BOOKINGS.length = 0;
}

function nextSupportDate(day, today) {
  const todayIndex = (new Date(dayNumber(today) * DAY_MS).getUTCDay() + 6) % 7;
  const ahead = (((DAYS.indexOf(day) - todayIndex) % 7) + 7) % 7 || 7;
  return isoOf(dayNumber(today) + ahead);
}

function supportLectures(student) {
  return SUPPORT_LECTURES[student.subject].map((lecture, i) => ({
    ...lecture,
    number: i + 1,
    subject: student.subject,
    campus: student.campus,
  }));
}

function supportTaken(lecture, date) {
  return SUPPORT_BOOKINGS.filter(
    (b) => b.subject === lecture.subject && b.number === lecture.number && b.date === date
  ).length;
}

function supportSeatsLeft(lecture, today) {
  return Math.max(0, SUPPORT_CAPACITY - supportTaken(lecture, nextSupportDate(lecture.day, today)));
}

function supportClash(student, lecture) {
  const start = timeToMinutes(lecture.start);
  const end = timeToMinutes(lecture.end);
  for (const [type, item] of [["Lecture", student.lecture], ["Practical", student.practical]]) {
    if (item.day !== lecture.day) continue;
    const [from, to] = item.time.split("-");
    if (start < timeToMinutes(to) && timeToMinutes(from) < end) return { type, time: item.time };
  }
  return null;
}

function supportPayload(number) {
  return `/book_support_lecture${JSON.stringify({ session: String(number) })}`;
}

function describeSupport(lecture, today) {
  const date = nextSupportDate(lecture.day, today);
  const left = supportSeatsLeft(lecture, today);
  return [
    `**${lecture.number}.** ${lecture.topic}`,
    `**Next:** ${lecture.day} ${longDate(date)}`,
    `**Time:** ${lecture.start}-${lecture.end}`,
    `**Room:** ${lecture.room}, ${lecture.campus} campus`,
    `**Lab assistant:** ${lecture.assistant.join(" ")}`,
    left ? `**Seats left:** ${left}` : "**Seats left:** Full",
  ].join("\n");
}

function supportListReply(student, today) {
  const lectures = supportLectures(student);
  const blocks = lectures.map((lecture) => describeSupport(lecture, today)).join("\n\n");
  return {
    texts: [
      `Hi ${student.first}! Here are the extra support lectures for **${student.subject}**. Each one is a weekly one-hour class run by a lab assistant:\n\n${blocks}\n\nChoose a number to book a seat. You book the next session shown.`,
    ],
    student,
    buttons: lectures.map((lecture) => ({
      title: `Book session ${lecture.number}`,
      payload: supportPayload(lecture.number),
    })),
  };
}

function parseSession(t) {
  const named = t.match(/\b(?:session|lecture|class|number|no)\s*(\d{1,2})\b/);
  if (named) return Number(named[1]);
  const bare = t.match(/\b(\d{1,2})\b/);
  if (bare) return Number(bare[1]);
  for (const [word, number] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) return number;
  }
  return null;
}

function supportBookReply(t, student, today) {
  const number = parseSession(t);
  if (number === null) return supportListReply(student, today);
  const lectures = supportLectures(student);
  const lecture = lectures.find((l) => l.number === number);
  if (!lecture) {
    return { texts: [`${student.first}, I couldn't find that session. Choose a number from 1 to ${lectures.length}.`], student };
  }
  const date = nextSupportDate(lecture.day, today);
  const mine = SUPPORT_BOOKINGS.some(
    (b) => b.student === student && b.subject === lecture.subject && b.number === number && b.date === date
  );
  if (mine) {
    return { texts: [`${student.first}, you already have a seat in **${lecture.topic}** next ${lecture.day}. Say 'my support lectures' to see it.`], student };
  }
  if (supportSeatsLeft(lecture, today) === 0) {
    return { texts: [`${student.first}, **${lecture.topic}** is full next ${lecture.day}. Say 'support lectures' to see the sessions that still have seats.`], student };
  }
  const clash = supportClash(student, lecture);
  if (clash) {
    return {
      texts: [`${student.first}, **${lecture.topic}** on ${lecture.day} (${lecture.start}-${lecture.end}) clashes with your **${clash.type}** at ${clash.time}. Choose another session.`],
      student,
    };
  }
  SUPPORT_BOOKINGS.push({ student, subject: lecture.subject, number, date });
  return {
    texts: [
      `Booked, ${student.first}! You have a seat in **${lecture.topic}** on **${lecture.day} ${longDate(date)}** from **${lecture.start}** to **${lecture.end}** in room **${lecture.room}** at the **${lecture.campus}** campus. Your lab assistant is **${lecture.assistant.join(" ")}** (${lecture.email}). Say 'my support lectures' to see everything you have booked.`,
    ],
    student,
  };
}

function mySupportRows(student, today) {
  return SUPPORT_BOOKINGS.filter((b) => b.student === student && b.date >= isoOf(dayNumber(today)))
    .map((b) => ({ ...supportLectures(student)[b.number - 1], date: b.date }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

function supportBlocks(rows) {
  if (!rows.length) return "No support lectures booked.";
  return rows
    .map((row) =>
      [
        `**${row.topic}**`,
        `**When:** ${row.day} ${longDate(row.date)}`,
        `**Time:** ${row.start}-${row.end}`,
        `**Room:** ${row.room}, ${row.campus} campus`,
        `**Lab assistant:** ${row.assistant.join(" ")} (${row.email})`,
      ].join("\n")
    )
    .join("\n\n");
}

function supportMineReply(student, today) {
  const rows = mySupportRows(student, today);
  if (!rows.length) {
    return {
      texts: [`Hi ${student.first}! You have no upcoming support lectures booked. Say 'support lectures' to see what is available.`],
      student,
      buttons: [{ title: "Book another", payload: "/ask_support_lectures" }],
    };
  }
  const noun = rows.length === 1 ? "a support lecture" : `${rows.length} support lectures`;
  return {
    texts: [`Hi ${student.first}! You have ${noun} booked:\n\n${supportBlocks(rows)}`],
    student,
    buttons: [{ title: "Book another", payload: "/ask_support_lectures" }],
  };
}

function myVisits(student) {
  const teacher = teacherFor(student);
  const prefix = `${teacher.first} ${teacher.last}|`;
  const visits = [];
  for (const [key, who] of BOOKINGS) {
    if (!key.startsWith(prefix) || who.first !== student.first || who.last !== student.last) continue;
    const [, day, start] = key.split("|");
    visits.push({ day, start, end: minutesToTime(timeToMinutes(start) + 30) });
  }
  return visits.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start));
}

function visitLines(student, visits) {
  if (!visits.length) return "No teacher visits booked.";
  const teacher = teacherFor(student);
  return visits
    .map((v) => `**${v.day}:** ${v.start}-${v.end} with ${teacher.first} ${teacher.last}, room ${teacher.room}, ${teacher.campus} campus`)
    .join("\n");
}

function appointmentSections(student, visits, rows) {
  return `**Teacher visits**\n${visitLines(student, visits)}\n\n**Lab assistant support lectures**\n${supportBlocks(rows)}`;
}

function appointmentButtons(visits, rows) {
  const buttons = [];
  if (!visits.length) buttons.push({ title: "Book a teacher visit", payload: "/ask_teacher_hours" });
  if (!rows.length) buttons.push({ title: "Book a support lecture", payload: "/ask_support_lectures" });
  return buttons.length ? buttons : undefined;
}

function appointmentsReply(student, today) {
  const visits = myVisits(student);
  const rows = mySupportRows(student, today);
  if (!visits.length && !rows.length) {
    return {
      texts: [`Hi ${student.first}! You have no appointments booked. You can book a visit with your teacher or a seat in a support lecture.`],
      student,
      buttons: appointmentButtons(visits, rows),
    };
  }
  return {
    texts: [`Hi ${student.first}! Here are your appointments:\n\n${appointmentSections(student, visits, rows)}`],
    student,
    buttons: appointmentButtons(visits, rows),
  };
}

function timetableReply(student, today) {
  const visits = myVisits(student);
  const rows = mySupportRows(student, today);
  const teacher = teacherFor(student);
  const name = `${teacher.first} ${teacher.last}`;
  const blocks = ["lecture", "practical"]
    .map(
      (k) =>
        `**${titleCase(k)}**\n**Day:** ${student[k].day}\n**Time:** ${student[k].time}\n` +
        `**Room:** ${student[k].room}, ${student.campus} campus\n**Teacher:** ${name}`
    )
    .join("\n\n");
  return {
    texts: [
      `Here is the full timetable for **${student.first} ${student.last}**:\n\n` +
        `**Subject:** ${student.subject}\n**Teacher:** ${name} (office **${teacher.room}**)\n\n` +
        `${blocks}\n\n**Appointments**\n\n${appointmentSections(student, visits, rows)}`,
    ],
    student,
    buttons: appointmentButtons(visits, rows),
  };
}

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
    "Hello! I'm Octopi, your Campus Attendance Assistant. Welcome to the Campus Attendance System. Ask me about your schedule - lecture or practical days, campus, time, subject, room, your teacher or the library. I can also show your teacher's contact details and office hours, book a visit, lend you books and book extra support lectures. If I don't know you yet, tell me your first and last name (e.g. 'My name is Alice Johnson').",
  found: (f, l) =>
    `Great! I found your record, ${f} ${l}. You can now ask me about your schedule. For example: 'What days do I have lectures?', 'What days do I have practicals?', 'Give me all my schedule details', or 'When can I visit my teacher?'`,
  notFound: (f, l) =>
    `I'm sorry, I couldn't find a student with the name ${f} ${l} in our attendance records. Please check your name and try again.`,
  lectureDays: (s) =>
    `Hi ${s.first}! You have a **Lecture** session on **${s.lecture.day}**, hosted by **${teacherName(s)}**. Would you like to know more details such as your campus, time, subject, or room?`,
  practicalDays: (s) =>
    `Hi ${s.first}! You have a **Practical** session on **${s.practical.day}**, hosted by **${teacherName(s)}**. Would you like to know more details such as your campus, time, subject, or room?`,
  campus: (s) =>
    `${s.first}, your lecture and practical both take place at the **${s.campus}** campus, hosted by **${teacherName(s)}**.`,
  time: (s) =>
    `${s.first}, your **Lecture** on **${s.lecture.day}** runs from **${s.lecture.time}** and your **Practical** on **${s.practical.day}** runs from **${s.practical.time}**. Both are hosted by **${teacherName(s)}**.`,
  subject: (s) =>
    `${s.first}, your subject is **${s.subject}**, taught by **${teacherName(s)}**.`,
  room: (s) =>
    `${s.first}, your **Lecture** is in room **${s.lecture.room}** and your **Practical** is in room **${s.practical.room}**, both at the **${s.campus}** campus. Your teacher **${teacherName(s)}** has office hours in room **${teacherFor(s).room}**.`,
  contact: (s) => {
    const t = teacherFor(s);
    const name = `${t.first} ${t.last}`;
    return (
      `${s.first}, here is how to reach **${name}**:\n\n` +
      `**Email:** ${t.email}\n**Phone:** ${t.phone}\n` +
      `**Microsoft Teams:** search for ${name} in Teams to send a chat message or start a call\n\n` +
      `You can also visit room **${t.room}** at the **${t.campus}** campus. ` +
      "Ask me for the office hours to see when and to book a visit."
    );
  },
  teacher: (s) => {
    const t = teacherFor(s);
    return (
      `${s.first}, your teacher is **${t.first} ${t.last}**, who hosts both your ` +
      `**Lecture** and your **Practical** for **${s.subject}** at the **${t.campus}** campus. ` +
      `Their office is room **${t.room}**.`
    );
  },
  teacherOffice: (s) => {
    const t = teacherFor(s);
    return (
      `${s.first}, **${t.first} ${t.last}** holds office hours in room **${t.room}** ` +
      `at the **${t.campus}** campus. Ask me when you can visit and I'll show the free hours.`
    );
  },
  teacherHours: (s) => {
    const t = teacherFor(s);
    return (
      `${s.first}, you can visit **${t.first} ${t.last}** in room **${t.room}** at the ` +
      `**${t.campus}** campus during these free hours:\n\n${hoursLines(t)}\n\n` +
      "Appointments are 30 minutes. Tell me a day and time to book one " +
      "(for example: 'Book Tuesday at 14:30')."
    );
  },
  bookingPrompt: (s) => {
    const t = teacherFor(s);
    return (
      `Sure, ${s.first}. **${t.first} ${t.last}** is free in room **${t.room}** at these times:\n\n` +
      `${hoursLines(t)}\n\nWhich day and time would you like? Slots are 30 minutes and ` +
      "start on the hour or half hour (for example: 'Tuesday at 14:30')."
    );
  },
  booked: (s, day, start, end) => {
    const t = teacherFor(s);
    return (
      `Booked! **${s.first}**, you will meet **${t.first} ${t.last}** on **${day}** from ` +
      `**${start}** to **${end}** in room **${t.room}** at the **${t.campus}** campus. ` +
      "Please arrive on time. Ask me any time to see your teacher's free hours again."
    );
  },
  alreadyBooked: (s, day, start, end) => {
    const t = teacherFor(s);
    return (
      `${s.first}, you already have that appointment: **${day}** from **${start}** to ` +
      `**${end}** with **${t.first} ${t.last}** in room **${t.room}**. Ask me to book a different free slot.`
    );
  },
  bookingError: {
    day_unavailable: (s, day) =>
      `${s.first}, **${teacherName(s)}** does not hold office hours on **${day}**. ` +
      `These are the free hours:\n\n${hoursLines(teacherFor(s))}`,
    bad_time: (s) =>
      `${s.first}, appointments are 30 minutes and start on the hour or half hour. ` +
      "Try a time like **14:00** or **14:30**.",
    outside_hours: (s, day) => {
      const t = teacherFor(s);
      const [from, to] = t.hours[day].split("-");
      return (
        `${s.first}, **${t.first} ${t.last}** is free on **${day}** only from ` +
        `**${from}** to **${to}**. Book a 30-minute slot inside that window, e.g. **${from}**.`
      );
    },
    taken: (s, day) => {
      const free = freeSlots(s, day).map((slot) => `**${slot}**`).join(", ");
      return (
        `${s.first}, that slot on **${day}** is already booked. Free slots that day: ` +
        `${free || "none left"}.`
      );
    },
  },
  fullSchedule: (s) => [
    `Here is the weekly schedule for **${s.first} ${s.last}**:`,
    `**Campus:** ${s.campus}\n**Subject:** ${s.subject}\n` +
      `**Teacher:** ${teacherName(s)} (office **${teacherFor(s).room}**)\n\n` +
      ["lecture", "practical"]
        .map(
          (k) =>
            `**${titleCase(k)}**\n**Day:** ${s[k].day}\n**Time:** ${s[k].time}\n` +
            `**Room:** ${s[k].room}\n**Teacher:** ${teacherName(s)}`
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
    "I'm sorry, I can only help with campus attendance, your schedule and your teacher's office hours. Please ask me something related to your timetable or booking a visit.",
  explain: [
    "I'm Octopi, the Campus Attendance Assistant. Here is what I can do, in plain words:",
    "",
    "1. **Tell me who you are.** Type your first and last name, for example 'My name is Alice Johnson'.",
    "2. **Your timetable.** Ask about your lecture or practical days, time, room, campus or subject, or say 'Give me all my schedule details'.",
    "3. **Your teacher.** Ask 'Who is my teacher?', 'How can I contact my teacher?' or 'When can I visit my teacher?', then book a visit, for example 'Book Tuesday at 14:30'.",
    "4. **The library.** Ask 'Where is the library?', then 'Recommend books' and borrow one digitally or collect it in person.",
    "5. **Appointments and timetable.** Ask 'Show my appointments' for your booked teacher visits and support lectures, or 'Show my timetable' for your whole week.",
    "6. **Extra support.** Ask 'What support lectures are available?' to see sessions run by lab assistants, then book a seat.",
    "7. **What you owe.** Ask 'Do I have any parking arrears?' or 'Show my borrowed books' to check fines.",
    "",
    "Just type your question like a text message, tap the buttons I show, or use the microphone to speak.",
  ].join("\n"),
  fallback:
    "I didn't quite understand that. You can ask me about your lecture or practical days, campus location, time, subject, room number, how to contact or visit your teacher, the library, borrowing books, or your fines. Say 'help' for a short guide.",
};

/* Dialogue engine. */

const DAY_ALIASES = {
  mon: "Monday", monday: "Monday",
  tue: "Tuesday", tues: "Tuesday", tuesday: "Tuesday",
  wed: "Wednesday", weds: "Wednesday", wednesday: "Wednesday",
  thu: "Thursday", thur: "Thursday", thurs: "Thursday", thursday: "Thursday",
  fri: "Friday", friday: "Friday",
};

function teacherName(student) {
  const t = teacherFor(student);
  return `${t.first} ${t.last}`;
}

function hoursLines(teacher) {
  return DAYS.map((day) => `**${day}:** ${teacher.hours[day]}`).join("\n");
}

function normaliseDay(value) {
  if (!value) return null;
  const word = String(value).toLowerCase().replace(/[^a-z]/g, "");
  return DAY_ALIASES[word] ?? DAY_ALIASES[word.replace(/s$/, "")] ?? null;
}

function parseDay(text) {
  for (const word of String(text || "").toLowerCase().match(/[a-z]+/g) || []) {
    const day = DAY_ALIASES[word] ?? DAY_ALIASES[word.replace(/s$/, "")];
    if (day) return day;
  }
  return null;
}

function normaliseTime(value) {
  const m = String(value || "").match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const suffix = (m[3] || "").toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTime(text) {
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
  let m;
  while ((m = re.exec(String(text || ""))) !== null) {
    if (m[2] || m[3]) {
      const found = normaliseTime(m[0]);
      if (found) return found;
    }
  }
  return null;
}

function timeToMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function slotsBetween(start, end) {
  const slots = [];
  for (let at = timeToMinutes(start); at + 30 <= timeToMinutes(end); at += 30) {
    slots.push(minutesToTime(at));
  }
  return slots;
}

function bookingKey(teacher, day, start) {
  return `${teacher.first} ${teacher.last}|${day}|${start}`;
}

function freeSlots(student, day) {
  const teacher = teacherFor(student);
  const window = teacher.hours[day];
  if (!window) return [];
  const [from, to] = window.split("-");
  return slotsBetween(from, to).filter(
    (slot) => !BOOKINGS.has(bookingKey(teacher, day, slot))
  );
}

function validateSlot(student, day, start) {
  const teacher = teacherFor(student);
  const window = teacher.hours[day];
  if (!window) return "day_unavailable";
  const [from, to] = window.split("-");
  const minutes = timeToMinutes(start);
  if (minutes % 30) return "bad_time";
  if (minutes < timeToMinutes(from) || minutes + 30 > timeToMinutes(to)) {
    return "outside_hours";
  }
  const existing = BOOKINGS.get(bookingKey(teacher, day, start));
  if (existing) {
    return existing.first === student.first && existing.last === student.last
      ? "mine"
      : "taken";
  }
  return { start, end: minutesToTime(minutes + 30) };
}

function bookingReply(text, student) {
  const day = parseDay(text);
  const start = parseTime(text);
  if (!day || !start) return SAY.bookingPrompt(student);

  const result = validateSlot(student, day, start);
  if (result === "mine") {
    const end = minutesToTime(timeToMinutes(start) + 30);
    return SAY.alreadyBooked(student, day, start, end);
  }
  if (typeof result === "string") return SAY.bookingError[result](student, day);

  const teacher = teacherFor(student);
  BOOKINGS.set(bookingKey(teacher, day, result.start), {
    first: student.first,
    last: student.last,
  });
  return SAY.booked(student, day, result.start, result.end);
}

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
  teacherContact:
    /(\b(contact|email|e-mail|phone|get in touch|reach)\b.*\b(teacher|lecturer|tutor)s?\b|\b(teacher|lecturer|tutor)s?'?s?\b.*\b(contact|email|e-mail|phone|get in touch)\b|\b(call|message|speak to|talk to) (my |the )?(teacher|lecturer|tutor))/,
  borrowed:
    /(borrowed|on loan|overdue|library fines?|book fines?|book loans?|library loans?|late books?|my borrowed|owe.*(library|books)|return my books)/,
  borrow: /\b(borrow|take out|lend|ask books?\b)|reserve (a )?book/,
  recommend: /(recommend|suggest|reading list|book list|which books|what books|books for my|show me (the |some )?books|^ask books$)/,
  library: /\blibrar(y|ies)\b/,
  timetable: /(\btimetables?\b|my whole week|what does my week look like)/,
  appointments:
    /(\b(show|list|check|view|see)\b.*\bappointments?\b|\b(my|any|upcoming|all)\b\s+(booked\s+)?(appointments?|slots)|appointments? (do i have|have i)|slots have i booked|visits have i booked|what have i booked)/,
  support:
    /(support (lectures?|sessions?|classes)|lab assistants?|extra (help|support|lectures?|classes)|additional (support|lectures?))/,
  supportMine:
    /(my (booked )?support|support (lectures?|sessions?) (have i|do i have|i have)|booked support|support (lectures?|sessions?|classes) booked|am i booked|support bookings?|my extra lectures|next support)/,
  supportBook: /\b(book|reserve|join|sign me up|schedule)\b/,
  teacherOffice:
    /(teacher'?s? (office|room)|office (room )?(number|of my teacher)|where (is|can i find) my teacher|where does my teacher work)/,
  booking: /\b(book|booking|appointment|reserve|schedule a (meeting|slot))\b/,
  teacherHours:
    /(office hours?|free hours|when can i (visit|see|meet|come to) (my |the )?teacher|when (is|can) (my |the )?teacher (free|available|in)|when can students visit|teacher'?s? (free|available))/,
  teacher:
    /(who (is|teaches|teach)|who teaches|(my|the) (teacher|lecturer|tutor)|which teacher|teacher'?s? name)/,
  parking: /\b(parking|arrears?)\b/,
  payPhone: /(pay|payment|call).*\bphone\b|\bphone\b.*(pay|payment)/,
  infoDesk: /info ?desk|pay in person|pay at the desk/,
  filler: /^(ok|okay|cool|nice|hmm+|hm|yeah|sure|right|oh|ah|meh|k|np|got it)\.?$/,
};

/** Reply to a user message: { texts, student }. */
export function reply(text, student, today = new Date()) {
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

  if (RE.timetable.test(t) || RE.appointments.test(t)) {
    if (!student) return { texts: [SAY.guard], student };
    if (RE.timetable.test(t)) return timetableReply(student, today);
    return appointmentsReply(student, today);
  }

  if (RE.support.test(t) || RE.supportMine.test(t)) {
    if (!student) return { texts: [SAY.guard], student };
    if (RE.supportMine.test(t)) return supportMineReply(student, today);
    if (RE.supportBook.test(t) || parseSession(t) !== null) return supportBookReply(t, student, today);
    return supportListReply(student, today);
  }

  const libraryQuestion =
    RE.teacherContact.test(t) || RE.borrowed.test(t) || RE.borrow.test(t) || RE.recommend.test(t);

  if (libraryQuestion && !student) {
    return { texts: [SAY.guard], student };
  }

  if (student) {
    if (RE.teacherContact.test(t)) return { texts: [SAY.contact(student)], student };
    if (RE.borrowed.test(t)) return loansReply(student, today);
    if (RE.borrow.test(t)) return borrowReply(t, student, today);
    if (RE.recommend.test(t)) return booksReply(student);
  }

  if (RE.library.test(t)) return librariesReply(student);

  // Payment choices after the arrears message (the buttons send /pay_by_phone and /pay_at_infodesk).
  if (RE.payPhone.test(t)) return { texts: [SAY.payByPhone], student };
  if (RE.infoDesk.test(t)) return { texts: [SAY.visitInfoDesk], student };

  const teacherQuestion =
    RE.teacherOffice.test(t) ||
    RE.booking.test(t) ||
    RE.teacherHours.test(t) ||
    RE.teacher.test(t);

  if (teacherQuestion && !student) {
    return { texts: [SAY.guard], student };
  }

  if (student) {
    if (RE.teacherOffice.test(t)) return { texts: [SAY.teacherOffice(student)], student };
    if (RE.booking.test(t)) return { texts: [bookingReply(text, student)], student };
    if (RE.teacherHours.test(t)) return { texts: [SAY.teacherHours(student)], student };
    if (RE.teacher.test(t)) return { texts: [SAY.teacher(student)], student };
    if (parseDay(text) && parseTime(text)) {
      return { texts: [bookingReply(text, student)], student };
    }
  }

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
