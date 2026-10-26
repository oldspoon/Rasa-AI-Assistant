import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, SessionExpired, isBackendDown, postChat } from "./backend.js";

describe("isBackendDown", () => {
  it("is true when fetch cannot reach the server", () => {
    expect(isBackendDown(new TypeError("Failed to fetch"))).toBe(true);
  });

  it.each([502, 503, 504])("is true for a gateway status %i", (status) => {
    expect(isBackendDown(new HttpError(status))).toBe(true);
  });

  it.each([400, 401, 404, 500])("is false when the server answers %i", (status) => {
    expect(isBackendDown(new HttpError(status))).toBe(false);
  });

  it("is false for a bad response body or a bug", () => {
    expect(isBackendDown(new SyntaxError("Unexpected token <"))).toBe(false);
    expect(isBackendDown(new Error("unexpected login response"))).toBe(false);
  });
});

describe("postChat", () => {
  afterEach(() => vi.unstubAllGlobals());

  const answer = (status) => vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status })));

  it("sends the token as a Bearer header", async () => {
    answer(200);
    await postChat("abc", "hi", "tok");
    const [, init] = fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ sender: "abc", message: "hi" });
  });

  it("reports an expired session when the token is refused", async () => {
    answer(401);
    await expect(postChat("abc", "hi", "tok")).rejects.toBeInstanceOf(SessionExpired);
  });

  it("reports a refusal without a token as an HTTP error, not as the backend being down", async () => {
    answer(401);
    const err = await postChat("abc", "hi", undefined).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(isBackendDown(err)).toBe(false);
  });

  it("reports a server error as an HTTP error, not as the backend being down", async () => {
    answer(500);
    const err = await postChat("abc", "hi", "tok").catch((e) => e);
    expect(err.status).toBe(500);
    expect(isBackendDown(err)).toBe(false);
  });
});
