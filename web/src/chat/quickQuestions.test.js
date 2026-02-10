import { describe, expect, it } from "vitest";
import { BASE_REPLIES, SIDEBAR_QUESTIONS } from "./quickQuestions.js";
import { SAY, reply } from "../demo/demoEngine.js";

const student = reply("My name is Alice Johnson", null).student;

describe("quick questions", () => {
  it("include parking arrears in the sidebar and the suggestions", () => {
    expect(SIDEBAR_QUESTIONS.map((q) => q.label)).toContain("Parking arrears");
    expect(BASE_REPLIES).toContain("Do I have any parking arrears?");
  });

  it("are all understood by the chat", () => {
    const messages = [...SIDEBAR_QUESTIONS.map((q) => q.message), ...BASE_REPLIES];
    for (const message of messages) {
      const text = reply(message, student, new Date(2026, 10, 16)).texts[0];
      expect([SAY.outOfScope, SAY.fallback, SAY.guard], message).not.toContain(text);
    }
  });
});
