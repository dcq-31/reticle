/**
 * Generic multi-touch gesture helpers shared across pointer hooks.
 */

export type PointerKind = "mouse" | "pen" | "touch";

/** Minimal pointer record tracked during a gesture. */
export interface TrackedPointer {
  readonly x: number;
  readonly y: number;
  readonly type: PointerKind;
}

/** Extract up to `max` touch pointers from the tracked set. */
export function touchPointers(
  map: ReadonlyMap<number, TrackedPointer>,
  max = 2,
): readonly { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of map.values()) {
    if (p.type === "touch") {
      out.push({ x: p.x, y: p.y });
      if (out.length >= max) break;
    }
  }
  return out;
}

export interface TouchGesture {
  readonly centerX: number;
  readonly centerY: number;
  readonly distance: number;
}

/** Compute the center point and distance of a two-finger touch gesture. */
export function touchGesture(map: ReadonlyMap<number, TrackedPointer>): TouchGesture | null {
  const [a, b] = touchPointers(map);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    centerX: (a.x + b.x) / 2,
    centerY: (a.y + b.y) / 2,
    distance: Math.max(1, Math.hypot(dx, dy)),
  };
}
