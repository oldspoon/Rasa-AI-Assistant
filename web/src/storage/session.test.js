import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStorage } from "./fakeStorage.js";
import { clearStoredUser, getSender, newSenderId, readStoredUser, saveSender, storeUser } from "./session.js";

beforeEach(() => {
  vi.stubGlobal("localStorage", new FakeStorage());
  vi.stubGlobal("sessionStorage", new FakeStorage());
});

describe("conversation id", () => {
  it("creates an id once and keeps it", () => {
    const first = getSender();
    expect(first).toBeTruthy();
    expect(getSender()).toBe(first);
  });

  it("uses a stored id after saveSender", () => {
    saveSender("abc-123");
    expect(getSender()).toBe("abc-123");
  });

  it("makes a different id each time", () => {
    expect(newSenderId()).not.toBe(newSenderId());
  });
});

describe("signed-in student", () => {
  it("round-trips through the tab storage", () => {
    storeUser({ first: "Alice", last: "Johnson", via: "server" });
    expect(readStoredUser()).toEqual({ first: "Alice", last: "Johnson", via: "server" });
  });

  it("is cleared on sign-out", () => {
    storeUser({ first: "Alice", last: "Johnson" });
    clearStoredUser();
    expect(readStoredUser()).toBeNull();
  });

  it("ignores broken or incomplete stored data", () => {
    sessionStorage.setItem("attendance-bot-user", "{not json");
    expect(readStoredUser()).toBeNull();
    sessionStorage.setItem("attendance-bot-user", JSON.stringify({ first: "Alice" }));
    expect(readStoredUser()).toBeNull();
  });
});
