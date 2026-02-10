import { describe, expect, it } from "vitest";
import { MAX_BUTTONS, suggestedQuestions, usedPayloads, usedQuestions, visibleButtons } from "./suggestions.js";

const user = (text, payload) => ({ from: "user", text, ...(payload ? { payload } : {}) });
const bot = (text) => ({ from: "bot", text });
const POOL = ["One?", "Two?", "Three?", "Four?", "Five?"];

describe("suggested questions", () => {
  it("shows at most three", () => {
    expect(MAX_BUTTONS).toBe(3);
    expect(suggestedQuestions(POOL, [])).toEqual(["One?", "Two?", "Three?"]);
  });

  it("skips a question already asked, however it was written", () => {
    const turns = [user("two"), bot("answer"), user("THREE?!")];
    expect(suggestedQuestions(POOL, turns)).toEqual(["One?", "Four?", "Five?"]);
  });

  it("brings in new ones as earlier ones are used", () => {
    const turns = [user("One?"), user("Two?"), user("Three?")];
    expect(suggestedQuestions(POOL, turns)).toEqual(["Four?", "Five?"]);
  });

  it("is empty once everything has been asked", () => {
    expect(suggestedQuestions(POOL, POOL.map((q) => user(q)))).toEqual([]);
  });

  it("ignores what the bot said and what button clicks were called", () => {
    const turns = [bot("One?"), user("One?", "/payload")];
    expect(suggestedQuestions(POOL, turns)[0]).toBe("One?");
    expect(usedQuestions(turns).size).toBe(0);
  });
});

describe("reply buttons", () => {
  const buttons = [1, 2, 3, 4, 5].map((n) => ({ title: `Borrow book ${n}`, payload: `/b${n}` }));

  it("shows at most three per bubble", () => {
    expect(visibleButtons(buttons, [])).toHaveLength(3);
  });

  it("drops a button that was clicked before and fills the space", () => {
    const turns = [user("Borrow book 1", "/b1"), user("Borrow book 3", "/b3")];
    expect(visibleButtons(buttons, turns).map((b) => b.payload)).toEqual(["/b2", "/b4", "/b5"]);
  });

  it("does not hide a button because of typed text", () => {
    expect(visibleButtons(buttons, [user("Borrow book 1")])[0].payload).toBe("/b1");
  });

  it("returns nothing when every button was used or there are none", () => {
    expect(visibleButtons(buttons.slice(0, 1), [user("x", "/b1")])).toEqual([]);
    expect(visibleButtons(undefined, [])).toEqual([]);
  });

  it("collects the clicked payloads", () => {
    expect([...usedPayloads([user("a", "/x"), user("b"), bot("c")])]).toEqual(["/x"]);
  });
});
