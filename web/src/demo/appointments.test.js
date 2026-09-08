import { beforeEach, describe, expect, it } from "vitest";
import { SAY, reply, resetBookings } from "./demoEngine.js";

const TODAY = new Date(2026, 10, 16);
const introduce = (name) => reply(`My name is ${name}`, null).student;
const ask = (text, student, today = TODAY) => reply(text, student, today);

beforeEach(() => resetBookings());

describe("appointments", () => {
  it("says when nothing is booked and offers both bookings", () => {
    const result = ask("Show my appointments", introduce("Grace Miller"));
    expect(result.texts[0]).toMatch(/no appointments booked/);
    expect(result.buttons.map((b) => b.payload)).toEqual(["/ask_teacher_hours", "/ask_support_lectures"]);
  });

  it("lists the teacher visit and the lab assistant support lecture", () => {
    const grace = introduce("Grace Miller");
    ask("Book Thursday at 14:00", grace);
    ask("Book support lecture 2", grace);
    const result = ask("What appointments do I have?", grace);
    const text = result.texts[0];
    expect(text).toMatch(/\*\*Teacher visits\*\*/);
    expect(text).toMatch(/\*\*Thursday:\*\* 14:00-14:30 with Margaret Ellison, room C214/);
    expect(text).toMatch(/\*\*Lab assistant support lectures\*\*/);
    expect(text).toMatch(/Drawing techniques lab/);
    expect(text).toMatch(/\*\*Lab assistant:\*\* Callum Reid/);
    expect(result.buttons).toBeUndefined();
  });

  it("offers only the missing kind of booking", () => {
    const grace = introduce("Grace Miller");
    ask("Book Thursday at 14:00", grace);
    const result = ask("my appointments", grace);
    expect(result.texts[0]).toMatch(/No support lectures booked/);
    expect(result.buttons.map((b) => b.payload)).toEqual(["/ask_support_lectures"]);
  });

  it("is not mistaken for booking a teacher visit", () => {
    const text = ask("I would like to book an appointment with my teacher", introduce("Grace Miller")).texts[0];
    expect(text).toMatch(/Which day and time/);
  });

  it("asks an unknown student to introduce themselves first", () => {
    expect(ask("show my appointments", null).texts[0]).toBe(SAY.guard);
  });
});

describe("timetable", () => {
  it("lists the lecture, the practical and the appointments with all their data", () => {
    const bob = introduce("Bob Smith");
    ask("Book Tuesday at 10:00", bob);
    ask("Book support lecture 3", bob);
    const text = ask("Show my timetable", bob).texts[0];
    for (const part of [
      "**Bob Smith**",
      "**Subject:** Computing",
      "**Teacher:** Daniel Fraser (office **D108**)",
      "**Lecture**\n**Day:** Thursday\n**Time:** 14:00-16:00\n**Room:** D75, Sighthill campus",
      "**Practical**\n**Day:** Tuesday\n**Time:** 11:00-13:00\n**Room:** A94, Sighthill campus",
      "**Appointments**",
      "**Tuesday:** 10:00-10:30 with Daniel Fraser",
      "**Debugging clinic**",
    ]) {
      expect(text).toContain(part);
    }
    expect(text.indexOf("**Lecture**")).toBeLessThan(text.indexOf("**Practical**"));
  });

  it("still shows the week when there are no appointments", () => {
    const text = ask("what is my timetable", introduce("Alice Johnson")).texts[0];
    expect(text).toMatch(/\*\*Lecture\*\*/);
    expect(text).toMatch(/No teacher visits booked\./);
    expect(text).toMatch(/No support lectures booked\./);
  });

  it("keeps the schedule details answer separate", () => {
    const texts = ask("Give me all my schedule details", introduce("Alice Johnson")).texts;
    expect(texts).toHaveLength(3);
    expect(texts.join("")).not.toMatch(/Appointments/);
  });

  it("asks an unknown student to introduce themselves first", () => {
    expect(ask("show my timetable", null).texts[0]).toBe(SAY.guard);
  });
});
