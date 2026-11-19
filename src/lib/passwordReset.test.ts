import { describe, expect, it } from "vitest";
import {
  buildResetToken,
  hashResetToken,
  isResetTokenUsable,
  RESET_TOKEN_TTL_MS,
} from "./passwordReset";

describe("password reset tokens", () => {
  it("builds a token whose hash matches hashResetToken", () => {
    const { token, tokenHash } = buildResetToken();
    expect(tokenHash).toBe(hashResetToken(token));
    expect(tokenHash).not.toBe(token);
  });

  it("expires one hour after creation", () => {
    const now = Date.parse("2026-11-19T10:00:00Z");
    const { expiresAt } = buildResetToken(now);
    expect(expiresAt.getTime()).toBe(now + RESET_TOKEN_TTL_MS);
  });

  it("is usable while unused and unexpired", () => {
    const now = Date.now();
    expect(
      isResetTokenUsable({ expiresAt: new Date(now + 1000), usedAt: null }, now),
    ).toBe(true);
  });

  it("is not usable after use (single-use)", () => {
    const now = Date.now();
    expect(
      isResetTokenUsable(
        { expiresAt: new Date(now + 1000), usedAt: new Date(now) },
        now,
      ),
    ).toBe(false);
  });

  it("is not usable after expiry", () => {
    const now = Date.now();
    expect(
      isResetTokenUsable({ expiresAt: new Date(now - 1), usedAt: null }, now),
    ).toBe(false);
  });
});
