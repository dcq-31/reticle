"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { VolumeRenderStoreAdapter } from "@/hooks/renderStoreAdapters";
import { BoxGeometry, type Data3DTexture, PerspectiveCamera, Scene, WebGLRenderer } from "three";

import { buildLUT } from "@/lib/render/colormap";
import {
  createVolumeMaterial,
  updateLutTexture,
  type VolumeMaterialBundle,
} from "@/lib/render/volume3d/material";
import { attachOrbitInteraction, renderVolumeFrame } from "@/lib/render/volume3d/orbitInteraction";
import { createOrbitState, resetOrbit, type OrbitState } from "@/lib/render/volume3d/orbit";
import { buildVolumeTexture } from "@/lib/render/volume3d/texture";
import { MAX_DPR } from "@/lib/utils/constants";
import { FrameScheduler } from "@/lib/utils/raf";

export interface VolumeRendererHandle {
  /** True when WebGL2 is unavailable; component should render a fallback. */
  readonly failed: boolean;
  /** Tell the renderer to resize its viewport (called from ResizeObserver). */
  setCanvasSize: (width: number, height: number) => void;
}

/**
 * Drives the Three.js raycaster lifecycle: renderer/scene/material setup,
 * 3D texture builds on volume/time change, uniform updates on window/lut/
 * vol3d-setting change, orbit interaction, and RAF coalescing.
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

  const rebuildTexture = useCallback(() => {
    const bundle = bundleRef.current;
    if (!bundle) return;
    const snapshot = storeAdapter.getSnapshot();
    const base = snapshot.base;
    const stats = snapshot.stats;
    if (!base || !stats) return;
    if (tex3dRef.current) {
      tex3dRef.current.dispose();
      tex3dRef.current = null;
    }
    try {
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
    } catch (err) {
      bundle.uniforms.uData.value = null;
      console.error("[useVolumeRenderer] texture rebuild failed", err);
    }
  }, [storeAdapter, syncDisplay, syncSettings]);

  const renderFrame = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const bundle = bundleRef.current;
    if (!renderer || !scene || !camera || !bundle || !tex3dRef.current) return;

    renderVolumeFrame(
      {
        orbit: orbitRef.current,
        camera,
        sched: schedRef.current,
        interacting: interactingRef,
        idleTimer: idleTimerRef,
      },
      renderer,
      scene,
      bundle,
    );
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
    let bundle: VolumeMaterialBundle | null = null;
    let renderer: WebGLRenderer;
    try {
      bundle = createVolumeMaterial(initialLut);
      renderer = new WebGLRenderer({ canvas, context: gl, antialias: false, alpha: true });
      renderer.setClearColor(0x000000, 0);
    } catch (err) {
      bundle?.dispose();
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

    return attachOrbitInteraction(canvas, {
      orbit: orbitRef.current,
      camera: cameraRef.current,
      sched: schedRef.current,
      interacting: interactingRef,
      idleTimer: idleTimerRef,
    });
  }, [canvasRef, failed]);

  // Store subscriptions.
  useEffect(() => {
    const unsubVolume = storeAdapter.subscribeVolume(({ volumeChanged }) => {
      rebuildTexture();
      if (volumeChanged) resetOrbit(orbitRef.current);
      schedRef.current?.request();
    });
    const unsubTimeIndex = storeAdapter.subscribeTimeIndex(() => {
      rebuildTexture();
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
      unsubTimeIndex();
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
