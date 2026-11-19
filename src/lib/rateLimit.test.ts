import { beforeEach, describe, expect, it } from "vitest";
import { isRateLimited, resetRateLimits } from "./rateLimit";
import { isSameOriginRequest } from "./security";

describe("rate limiter", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit, then blocks", () => {
    expect(isRateLimited("k", 3, 60_000)).toBe(false);
    expect(isRateLimited("k", 3, 60_000)).toBe(false);
    expect(isRateLimited("k", 3, 60_000)).toBe(false);
    expect(isRateLimited("k", 3, 60_000)).toBe(true);
  });

  it("tracks keys separately", () => {
    expect(isRateLimited("a", 1, 60_000)).toBe(false);
    expect(isRateLimited("b", 1, 60_000)).toBe(false);
    expect(isRateLimited("a", 1, 60_000)).toBe(true);
  });
});

describe("same-origin check", () => {
  it("allows a matching Origin", () => {
    expect(isSameOriginRequest("https://app.example.com", null, "app.example.com")).toBe(true);
  });

  it("rejects a foreign Origin", () => {
    expect(isSameOriginRequest("https://evil.example.com", null, "app.example.com")).toBe(false);
  });

  it("allows requests with no Origin or Referer (non-browser clients)", () => {
    expect(isSameOriginRequest(null, null, "app.example.com")).toBe(true);
  });

  it("rejects when the host is missing but an Origin is present", () => {
    expect(isSameOriginRequest("https://app.example.com", null, null)).toBe(false);
  });

  it("rejects an unparseable Origin", () => {
    expect(isSameOriginRequest("not a url", null, "app.example.com")).toBe(false);
  });
});
