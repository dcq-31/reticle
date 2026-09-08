/**
 * `setPointerCapture` throws `NotFoundError` whenever the pointer id is no
 * longer active. That is not an exceptional condition in practice:
 *
 *  - on touch, the browser can cancel a pointer at any moment (it decides the
 *    gesture belongs to scrolling or a browser affordance)
 *  - the pointer can be released between event dispatch and handler execution
 *  - synthetic pointer events (tests, automation) have no active pointer at all
 *
 * Left unguarded, the throw aborts the rest of the `pointerdown` handler, so
 * the drag state never initializes and the gesture silently dies. Capture is an
 * optimization — losing it degrades a drag that leaves the element, which is
 * strictly better than dropping the interaction.
 */
export function capturePointer(element: Element, pointerId: number): boolean {
  try {
    element.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely release a captured pointer, swallowing errors if it was already
 * released by the browser. Intended to be called in pointerup / pointercancel
 * handlers and during cleanup.
 */
export function releasePointer(element: HTMLCanvasElement, pointerId: number): void {
  try {
    element.releasePointerCapture(pointerId);
  } catch {
    // Capture is best-effort; cleanup should not fail if the browser already released it.
  }
}
