import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { BOOKS, LIBRARIES, STUDENTS, fineFor, reply, resetBookings } from "./demoEngine.js";

const TODAY = new Date(2026, 10, 16);
const introduce = (name) => reply(`My name is ${name}`, null).student;
const ask = (text, student, today = TODAY) => reply(text, student, today);

beforeEach(() => resetBookings());

describe("teacher contact", () => {
  it("gives the napier email, phone number and Microsoft Teams", () => {
    const text = ask("How can I contact my teacher?", introduce("Alice Johnson")).texts[0];
    expect(text).toContain("margaret.ellison@napier.ac.uk");
    expect(text).toContain("0131 496 0142");
    expect(text).toMatch(/Microsoft Teams/);
  });

  it("answers an email question and a phone question the same way", () => {
    expect(ask("What is my teacher's email?", introduce("Bob Smith")).texts[0]).toContain("daniel.fraser@napier.ac.uk");
    expect(ask("Can I call my teacher?", introduce("Carol Williams")).texts[0]).toContain("priya.raman@napier.ac.uk");
  });

  it("does not confuse the room number question with contact details", () => {
    expect(ask("What is my teacher's room number?", introduce("Alice Johnson")).texts[0]).toMatch(/C214/);
  });

  it("asks an unknown student to introduce themselves first", () => {
    expect(ask("How can I contact my teacher?", null).texts[0]).toMatch(/introduce yourself/);
  });
});

describe("library locations", () => {
  it("lists all three libraries, with Merchiston in the east wing", () => {
    const text = ask("Where is the library?", null).texts[0];
    for (const lib of LIBRARIES) expect(text).toContain(`**${lib.name}**`);
    expect(LIBRARIES[0].campus).toBe("Merchiston");
    expect(LIBRARIES[0].location).toMatch(/East Wing/);
  });

  it("works for a signed-in student too and offers the books", () => {
    const result = ask("Where is the library at Sighthill?", introduce("Bob Smith"));
    expect(result.texts[0]).toMatch(/Sighthill Library/);
    expect(result.buttons[0].payload).toBe("/ask_books");
  });
});

describe("book recommendations", () => {
  it("offers five classics for the student's subject with a borrow button each", () => {
    const result = ask("Recommend books", introduce("Bob Smith"));
    expect(result.texts[0]).toMatch(/The C Programming Language/);
    expect(result.texts[0]).toMatch(/\*\*5\.\*\*/);
    expect(result.buttons).toHaveLength(5);
    expect(result.buttons[1].title).toBe("Borrow book 2");
  });

  it("has five books in every subject", () => {
    for (const books of Object.values(BOOKS)) expect(books).toHaveLength(5);
  });

  it("asks an unknown student to introduce themselves first", () => {
    expect(ask("Recommend books", null).texts[0]).toMatch(/introduce yourself/);
  });
});

