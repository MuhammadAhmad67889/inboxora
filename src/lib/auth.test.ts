import { beforeAll, describe, expect, it } from "vitest";
import {
  hashPassword,
  hashToken,
  newSessionToken,
  normalizeEmail,
  sessionExpiry,
  signSessionCookie,
  validateCredentials,
  verifyPassword,
  verifySessionCookie,
} from "./auth";
import { isValidEmail } from "./validation";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-only-secret-for-auth-tests";
});

describe("password hashing", () => {
  it("round-trips: correct password verifies, wrong one does not", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(verifyPassword("wrong password", stored)).toBe(false);
  });

  it("salts per password: same password hashes differently twice", () => {
    expect(hashPassword("same-password")).not.toBe(hashPassword("same-password"));
  });

  it("rejects malformed stored values instead of throwing", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "bcrypt:abc:def")).toBe(false);
    expect(verifyPassword("x", "scrypt:nothex:nothex")).toBe(false);
  });
});

describe("session cookies", () => {
  it("signs and verifies a cookie", () => {
    const token = newSessionToken();
    const value = signSessionCookie("session-123", token);
    expect(verifySessionCookie(value)).toEqual({ sessionId: "session-123", token });
  });

  it("rejects a tampered payload", () => {
    const value = signSessionCookie("session-123", newSessionToken());
    const tampered = `x${value}`;
    expect(verifySessionCookie(tampered)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const value = signSessionCookie("session-123", newSessionToken());
    const dot = value.lastIndexOf(".");
    const tampered = `${value.slice(0, dot + 1)}${"0".repeat(64)}`;
    expect(verifySessionCookie(tampered)).toBeNull();
  });

  it("rejects empty and garbage values", () => {
    expect(verifySessionCookie(undefined)).toBeNull();
    expect(verifySessionCookie(null)).toBeNull();
    expect(verifySessionCookie("")).toBeNull();
    expect(verifySessionCookie("no-dot-here")).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const value = signSessionCookie("session-123", newSessionToken(), "other-secret");
    expect(verifySessionCookie(value)).toBeNull();
  });

  it("hashToken is deterministic and secret-dependent", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("sessionExpiry is 7 days ahead", () => {
    const from = new Date("2026-11-19T00:00:00Z");
    expect(sessionExpiry(from).toISOString()).toBe("2026-11-26T00:00:00.000Z");
  });
});

describe("credential validation", () => {
  it("accepts a good email and password", () => {
    expect(
      validateCredentials({ email: "a@example.com", password: "long-enough" }),
    ).toEqual({});
  });

  it("flags a bad email and a short password", () => {
    const errors = validateCredentials({ email: "not-an-email", password: "short" });
    expect(errors.email).toBeTruthy();
    expect(errors.password).toBeTruthy();
  });

  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  A@Example.COM ")).toBe("a@example.com");
  });

  it("isValidEmail handles the basics", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.co")).toBe(false);
    expect(isValidEmail("@c.co")).toBe(false);
    expect(isValidEmail("a@")).toBe(false);
    expect(isValidEmail("a@@c.co")).toBe(false);
  });
});
