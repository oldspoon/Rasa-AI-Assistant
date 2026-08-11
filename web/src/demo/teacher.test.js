import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { DAYS, STUDENTS, TEACHERS, reply, resetBookings, teacherFor } from "./demoEngine.js";

const introduce = (name) => reply(`My name is ${name}`, null).student;
const alice = () => introduce("Alice Johnson");
const mia = () => introduce("Mia Thomas");

beforeEach(() => resetBookings());

describe("teacher data", () => {
  it("has exactly one teacher per discipline, each with an own office and free hours every weekday", () => {
    expect(Object.keys(TEACHERS).sort()).toEqual(["Biology", "Computing", "Fine Arts"]);
    const rooms = Object.values(TEACHERS).map((t) => t.room);
    expect(new Set(rooms).size).toBe(rooms.length);
    for (const teacher of Object.values(TEACHERS)) {
      expect(Object.keys(teacher.hours)).toEqual(DAYS);
    }
  });

  it("gives every student the teacher of their discipline, on their own campus", () => {
    for (const student of STUDENTS) {
      const teacher = teacherFor(student);
      expect(teacher, student.subject).toBeTruthy();
      expect(teacher.campus).toBe(student.campus);
    }
  });

  it("matches the teachers seeded in populate_db.py", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      resolve(here, "../../../action_server/database/populate_db.py"),
      "utf8"
    );
    const seeded = [...source.matchAll(
      /\(\s*"([^"]+)",\s*"([^"]+)",\s*"(Fine Arts|Computing|Biology)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\s*\)/g
    )].map((m) => ({
      first: m[1], last: m[2], discipline: m[3], campus: m[4], room: m[5], email: m[6], phone: m[7],
    }));

    expect(seeded).toHaveLength(3);
    for (const row of seeded) {
      expect(TEACHERS[row.discipline]).toMatchObject({
        first: row.first,
        last: row.last,
        campus: row.campus,
        room: row.room,
        email: row.email,
        phone: row.phone,
      });
      for (const [day, hours] of Object.entries(TEACHERS[row.discipline].hours)) {
        const [from, to] = hours.split("-");
        expect(source, `${row.discipline} ${day}`).toContain(`("${day}", "${from}", "${to}")`);
      }
    }
  });
});

describe("teacher replies", () => {
  it("says who teaches the student and where the office is", () => {
    expect(reply("Who is my teacher?", alice()).texts[0]).toMatch(/Margaret Ellison/);
    expect(reply("Where is my teacher's office?", alice()).texts[0]).toMatch(/C214/);
    expect(reply("Where is my teacher's office?", alice()).texts[0]).toMatch(/Craiglockhart/);
  });

  it("lists the free office hours for every weekday", () => {
    const text = reply("When can I visit my teacher?", alice()).texts[0];
    for (const day of DAYS) expect(text).toContain(`**${day}:**`);
    expect(text).toMatch(/Tuesday:\*\* 14:00-16:00/);
    expect(text).toMatch(/30 minutes/);
  });

  it("asks an unknown student to introduce themselves first", () => {
    expect(reply("When can I visit my teacher?", null).texts[0]).toMatch(/introduce yourself/);
  });
});

describe("booking an office-hour slot", () => {
  it("asks for a day and time and shows the free hours", () => {
    const text = reply("I want to book an office hour", alice()).texts[0];
    expect(text).toMatch(/Which day and time/);
    expect(text).toMatch(/C214/);
  });

  it("books a 30-minute slot inside the free hours", () => {
    const text = reply("Book Tuesday at 14:30", alice()).texts[0];
    expect(text).toMatch(/Booked!/);
    expect(text).toMatch(/Margaret Ellison/);
    expect(text).toMatch(/\*\*Tuesday\*\* from \*\*14:30\*\* to \*\*15:00\*\*/);
    expect(text).toMatch(/C214/);
  });

  it("understands 12-hour times and a bare day", () => {
    expect(reply("Tuesday at 2:30pm please", alice()).texts[0]).toMatch(/14:30/);
    expect(reply("Monday 10am", mia()).texts[0]).toMatch(/10:00/);
  });

  it("refuses a time outside the free hours, showing the window", () => {
    const text = reply("Book Tuesday at 13:00", alice()).texts[0];
    expect(text).toMatch(/only from/);
    expect(text).toMatch(/14:00/);
    expect(text).toMatch(/16:00/);
  });

  it("asks for a day and time when the weekday is not recognised", () => {
    expect(reply("Book Saturday at 10:00", alice()).texts[0]).toMatch(/Which day and time/);
  });

  it("tells the same student when they already have the slot", () => {
    reply("Book Tuesday at 14:30", alice());
    expect(reply("Book Tuesday at 14:30", alice()).texts[0]).toMatch(/already have that appointment/);
  });

  it("refuses a slot another student already booked", () => {
    reply("Book Tuesday at 14:30", alice());
    const text = reply("Book Tuesday at 14:30", mia()).texts[0];
    expect(text).toMatch(/already booked/);
    expect(text).toMatch(/14:00/);
  });

  it("requires slots on the hour or half hour", () => {
    expect(reply("Book Tuesday at 14:15", alice()).texts[0]).toMatch(/hour or half hour/);
  });
});
