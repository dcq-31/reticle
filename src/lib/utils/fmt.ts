/**
 * Format a number for display in the status bar / metadata panel.
 *
 * - Non-finite values render as the en-dash placeholder.
 * - Very small (< 0.01) or very large (>= 1e5) magnitudes switch to two-digit
 *   exponential to keep status-bar columns compact.
 * - Everything else is rounded to 3 decimal places, trailing zeros dropped.
 */
export function fmt(x: number): string {
  if (!Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a !== 0 && (a < 0.01 || a >= 1e5)) return x.toExponential(2);
  return (Math.round(x * 1000) / 1000).toString();
}
