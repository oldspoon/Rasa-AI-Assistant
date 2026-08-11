import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PARKING, PARKING_BUTTONS, STUDENTS, parkingFor, reply } from "./demoEngine.js";

const CAMPUSES = ["Craiglockhart", "Sighthill", "Merchiston"];
const introduce = (name) => reply(`My name is ${name}`, null).student;

describe("parking arrears data", () => {
  it("gives Alice Johnson a charge on Craiglockhart campus grounds", () => {
    const [charge] = parkingFor(introduce("Alice Johnson"));
    expect(charge.location).toBe("Craiglockhart campus grounds");
    expect(charge.plate).toBe("LB21 XQT");
  });

  it("covers Alice and every other student, eight of fifteen", () => {
    expect(PARKING).toHaveLength(8);
    expect(STUDENTS).toHaveLength(15);
  });

  it("puts each charge on the campus the student attends", () => {
    for (const [first, last] of PARKING) {
      const student = STUDENTS.find((s) => s.first === first && s.last === last);
      expect(student, `${first} ${last} is a student`).toBeTruthy();
      expect(parkingFor(student)[0].location).toBe(`${student.campus} campus grounds`);
    }
  });

  it("matches the seed data in populate_db.py", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "../../../action_server/database/populate_db.py"), "utf8");
    const seeded = [...source.matchAll(/\((\d+), "([A-Z0-9 ]+)", "([\d: -]+)", (\d+)\)/g)].map((m) => ({
      index: Number(m[1]),
      plate: m[2],
      issued: m[3],
      pence: Number(m[4]),
    }));
    expect(seeded).toHaveLength(PARKING.length);
    for (const row of seeded) {
      const student = STUDENTS[row.index];
      const charge = parkingFor(student)[0];
      expect([charge.plate, charge.issued, charge.pence]).toEqual([row.plate, row.issued, row.pence]);
      // The database puts student i on campus i % 3, so the charge is on their campus.
      expect(student.campus).toBe(CAMPUSES[row.index % CAMPUSES.length]);
    }
  });
});

describe("parking arrears replies", () => {
  it("lists date, time, plate, location, fine and the pay-by date", () => {
    const text = reply("Do I have any parking arrears?", introduce("Alice Johnson")).texts[0];
    for (const part of [
      "**Date:** 14 October 2026",
      "**Time:** 09:32",
      "**Vehicle:** LB21 XQT",
      "**Location:** Craiglockhart campus grounds",
      "**Fine owed:** £60.00",
      "**Pay by:** 14 November 2026",
      "charges start to accrue",
    ]) {
      expect(text).toContain(part);
    }
  });

  it("offers the phone and InfoDesk buttons, phone first", () => {
    const result = reply("check my parking fines", introduce("Alice Johnson"));
    expect(result.buttons).toEqual(PARKING_BUTTONS);
    expect(result.buttons.map((b) => b.payload)).toEqual(["/pay_by_phone", "/pay_at_infodesk"]);
  });

  it("tells a student with no charge they are clear, without buttons", () => {
    const result = reply("any parking arrears", introduce("Bob Smith"));
    expect(result.texts[0]).toMatch(/no parking arrears/);
    expect(result.buttons).toBeUndefined();
  });

  it("asks an unknown student to introduce themselves first", () => {
    expect(reply("do I have parking arrears", null).texts[0]).toMatch(/introduce yourself/);
  });

  it("answers the pay-by-phone choice with a fake UK number", () => {
    const text = reply("/pay_by_phone", introduce("Alice Johnson")).texts[0];
    expect(text).toContain("**020 7946 0321**");
  });

  it("answers the InfoDesk choice", () => {
    expect(reply("/pay_at_infodesk", introduce("Alice Johnson")).texts[0]).toMatch(/visit the \*\*InfoDesk\*\*/);
  });

  it("understands typed payment choices too", () => {
    expect(reply("I want to pay by phone", null).texts[0]).toContain("020 7946 0321");
    expect(reply("I will pay at the info desk", null).texts[0]).toMatch(/InfoDesk/);
  });

  it("does not change how other questions are answered", () => {
    const alice = introduce("Alice Johnson");
    expect(reply("Which campus is my class at?", alice).texts[0]).toMatch(/Craiglockhart/);
    expect(reply("What days do I have lectures?", alice).texts[0]).toMatch(/Monday/);
  });
});
