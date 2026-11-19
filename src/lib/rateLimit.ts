import type { NextRequest } from "next/server";

/** In-memory fixed-window rate limiter for auth routes.
 *
 * It is deliberately simple: per-process counters reset on deploy,
 * which is fine for slowing down password guessing. A shared store
 * (Redis) would be needed for multiple server instances. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

/** Best-effort client IP from proxy headers, falling back to a
 * constant so the limiter still groups unknown clients together. */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Test helper: wipe all counters between tests. */
export function resetRateLimits(): void {
  buckets.clear();
}
