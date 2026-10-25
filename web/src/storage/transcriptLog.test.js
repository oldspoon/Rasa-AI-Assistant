import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStorage } from "./fakeStorage.js";
import { clearTranscripts, trackTurn } from "./transcriptLog.js";

const KEY = (sender) => `attendance-bot-log-${sender}`;
const readLog = (sender) => JSON.parse(localStorage.getItem(KEY(sender)));

beforeEach(() => {
  vi.stubGlobal("localStorage", new FakeStorage());
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("trackTurn", () => {
  it("appends each turn to the conversation's log", () => {
    trackTurn("s1", "user", "hello");
    trackTurn("s1", "bot", "hi", { engine: "demo" });
    const log = readLog("s1");
    expect(log.map((e) => e.text)).toEqual(["hello", "hi"]);
    expect(log[1].engine).toBe("demo");
  });

  it("logs notices as warnings and other turns as info", () => {
    trackTurn("s1", "notice", "backend down");
    trackTurn("s1", "user", "hello");
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledTimes(1);
  });

  it("keeps only the newest 300 entries per conversation", () => {
    for (let i = 0; i < 305; i += 1) trackTurn("s1", "user", `m${i}`);
    const log = readLog("s1");
    expect(log).toHaveLength(300);
    expect(log[0].text).toBe("m5");
    expect(log[299].text).toBe("m304");
  });

  it("keeps only the 20 most recent conversations", () => {
    for (let i = 0; i < 25; i += 1) {
      vi.spyOn(Date, "now").mockReturnValue(1000 + i);
      trackTurn(`c${i}`, "user", "hi");
    }
    const kept = Object.keys(localStorage).filter((k) => k.startsWith("attendance-bot-log-"));
    expect(kept).toHaveLength(20);
    expect(localStorage.getItem(KEY("c24"))).not.toBeNull();
    expect(localStorage.getItem(KEY("c0"))).toBeNull();
  });

  it("never throws when storage fails", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => trackTurn("s1", "user", "hello")).not.toThrow();
  });
});

describe("clearTranscripts", () => {
  it("removes every saved transcript but nothing else", () => {
    trackTurn("s1", "user", "hello");
    trackTurn("s2", "user", "hi");
    localStorage.setItem("attendance-bot-theme", "dark");
    clearTranscripts();
    expect(localStorage.getItem(KEY("s1"))).toBeNull();
    expect(localStorage.getItem(KEY("s2"))).toBeNull();
    expect(localStorage.getItem("attendance-bot-theme")).toBe("dark");
  });
});
