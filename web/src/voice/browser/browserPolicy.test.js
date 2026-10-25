import { describe, it, expect } from "vitest";
import {
  FALLBACK_HINT,
  MAX_SILENT_RESTARTS,
  commitSession,
  joinText,
  onEndAction,
  speechErrorAction,
} from "./browserPolicy.js";

describe("speechErrorAction", () => {
  it("ignores aborts, because we stopped the recogniser ourselves", () => {
    expect(speechErrorAction("aborted")).toEqual({ action: "ignore" });
  });

  it("falls back to the on-device model when the service is unreachable", () => {
    expect(speechErrorAction("network")).toEqual({ action: "fallback", hint: FALLBACK_HINT });
    expect(speechErrorAction("service-not-allowed").action).toBe("fallback");
  });

  it("lets the end event restart the session after silence", () => {
    expect(speechErrorAction("no-speech")).toEqual({ action: "restart" });
  });

  it("gives a specific hint for a blocked microphone", () => {
    const result = speechErrorAction("not-allowed");
    expect(result.action).toBe("fatal");
    expect(result.hint).toMatch(/Microphone access is blocked/);
  });

  it("gives a generic hint for an unknown error", () => {
    expect(speechErrorAction("something-new")).toEqual({
      action: "fatal",
      hint: "Voice input didn't work - please try again.",
    });
  });
});

describe("onEndAction", () => {
  it("stops when the user no longer wants dictation", () => {
    expect(onEndAction({ wantListen: false, speechActive: true, restarts: 0 })).toEqual({
      action: "stop",
      restarts: 0,
    });
  });

  it("restarts while the user still wants dictation", () => {
    expect(onEndAction({ wantListen: true, speechActive: true, restarts: 3 })).toEqual({
      action: "restart",
      restarts: 4,
    });
  });

  it("gives up after too many silent restarts", () => {
    const result = onEndAction({
      wantListen: true,
      speechActive: true,
      restarts: MAX_SILENT_RESTARTS,
    });
    expect(result.action).toBe("giveUp");
    expect(result.hint).toMatch(/tap the mic/);
  });
});

describe("text joining", () => {
  it("joins non-empty parts with single spaces", () => {
    expect(joinText(["  hello ", "", "  ", "world"])).toBe("hello world");
  });

  it("commits the finished session text onto what came before", () => {
    expect(commitSession("first part", " second part ")).toBe("first part second part");
    expect(commitSession("", "only this")).toBe("only this");
  });
});
