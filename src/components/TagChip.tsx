/**
 * Small presentational pieces shared by the inbox list and the
 * conversation view: tag chips and priority badges. Server-safe
 * (no client hooks) so both pages can render them directly.
 */

/** Chip colors by palette key (TAG_COLORS in src/lib/tags.ts).
 * Background tint + readable text. Unknown or missing colors use
 * the neutral default. */
const CHIP_COLORS: Record<string, { background: string; color: string }> = {
  amber: { background: "#fbf0d3", color: "#8a6414" },
  blue: { background: "#e3ecf7", color: "#2456a6" },
  gray: { background: "#efece4", color: "#5c6a64" },
  green: { background: "#e3f0e8", color: "#0b6e63" },
  purple: { background: "#eee7f7", color: "#6b3fa0" },
  red: { background: "#fbe3e1", color: "#b3261e" },
};

export function tagChipStyle(color: string | null): {
  background: string;
  color: string;
} {
  return (color && CHIP_COLORS[color]) || CHIP_COLORS.gray;
}

/** One tag as a small rounded label. */
export function TagChip({ color, name }: { color: string | null; name: string }) {
  const style = tagChipStyle(color);
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
      style={style}
    >
      {name}
    </span>
  );
}

const PRIORITY_BADGES: Record<string, { label: string; style: { background: string; color: string } }> = {
  high: { label: "High", style: { background: "#fbf0d3", color: "#8a6414" } },
  low: { label: "Low", style: { background: "#efece4", color: "#5c6a64" } },
  urgent: { label: "Urgent", style: { background: "#b3261e", color: "#ffffff" } },
};

/** Priority badge for inbox rows. "normal" (the default) shows
 * nothing, so the rows that need attention stand out. */
export function PriorityBadge({ priority }: { priority: string }) {
  const badge = PRIORITY_BADGES[priority];
  if (!badge) return null;
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-bold"
      style={badge.style}
    >
      {badge.label}
    </span>
  );
}

/** Display labels for the priority picker, least to most urgent. */
export const PRIORITY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

/** Color choices for the tag forms. "" means the default look. */
export const TAG_COLOR_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Default", value: "" },
  { label: "Green", value: "green" },
  { label: "Blue", value: "blue" },
  { label: "Purple", value: "purple" },
  { label: "Amber", value: "amber" },
  { label: "Red", value: "red" },
  { label: "Gray", value: "gray" },
];
