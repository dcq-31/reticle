import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { Vector3 } from "three";

import {
  ORBIT_PHI_MAX,
  ORBIT_PHI_MIN,
  ORBIT_RADIUS_MAX,
  ORBIT_RADIUS_MIN,
  placeCameraOnOrbit,
  type OrbitState,
} from "@/lib/render/volume3d/orbit";
import type { VolumeMaterialBundle } from "@/lib/render/volume3d/material";
import { clamp } from "@/lib/utils/clamp";
import { touchGesture, type TrackedPointer } from "@/lib/utils/touchGesture";
import { releasePointer } from "@/lib/utils/pointerCapture";
import type { FrameScheduler } from "@/lib/utils/raf";

type PointerKind = "mouse" | "pen" | "touch";

/** Reusable scratch vectors to avoid per-frame allocations during pan. */
const _right = new Vector3();
const _up = new Vector3();
const _forward = new Vector3();

/** Step-count multiplier while user is dragging/zooming (saves frame time). */
const INTERACTION_STEPS_FACTOR = 0.35;
/** Hard cap on raymarch steps while interacting, regardless of quality setting. */
const INTERACTION_MAX_STEPS = 128;
/** ms of idleness before we rerender with the full step count. */
const INTERACTION_IDLE_MS = 140;
const WHEEL_IDLE_MS = 160;

export interface OrbitRefs {
  readonly orbit: OrbitState;
  readonly camera: PerspectiveCamera | null;
  readonly sched: FrameScheduler | null;
  /** Mutated: set to `true` during active interaction to lower step count. */
  readonly interacting: { current: boolean };
  /** Mutated: stores the idle-reset timeout id. */
  readonly idleTimer: { current: number | null };
}

/**
 * Attach pointer + wheel orbit interaction to a canvas element.
 * Returns a cleanup function that removes all listeners.
 */
