import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { SAY, SUPPORT_LECTURES, reply, resetBookings } from "./demoEngine.js";

const TODAY = new Date(2026, 10, 16);
const introduce = (name) => reply(`My name is ${name}`, null).student;
const ask = (text, student, today = TODAY) => reply(text, student, today);

beforeEach(() => resetBookings());

describe("listing support lectures", () => {
  it("shows the programme's sessions with the lab assistant, next date and seats", () => {
    const result = ask("What support lectures are available?", introduce("Bob Smith"));
    const text = result.texts[0];
    expect(text).toMatch(/\*\*Computing\*\*/);
    expect(text).toMatch(/\*\*1\.\*\* C programming lab/);
    expect(text).toMatch(/\*\*Next:\*\* Tuesday 17 November 2026/);
    expect(text).toMatch(/\*\*Lab assistant:\*\* Omar Haddad/);
    expect(text).toMatch(/\*\*Seats left:\*\* 8/);
    expect(result.buttons.map((b) => b.title)).toEqual(["Book session 1", "Book session 2", "Book session 3"]);
  });

  it("gives each programme its own sessions", () => {
    expect(ask("support lectures", introduce("Alice Johnson")).texts[0]).toMatch(/Colour theory workshop/);
    expect(ask("support lectures", introduce("Carol Williams")).texts[0]).toMatch(/Cell biology lab/);
  });

  it("asks an unknown student to introduce themselves first", () => {
    expect(ask("support lectures", null).texts[0]).toBe(SAY.guard);
  });
});

describe("booking a support lecture", () => {
  it("books the next occurrence and names the lab assistant", () => {
    const text = ask("Book support lecture 3", introduce("Bob Smith")).texts[0];
    expect(text).toMatch(/Booked, Bob!/);
    expect(text).toMatch(/\*\*Friday 20 November 2026\*\* from \*\*11:00\*\* to \*\*12:00\*\*/);
    expect(text).toContain("**Omar Haddad** (omar.haddad@napier.ac.uk)");
  });

  it("understands the button payload", () => {
    const text = ask('/book_support_lecture{"session":"1"}', introduce("Bob Smith")).texts[0];
    expect(text).toMatch(/Booked, Bob!/);
    expect(text).toMatch(/C programming lab/);
  });

  it("lists the sessions again when no number is given", () => {
    expect(ask("I want to book a support lecture", introduce("Bob Smith")).buttons).toHaveLength(3);
  });

  it("refuses an unknown session number", () => {
    expect(ask("Book support lecture 7", introduce("Bob Smith")).texts[0]).toMatch(/couldn't find that session/);
  });

  it("refuses a session that clashes with the timetable", () => {
    const text = ask("Book support lecture 3", introduce("Mia Thomas")).texts[0];
    expect(text).toMatch(/clashes with your \*\*Practical\*\* at 13:00-15:00/);
  });

  it("refuses the same session twice", () => {
    const bob = introduce("Bob Smith");
    ask("Book support lecture 1", bob);
    expect(ask("Book support lecture 1", bob).texts[0]).toMatch(/already have a seat/);
  });

  it("uses a later date once the weekday has passed", () => {
    const text = ask("Book support lecture 1", introduce("Bob Smith"), new Date(2026, 10, 17)).texts[0];
    expect(text).toMatch(/Tuesday 24 November 2026/);
  });

  it("is not mistaken for booking a teacher visit or borrowing a book", () => {
    const text = ask("Book support lecture 1", introduce("Bob Smith")).texts[0];
    expect(text).not.toMatch(/office|Collection code/);
  });
});

describe("my support lectures", () => {
  it("says when nothing is booked", () => {
    expect(ask("my support lectures", introduce("Bob Smith")).texts[0]).toMatch(/no upcoming support lectures/);
  });

  it("lists what has been booked, with a button to book another", () => {
    const bob = introduce("Bob Smith");
    ask("Book support lecture 3", bob);
    const result = ask("Show my support lectures", bob);
    expect(result.texts[0]).toMatch(/a support lecture booked/);
    expect(result.texts[0]).toMatch(/Debugging clinic/);
    expect(result.buttons[0].payload).toBe("/ask_support_lectures");
  });

  it("drops a booking once its date has passed", () => {
    const bob = introduce("Bob Smith");
    ask("Book support lecture 3", bob);
    expect(ask("my support lectures", bob, new Date(2026, 10, 25)).texts[0]).toMatch(/no upcoming support lectures/);
  });
});

describe("matches the seed data in populate_db.py", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "../../../action_server/database/populate_db.py"), "utf8");

  it("has the same sessions", () => {
    for (const lectures of Object.values(SUPPORT_LECTURES)) {
      expect(lectures).toHaveLength(3);
      for (const l of lectures) {
        expect(source).toContain(`("${l.topic}", "${l.day}", "${l.start}", "${l.end}", "${l.room}", `);
      }
    }
  });

  it("has the same lab assistants", () => {
    const assistants = new Set();
    for (const [discipline, lectures] of Object.entries(SUPPORT_LECTURES)) {
      for (const l of lectures) assistants.add(`("${l.assistant[0]}", "${l.assistant[1]}", "${discipline}", "${l.email}")`);
    }
    expect(assistants.size).toBe(6);
    for (const row of assistants) expect(source).toContain(row);
  });
});
