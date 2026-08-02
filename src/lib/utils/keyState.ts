/**
 * Singleton mutable object tracking modifier keys held by the user.
 *
 * Used by `useKeyboardShortcuts` (writer) and `useViewportPointer` (reader)
 * to wire Space-as-pan-modifier without round-tripping through React state
 * — every keydown would otherwise cause a re-render of every plane.
 */
export const keyState: { space: boolean } = { space: false };