export function attachOrbitInteraction(canvas: HTMLCanvasElement, refs: OrbitRefs): () => void {
  let mode: "rot" | "pan" | null = null;
  let pinchActive = false;
  let lx = 0;
  let ly = 0;
  let touchStartRadius = refs.orbit.radius;
  let touchStartTarget = refs.orbit.target.clone();
  let touchStartDistance = 1;
  let touchStartCenterX = 0;
  let touchStartCenterY = 0;
  const pointers = new Map<number, TrackedPointer>();
  const capturedPointers = new Set<number>();
  const previousTouches = new Map<number, { x: number; y: number }>();

  const syncPointer = (e: PointerEvent): void => {
    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType as PointerKind,
    });
  };

  const removePointer = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    previousTouches.delete(e.pointerId);
  };

  const doReleasePointer = (pointerId: number): void => {
    if (!capturedPointers.has(pointerId)) return;
    capturedPointers.delete(pointerId);
    releasePointer(canvas, pointerId);
  };

  const touchPoints = (): readonly TrackedPointer[] =>
    Array.from(pointers.values())
      .filter((p) => p.type === "touch")
      .slice(0, 2);

  const beginPinch = (): void => {
    const gesture = touchGesture(pointers);
    if (!gesture) return;
    pinchActive = true;
    mode = "pan";
    touchStartRadius = refs.orbit.radius;
    touchStartTarget = refs.orbit.target.clone();
    touchStartDistance = gesture.distance;
    touchStartCenterX = gesture.centerX;
    touchStartCenterY = gesture.centerY;
  };

  const onPointerDown = (e: PointerEvent): void => {
    syncPointer(e);
    try {
      canvas.setPointerCapture(e.pointerId);
      capturedPointers.add(e.pointerId);
    } catch {
      // Synthetic or already-cancelled pointers can make capture fail.
    }
    refs.interacting.current = true;
    canvas.classList.add("dragging");

    if (e.pointerType === "touch") {
      previousTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPoints().length >= 2) {
        beginPinch();
      } else {
        mode = "rot";
        lx = e.clientX;
        ly = e.clientY;
      }
      return;
    }

    const isPan = e.button === 1 || e.shiftKey || e.button === 2;
    mode = isPan ? "pan" : "rot";
    lx = e.clientX;
    ly = e.clientY;
  };

  const onPointerMove = (e: PointerEvent): void => {
    syncPointer(e);
    const orbit = refs.orbit;

    if (e.pointerType === "touch") {
      if (touchPoints().length >= 2) {
        if (!pinchActive) beginPinch();
        const gesture = touchGesture(pointers);
        if (!gesture) return;
        const camera = refs.camera;
        if (!camera) return;
        orbit.radius = clamp(
          touchStartRadius * (touchStartDistance / gesture.distance),
          ORBIT_RADIUS_MIN,
          ORBIT_RADIUS_MAX,
        );
        camera.matrixWorld.extractBasis(_right, _up, _forward);
        const k = orbit.radius * 0.0016;
        orbit.target.copy(touchStartTarget);
        orbit.target
          .addScaledVector(_right, -(gesture.centerX - touchStartCenterX) * k)
          .addScaledVector(_up, (gesture.centerY - touchStartCenterY) * k);
        refs.sched?.request();
        return;
      }

      pinchActive = false;
      mode = "rot";
      const prev = previousTouches.get(e.pointerId) ?? { x: e.clientX, y: e.clientY };
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      previousTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      orbit.theta -= dx * 0.01;
      orbit.phi = clamp(orbit.phi - dy * 0.01, ORBIT_PHI_MIN, ORBIT_PHI_MAX);
      refs.sched?.request();
      return;
    }

    if (!mode) return;
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    if (mode === "rot") {
      orbit.theta -= dx * 0.01;
      orbit.phi = clamp(orbit.phi - dy * 0.01, ORBIT_PHI_MIN, ORBIT_PHI_MAX);
    } else {
      const camera = refs.camera;
      if (camera) {
        camera.matrixWorld.extractBasis(_right, _up, _forward);
        const k = orbit.radius * 0.0016;
        orbit.target.addScaledVector(_right, -dx * k).addScaledVector(_up, dy * k);
      }
    }
    refs.sched?.request();
  };

  const endPointer = (e: PointerEvent): void => {
    removePointer(e);
    doReleasePointer(e.pointerId);
    if (e.pointerType === "touch" && touchPoints().length < 2) {
      pinchActive = false;
    }
    mode = null;
    refs.interacting.current = false;
    canvas.classList.remove("dragging");
    refs.sched?.request();
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const orbit = refs.orbit;
    orbit.radius = clamp(
      orbit.radius * (e.deltaY > 0 ? 1.1 : 0.9),
      ORBIT_RADIUS_MIN,
      ORBIT_RADIUS_MAX,
    );
    refs.interacting.current = true;
    refs.sched?.request();
    if (refs.idleTimer.current !== null) clearTimeout(refs.idleTimer.current);
    refs.idleTimer.current = window.setTimeout(() => {
      refs.interacting.current = false;
      refs.sched?.request();
    }, WHEEL_IDLE_MS);
  };

  const onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  const onPointerCancel = (e: PointerEvent): void => {
    removePointer(e);
    doReleasePointer(e.pointerId);
    if (e.pointerType === "touch" && touchPoints().length < 2) {
      pinchActive = false;
    }
    mode = null;
    refs.interacting.current = false;
    canvas.classList.remove("dragging");
    refs.sched?.request();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    for (const pointerId of capturedPointers) doReleasePointer(pointerId);
    if (refs.idleTimer.current !== null) {
      clearTimeout(refs.idleTimer.current);
      refs.idleTimer.current = null;
    }
    refs.interacting.current = false;
    canvas.classList.remove("dragging");
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", endPointer);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    canvas.removeEventListener("wheel", onWheel);
  };
}

/**
 * Render one volume frame, lowering step count and disabling shading during
 * active interaction. The camera is placed from orbit state every frame so
 * drag/zoom/pan mutations actually move the view.
 */
export function renderVolumeFrame(
  refs: OrbitRefs,
  renderer: WebGLRenderer,
  scene: Scene,
  bundle: VolumeMaterialBundle,
): void {
  if (!refs.camera) return;

  placeCameraOnOrbit(refs.camera, refs.orbit);

  const fullSteps = bundle.uniforms.uSteps.value;
  const fullShade = bundle.uniforms.uShade.value;
  if (refs.interacting.current) {
    bundle.uniforms.uSteps.value = Math.min(
      INTERACTION_MAX_STEPS,
      Math.max(48, Math.round(fullSteps * INTERACTION_STEPS_FACTOR)),
    );
    bundle.uniforms.uShade.value = 0;
  }
  bundle.uniforms.uCam.value.copy(refs.camera.position);
  renderer.render(scene, refs.camera);

  if (refs.interacting.current) {
    bundle.uniforms.uSteps.value = fullSteps;
    bundle.uniforms.uShade.value = fullShade;
    if (refs.idleTimer.current !== null) clearTimeout(refs.idleTimer.current);
    refs.idleTimer.current = window.setTimeout(() => {
      refs.interacting.current = false;
      refs.sched?.request();
    }, INTERACTION_IDLE_MS);
  }
}