describe("borrowing", () => {
  it("asks how to borrow with two buttons when no format is given", () => {
    const result = ask("I want to borrow book 2", introduce("Bob Smith"));
    expect(result.texts[0]).toMatch(/How would you like to borrow it/);
    expect(result.buttons.map((b) => b.title)).toEqual(["Borrow digitally", "Collect in person"]);
  });

  it("lends a digital copy at once", () => {
    const text = ask("Borrow book 2 digitally", introduce("Bob Smith")).texts[0];
    expect(text).toMatch(/digital library/);
    expect(text).toMatch(/14 December 2026/);
  });

  it("gives an in-person loan a collection code and a receipt", () => {
    const text = ask("Borrow book 3 in person", introduce("Mia Thomas")).texts[0];
    expect(text).toMatch(/\*\*Collection code:\*\* CRA-\d{4}/);
    expect(text).toMatch(/\*\*Collect from:\*\* Craiglockhart Library, Main Building, second floor, room M221/);
    expect(text).toMatch(/\*\*Return by:\*\* 14 December 2026/);
    expect(text).toMatch(/\*\*Return to:\*\* Craiglockhart Library, room M221/);
    expect(text).toMatch(/£5.00 for each month/);
  });

  it("understands the button payloads", () => {
    const text = ask('/borrow_book{"book":"3","format":"digital"}', introduce("Bob Smith")).texts[0];
    expect(text).toMatch(/Art of Computer Programming/);
    expect(text).toMatch(/digital library/);
  });

  it("lists the books again when no number is given", () => {
    expect(ask("I want to borrow a book", introduce("Bob Smith")).buttons).toHaveLength(5);
  });

  it("refuses an unknown book number", () => {
    expect(ask("Borrow book 9", introduce("Bob Smith")).texts[0]).toMatch(/couldn't find that book/);
  });

  it("refuses the same book twice", () => {
    const bob = introduce("Bob Smith");
    ask("Borrow book 2 digitally", bob);
    expect(ask("Borrow book 2 digitally", bob).texts[0]).toMatch(/already have/);
  });

  it("does not mistake borrowing for booking a teacher slot", () => {
    expect(ask("Borrow book 2 in person", introduce("Mia Thomas")).texts[0]).not.toMatch(/office/);
  });
});

describe("borrowed books and fines", () => {
  it("shows an overdue loan with a five pound fine for each month", () => {
    const result = ask("Show my borrowed books", introduce("Alice Johnson"));
    const text = result.texts[0];
    expect(text).toMatch(/The Story of Art by E. H. Gombrich/);
    expect(text).toMatch(/Overdue by 48 days/);
    expect(text).toMatch(/\*\*Fine owed:\*\* £10.00/);
    expect(text).toMatch(/\*\*Total fines:\*\* £10.00/);
    expect(result.buttons[0].payload).toBe("/ask_library_location");
  });

  it("charges one month for 14 days late and two for 55 days late", () => {
    expect(ask("do I have any library fines", introduce("Carol Williams")).texts[0]).toMatch(/£5.00/);
    expect(ask("do I have any library fines", introduce("Emma Jones")).texts[0]).toMatch(/£10.00/);
  });

  it("shows a loan on time and a digital loan without a fine", () => {
    expect(ask("what books have I borrowed", introduce("Bob Smith")).texts[0]).toMatch(/no library fines/);
    expect(ask("what books have I borrowed", introduce("David Brown")).texts[0]).toMatch(/Returns by itself/);
  });

  it("tells a student with no loans they are clear", () => {
    expect(ask("my borrowed books", introduce("Frank Garcia")).texts[0]).toMatch(/no borrowed books and no library fines/);
  });

  it("shows a new loan straight away", () => {
    const frank = introduce("Frank Garcia");
    ask("Borrow book 1 in person", frank);
    expect(ask("my borrowed books", frank).texts[0]).toMatch(/On the Origin of Species/);
  });

  it("calculates fines in whole months, in pounds", () => {
    const loan = (due) => ({ format: "In person", due, returned: null });
    expect(fineFor(loan("2026-11-16"), TODAY)).toBe(0);
    expect(fineFor(loan("2026-11-15"), TODAY)).toBe(500);
    expect(fineFor(loan("2026-10-17"), TODAY)).toBe(500);
    expect(fineFor(loan("2026-10-16"), TODAY)).toBe(1000);
    expect(fineFor({ format: "Digital", due: "2026-01-01", returned: null }, TODAY)).toBe(0);
  });

  it("asks an unknown student to introduce themselves first", () => {
    expect(ask("my borrowed books", null).texts[0]).toMatch(/introduce yourself/);
  });
});

describe("matches the seed data in populate_db.py", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "../../../action_server/database/populate_db.py"), "utf8");

  it("has the same books", () => {
    for (const books of Object.values(BOOKS)) {
      for (const [title, author] of books) {
        expect(source).toContain(`("${title}", "${author}")`);
      }
    }
  });

  it("has the same libraries", () => {
    for (const lib of LIBRARIES) {
      expect(source).toContain(`("${lib.campus}", "${lib.name}", "${lib.location}", "${lib.room}", "${lib.hours}")`);
    }
  });

  it("puts every student on a campus that has a library", () => {
    for (const student of STUDENTS) {
      expect(LIBRARIES.some((lib) => lib.campus === student.campus)).toBe(true);
    }
  });
});
