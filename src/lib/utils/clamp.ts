export function clamp(value: number, lo: number, hi: number): number {
  if (lo > hi) [lo, hi] = [hi, lo];
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}
