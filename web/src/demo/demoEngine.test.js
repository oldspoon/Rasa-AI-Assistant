import { describe, expect, it } from "vitest";
import { STUDENTS, checkCredentials, reply } from "./demoEngine.js";

const alice = () => reply("My name is Alice Johnson", null).student;
const bob = () => reply("My name is Bob Smith", null).student;

describe("introduction", () => {
  it("finds a seeded student by name", () => {
    const result = reply("My name is Alice Johnson", null);
    expect(result.student.first).toBe("Alice");
    expect(result.texts[0]).toMatch(/I found your record, Alice Johnson/);
  });

  it("rejects an unknown name and keeps the current student", () => {
    const result = reply("My name is John Doe", null);
    expect(result.student).toBeNull();
    expect(result.texts[0]).toMatch(/couldn't find a student with the name John Doe/);
  });
});

describe("schedule questions", () => {
  it("asks for an introduction first when no student is known", () => {
    expect(reply("What days do I have lectures?", null).texts[0]).toMatch(/introduce yourself/);
  });

  it("answers the lecture and practical days for every student", () => {
    expect(reply("What days do I have lectures?", alice()).texts[0]).toMatch(/Lecture\*\* session on \*\*Monday/);
    expect(reply("What days do I have practicals?", alice()).texts[0]).toMatch(/Practical\*\* session on \*\*Wednesday/);
    expect(reply("What days do I have lectures?", bob()).texts[0]).toMatch(/Lecture\*\* session on \*\*Thursday/);
    expect(reply("What days do I have practicals?", bob()).texts[0]).toMatch(/Practical\*\* session on \*\*Tuesday/);
  });

  it("answers campus, time, subject and room for both sessions", () => {
    const student = alice();
    expect(reply("Which campus is my class at?", student).texts[0]).toMatch(/Craiglockhart/);
    const time = reply("What time is my session?", student).texts[0];
    expect(time).toMatch(/10:00-12:00/);
    expect(time).toMatch(/13:00-15:00/);
    expect(reply("What subject am I studying?", student).texts[0]).toMatch(/Fine Arts/);
    const room = reply("Which room is it?", student).texts[0];
    expect(room).toMatch(/F14/);
    expect(room).toMatch(/D28/);
  });

  it("returns the weekly schedule as three messages, lecture before practical", () => {
    const texts = reply("Give me all my schedule details.", alice()).texts;
    expect(texts).toHaveLength(3);
    expect(texts[0]).toMatch(/Alice Johnson/);
    expect(texts[1].indexOf("Lecture")).toBeLessThan(texts[1].indexOf("Practical"));
  });

  it("gives every student a lecture and a practical on different days", () => {
    for (const s of STUDENTS) {
      expect(s.lecture.day).not.toBe(s.practical.day);
    }
  });
});

describe("other messages", () => {
  it("greets, thanks and says goodbye", () => {
    expect(reply("hello", null).texts[0]).toMatch(/I'm Octopi/);
    expect(reply("thanks", null).texts[0]).toMatch(/You're welcome/);
    expect(reply("bye", null).texts[0]).toMatch(/Goodbye/);
  });

  it("declines topics outside the timetable", () => {
    expect(reply("order me a pizza", alice()).texts[0]).toMatch(/only help with campus attendance/);
  });

  it("falls back on empty or filler input", () => {
    expect(reply("   ", null).texts[0]).toMatch(/didn't quite understand/);
    expect(reply("ok", null).texts[0]).toMatch(/didn't quite understand/);
  });
});

describe("checkCredentials", () => {
  it("accepts first+last and last+first, ignoring case and spaces", () => {
    expect(checkCredentials("alicejohnson", "johnsonalice").first).toBe("Alice");
    expect(checkCredentials("Alice Johnson", "Johnson Alice").last).toBe("Johnson");
  });

  it("rejects a wrong password, an unknown user and empty values", () => {
    expect(checkCredentials("alicejohnson", "wrong")).toBeNull();
    expect(checkCredentials("nobody", "nobody")).toBeNull();
    expect(checkCredentials("", "")).toBeNull();
    expect(checkCredentials(undefined, undefined)).toBeNull();
  });
});
