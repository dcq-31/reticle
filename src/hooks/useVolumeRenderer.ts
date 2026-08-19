"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { VolumeRenderStoreAdapter } from "@/hooks/renderStoreAdapters";
import {
  BoxGeometry,
  type Data3DTexture,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";

import { buildLUT } from "@/lib/render/colormap";
import {
  createVolumeMaterial,
  updateLutTexture,
  type VolumeMaterialBundle,
} from "@/lib/render/volume3d/material";
import {
  createOrbitState,
  ORBIT_PHI_MAX,
  ORBIT_PHI_MIN,
  ORBIT_RADIUS_MAX,
  ORBIT_RADIUS_MIN,
  placeCameraOnOrbit,
  resetOrbit,
  type OrbitState,
} from "@/lib/render/volume3d/orbit";
import { buildVolumeTexture } from "@/lib/render/volume3d/texture";
import { clamp } from "@/lib/utils/clamp";
import { FrameScheduler } from "@/lib/utils/raf";

export interface VolumeRendererHandle {
  /** True when WebGL2 is unavailable; component should render a fallback. */
  readonly failed: boolean;
  /** Tell the renderer to resize its viewport (called from ResizeObserver). */
  setCanvasSize: (width: number, height: number) => void;
}

const MAX_DPR = 2;
/** Step-count multiplier while user is dragging/zooming (saves frame time). */
const INTERACTION_STEPS_FACTOR = 0.5;
/** ms of idleness before we rerender with the full step count. */
const INTERACTION_IDLE_MS = 80;
const WHEEL_IDLE_MS = 160;

/**
 * Drives the Three.js raycaster lifecycle: renderer/scene/material setup,
 * 3D texture builds on volume/time change, uniform updates on window/lut/
 * vol3d-setting change, orbit interaction, and RAF coalescing.
 *
 * Owned imperative refs (mirroring `useSliceRenderer`'s pattern):
 *  - WebGLRenderer + Scene + PerspectiveCamera
 *  - VolumeMaterialBundle (mesh + material + lut texture)
 *  - Current Data3DTexture (replaced on volume/time change)
 *  - OrbitState (mutated by pointer/wheel handlers)
 *  - Interaction flag for step-count downscale
 */
export function useVolumeRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  storeAdapter: VolumeRenderStoreAdapter,
): VolumeRendererHandle {
  const [failed, setFailed] = useState(false);

  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const bundleRef = useRef<VolumeMaterialBundle | null>(null);
  const tex3dRef = useRef<Data3DTexture | null>(null);
  const orbitRef = useRef<OrbitState>(createOrbitState());
  const interactingRef = useRef(false);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const dimsRef = useRef<[number, number, number]>([1, 1, 1]);
  const schedRef = useRef<FrameScheduler | null>(null);
  const idleTimerRef = useRef<number | null>(null);

  /** Push current store window/lut into uniforms; ask for a frame. */
  const syncDisplay = useCallback(() => {
    const bundle = bundleRef.current;
    if (!bundle) return;
    const base = storeAdapter.getSnapshot().base;
    if (!base) return;
    bundle.uniforms.uWinLo.value = base.display.win.level - base.display.win.width / 2;
    bundle.uniforms.uWinWidth.value = Math.max(1e-6, base.display.win.width);
    updateLutTexture(bundle.lutTexture, base.display.lut);
    schedRef.current?.request();
  }, [storeAdapter]);

  /** Push current store vol3d settings into uniforms; ask for a frame. */
  const syncSettings = useCallback(() => {
    const bundle = bundleRef.current;
    if (!bundle) return;
    const s = storeAdapter.getSnapshot();
    bundle.uniforms.uMode.value = s.mode === "mip" ? 0 : s.mode === "iso" ? 2 : 1;
    bundle.uniforms.uDensity.value = s.density;
    bundle.uniforms.uThresh.value = s.threshold;
    bundle.uniforms.uShade.value = s.shade ? 1 : 0;
    const baseAxis = Math.max(...dimsRef.current);
    bundle.uniforms.uSteps.value = Math.min(
      1024,
      Math.max(48, Math.round(baseAxis * 1.7 * s.quality)),
    );
    schedRef.current?.request();
  }, [storeAdapter]);

  /** Build a 3D texture for the current base volume at the current time. */
  const rebuildTexture = useCallback(() => {
    const bundle = bundleRef.current;
    if (!bundle) return;
    const snapshot = storeAdapter.getSnapshot();
    const base = snapshot.base;
    const stats = snapshot.stats;
    if (!base || !stats) return;
    if (tex3dRef.current) tex3dRef.current.dispose();
    const built = buildVolumeTexture(base.volume, stats, snapshot.timeIndex);
    tex3dRef.current = built.texture;
    dimsRef.current = [built.dims[0], built.dims[1], built.dims[2]];

    bundle.mesh.geometry.dispose();
    bundle.mesh.geometry = new BoxGeometry(built.aspect[0], built.aspect[1], built.aspect[2]);
    bundle.uniforms.uData.value = built.texture;
    bundle.uniforms.uAspect.value.set(built.aspect[0], built.aspect[1], built.aspect[2]);
    bundle.uniforms.uVolMin.value = built.volMin;
    bundle.uniforms.uVolRange.value = built.volRange;

    syncDisplay();
    syncSettings();
  }, [storeAdapter, syncDisplay, syncSettings]);

  /** Render one frame; lowers step count if mid-interaction, then restores. */
  const renderFrame = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const bundle = bundleRef.current;
    if (!renderer || !scene || !camera || !bundle || !tex3dRef.current) return;

    const fullSteps = bundle.uniforms.uSteps.value;
    if (interactingRef.current) {
      bundle.uniforms.uSteps.value = Math.max(48, Math.round(fullSteps * INTERACTION_STEPS_FACTOR));
    }
    placeCameraOnOrbit(camera, orbitRef.current);
    bundle.uniforms.uCam.value.copy(camera.position);
    renderer.render(scene, camera);

    if (interactingRef.current) {
      bundle.uniforms.uSteps.value = fullSteps;
      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => {
        if (!interactingRef.current) schedRef.current?.request();
      }, INTERACTION_IDLE_MS);
    }
  }, []);

  // Mount: create WebGL2 renderer + scene + material.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2");
    } catch {
      gl = null;
    }
    if (!gl) {
      setFailed(true);
      return;
    }

    const initialLut = storeAdapter.getSnapshot().base?.display.lut ?? buildLUT("gray", false);
    let bundle: VolumeMaterialBundle | null;
    let renderer: WebGLRenderer;
    try {
      bundle = createVolumeMaterial(initialLut);
      renderer = new WebGLRenderer({ canvas, context: gl, antialias: false, alpha: true });
      renderer.setClearColor(0x000000, 0);
    } catch (err) {
      console.error("[useVolumeRenderer] init failed", err);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot init failure, no cascade.
      setFailed(true);
      return;
    }

    const scene = new Scene();
    scene.add(bundle.mesh);
    const camera = new PerspectiveCamera(35, 1, 0.01, 100);
    const scheduler = new FrameScheduler(renderFrame);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    bundleRef.current = bundle;
    schedRef.current = scheduler;

    rebuildTexture();
    syncDisplay();
    syncSettings();
    scheduler.request();

    return () => {
      scheduler.cancel();
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      tex3dRef.current?.dispose();
      tex3dRef.current = null;
      bundle?.dispose();
      bundleRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      schedRef.current = null;
    };
  }, [canvasRef, rebuildTexture, renderFrame, storeAdapter, syncDisplay, syncSettings]);

  // Pointer + wheel orbit interaction.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || failed) return;

    let mode: "rot" | "pan" | null = null;
    let lx = 0;
    let ly = 0;

    const onPointerDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId);
      const isPan = e.button === 1 || e.shiftKey || e.button === 2;
      mode = isPan ? "pan" : "rot";
      lx = e.clientX;
      ly = e.clientY;
      interactingRef.current = true;
      canvas.classList.add("dragging");
    };

    const onPointerMove = (e: PointerEvent): void => {
      if (!mode) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      const orbit = orbitRef.current;
      if (mode === "rot") {
        orbit.theta -= dx * 0.01;
        orbit.phi = clamp(orbit.phi - dy * 0.01, ORBIT_PHI_MIN, ORBIT_PHI_MAX);
      } else {
        const camera = cameraRef.current;
        if (camera) {
          const right = new Vector3();
          const up = new Vector3();
          camera.matrixWorld.extractBasis(right, up, new Vector3());
          const k = orbit.radius * 0.0016;
          orbit.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
        }
      }
      schedRef.current?.request();
    };

    const endPointer = (): void => {
      mode = null;
      interactingRef.current = false;
      canvas.classList.remove("dragging");
      schedRef.current?.request();
    };

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const orbit = orbitRef.current;
      orbit.radius = clamp(
        orbit.radius * (e.deltaY > 0 ? 1.1 : 0.9),
        ORBIT_RADIUS_MIN,
        ORBIT_RADIUS_MAX,
      );
      interactingRef.current = true;
      schedRef.current?.request();
      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => {
        interactingRef.current = false;
        schedRef.current?.request();
      }, WHEEL_IDLE_MS);
    };

    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointercancel", endPointer);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [canvasRef, failed]);

  // Store subscriptions: each fires a targeted re-sync.
  useEffect(() => {
    const unsubVolume = storeAdapter.subscribeVolume(({ volumeChanged }) => {
      rebuildTexture();
      if (volumeChanged) resetOrbit(orbitRef.current);
      schedRef.current?.request();
    });
    const unsubDisplay = storeAdapter.subscribeDisplay(() => syncDisplay());
    const unsubSettings = storeAdapter.subscribeSettings(() => syncSettings());
    const unsubReset = storeAdapter.subscribeReset(() => {
      resetOrbit(orbitRef.current);
      schedRef.current?.request();
    });
    return () => {
      unsubVolume();
      unsubDisplay();
      unsubSettings();
      unsubReset();
    };
  }, [rebuildTexture, storeAdapter, syncDisplay, syncSettings]);

  const setCanvasSize = useCallback<VolumeRendererHandle["setCanvasSize"]>((width, height) => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    sizeRef.current = { width, height, dpr };
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    schedRef.current?.request();
  }, []);

  return { failed, setCanvasSize };
}
