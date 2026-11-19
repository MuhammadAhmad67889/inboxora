/** Small, honest email check: one @, something on both sides, and a
 * dot in the domain. Full RFC validation is not worth it — the real
 * proof an address works is mail arriving there. */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  const parts = trimmed.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (/\s/.test(trimmed)) return false;
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}
