import { describe, it, expect } from "vitest";
import { isNoiseTranscript, mergeTranscript, scrubTranscript } from "./transcript.js";

describe("scrubTranscript", () => {
  it("removes Whisper's bracketed and parenthesised silence markers", () => {
    expect(scrubTranscript("[BLANK_AUDIO] check my room (silence)")).toBe("check my room");
  });

  it("collapses whitespace and trims", () => {
    expect(scrubTranscript("  what   time \n is it ")).toBe("what time is it");
  });

  it("returns an empty string for missing input", () => {
    expect(scrubTranscript(undefined)).toBe("");
    expect(scrubTranscript(null)).toBe("");
  });
});

describe("isNoiseTranscript", () => {
  it("flags empty text and the phrases Whisper invents on silence", () => {
    expect(isNoiseTranscript("")).toBe(true);
    expect(isNoiseTranscript("Thank you.")).toBe(true);
    expect(isNoiseTranscript("you")).toBe(true);
  });

  it("keeps real questions", () => {
    expect(isNoiseTranscript("what time is my lecture")).toBe(false);
  });
});

describe("mergeTranscript", () => {
  it("skips words repeated across the overlap between two passes", () => {
    expect(mergeTranscript("what time", "time is my session")).toBe("what time is my session");
  });

  it("is case-insensitive when matching the overlap", () => {
    expect(mergeTranscript("Hello There", "there friend")).toBe("Hello There friend");
  });

  it("appends when there is no overlap", () => {
    expect(mergeTranscript("one two", "three")).toBe("one two three");
  });

  it("returns the other side when one side is empty", () => {
    expect(mergeTranscript("", "hello")).toBe("hello");
    expect(mergeTranscript("hello", "")).toBe("hello");
  });
});
