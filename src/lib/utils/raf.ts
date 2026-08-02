/**
 * Coalesce render requests into a single `requestAnimationFrame` tick.
 *
 * Multiple `request()` calls within the same frame fire `cb` only once,
 * on the next frame. Call `cancel()` on teardown.
 */
export class FrameScheduler {
  private rafId = 0;

  constructor(private readonly cb: () => void) {}

  request(): void {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.cb();
    });
  }

  cancel(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }
}
